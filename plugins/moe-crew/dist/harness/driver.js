/**
 * The harness-driver abstraction: the load-bearing seam that lets one CLI drive
 * Claude, Codex, and Pi workers. Each harness implements this same shape; the
 * launch/read commands talk only to the interface (see the moe-crew multiharness
 * design spec §6).
 *
 * `launchArgv` is harness-specific. `prepare`/`postLaunch`/`awaitReady` are the
 * per-harness hooks the launch command orchestrates around (codex writes a
 * CODEX_HOME config in `prepare`; a harness with a trust gate dismisses it in
 * `postLaunch`). The transcript seam is split: `transcriptPath` locates the
 * JSONL, `parseTurn` does the harness-specific parse into the shared
 * `NormalizedTurn`.
 */
export {};
