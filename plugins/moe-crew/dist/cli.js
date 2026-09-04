import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { cmdAdopt } from "./commands/adopt.js";
import { cmdConverse } from "./commands/converse.js";
import { cmdEventsFile } from "./commands/events-file.js";
import { cmdGrantConsent } from "./commands/grant-consent.js";
import { cmdHandoff } from "./commands/handoff.js";
import { cmdLaunch } from "./commands/launch.js";
import { cmdList } from "./commands/list.js";
import { cmdPack, cmdPackStop } from "./commands/pack.js";
import { cmdPrune } from "./commands/prune.js";
import { cmdReadEvents, followEvents } from "./commands/read-events.js";
import { cmdReadTurn } from "./commands/read-turn.js";
import { cmdSend } from "./commands/send.js";
import { cmdSessionId } from "./commands/session-id.js";
import { cmdStatus } from "./commands/status.js";
import { cmdStop } from "./commands/stop.js";
import { cmdWaitForTurn } from "./commands/wait-for-turn.js";
import { harnessMarkerPath, workerDir } from "./core/paths.js";
import { tmux } from "./core/tmux.js";
import { readHarnessMarker, readMeta, resolveSession } from "./core/worker-store.js";
import { detectInstalledHarnesses, getDriver } from "./harness/registry.js";
import { resolveHarness } from "./harness/resolver.js";
const realIo = {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
};
const TOP_LEVEL_SUBS = [
    "launch",
    "adopt",
    "list",
    "pack",
    "pack-stop",
    "prune",
    "grant-consent",
    "help",
];
const PER_WORKER_SUBS = [
    "converse",
    "send",
    "wait-for-turn",
    "status",
    "read-events",
    "read-turn",
    "stop",
    "handoff",
    "session-id",
    "events-file",
];
/**
 * The user contract. Ported from the bash `usage()` heredoc, updated for the
 * TypeScript multi-harness tool: the `--harness` launch flag, the private
 * per-user default worker dir, and the per-harness env vars.
 */
