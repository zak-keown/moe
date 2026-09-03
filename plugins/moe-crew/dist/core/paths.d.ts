export declare function workerDir(): string;
export declare function eventsPath(dir: string, sid: string): string;
export declare function metaPath(dir: string, sid: string): string;
export declare function shimPath(dir: string, name: string): string;
/**
 * The per-worker home dir, keyed by tmux_name. Derive harnesses (codex's
 * CODEX_HOME, pi's PI_CODING_AGENT_DIR) stage the operator's auth and config
 * here during `prepare`. Deterministic from tmux_name so it can be re-derived
 * without persisted state; `stop`/`removeWorker` deletes it to clean up the
 * staged credentials.
 */
export declare function workerHomePath(dir: string, name: string): string;
/**
 * The sidecar harness marker keyed by tmux_name. Written at launch for derive
 * harnesses (codex), whose `<sid>.meta` does not exist until the producer
 * self-registers it on the first prompt — so per-worker commands can load the
 * right driver during that pre-registration window. Assign harnesses (claude)
 * carry the harness in the meta from launch and do not need this.
 */
export declare function harnessMarkerPath(dir: string, name: string): string;
export declare function claudeTranscriptPath(home: string, cwd: string, sid: string): string;
