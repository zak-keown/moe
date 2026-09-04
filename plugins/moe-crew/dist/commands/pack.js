import { existsSync } from "node:fs";
import { loadPack } from "../core/packs.js";
import { harnessMarkerPath } from "../core/paths.js";
import { listOrphanNames, listWorkers, readHarnessMarker, removeOrphan, } from "../core/worker-store.js";
import { detectInstalledHarnesses, getDriver } from "../harness/registry.js";
import { resolveHarness } from "../harness/resolver.js";
import { cmdLaunch } from "./launch.js";
import { cmdSend } from "./send.js";
import { cmdStop } from "./stop.js";
/** Resolve every pack worker before any session is launched. */
export function resolvePackHarnesses(pack, defaults) {
    const harnesses = [];
    for (const worker of pack.workers) {
        const resolution = resolveHarness({
            worker: worker.harness,
            command: defaults.command,
            pack: pack.defaultHarness,
            environment: defaults.environment,
            installed: defaults.installed,
        });
        if (!resolution.ok)
            return resolution;
        harnesses.push(resolution.harness);
    }
    return { ok: true, harnesses };
}
/**
 * Derive the worker name for a pack entry: `<packName>-<namePrefix>-<index>`.
 * The index is zero-based within the full workers array (not per-prefix), so
 * names are always unique even when multiple workers share a prefix.
 */
function workerName(packName, prefix, index) {
    return `${packName}-${prefix}-${index}`;
}
/**
 * Launch all workers defined in a pack file, then send each its role prompt.
 *
 * For each worker in the pack definition:
 * 1. Resolve every harness without side effects, then `cmdLaunch` with name =
 *    `<packName>-<namePrefix>-<index>` and cwd from the argument.
 * 2. `cmdSend` with the worker's rolePrompt.
 *
 * Returns a summary or the first fatal error.
 */
export async function cmdPack(ctx, args, opts) {
    let pack;
    try {
        pack = loadPack(args.packFile);
    }
    catch (e) {
        return { stderr: `Error: ${e.message}`, code: 1 };
    }
    const environmentHarness = Object.hasOwn(args, "environmentHarness")
        ? args.environmentHarness
        : process.env.MOE_CREW_DEFAULT_HARNESS;
    const resolution = resolvePackHarnesses(pack, {
        command: args.harness,
        environment: environmentHarness,
        installed: args.installedHarnesses ?? detectInstalledHarnesses(),
    });
    if (!resolution.ok) {
        return { stderr: `Error: ${resolution.diagnostic}`, code: resolution.code };
    }
    const shims = [];
    const errors = [];
    for (const [i, w] of pack.workers.entries()) {
        const name = workerName(pack.name, w.namePrefix, i);
        const harness = resolution.harnesses[i];
        if (harness === undefined) {
            return { stderr: `Error: no resolved harness for pack worker '${name}'`, code: 2 };
        }
        const extraArgs = w.harnessArgs ?? [];
        const workerCtx = { ...ctx, driver: getDriver(harness) };
        const launchResult = await cmdLaunch(workerCtx, { tmuxName: name, cwd: args.cwd, extraArgs, harness }, opts);
        if (launchResult.code !== 0) {
            errors.push(`Failed to launch ${name}: ${launchResult.stderr ?? "unknown error"}`);
            continue;
        }
        // stdout from cmdLaunch is the shim path.
        if (launchResult.stdout) {
            shims.push(launchResult.stdout);
        }
        // Send the role prompt.
        const sendResult = await cmdSend(workerCtx, name, w.rolePrompt.trim());
        if (sendResult.code !== 0) {
            errors.push(`Failed to send role prompt to ${name}: ${sendResult.stderr ?? "unknown error"}`);
        }
    }
    if (errors.length > 0 && shims.length === 0) {
        return { stderr: errors.join("\n"), code: 1 };
    }
    const summary = [`Pack '${pack.name}' launched: ${shims.length} workers`];
    for (const s of shims) {
        summary.push(`  ${s}`);
    }
    if (errors.length > 0) {
        summary.push(`Errors (${errors.length}):`);
        for (const e of errors) {
            summary.push(`  ${e}`);
        }
    }
    return { stdout: summary.join("\n"), code: errors.length > 0 ? 1 : 0 };
}
/**
 * Stop all workers belonging to a pack. Identifies the pack by name: if the
 * argument looks like a file path, loads it to read the name; otherwise uses
 * the argument as a direct name. Finds all workers in the store whose
 * tmux_name starts with `<packName>-` and stops each one. Marker-only derive
 * workers are included because their first send may fail before metadata is
 * registered.
 */