const USAGE = `Usage: moe-crew <subcommand> [args...]
       moe-crew --worker <name> <subcommand> [args...]

A worker is a coding-agent session (Claude Code, Codex, or Pi) in a tmux pane
that emits lifecycle events the controller observes. \`moe-crew launch\` prints a
*shim path* on stdout (deterministic at <worker-dir>/bin/<tmux-name> — see
MOE_CREW_WORKER_DIR below) — run that shim for all per-worker subcommands.
\`moe-crew stop\` removes the shim along with the worker's state. The per-worker
surface is identical across harnesses.

Top-level subcommands:
  launch [--harness <claude|codex|pi>] [--worktree] <tmux-name> <cwd> [-- harness-args...]
                       Bootstrap a worker. Without --harness, selection uses
                       MOE_CREW_DEFAULT_HARNESS or the sole installed harness.
                       Shim path on stdout, panel on stderr. --worktree creates a
                       disposable git worktree per worker so parallel workers
                       do not race on git state; stop removes it
  adopt <tmux-name> <cwd> <session-id> [-- claude-args...]
                       Re-adopt an existing Claude session as a driveable
                       worker via \`claude --resume <session-id>\` (claude-only;
                       codex/pi mint their own ids and offer no resume-by-id).
                       Restores a worker after a reboot/crash wiped the
                       worker directory while the conversation transcript
                       survived. If a tmux session named <tmux-name> already
                       exists (e.g. restored by tmux-resurrect), respawns its
                       pane in place; else opens a new one. Shim path on stdout,
                       panel on stderr
  list [--all] [<pattern>]
                       Enumerate workers (default: skip workers whose tmux is
                       gone). Optional pattern filters by tmux-name substring
  pack [--harness <claude|codex|pi>] <pack-file> [cwd]
                       Launch a predefined team of workers from a YAML pack
                       file. --harness is the command default; each worker's
                       harness overrides it, followed by pack defaultHarness.
                       cwd defaults to the current directory
  pack-stop <name-or-file>
                       Stop all workers belonging to a pack. Accepts either
                       a pack name or a pack YAML file path (reads the name)
  prune                Remove the runtime state of all \`gone\` workers (tmux
                       session dead); live workers are untouched
  grant-consent        One-time consent for running workers with permissions
                       bypassed (--dangerously-skip-permissions et al.)
  help                 Show this message

Per-worker subcommands (require --worker, supplied by the shim):
  converse [--with-turn] <prompt> [timeout=120]
                       Send prompt, wait for turn, return assistant text.
                       --with-turn returns the full markdown turn instead
  send <prompt>        Send a prompt without waiting for the turn
  wait-for-turn [timeout=60] [--after-line N]
                       Block until the next stop OR session_end. By default the
                       baseline is the events file's current end, so it waits for
                       a NEW turn-end; pass --after-line N to wait for the first
                       turn-end after line N (a baseline you captured earlier)
  status               idle | working | terminated | gone | unknown
  read-events [--last N] [--type T] [--follow]
                       Read the event JSONL stream. With --follow, --last N caps
                       the replayed backlog to the last N events before tailing
                       (--last 0 = only NEW events; omit = replay everything)
  read-turn [--full]   Last turn as markdown. Without --full, tool results
                       are truncated to 5 lines; --full shows them complete
  stop                 /exit, clean up meta + events + shim
  handoff              Print tmux-attach instructions for a human
  session-id           Print the worker's session id
  events-file          Print the absolute path to the events JSONL

Environment variables:
  MOE_CREW_DEFAULT_HARNESS
                       Default harness when neither a worker nor --harness nor
                       pack defaultHarness selects one. Must be claude, codex,
                       or pi. With no default, the sole installed harness wins;
                       zero or multiple installed harnesses is a usage error.
  MOE_CREW_PLUGIN_ROOT Root of the installed moe-crew plugin. Defaults to the
                       parent of the running bundle's dist directory.
  MOE_CREW_CLAUDE_BIN / MOE_CREW_CODEX_BIN / MOE_CREW_PI_BIN
                       Path to each harness binary (defaults: claude / codex / pi,
                       resolved via PATH). Set when the binary is not on PATH or you
                       want to pin a specific version.
  MOE_CREW_CODEX_MODEL / MOE_CREW_PI_MODEL
                       Optional model override for codex / pi workers. Unset = the
                       harness default (codex: gpt-5.5; pi: its configured default).
  MOE_CREW_CONVERSE_DIAG_FILE
                       When set, \`converse\` writes a post-mortem diagnostic (ps tree +
                       tmux capture-pane + worker session JSONL tail + moe-crew events tail)
                       to this path on timeout, then emits "moe-crew-diagnostic: <path>" to
                       stderr. Overwritten on each timeout. Unset = no diagnostic file.
  MOE_CREW_WORKER_DIR  Directory for worker runtime state (meta/events/shim).
                       Default: $XDG_RUNTIME_DIR/moe-crew-workers if set, else
                       ~/.local/state/moe-crew/workers. Created privately
                       (mode 0700); refuses an existing directory not owned
                       by the current user.
  MOE_CREW_SUBMIT_TIMEOUT / MOE_CREW_SUBMIT_RETRY_INTERVAL
                       \`send\`: seconds to wait for the worker to confirm a pasted
                       prompt (default 10) and seconds between retry-Enter resends
                       (default 2).
  MOE_CREW_REGISTER_TIMEOUT
                       Seconds the FIRST \`send\` to a derive worker (codex/pi) waits
                       for it to self-register its session id (default 15).
  XDG_STATE_HOME       Durable Moe state root. Consent is stored at
                       $XDG_STATE_HOME/moe/crew/consent, falling back to
                       ~/.local/state/moe/crew/consent.
  HOME                 Home-directory fallback and harness-owned state root.
`;
function err(message, code = 2) {
    return { message, code };
}
/**
 * Parse a leading `--worker <val>` / `--worker=val` (upstream bash `csd`:950-963). Returns
 * the worker (or undefined) plus the remaining argv after the worker flag, or a
 * DispatchError when `--worker` is given with no value.
 */
