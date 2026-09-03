import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { hasConsent } from "../core/consent.js";
import { eventsPath, harnessMarkerPath, metaPath } from "../core/paths.js";
import { isoSecondsUtc } from "../core/time.js";
import {
  ensureOwnedDir,
  listWorkers,
  readHarnessMarker,
  readMeta,
  writeMeta,
  writeShim,
} from "../core/worker-store.js";
import type { HarnessId } from "../harness/driver.js";
import { getDriver } from "../harness/registry.js";
import { resolveHarness } from "../harness/resolver.js";
import { awaitSessionStart } from "./await-start.js";
import type { CommandContext, CommandResult } from "./context.js";
import { type BootstrapOpts, consentError, renderPanel, resolveCwd } from "./launch.js";

/** Claude session ids are UUID-ish: hex + dashes (upstream bash `csd`:818). */
const CLAUDE_SESSION_ID = /^[0-9a-fA-F][0-9a-fA-F-]{7,}$/;

export interface AdoptArgs {
  tmuxName: string;
  cwd: string;
  /** The existing Claude session id to resume. */
  sessionId: string;
  extraArgs: string[];
}

type ExistingHarnessState =
  | { ok: true; harness?: HarnessId | undefined }
  | { ok: false; result: CommandResult };

/**
 * Inspect every persisted identity relevant to an adopt target. Metadata may
 * be keyed by the supplied session id or by another id carrying the same tmux
 * name; derive workers may instead have only a sidecar marker. Every present
 * value goes through the canonical resolver, and contradictory evidence is a
 * controlled state error rather than permission to overwrite it with Claude.
 */
function existingHarnessState(
  workerDir: string,
  tmuxName: string,
  sessionId: string,
): ExistingHarnessState {
  const evidence: Array<{ source: string; value: unknown }> = [];
  const seenSessionIds = new Set<string>();
  const directMetaPath = metaPath(workerDir, sessionId);
  if (existsSync(directMetaPath)) {
    const meta = readMeta(workerDir, sessionId);
    if (meta === null) {
      evidence.push({ source: `metadata ${directMetaPath}`, value: "(unreadable metadata)" });
    } else {
      seenSessionIds.add(meta.session_id);
      evidence.push({
        source: `metadata ${directMetaPath}`,
        value: meta.harness ?? "(missing harness field in metadata)",
      });
    }
  }
  for (const meta of listWorkers(workerDir)) {
    if (meta.tmux_name !== tmuxName || seenSessionIds.has(meta.session_id)) continue;
    seenSessionIds.add(meta.session_id);
    evidence.push({
      source: `metadata for session ${meta.session_id}`,
      value: meta.harness ?? "(missing harness field in metadata)",
    });
  }

  const markerPath = harnessMarkerPath(workerDir, tmuxName);
  if (existsSync(markerPath)) {
    evidence.push({
      source: `harness marker ${markerPath}`,
      value: readHarnessMarker(workerDir, tmuxName) ?? "(empty or unreadable harness marker)",
    });
  }

  const resolved: Array<{ source: string; harness: HarnessId }> = [];
  for (const item of evidence) {
    const resolution = resolveHarness({ worker: item.value, installed: [] });
    if (!resolution.ok) {
      return {
        ok: false,
        result: {
          stderr: `Error: invalid ${item.source}: ${resolution.diagnostic}`,
          code: resolution.code,
        },
      };
    }
    resolved.push({ source: item.source, harness: resolution.harness });
  }

  const harnesses = new Set(resolved.map((item) => item.harness));
  if (harnesses.size > 1) {
    return {
      ok: false,
      result: {
        stderr: `Error: conflicting harness state for '${tmuxName}': ${resolved
          .map((item) => `${item.source} says ${item.harness}`)
          .join("; ")}`,
        code: 2,
      },
    };
  }
  return { ok: true, harness: resolved[0]?.harness };
}

