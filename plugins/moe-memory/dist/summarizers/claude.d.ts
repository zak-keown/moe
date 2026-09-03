import type { ProcessAdapter, ProcessSpec } from "./process.js";
export declare const MIN_CLAUDE_VERSION = "2.1.141";
export interface ClaudeCommandOptions {
    prompt: string;
    sessionId?: string | undefined;
    cwd?: string | undefined;
    model: string;
    systemPrompt?: string | undefined;
}
export declare function buildClaudeSummarizerCommand(options: ClaudeCommandOptions): ProcessSpec;
export interface ClaudeJsonResult {
    result?: string;
    is_error?: boolean;
    subtype?: string;
    session_id?: string;
}
export declare function runClaudeCommand(spec: ProcessSpec, adapter: ProcessAdapter): Promise<string>;
export declare function buildSummarySystemPrompt(): string;
export declare function buildSummaryPrompt(conversationText: string, sessionId?: string): string;
export declare function buildChunkPrompt(conversationText: string): string;
export declare function buildSynthesisPrompt(chunkSummaries: string[]): string;