function parseWorker(argv) {
    let worker;
    let i = 0;
    while (i < argv.length) {
        const a = argv[i] ?? "";
        if (a === "--worker") {
            if (i + 1 >= argv.length) {
                return err("Error: --worker requires a value");
            }
            worker = argv[i + 1];
            i += 2;
        }
        else if (a.startsWith("--worker=")) {
            worker = a.slice("--worker=".length);
            i += 1;
        }
        else {
            break;
        }
    }
    // bash uses `[ -z "$WORKER" ]`: an empty worker (`--worker=` or `--worker ""`)
    // is treated as MISSING, not as a literal worker named '' (which would yield
    // exit 1 "no worker known as ''" instead of the exit 2 "required" error).
    return { worker: worker ? worker : undefined, rest: argv.slice(i) };
}
/**
 * The harness id for a per-worker command's `worker`. Read from the worker meta
 * (`harness`) once it exists; during a derive worker's pre-registration window
 * (codex, before its hook self-registers the meta) fall back to the sidecar
 * `<tmux_name>.harness` marker launch wrote. Returns no persisted selection
 * when neither exists; the worker command itself then reports the unknown
 * worker without treating that provisional context as durable state.
 */
function resolveWorkerHarness(dir, worker) {
    const sid = resolveSession(dir, worker);
    if (sid !== null) {
        const meta = readMeta(dir, sid);
        if (meta === null)
            return { found: true, value: "(missing or unreadable metadata)" };
        return {
            found: true,
            value: meta.harness ?? "(missing harness field in worker metadata)",
        };
    }
    const marker = readHarnessMarker(dir, worker);
    if (marker !== null)
        return { found: true, value: marker };
    if (existsSync(harnessMarkerPath(dir, worker)))
        return { found: true, value: "" };
    return { found: false };
}
/**
 * Build the CommandContext: real tmux and the per-worker harness driver. For
 * per-worker commands the driver is resolved from the worker's meta/sidecar so
 * codex workers drive the codex transcript/send paths. Top-level commands use
 * a provisional Claude driver only as inert context: launch and pack resolve
 * their actual drivers before any harness-specific work, while adopt is
 * explicitly Claude-only.
 */
function buildContext(worker) {
    const dir = workerDir();
    let harness = "claude";
    if (worker !== undefined) {
        const persisted = resolveWorkerHarness(dir, worker);
        if (persisted.found) {
            const resolution = resolveHarness({ worker: persisted.value, installed: [] });
            if (!resolution.ok)
                return err(`Error: ${resolution.diagnostic}`, resolution.code);
            harness = resolution.harness;
        }
    }
    return {
        workerDir: dir,
        home: process.env.HOME ?? homedir(),
        environment: process.env,
        tmux,
        driver: getDriver(harness),
    };
}
/**
 * The bootstrap opts launch/adopt need. In the tsup CJS bundle `__dirname` is
 * the `dist/` directory, so the plugin root is its parent and `moe-crew.cjs` sits
 * beside this file.
 */
export function resolvePluginRoot(bundleDir, environment = process.env) {
    return environment.MOE_CREW_PLUGIN_ROOT || resolve(bundleDir, "..");
}
function bootstrapOpts() {
    const moeCrewEntry = join(__dirname, "moe-crew.cjs");
    return {
        pluginDir: resolvePluginRoot(__dirname),
        moeCrewEntry,
        moeCrewPath: process.env.MOE_CREW_PATH || moeCrewEntry,
    };
}
/**
 * Read the first line from `input` (default stdin), resolving the trimmed
 * string. On EOF without a line (empty pipe), resolves '' so the caller does not
 * hang forever waiting for a line that never arrives.
 *
 * Piped (non-TTY) stdin is the subtle case: readline can emit `'close'` in the
 * same tick as the buffered `'line'`, and a naive `close -> resolve('')` races
 * ahead of the line, dropping it — so `echo yes | moe-crew grant-consent` would deny
 * consent (a parity regression; bash `read -r` reads it fine). We capture the
 * first line and resolve with whatever we captured on close, so a received line
 * always wins.
 */
