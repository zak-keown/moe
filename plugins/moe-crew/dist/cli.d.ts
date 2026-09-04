import type { CommandContext } from "./commands/context.js";
/** Writers the dispatcher prints through; tests inject capturing functions. */
export interface Io {
    out: (s: string) => void;
    err: (s: string) => void;
}
/**
 * The bootstrap opts launch/adopt need. In the tsup CJS bundle `__dirname` is
 * the `dist/` directory, so the plugin root is its parent and `moe-crew.cjs` sits
 * beside this file.
 */
export declare function resolvePluginRoot(bundleDir: string, environment?: NodeJS.ProcessEnv): string;
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
export declare function readLine(input?: NodeJS.ReadableStream): Promise<string>;
/**
 * The CLI dispatcher. Parses `--worker`, validates the subcommand against the
 * top-level/per-worker sets, builds the CommandContext, parses the per-command
 * args, runs the matching command, and prints its result. Returns the exit code
 * (never calls process.exit — the entry point does that).
 */
export declare function run(argv: string[], io?: Io): Promise<number>;
/**
 * Stream events to stdout until SIGINT. followEvents emits lines WITHOUT a
 * trailing newline, so the sink appends one. Resolves 0 once aborted.
 *
 * Tests inject `signal`/`pollMs` to drive the stream deterministically (append a
 * line, assert it arrives, abort). In production neither is passed: an internal
 * AbortController is wired to SIGINT.
 */
export declare function followStream(ctx: CommandContext, worker: string, opts: {
    type?: string | undefined;
    last?: number | undefined;
    pollMs?: number | undefined;
}, io: Io, signal?: AbortSignal): Promise<number>;
/**
 * The interactive consent confirm: print the prompt (the command's preamble is
 * printed by the command BEFORE this runs), read a line from `input` (default
 * stdin), resolve true iff it is 'yes'. Works for both an interactive TTY and a
 * pipe (`echo yes | moe-crew grant-consent`).
 */
export declare function grantConsentConfirm(io: Io, input?: NodeJS.ReadableStream): Promise<boolean>;
