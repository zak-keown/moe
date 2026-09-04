import type { ConversationExchange } from "./types.js";
export { buildCodexSummarizerCommand, type CodexSummarizerCommand, getApiEnv, runCodexCommand, } from "./summarizers/codex.js";
export declare class SummarizerSdkError extends Error {
    readonly subtype: string;
    readonly sessionId?: string | undefined;
    constructor(subtype: string, sessionId?: string | undefined);
}
export declare function isResumeFailure(error: unknown): boolean;
/**
 * Thrown by callClaude when BOTH the primary and fallback model hit the
 * "thinking.budget_tokens" API error (#96/CR-059). This used to be handled
 * by returning the raw error text as though it were the model's output —
 * summarizeConversation would then extractSummary() it, find no <summary>
 * tags, fall back to text.trim(), and write the error text to
 * `<archive>-summary.txt` as a permanent "summary" with no error sentinel
 * and no retry path. Throwing here routes the failure through the same
 * catch-and-sentinel machinery every caller already has for other errors.
 */
export declare class SummarizerThinkingBudgetError extends Error {
    readonly rawResult: string;
    constructor(rawResult: string);
}
/**
 * Detect whether the current process is running inside the Claude Agent SDK
 * subprocess that the summarizer just spawned. The flag is set by getApiEnv()
 * and inherited by the spawned subprocess. Used by sync entry points to bail
 * out before re-entering the sync→summarizer→spawn cycle (#87).
 */
export declare function shouldSkipReentrantSync(): boolean;
export declare function formatConversationText(exchanges: ConversationExchange[]): string;
export declare function buildSummarizerQueryOptions(args: {
    model: string;
    sessionId?: string | undefined;
}): Record<string, unknown>;
export declare function buildCodexSummaryPrompt(): string;
export declare function getCodexModel(_exchanges: ConversationExchange[]): string | undefined;
export declare function summarizeConversation(exchanges: ConversationExchange[], sessionId?: string): Promise<string>;
