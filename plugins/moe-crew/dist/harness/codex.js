/**
 * The Codex (OpenAI) harness driver. Parity port of the bash `codex.sh` driver
 * (skills/driving-claude-code-sessions/scripts/drivers/codex.sh), validated
 * end-to-end against codex 0.134.
 *
 * Codex's control plane is hooks (the SAME node `emit-event.cjs` bundle as
 * claude); the harness mints its OWN session id (idStrategy `derive`), so the
 * hook self-registers the worker meta — hence the hook command bakes the
 * tmux_name/cwd/worker_dir as positional args (B3 teaches emit-event to accept
 * them). `prepare` writes a per-worker `CODEX_HOME/config.toml` registering the
 * hook on every lifecycle event and trusting the project, and stages the
 * operator's `~/.codex/auth.json` so the worker authenticates as the operator.
 *
 * The TOML is built with a properly-quoted, escaping generator (no unquoted
 * interpolation): a cwd with spaces or quotes survives both as the
 * `[projects."<cwd>"]` table key and inside the shell-quoted hook `command`.
 *
 * `postLaunch` (dismiss the trust gate) and `awaitReady` (poll for the composer)
 * need tmux, which this interface does not hand the driver; they are documented
 * stubs here and the real tmux dance is wired into the launch command (B2/B4).
 */
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { workerDir } from "../core/paths.js";
import { shellQuoteAlways } from "../core/shell.js";
import { parseCodexTurn } from "../core/transcript.js";
import { ensureOwnedDir, readMeta, stageCredentialFile } from "../core/worker-store.js";
/** The lifecycle events codex fires our hook on, in config-file order. */
const CODEX_HOOK_EVENTS = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SessionEnd",
];
const DEFAULT_MODEL = "gpt-5.5";
/**
 * Escape a string for a TOML *basic* string (`"..."`): backslash and double
 * quote, plus the control chars TOML requires escaped. Used for both quoted
 * table keys and string values, so a path with `"`/`\`/newlines stays valid.
 */
function tomlBasicString(value) {
    let out = '"';
    for (const ch of value) {
        switch (ch) {
            case "\\":
                out += "\\\\";
                break;
            case '"':
                out += '\\"';
                break;
            case "\b":
                out += "\\b";
                break;
            case "\t":
                out += "\\t";
                break;
            case "\n":
                out += "\\n";
                break;
            case "\f":
                out += "\\f";
                break;
            case "\r":
                out += "\\r";
                break;
            default: {
                const code = ch.codePointAt(0) ?? 0;
                // Other control chars (U+0000–U+001F, U+007F) must be \uXXXX-escaped.
                if (code < 0x20 || code === 0x7f) {
                    out += `\\u${code.toString(16).padStart(4, "0")}`;
                }
                else {
                    out += ch;
                }
            }
        }
    }
    return `${out}"`;
}
/**
 * The absolute path to the bundled `emit-event.cjs`. Injectable via
 * `MOE_CREW_EMIT_EVENT_PATH` (tests set it); otherwise it sits next to the running
 * `moe-crew.cjs` bundle (tsup emits both into `dist/`), so `__dirname` is `dist/`.
 */
function emitEventPath() {
    const override = process.env.MOE_CREW_EMIT_EVENT_PATH;
    if (override)
        return override;
    return join(__dirname, "emit-event.cjs");
}
/** The per-worker tmux env: codex reads its config/auth/sessions from CODEX_HOME. */
export function codexWorkerEnv(workerHome) {
    return { CODEX_HOME: workerHome };
}
/**
 * Build the `config.toml` text for a worker. The hook `command` bakes the three
 * positional args (tmux_name, cwd, worker_dir) the self-registering hook needs,
 * each shell-quoted so codex's shell exec handles spaces/specials.
 */
