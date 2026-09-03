/**
 * Assistant-text extraction from a claude transcript JSONL. A parity port of the
 * `count_text_messages` / `last_text_response` jq helpers in bash `cmd_converse`
 * (upstream skills/driving-claude-code-sessions/scripts/csd).
 *
 * Both select assistant lines whose `message.content` is an ARRAY containing at
 * least one `{type:"text"}` block. `countAssistantTextMessages` counts them;
 * `lastAssistantText` returns the LAST one's text blocks joined with newlines.
 */
export declare function countAssistantTextMessages(jsonl: string): number;
export declare function lastAssistantText(jsonl: string): string;
