import type { PackDefinition } from "../core/packs.js";
import { loadPack } from "../core/packs.js";
import { listWorkers } from "../core/worker-store.js";
import type { HarnessId } from "../harness/driver.js";
import { detectInstalledHarnesses, getDriver } from "../harness/registry.js";
import { type HarnessResolutionFailure, resolveHarness } from "../harness/resolver.js";
import type { CommandContext, CommandResult } from "./context.js";
import type { BootstrapOpts } from "./launch.js";
import { cmdLaunch } from "./launch.js";
import { cmdSend } from "./send.js";
import { cmdStop } from "./stop.js";

export interface PackArgs {
  packFile: string;
  cwd: string;
  /** `--harness`, used as the command-wide pack default. */
  harness?: HarnessId | undefined;
  /** Injectable environment default for tests and programmatic callers. */
  environmentHarness?: unknown;
  /** Injectable executable-detection result for tests and programmatic callers. */
  installedHarnesses?: readonly HarnessId[] | undefined;
}

export type PackHarnessResolution = { ok: true; harnesses: HarnessId[] } | HarnessResolutionFailure;

/** Resolve every pack worker before any session is launched. */
export function resolvePackHarnesses(
  pack: PackDefinition,
  defaults: {
    command?: unknown;
    environment?: unknown;
    installed: readonly HarnessId[];
  },
): PackHarnessResolution {
  const harnesses: HarnessId[] = [];
  for (const worker of pack.workers) {
    const resolution = resolveHarness({
      worker: worker.harness,
      command: defaults.command,
      pack: pack.defaultHarness,
      environment: defaults.environment,
      installed: defaults.installed,
    });
    if (!resolution.ok) return resolution;
    harnesses.push(resolution.harness);
  }
  return { ok: true, harnesses };
}

/**
 * Derive the worker name for a pack entry: `<packName>-<namePrefix>-<index>`.
 * The index is zero-based within the full workers array (not per-prefix), so
 * names are always unique even when multiple workers share a prefix.
 */
function workerName(packName: string, prefix: string, index: number): string {
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
export async function cmdPack(
  ctx: CommandContext,
  args: PackArgs,
  opts: BootstrapOpts,
): Promise<CommandResult> {
  let pack: PackDefinition;
  try {
    pack = loadPack(args.packFile);
  } catch (e) {
    return { stderr: `Error: ${(e as Error).message}`, code: 1 };
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

  const shims: string[] = [];
  const errors: string[] = [];

  for (const [i, w] of pack.workers.entries()) {
    const name = workerName(pack.name, w.namePrefix, i);
    const harness = resolution.harnesses[i];
    if (harness === undefined) {
      return { stderr: `Error: no resolved harness for pack worker '${name}'`, code: 2 };
    }
    const extraArgs = w.harnessArgs ?? [];
    const workerCtx = { ...ctx, driver: getDriver(harness) };

    const launchResult = await cmdLaunch(
      workerCtx,
      { tmuxName: name, cwd: args.cwd, extraArgs, harness },
      opts,
    );

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

export interface PackStopArgs {
  /** Either a pack file path (ends in .yaml/.yml/.json) or a pack name. */
  nameOrFile: string;
}

/**
 * Stop all workers belonging to a pack. Identifies the pack by name: if the
 * argument looks like a file path, loads it to read the name; otherwise uses
 * the argument as a direct name. Finds all workers in the store whose
 * tmux_name starts with `<packName>-` and stops each one.
 */
export async function cmdPackStop(ctx: CommandContext, args: PackStopArgs): Promise<CommandResult> {
  let packName: string;

  if (/\.(ya?ml|json)$/.test(args.nameOrFile)) {
    try {
      const pack = loadPack(args.nameOrFile);
      packName = pack.name;
    } catch (e) {
      return { stderr: `Error: ${(e as Error).message}`, code: 1 };
    }
  } else {
    packName = args.nameOrFile;
  }

  const prefix = `${packName}-`;
  const workers = listWorkers(ctx.workerDir);
  const matching = workers.filter((m) => m.tmux_name.startsWith(prefix));

  if (matching.length === 0) {
    return { stderr: `No workers found for pack '${packName}'`, code: 0 };
  }

  const routed = [];
  for (const meta of matching) {
    const resolution = resolveHarness({ worker: meta.harness, installed: [] });
    if (!resolution.ok) {
      return { stderr: `Error: ${resolution.diagnostic}`, code: resolution.code };
    }
    routed.push({ meta, driver: getDriver(resolution.harness) });
  }

  let stopped = 0;
  const errors: string[] = [];

  for (const { meta, driver } of routed) {
    const result = await cmdStop({ ...ctx, driver }, meta.tmux_name);
    if (result.code === 0) {
      stopped++;
    } else {
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
