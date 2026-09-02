const DEFAULT_WORKER_DIR = "/tmp/moe-crew-workers";

export function workerDir(): string {
  return process.env.MOE_CREW_WORKER_DIR ?? DEFAULT_WORKER_DIR;
}

export function eventsPath(dir: string, sid: string): string {
  return `${dir}/${sid}.events.jsonl`;
}

export function metaPath(dir: string, sid: string): string {
  return `${dir}/${sid}.meta`;
}

/**
 * tmux_name (and any other worker name keyed into these paths) is untrusted:
 * it round-trips through a `.meta` file on disk, which a co-resident local
 * user can plant ahead of `prune`/`stop`. Require a single safe path segment
 * so it can never carry `/`, `.` or `..` out of the worker dir.
 */
function assertSafeSegment(name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`unsafe worker name (must be a single [A-Za-z0-9_-]+ segment): ${JSON.stringify(name)}`);
  }
}

export function shimPath(dir: string, name: string): string {
  assertSafeSegment(name);
  return `${dir}/bin/${name}`;
}

/**
 * The per-worker home dir, keyed by tmux_name. Derive harnesses (codex's
 * CODEX_HOME, pi's PI_CODING_AGENT_DIR) stage the operator's auth and config
 * here during `prepare`. Deterministic from tmux_name so it can be re-derived
 * without persisted state; `stop`/`removeWorker` deletes it to clean up the
 * staged credentials.
 */
export function workerHomePath(dir: string, name: string): string {
  assertSafeSegment(name);
  return `${dir}/homes/${name}`;
}

/**
 * The sidecar harness marker keyed by tmux_name. Written at launch for derive
 * harnesses (codex), whose `<sid>.meta` does not exist until the producer
 * self-registers it on the first prompt — so per-worker commands can load the
 * right driver during that pre-registration window. Assign harnesses (claude)
 * carry the harness in the meta from launch and do not need this.
 */
export function harnessMarkerPath(dir: string, name: string): string {
  assertSafeSegment(name);
  return `${dir}/${name}.harness`;
}

export function claudeTranscriptPath(home: string, cwd: string, sid: string): string {
  return `${home}/.claude/projects/${cwd.replace(/[/._:]/g, "-")}/${sid}.jsonl`;
}