export function readLine(input = process.stdin) {
    return new Promise((res) => {
        const rl = createInterface({ input });
        let captured = null;
        rl.once("line", (line) => {
            captured = line.trim();
            rl.close();
        });
        rl.once("close", () => res(captured ?? ""));
    });
}
/** Parse `launch [--harness <id>] [--worktree] <tmux-name> <cwd> [-- harness-args...]`. */
function parseLaunchArgs(argv) {
    const usage = "Usage: launch <tmux-name> <cwd> [-- harness-args...]";
    const positionals = [];
    let harness;
    let worktree = false;
    let extraArgs = [];
    let i = 0;
    while (i < argv.length) {
        const a = argv[i] ?? "";
        if (a === "--") {
            extraArgs = argv.slice(i + 1);
            break;
        }
        if (a === "--harness") {
            const value = argv[i + 1];
            if (value === undefined) {
                return err("Error: --harness expects a value for launch");
            }
            // Validate the id against the driver registry at parse time so an unknown
            // harness yields a clean code-2 error instead of a stack trace from
            // getDriver() inside cmdLaunch.
            const resolution = resolveHarness({ command: value, installed: [] });
            if (!resolution.ok)
                return err(resolution.diagnostic, resolution.code);
            harness = resolution.harness;
            i += 2;
            continue;
        }
        if (a === "--worktree") {
            worktree = true;
            i += 1;
            continue;
        }
        positionals.push(a);
        i += 1;
    }
    const [tmuxName, cwd] = positionals;
    if (tmuxName === undefined || cwd === undefined)
        return err(usage);
    return {
        tmuxName,
        cwd,
        extraArgs,
        ...(harness !== undefined ? { harness } : {}),
        ...(worktree ? { worktree: true } : {}),
    };
}
/** Parse `adopt <tmux-name> <cwd> <session-id> [-- claude-args...]`. */
function parseAdoptArgs(argv) {
    const usage = "Usage: adopt <tmux-name> <cwd> <session-id> [-- claude-args...]";
    let rest = argv;
    let extraArgs = [];
    const sep = rest.indexOf("--");
    if (sep !== -1) {
        extraArgs = rest.slice(sep + 1);
        rest = rest.slice(0, sep);
    }
    const [tmuxName, cwd, sessionId] = rest;
    if (tmuxName === undefined || cwd === undefined || sessionId === undefined) {
        return err(usage);
    }
    return { tmuxName, cwd, sessionId, extraArgs };
}
/** Parse `pack [--harness <id>] <pack-file> [cwd]`. */
function parsePackArgs(argv) {
    const positionals = [];
    let harness;
    let i = 0;
    while (i < argv.length) {
        const value = argv[i] ?? "";
        if (value === "--harness") {
            const requested = argv[i + 1];
            if (requested === undefined)
                return err("Error: --harness expects a value for pack");
            const resolution = resolveHarness({ command: requested, installed: [] });
            if (!resolution.ok)
                return err(resolution.diagnostic, resolution.code);
            harness = resolution.harness;
            i += 2;
            continue;
        }
        if (value.startsWith("--"))
            return err(`Error: unknown option '${value}' for pack`);
        positionals.push(value);
        i += 1;
    }
    const packFile = positionals[0];
    if (packFile === undefined || positionals.length > 2) {
        return err("Usage: pack [--harness <claude|codex|pi>] <pack-file> [cwd]");
    }
    return {
        packFile,
        cwd: positionals[1] ?? process.cwd(),
        ...(harness !== undefined ? { harness } : {}),
    };
}
/** Print a CommandResult and return its code; each stream gets a trailing newline. */
function emit(io, result) {
    if (result.stdout !== undefined && result.stdout.length > 0) {
        io.out(`${result.stdout}\n`);
    }
    if (result.stderr !== undefined && result.stderr.length > 0) {
        io.err(`${result.stderr}\n`);
    }
    return result.code;
}
/**
 * The CLI dispatcher. Parses `--worker`, validates the subcommand against the
 * top-level/per-worker sets, builds the CommandContext, parses the per-command
 * args, runs the matching command, and prints its result. Returns the exit code
 * (never calls process.exit — the entry point does that).
 */
