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
import { canonicalToolName } from "./tool-name.js";
const COMMAND_PREFIX = /^<(local-command|command-name)/;
const NO_OUTPUT = "(no output)";
function parseLines(jsonl) {
    const out = [];
    for (const line of jsonl.split("\n")) {
        if (line.length === 0)
            continue;
        try {
            out.push(JSON.parse(line));
        }
        catch {
            // Real transcripts can contain partial/garbage lines; skip them.
        }
    }
    return out;
}
/** True for a `"type":"user"` line whose content is a real prompt string. */
function isPromptBoundary(line) {
    if (line.type !== "user")
        return false;
    const content = line.message?.content;
    return typeof content === "string" && !COMMAND_PREFIX.test(content);
}
function findBoundary(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
        if (isPromptBoundary(lines[i]))
            return i;
    }
    return -1;
}
/**
 * Mirror jq's `.content // "(no output)"`: yield `(no output)` when content is
 * null/undefined; otherwise coerce to string. (An empty string passes through in
 * jq's `//`; we treat only null/undefined as missing for parity simplicity.)
 */
function resultContent(content) {
    if (content === null || content === undefined)
        return NO_OUTPUT;
    return String(content);
}
/**
 * Narrow a raw array element to a block object, or null if it isn't one.
 * Real transcripts can contain partial/garbage array elements (null, numbers,
 * strings); mirror `parseLines`' graceful-degradation by skipping them rather
 * than throwing on `block.type`.
 */
function asBlock(x) {
    return typeof x === "object" && x !== null ? x : null;
}
function collectUser(line, out) {
    const content = line.message?.content;
    if (typeof content === "string") {
        if (!COMMAND_PREFIX.test(content))
            out.push({ kind: "prompt", text: content });
        return;
    }
    if (!Array.isArray(content))
        return;
    for (const raw of content) {
        const block = asBlock(raw);
        if (!block)
            continue;
        if (block.type !== "tool_result")
            continue;
        out.push({
            kind: "tool_result",
            content: resultContent(block.content),
            isError: Boolean(block.is_error),
        });
    }
}
function collectAssistant(line, out) {
    const content = line.message?.content;
    if (!Array.isArray(content))
        return;
    // A missing `thinking`/`text`/`name` field renders as an empty string rather
    // than the literal "undefined": graceful empty is clearer than jq's behavior
    // of dropping the whole turn when such a field is absent.
    for (const raw of content) {
        const block = asBlock(raw);
        if (!block)
            continue;
        if (block.type === "thinking") {
            const text = typeof block.thinking === "string" ? block.thinking : "";
            out.push({ kind: "thinking", text });
        }
        else if (block.type === "text") {
            const text = typeof block.text === "string" ? block.text : "";
            out.push({ kind: "text", text });
        }
        else if (block.type === "tool_use") {
            const name = typeof block.name === "string" ? block.name : "";
            out.push({
                kind: "tool_use",
                name,
                input: block.input,
            });
        }
    }
}
export function parseClaudeTurn(jsonl) {
    const lines = parseLines(jsonl);
    const boundary = findBoundary(lines);
    if (boundary < 0)
        return [];
    const turn = [];
    for (const line of lines.slice(boundary)) {
        if (line.type === "user")
            collectUser(line, turn);
        else if (line.type === "assistant")
            collectAssistant(line, turn);
    }
    return turn;
}
function parseRolloutLines(jsonl) {
    const out = [];
    for (const line of jsonl.split("\n")) {
        if (line.length === 0)
            continue;
        try {
            const parsed = JSON.parse(line);
            // Codex rollout JSONL can contain bare scalars; the object guard prevents
            // treating them as line objects (unlike Claude transcripts which are always objects).
            if (typeof parsed === "object" && parsed !== null) {
                out.push(parsed);
            }
        }
        catch {
            // Real rollouts can contain partial/garbage lines; skip them.
        }
    }
    return out;
}
function asPayload(line) {
    if (line.type !== "response_item")
        return null;
    const p = line.payload;
    return typeof p === "object" && p !== null ? p : null;
}
/** Join `content[].text` / `content[].output_text` of a codex message payload. */
function messageText(content) {
    if (!Array.isArray(content))
        return "";
    return content
        .map((raw) => {
        const block = asBlock(raw);
        if (!block)
            return "";
        if (typeof block.text === "string")
            return block.text;
        const out = block.output_text;
        return typeof out === "string" ? out : "";
    })
        .join("");
}
/** Join the `text` of each reasoning `summary[]` entry (or the entry itself). */
function reasoningText(summary) {
    if (!Array.isArray(summary))
        return "";
    return summary
        .map((raw) => {
        if (typeof raw === "string")
            return raw;
        const block = asBlock(raw);
        return block && typeof block.text === "string" ? block.text : "";
    })
        .join(" ");
}
/** Index of the last user `response_item` message, or 0 to start from line 1. */
function findCodexBoundary(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
        const p = asPayload(lines[i]);
        if (p && p.type === "message" && p.role === "user")
            return i;
    }
    return 0;
}
/**
 * Codex names its shell tool `exec_command` in the rollout, but its hook payload
 * (and thus the moe-crew event stream) reports the canonical `Bash`. Map rollout names
 * onto the same vocabulary so `read-turn` and `read-events` agree for the same
 * call; pass anything unmapped through (the native name beats a wrong guess).
 */