export async function cmdPackStop(ctx, args) {
    let packName;
    if (/\.(ya?ml|json)$/.test(args.nameOrFile)) {
        try {
            const pack = loadPack(args.nameOrFile);
            packName = pack.name;
        }
        catch (e) {
            return { stderr: `Error: ${e.message}`, code: 1 };
        }
    }
    else {
        packName = args.nameOrFile;
    }
    const prefix = `${packName}-`;
    const workers = listWorkers(ctx.workerDir);
    const matching = workers.filter((m) => m.tmux_name.startsWith(prefix));
    const orphanNames = listOrphanNames(ctx.workerDir).filter((name) => name.startsWith(prefix));
    if (matching.length === 0 && orphanNames.length === 0) {
        return { stderr: `No workers found for pack '${packName}'`, code: 0 };
    }
    const routed = [];
    for (const meta of matching) {
        const resolution = resolveHarness({ worker: meta.harness, installed: [] });
        if (!resolution.ok) {
            return { stderr: `Error: ${resolution.diagnostic}`, code: resolution.code };
        }
        routed.push({ name: meta.tmux_name, driver: getDriver(resolution.harness) });
    }
    const corruptOrphans = [];
    for (const name of orphanNames) {
        const markerPath = harnessMarkerPath(ctx.workerDir, name);
        const marker = readHarnessMarker(ctx.workerDir, name);
        const value = marker ??
            (existsSync(markerPath)
                ? "(empty or unreadable harness marker)"
                : "(missing harness marker)");
        const resolution = resolveHarness({ worker: value, installed: [] });
        if (!resolution.ok) {
            corruptOrphans.push({ name, diagnostic: resolution.diagnostic });
            continue;
        }
        routed.push({ name, driver: getDriver(resolution.harness) });
    }
    let stopped = 0;
    const errors = [];
    for (const { name, driver } of routed) {
        const result = await cmdStop({ ...ctx, driver }, name);
        if (result.code === 0) {
            stopped++;
        }
        else {
            errors.push(`Failed to stop ${name}: ${result.stderr ?? "unknown error"}`);
        }
    }
    // A corrupt orphan has no trustworthy driver to ask for a graceful exit.
    // Still kill and remove it so an invalid marker cannot leave a live bypassed
    // worker behind, then surface the state corruption as the controlling code 2.
    for (const orphan of corruptOrphans) {
        if (await ctx.tmux.hasSession(orphan.name)) {
            await ctx.tmux.killSession(orphan.name);
        }
        removeOrphan(ctx.workerDir, orphan.name);
        stopped++;
        errors.push(`Invalid state for ${orphan.name}: ${orphan.diagnostic}`);
    }
    const summary = [`Pack '${packName}' stopped: ${stopped} workers`];
    if (errors.length > 0) {
        summary.push(`Errors (${errors.length}):`);
        for (const e of errors) {
            summary.push(`  ${e}`);
        }
    }
    return {
        stdout: summary.join("\n"),
        ...(corruptOrphans.length > 0 ? { stderr: errors.join("\n") } : {}),
        code: corruptOrphans.length > 0 ? 2 : errors.length > 0 ? 1 : 0,
    };
}
