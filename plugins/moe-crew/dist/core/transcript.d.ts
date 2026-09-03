/**
 * Normalized turn model + shared markdown renderer + Claude transcript parser.
 *
 * PARSE is harness-specific: read a transcript's JSONL and produce a
 * NormalizedTurn. RENDER is shared: NormalizedTurn -> markdown. `parseClaudeTurn`
 * and `parseCodexTurn` both produce the SAME NormalizedTurn and reuse
 * `renderTurn`; the Pi driver will add its own parse the same way.
 *
 * This is a character-for-character port of the jq pipeline in the upstream bash `csd`
 * (upstream skills/driving-claude-code-sessions/scripts/csd). jq `-r` prints each emitted
 * string followed by a newline, so each rendered chunk (already ending in `\n`)
 * is followed by one more `\n` — see `renderTurn`.
 */
export type TurnItem = {
    kind: "prompt";
    text: string;
} | {
    kind: "thinking";
    text: string;
} | {
    kind: "text";
    text: string;
} | {
    kind: "tool_use";
    name: string;
    input: unknown;
} | {
    kind: "tool_result";
    content: string;
    isError: boolean;
};
export type NormalizedTurn = TurnItem[];
export declare function parseClaudeTurn(jsonl: string): NormalizedTurn;
export declare function parseCodexTurn(jsonl: string): NormalizedTurn;
export declare function parsePiTurn(jsonl: string): NormalizedTurn;
export declare function renderTurn(turn: NormalizedTurn, opts: {
    full: boolean;
}): string;
/**
 * The markdown turn as a `read-turn`/`converse --with-turn` command result.
 *
 * `renderTurn` ends in `\n\n` (the jq `-r` parity ending). The CLI's `emit`
 * appends one more `\n` to every command's stdout, which would make the worker
 * surface emit THREE trailing newlines where bash's `read-turn` emits exactly
 * two. Strip a single trailing `\n` here so emit's append lands back on bash's
 * `\n\n`. Both command paths (read-turn and converse --with-turn) use this, so
 * they stay byte-identical.
 */
export declare function renderTurnForCommand(turn: NormalizedTurn, opts: {
    full: boolean;
}): string;
/**
 * The assistant's reply text for a parsed turn: the `text` items joined with
 * newlines. Harness-agnostic — works for any driver's `parseTurn` output, so
 * converse can extract the reply uniformly across claude/codex/pi (the
 * claude-only `lastAssistantText` count-gate could not). Empty when the turn has
 * no assistant text yet (e.g. the transcript has not caught up after `stop`).
 */
export declare function assistantText(turn: NormalizedTurn): string;
