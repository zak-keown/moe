export const EVENT_NAMES = [
    "session_start",
    "user_prompt_submit",
    "pre_tool_use",
    "post_tool_use",
    "stop",
    "session_end",
    "run_start",
    "run_end",
];
export function serializeEvent(e) {
    return JSON.stringify(e);
}
export function parseEvent(line) {
    let v;
    try {
        v = JSON.parse(line);
    }
    catch {
        return null;
    }
    if (typeof v !== "object" || v === null)
        return null;
    const event = v.event;
    if (typeof event !== "string" || !EVENT_NAMES.includes(event))
        return null;
    return v;
}