const CODEX_TOOL_NAMES = {
    exec_command: "Bash",
};
function canonicalCodexTool(name) {
    return CODEX_TOOL_NAMES[name] ?? name;
}
/**
 * Codex wraps each exec result in a metadata header — `Chunk ID`, `Wall time`,
 * `Process exited with code N`, `Original token count` — then a literal `Output:`
 * line and the real output. The default read-turn truncation would otherwise
 * show only that header, so collapse it to a single `exited <code> · <wall>s`
 * status line and keep the output. Anchored on the `Output:` boundary AND a
 * recognizable `Process exited with code` header; if either is absent (not an
 * exec result, or codex changed the format) the text passes through unchanged —
 * never drop data. Wall time is optional: omitted from the status if not found.
 */
function collapseCodexResult(text) {
    const marker = "\nOutput:\n";
    const idx = text.indexOf(marker);
    if (idx === -1)
        return text;
    const header = text.slice(0, idx);
    // function_call_output headers say "Process exited with code N"; custom tools
    // (apply_patch) say "Exit code: N". Accept either.
    const exit = header.match(/(?:Process exited with code|Exit code:) (\S+)/);
    if (!exit)
        return text;
    const wall = header.match(/Wall time:\s*(\S+)\s*seconds/);
    const status = wall ? `exited ${exit[1]} · ${wall[1]}s` : `exited ${exit[1]}`;
    return `${status}\n${text.slice(idx + marker.length)}`;
}
export function parseCodexTurn(jsonl) {
    const lines = parseRolloutLines(jsonl);
    if (lines.length === 0)
        return [];
    const boundary = findCodexBoundary(lines);
    const turn = [];
    for (const line of lines.slice(boundary)) {
        const p = asPayload(line);
        if (!p)
            continue;
        if (p.type === "message") {
            const text = messageText(p.content);
            if (p.role === "user")
                turn.push({ kind: "prompt", text });
            else
                turn.push({ kind: "text", text });
        }
        else if (p.type === "reasoning") {
            turn.push({ kind: "thinking", text: reasoningText(p.summary) });
        }
        else if (p.type === "function_call" || p.type === "custom_tool_call") {
            // Codex shell tools arrive as function_call (args in `arguments`); native
            // tools like apply_patch arrive as custom_tool_call (args in `input`).
            // Both render as a tool_use — otherwise apply_patch edits vanish from
            // read-turn (BUG-1).
            const name = canonicalCodexTool(typeof p.name === "string" ? p.name : "");
            const input = p.type === "custom_tool_call" ? p.input : p.arguments;
            turn.push({ kind: "tool_use", name, input });
        }
        else if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
            turn.push({
                kind: "tool_result",
                content: collapseCodexResult(resultContent(p.output)),
                isError: false,
            });
        }
    }
    return turn;
}
function parsePiEntries(jsonl) {
    const out = [];
    for (const line of jsonl.split("\n")) {
        if (line.length === 0)
            continue;
        try {
            const parsed = JSON.parse(line);
            // Pi session JSONL is always objects, but guard against bare scalars.
            if (typeof parsed === "object" && parsed !== null) {
                out.push(parsed);
            }
        }
        catch {
            // Real session files can contain partial/garbage lines; skip them.
        }
    }
    return out;
}
/** The inner AgentMessage of a `type:"message"` entry, or null otherwise. */
function asPiMessage(entry) {
    if (entry.type !== "message")
        return null;
    const m = entry.message;
    return typeof m === "object" && m !== null ? m : null;
}
/**
 * Join a pi message `content` into a single string: a bare string passes
 * through; an array joins its `{type:"text",text}` blocks (image/other blocks
 * contribute nothing).
 */
