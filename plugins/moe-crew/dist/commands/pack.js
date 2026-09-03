import { loadPack } from "../core/packs.js";
import { listWorkers } from "../core/worker-store.js";
import { cmdLaunch } from "./launch.js";
import { cmdSend } from "./send.js";
import { cmdStop } from "./stop.js";
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
 * 1. `cmdLaunch` with name = `<packName>-<namePrefix>-<index>`, harness from
 *    the worker or the default "claude", cwd from the argument.
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
    const shims = [];
    const errors = [];
    for (let i = 0; i < pack.workers.length; i++) {
        const w = pack.workers[i];
        const name = workerName(pack.name, w.namePrefix, i);
        const harness = w.harness ?? "claude";
        const extraArgs = w.harnessArgs ?? [];
        const launchResult = await cmdLaunch(ctx, { tmuxName: name, cwd: args.cwd, extraArgs, harness }, opts);
        if (launchResult.code !== 0) {
            errors.push(`Failed to launch ${name}: ${launchResult.stderr ?? "unknown error"}`);
            continue;
        }
        // stdout from cmdLaunch is the shim path.
        if (launchResult.stdout) {
            shims.push(launchResult.stdout);
        }
        // Send the role prompt.
        const sendResult = await cmdSend(ctx, name, w.rolePrompt.trim());
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
 * tmux_name starts with `<packName>-` and stops each one.
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
    if (matching.length === 0) {
        return { stderr: `No workers found for pack '${packName}'`, code: 0 };
    }
    let stopped = 0;
    const errors = [];
    for (const meta of matching) {
        const result = await cmdStop(ctx, meta.tmux_name);
        if (result.code === 0) {
            stopped++;
        }
        else {
            errors.push(`Failed to stop ${meta.tmux_name}: ${result.stderr ?? "unknown error"}`);
        }
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
        code: errors.length > 0 ? 1 : 0,
    };
}
