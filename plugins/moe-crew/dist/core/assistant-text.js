/**
 * Assistant-text extraction from a claude transcript JSONL. A parity port of the
 * `count_text_messages` / `last_text_response` jq helpers in bash `cmd_converse`
 * (upstream skills/driving-claude-code-sessions/scripts/csd).
 *
 * Both select assistant lines whose `message.content` is an ARRAY containing at
 * least one `{type:"text"}` block. `countAssistantTextMessages` counts them;
 * `lastAssistantText` returns the LAST one's text blocks joined with newlines.
 */
function asBlock(x) {
    return typeof x === "object" && x !== null ? x : null;
}
/** The assistant lines whose content is an array containing a text block. */
function assistantTextLines(jsonl) {
    const out = [];
    for (const line of jsonl.split("\n")) {
        if (line.length === 0)
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (parsed.type !== "assistant")
            continue;
        const content = parsed.message?.content;
        if (!Array.isArray(content))
            continue;
        if (content.some((b) => asBlock(b)?.type === "text")) {
            out.push(content);
        }
    }
    return out;
}
export function countAssistantTextMessages(jsonl) {
    return assistantTextLines(jsonl).length;
}
export function lastAssistantText(jsonl) {
    const lines = assistantTextLines(jsonl);
    const last = lines.at(-1);
    if (last === undefined)
        return "";
    return last
        .map((b) => asBlock(b))
        .filter((b) => b?.type === "text")
        .map((b) => (typeof b.text === "string" ? b.text : ""))
        .join("\n");
}