function piContentText(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    return content
        .map((raw) => {
        const block = asBlock(raw);
        if (block?.type !== "text")
            return "";
        return typeof block.text === "string" ? block.text : "";
    })
        .join("");
}
/** Index of the last user `message` entry, or 0 to start from the first one. */
function findPiBoundary(entries) {
    for (let i = entries.length - 1; i >= 0; i--) {
        const m = asPiMessage(entries[i]);
        if (m && m.role === "user")
            return i;
    }
    return 0;
}
function collectPiAssistant(content, out) {
    if (!Array.isArray(content))
        return;
    for (const raw of content) {
        const block = asBlock(raw);
        if (!block)
            continue;
        if (block.type === "thinking") {
            const text = typeof block.thinking === "string" ? block.thinking : "";
            out.push({ kind: "thinking", text });
        }
        else if (block.type === "text") {
            const text = typeof block.text === "string" ? block.text : "";
            out.push({ kind: "text", text });
        }
        else if (block.type === "toolCall") {
            const piBlock = block;
            out.push({
                kind: "tool_use",
                name: canonicalToolName(piBlock.name),
                input: piBlock.arguments,
            });
        }
    }
}
export function parsePiTurn(jsonl) {
    const entries = parsePiEntries(jsonl);
    if (entries.length === 0)
        return [];
    const boundary = findPiBoundary(entries);
    const turn = [];
    for (const entry of entries.slice(boundary)) {
        const m = asPiMessage(entry);
        if (!m)
            continue;
        if (m.role === "user") {
            turn.push({ kind: "prompt", text: piContentText(m.content) });
        }
        else if (m.role === "assistant") {
            collectPiAssistant(m.content, turn);
        }
        else if (m.role === "toolResult") {
            // Pi always sends toolResult content as an array of typed blocks (never a
            // bare null string), so piContentText (returns '' for null/non-array) is
            // correct here. Claude/codex use resultContent which returns '(no output)'
            // for null — that bare-string-null case does not arise in pi's format.
            turn.push({
                kind: "tool_result",
                content: piContentText(m.content),
                isError: Boolean(m.isError),
            });
        }
    }
    return turn;
}
/** Compact JSON for an object; the raw string for a string (jq `tostring`). */
function compactJson(input) {
    if (typeof input === "string")
        return input;
    return JSON.stringify(input);
}
function truncate(content) {
    const ls = content.split("\n");
    if (ls.length > 5) {
        return `${ls.slice(0, 5).join("\n")}\n... (${ls.length} lines total)`;
    }
    return ls.join("\n");
}
function renderItem(item, full) {
    switch (item.kind) {
        case "prompt":
            return `---\n\n**Prompt:** ${item.text}\n`;
        case "thinking":
            // A turn with no thinking content yields an empty item; render nothing
            // rather than a bare `> **Thinking:** ` line (RE-1).
            if (item.text.trim() === "")
                return "";
            return `> **Thinking:** ${item.text.split("\n").join("\n> ")}\n`;
        case "text":
            return `${item.text}\n`;
        case "tool_use":
            return `**Tool: ${item.name}**\n\`\`\`json\n${compactJson(item.input)}\n\`\`\`\n`;
        case "tool_result": {
            if (item.isError) {
                return `**Tool Error:**\n\`\`\`\n${item.content}\n\`\`\`\n`;
            }
            const body = full ? item.content : truncate(item.content);
            return `**Result:**\n\`\`\`\n${body}\n\`\`\`\n`;
        }
    }
}
export function renderTurn(turn, opts) {
    // jq `-r` prints each emitted string followed by a newline; each chunk already
    // ends in `\n`, so the per-output separator adds one more `\n` per chunk.
    return turn.map((item) => `${renderItem(item, opts.full)}\n`).join("");
}
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
export function renderTurnForCommand(turn, opts) {
    return renderTurn(turn, opts).replace(/\n$/, "");
}
/**
 * The assistant's reply text for a parsed turn: the `text` items joined with
 * newlines. Harness-agnostic — works for any driver's `parseTurn` output, so
 * converse can extract the reply uniformly across claude/codex/pi (the
 * claude-only `lastAssistantText` count-gate could not). Empty when the turn has
 * no assistant text yet (e.g. the transcript has not caught up after `stop`).
 */
export function assistantText(turn) {
    return turn
        .filter((item) => item.kind === "text")
        .map((item) => item.text)
        .join("\n");
}
