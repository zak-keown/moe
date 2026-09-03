/**
 * The Pi (@earendil-works/pi-coding-agent) harness driver. Pi is the third
 * harness; its control plane is a native TypeScript EXTENSION (the bundled
 * `dist/pi-extension.mjs`, loaded via `pi -e <path>`), NOT lifecycle hooks. The
 * verified contract this driver implements is the C1 comment block atop
 * `src/pi-extension/index.ts`.
 *
 * Pi mints its OWN session id (idStrategy `derive`; there is NO `--session-id`
 * flag), so the extension self-registers `<sid>.meta` on its first event — and
 * `transcriptPath` reads `transcript_path` back from that meta, exactly like the
 * codex driver. The extension reads `MOE_CREW_WORKER_DIR` + `MOE_CREW_TMUX_NAME` from the
 * worker env (C2's contract), so `workerEnv` pins those plus
 * `PI_CODING_AGENT_DIR` (the per-worker agent dir holding auth/sessions).
 *
 * `prepare` is LIGHTER than codex's: there is no per-worker config file to write
 * because the extension is registered by the `-e` launch flag and the rest of
 * pi's wiring rides in the env. `prepare` only ensures the worker home exists
 * and stages the operator's `~/.pi/agent/auth.json` (and `models.json` /
 * `settings.json` if present) so the worker authenticates as the operator.
 *
 * `postLaunch` (any post-launch fixup) and `awaitReady` (pi's composer/prompt
 * ready signal) need the tmux pane, which this interface does not hand the
 * driver; they are documented no-ops here and the launch command (C4) wires pi's
 * launch-time await, analogous to codex's trust-gate/composer dance.
 */
import type { HarnessDriver } from "./driver.js";
/**
 * The per-worker tmux env. Pi reads its auth/sessions from PI_CODING_AGENT_DIR;
 * the moe-crew extension (C2) reads MOE_CREW_WORKER_DIR (the events/meta sink) and
 * MOE_CREW_TMUX_NAME (baked into the self-registered meta) from this env.
 */
export declare function piWorkerEnv(workerHome: string, tmuxName: string): Record<string, string>;
export declare const pi: HarnessDriver;