/**
 * Re-attach to an existing Claude session after a reboot. Parity port of bash
 * `cmd_adopt` (upstream bash `csd`:791-905). Claude-only: there is no `--harness` flag, so the
 * driver is always claude.
 *
 * `claude --resume <id>` preserves the session id, so the worker's runtime
 * session_id equals the supplied id. The meta is pre-written keyed by that id
 * BEFORE claude starts, because the SessionStart hook only records events once a
 * meta exists for the session. If a tmux session already exists (e.g. restored
 * by tmux-resurrect), its pane is respawned in place to preserve the window
 * layout; otherwise a new detached session is opened.
 *
 * The proof-of-life wait and its teardown-on-timeout mirror launch; see
 * `cmdLaunch` for the driver-orchestration notes.
 */
export async function cmdAdopt(
  ctx: CommandContext,
  args: AdoptArgs,
  opts: BootstrapOpts,
): Promise<CommandResult> {
  const { tmuxName, sessionId, extraArgs } = args;
  const driver = getDriver("claude");

  const resolved = resolveCwd(args.cwd);
  if (typeof resolved !== "string") return resolved;
  const cwd = resolved;

  if (!CLAUDE_SESSION_ID.test(sessionId)) {
    return {
      stderr: `Error: '${sessionId}' does not look like a Claude session id`,
      code: 1,
    };
  }

  if (!hasConsent(ctx.home, ctx.environment ?? {})) return consentError(opts.moeCrewPath);

  // Adopt is Claude-only. Refuse every non-Claude, malformed, or conflicting
  // persisted identity before checking the transcript or touching tmux/state.
  const existing = existingHarnessState(ctx.workerDir, tmuxName, sessionId);
  if (!existing.ok) return existing.result;
  if (existing.harness !== undefined && existing.harness !== "claude") {
    return {
      stderr: `Error: '${tmuxName}' is a ${existing.harness} worker; adopt is claude-only (codex/pi mint their own ids and offer no resume-by-id). Stop it first, then relaunch.`,
      code: 1,
    };
  }

  // A bad/typo'd session id otherwise burns the full 30s session_start wait, then
  // returns a generic "failed to start". The transcript must exist to resume it,
  // so fail fast and name the id (N-1).
  const transcript = driver.transcriptPath(sessionId, cwd, ctx.home);
  if (!existsSync(transcript)) {
    return {
      stderr: `Error: no transcript found for session '${sessionId}' under ${cwd} (expected ${transcript}); it cannot be adopted — check the session id and cwd.`,
      code: 1,
    };
  }

  // Root created privately (0700), refusing an existing root not owned by
  // the current user (CR-019) — see launch.ts's cmdLaunch for the same.
  ensureOwnedDir(ctx.workerDir);
  mkdirSync(join(ctx.workerDir, "bin"), { recursive: true, mode: 0o700 });

  const invocation =
    extraArgs.length > 0
      ? [tmuxName, cwd, sessionId, "--", ...extraArgs]
      : [tmuxName, cwd, sessionId];

  // Pre-write the meta keyed by sessionId so the SessionStart hook can record
  // events the moment claude starts.
  writeMeta(ctx.workerDir, {
    tmux_name: tmuxName,
    session_id: sessionId,
    cwd,
    harness: driver.id,
    started_at: isoSecondsUtc(),
    invocation,
  });

  const env = driver.workerEnv(ctx.home, tmuxName, process.env);
  await driver.prepare(tmuxName, cwd, ctx.home);

  const argv = [
    ...driver.launchArgv("adopt", sessionId, cwd, opts.pluginDir, ctx.home),
    ...extraArgs,
  ];

  let mode: string;
  if (await ctx.tmux.hasSession(tmuxName)) {
    mode = "respawned existing pane";
    await ctx.tmux.respawnPane(tmuxName, cwd, env, argv);
  } else {
    mode = "opened new pane";
    await ctx.tmux.newSession(tmuxName, cwd, env, argv);
  }

  await driver.postLaunch(tmuxName);

  const proof = await awaitSessionStart(ctx, tmuxName, sessionId, opts);
  if (!proof.started) {
    return { stderr: proof.failureMessage, code: 1 };
  }

  const shim = writeShim(ctx.workerDir, tmuxName, opts.moeCrewEntry);
  const panel = renderPanel({
    header: `Worker adopted (${mode}).`,
    verb: "adopt",
    tmuxName,
    sessionId,
    cwd,
    eventsFile: eventsPath(ctx.workerDir, sessionId),
    moeCrewPath: opts.moeCrewPath,
    invocation,
  });

  return { stdout: shim, stderr: panel, code: 0 };
}
