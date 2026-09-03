import type { ConversationExchange } from "./types.js";
export { buildCodexSummarizerCommand, type CodexSummarizerCommand, getApiEnv, runCodexCommand, } from "./summarizers/codex.js";
export declare class SummarizerSdkError extends Error {
    readonly subtype: string;
    readonly sessionId?: string | undefined;
    constructor(subtype: string, sessionId?: string | undefined);
}
export declare function isResumeFailure(error: unknown): boolean;
export declare function shouldSkipReentrantSync(): boolean;
export declare function formatConversationText(exchanges: ConversationExchange[]): string;
export declare function buildSummarizerQueryOptions(args: {
    model: string;
    sessionId?: string | undefined;
}): Record<string, unknown>;
export declare function buildCodexSummaryPrompt(): string;
export declare function getCodexModel(_exchanges: ConversationExchange[]): string | undefined;
export declare function summarizeConversation(exchanges: ConversationExchange[], sessionId?: string): Promise<string>;