export async function run(argv, io = realIo) {
    const parsed = parseWorker(argv);
    if ("code" in parsed) {
        io.err(`${parsed.message}\n`);
        return parsed.code;
    }
    const { worker, rest } = parsed;
    const sub = rest[0];
    const args = rest.slice(1);
    if (sub === undefined) {
        io.err(USAGE);
        return 2;
    }
    if (TOP_LEVEL_SUBS.includes(sub)) {
        if (worker !== undefined) {
            io.err(`Error: --worker is not valid for '${sub}' (top-level subcommand)\n`);
            return 2;
        }
    }
    else if (PER_WORKER_SUBS.includes(sub)) {
        if (worker === undefined) {
            io.err(`Error: --worker <name> is required for '${sub}'\n`);
            return 2;
        }
    }
    else {
        io.err(`Error: unknown subcommand '${sub}'\n`);
        io.err(USAGE);
        return 2;
    }
    if (sub === "help") {
        io.out(USAGE);
        return 0;
    }
    const builtContext = buildContext(worker);
    if ("code" in builtContext) {
        io.err(`${builtContext.message}\n`);
        return builtContext.code;
    }
    const ctx = builtContext;
    // PER_WORKER_SUBS validation above guarantees `worker` is set for those subs.
    const w = worker;
    switch (sub) {
        case "grant-consent":
            return emit(io, await cmdGrantConsent(ctx, {
                warn: (text) => io.out(`${text}\n`),
                confirm: () => grantConsentConfirm(io),
            }));
        case "launch": {
            const parsedArgs = parseLaunchArgs(args);
            if ("code" in parsedArgs) {
                io.err(`${parsedArgs.message}\n`);
                return parsedArgs.code;
            }
            const resolution = resolveHarness({
                command: parsedArgs.harness,
                environment: process.env.MOE_CREW_DEFAULT_HARNESS,
                installed: detectInstalledHarnesses(),
            });
            if (!resolution.ok) {
                io.err(`Error: ${resolution.diagnostic}\n`);
                return resolution.code;
            }
            return emit(io, await cmdLaunch(ctx, { ...parsedArgs, harness: resolution.harness }, bootstrapOpts()));
        }
        case "adopt": {
            const parsedArgs = parseAdoptArgs(args);
            if ("code" in parsedArgs) {
                io.err(`${parsedArgs.message}\n`);
                return parsedArgs.code;
            }
            return emit(io, await cmdAdopt(ctx, parsedArgs, bootstrapOpts()));
        }
        case "list": {
            const opts = parseListArgs(args);
            if ("code" in opts) {
                io.err(`${opts.message}\n`);
                return opts.code;
            }
            return emit(io, await cmdList(ctx, opts));
        }
        case "pack": {
            const parsedArgs = parsePackArgs(args);
            if ("code" in parsedArgs) {
                io.err(`${parsedArgs.message}\n`);
                return parsedArgs.code;
            }
            return emit(io, await cmdPack(ctx, parsedArgs, bootstrapOpts()));
        }
        case "pack-stop": {
            const nameOrFile = args[0];
            if (nameOrFile === undefined) {
                io.err("Usage: pack-stop <name-or-file>\n");
                return 2;
            }
            return emit(io, await cmdPackStop(ctx, { nameOrFile }));
        }
        case "prune":
            return emit(io, await cmdPrune(ctx));
        case "converse": {
            let withTurn = false;
            let i = 0;
            if (args[i] === "--with-turn") {
                withTurn = true;
                i += 1;
            }
            const prompt = args[i];
            if (prompt === undefined || prompt.trim() === "") {
                io.err("Usage: converse [--with-turn] <prompt> [timeout=120]\n");
                return 1;
            }
            let timeout = 120;
            if (args[i + 1] !== undefined) {
                timeout = Number(args[i + 1]);
                if (!Number.isFinite(timeout)) {
                    io.err("Error: converse timeout must be a number\n");
                    return 2;
                }
            }
            return emit(io, await cmdConverse(ctx, w, prompt, { withTurn, timeout }));
        }
        case "send": {
            const prompt = args[0];
            if (prompt === undefined || prompt.trim() === "") {
                io.err("Usage: send <prompt-text>\n");
                return 1;
            }
            return emit(io, await cmdSend(ctx, w, prompt));
        }
        case "wait-for-turn": {
            const opts = parseWaitForTurnArgs(args);
            if ("code" in opts) {
                io.err(`${opts.message}\n`);
                return opts.code;
            }
            return emit(io, await cmdWaitForTurn(ctx, w, opts));
        }
        case "read-events": {
            const opts = parseReadEventsArgs(args);
            if ("code" in opts) {
                io.err(`${opts.message}\n`);
                return opts.code;
            }
            if (opts.follow) {
                return followStream(ctx, w, opts, io);
            }
            return emit(io, await cmdReadEvents(ctx, w, { last: opts.last, type: opts.type }));
        }
        case "read-turn": {
            const full = args[0] === "--full";
            return emit(io, await cmdReadTurn(ctx, w, { full }));
        }
        case "status":
            return emit(io, await cmdStatus(ctx, w));
        case "handoff":
            return emit(io, await cmdHandoff(ctx, w));
        case "session-id":
            return emit(io, await cmdSessionId(ctx, w));
        case "events-file":
            return emit(io, await cmdEventsFile(ctx, w));
        case "stop":
            return emit(io, await cmdStop(ctx, w));
        default:
            // Unreachable: validated against PER_WORKER_SUBS/TOP_LEVEL_SUBS above.
            io.err(`Error: unknown subcommand '${sub}'\n`);
            return 2;
    }
}
/** Parse `list [--all] [<pattern>]`. */
function parseListArgs(argv) {
    let all = false;
    let pattern;
    for (const a of argv) {
        if (a === "--all") {
            all = true;
        }
        else if (a.startsWith("--")) {
            return err(`Error: unknown option '${a}' for list`);
        }
        else if (pattern !== undefined) {
            return err("Error: list takes at most one pattern argument");
        }
        else {
            pattern = a;
        }
    }
    return { all, pattern };
}
/** Parse `wait-for-turn [timeout=60] [--after-line N]`. */
function parseWaitForTurnArgs(argv) {
    let timeout;
    let afterLine;
    let i = 0;
    while (i < argv.length) {
        const a = argv[i] ?? "";
        if (a === "--after-line") {
            const value = argv[i + 1];
            const n = value !== undefined ? Number(value) : Number.NaN;
            if (!Number.isFinite(n)) {
                return err("Error: --after-line expects a number for wait-for-turn");
            }
            afterLine = n;
            i += 2;
        }
        else if (/^[0-9]/.test(a)) {
            const n = Number(a);
            if (!Number.isFinite(n)) {
                return err("Error: wait-for-turn timeout must be a number");
            }
            timeout = n;
            i += 1;
        }
        else {
            return err(`Error: unknown option '${a}' for wait-for-turn`);
        }
    }
    return { timeout, afterLine };
}
/** Parse `read-events [--last N] [--type T] [--follow]`. */
function parseReadEventsArgs(argv) {
    let last;
    let type;
    let follow = false;
    let i = 0;
    while (i < argv.length) {
        const a = argv[i] ?? "";
        if (a === "--last") {
            const value = argv[i + 1];
            const n = value !== undefined ? Number(value) : Number.NaN;
            if (!Number.isFinite(n)) {
                return err("Error: --last expects a number for read-events");
            }
            last = n;
            i += 2;
        }
        else if (a === "--type") {
            const value = argv[i + 1];
            // A missing value or a following flag (e.g. `--type --follow`) means the
            // type value is absent; do not swallow the next flag as the value.
            if (value === undefined || value.startsWith("--")) {
                return err("Error: --type expects a value for read-events");
            }
            type = value;
            i += 2;
        }
        else if (a === "--follow") {
            follow = true;
            i += 1;
        }
        else {
            return err(`Error: unknown option '${a}' for read-events`);
        }
    }
    return { last, type, follow };
}
/**
 * Stream events to stdout until SIGINT. followEvents emits lines WITHOUT a
 * trailing newline, so the sink appends one. Resolves 0 once aborted.
 *
 * Tests inject `signal`/`pollMs` to drive the stream deterministically (append a
 * line, assert it arrives, abort). In production neither is passed: an internal
 * AbortController is wired to SIGINT.
 */