export function buildCodexConfig(opts) {
    const { cwd, model, hookCommand } = opts;
    const lines = [
        `model = ${tomlBasicString(model)}`,
        // Hardcoded safe literal — no user input, no escaping needed (unlike `model`
        // and `cwd` which go through tomlBasicString because they come from the user).
        'model_reasoning_effort = "low"',
        `[projects.${tomlBasicString(cwd)}]`,
        'trust_level = "trusted"',
    ];
    for (const ev of CODEX_HOOK_EVENTS) {
        lines.push(`[[hooks.${ev}]]`);
        if (ev === "PreToolUse" || ev === "PostToolUse") {
            lines.push('matcher = ".*"');
        }
        lines.push(`[[hooks.${ev}.hooks]]`);
        lines.push('type = "command"');
        lines.push(`command = ${tomlBasicString(hookCommand)}`);
    }
    return `${lines.join("\n")}\n`;
}
export const codex = {
    id: "codex",
    controlPlane: "hooks",
    idStrategy: "derive",
    registersIdAtLaunch: false,
    quitKeys: "/quit",
    // Codex neither emits session_end nor exits on its quit keys, so the wait is
    // always wasted — kill quickly instead of burning the full backstop.
    stopGraceSeconds: 2,
    bin() {
        return process.env.MOE_CREW_CODEX_BIN ?? "codex";
    },
    // CODEX_HOME is per-worker, so the env genuinely depends on workerHome (unlike
    // claude). `tmuxName` is ignored: codex bakes its name into the hook command
    // args (see prepare), not the env. controllerEnv is unused: codex pins only
    // CODEX_HOME.
    workerEnv(workerHome, _tmuxName, _controllerEnv = process.env) {
        return codexWorkerEnv(workerHome);
    },
    // Codex ignores mode/sid (derive), pluginDir (hooks come via CODEX_HOME), and
    // workerHome (CODEX_HOME is set via env); `-C` sets the workdir.
    launchArgv(_mode, _sessionId, cwd, _pluginDir, _workerHome) {
        return [
            this.bin(),
            "--dangerously-bypass-approvals-and-sandbox",
            "--dangerously-bypass-hook-trust",
            "-C",
            cwd,
        ];
    },
    async prepare(tmuxName, cwd, workerHome) {
        // Private (0700), refuses an existing home not owned by the current
        // user (CR-021/CR-019) — a co-resident local account could otherwise
        // pre-plant this predictable <workerDir>/homes/<tmuxName> path.
        ensureOwnedDir(workerHome);
        // Stage the operator's codex auth so the worker authenticates as them.
        // stageCredentialFile refuses to follow a symlink planted at the
        // destination (CR-021).
        const auth = join(homedir(), ".codex", "auth.json");
        stageCredentialFile(auth, join(workerHome, "auth.json"));
        const hookCommand = [
            "node",
            shellQuoteAlways(emitEventPath()),
            shellQuoteAlways(tmuxName),
            shellQuoteAlways(cwd),
            shellQuoteAlways(workerDir()),
        ].join(" ");
        const config = buildCodexConfig({
            cwd,
            model: process.env.MOE_CREW_CODEX_MODEL ?? DEFAULT_MODEL,
            hookCommand,
        });
        writeFileSync(join(workerHome, "config.toml"), config);
    },
    // The trust-gate dismissal needs the tmux pane, which this interface does not
    // pass the driver. Codex's "Hooks need review" gate is dismissed by the launch
    // command's post-launch step (B2/B4); this stays a no-op at the driver level.
    async postLaunch(_tmuxName) { },
    // Readiness (poll the pane for the composer glyph) also needs tmux; codex's
    // session_start fires at the first prompt, not boot, so the real wait lives in
    // the launch command (B2/B4). No-op here.
    async awaitReady(_tmuxName, _sessionId) { },
    // Codex mints its own session id, so the transcript path is not derivable from
    // (cwd, home): the self-registering hook records it in `<sid>.meta`. We read it
    // back from the worker dir's meta. Returns '' when the meta or field is absent.
    transcriptPath(sessionId, _cwd, _workerHome) {
        const meta = readMeta(workerDir(), sessionId);
        const path = meta?.transcript_path;
        return typeof path === "string" ? path : "";
    },
    parseTurn(transcript) {
        return parseCodexTurn(transcript);
    },
};
