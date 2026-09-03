export type WorkerEvent = {
    event: "session_start";
    ts: string;
    cwd?: string;
} | {
    event: "user_prompt_submit";
    ts: string;
} | {
    event: "pre_tool_use";
    ts: string;
    tool: string;
    tool_input: unknown;
} | {
    event: "post_tool_use";
    ts: string;
    tool: string;
} | {
    event: "stop";
    ts: string;
} | {
    event: "session_end";
    ts: string;
};
export type EventName = WorkerEvent["event"];
export declare const EVENT_NAMES: readonly EventName[];
export declare function serializeEvent(e: WorkerEvent): string;
export declare function parseEvent(line: string): WorkerEvent | null;