export function followStream(ctx, worker, opts, io, signal) {
    const followOpts = { type: opts.type, last: opts.last, pollMs: opts.pollMs };
    if (signal !== undefined) {
        return followEvents(ctx, worker, followOpts, (line) => io.out(`${line}\n`), signal).then(() => 0);
    }
    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.on("SIGINT", onSigint);
    return followEvents(ctx, worker, followOpts, (line) => io.out(`${line}\n`), controller.signal)
        .then(() => 0)
        .finally(() => process.off("SIGINT", onSigint));
}
/**
 * The interactive consent confirm: print the prompt (the command's preamble is
 * printed by the command BEFORE this runs), read a line from `input` (default
 * stdin), resolve true iff it is 'yes'. Works for both an interactive TTY and a
 * pipe (`echo yes | moe-crew grant-consent`).
 */
export async function grantConsentConfirm(io, input = process.stdin) {
    io.out("Type 'yes' to grant consent:\n");
    const reply = await readLine(input);
    return reply === "yes";
}
// Run the CLI only when executed as the bundled `node dist/moe-crew.cjs`. In the
// tsup CJS bundle `require.main === module` is true only then; under vitest's
// ESM import of this source it is not, so run() does not fire during tests.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    run(process.argv.slice(2))
        .then((c) => process.exit(c))
        .catch((e) => {
        process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    });
}
