/**
 * Marker text that identifies summarizer agent conversations.
 * When this text appears in a conversation, it will be excluded from indexing.
 * Used in summarizer prompts to prevent agent conversations from polluting search results.
 */
export declare const SUMMARIZER_CONTEXT_MARKER = "Context: This summary will be shown in a list to help users and Claude choose which conversations are relevant";
/**
 * Embedding width. Lives here rather than in embeddings.ts so db.ts can declare
 * the vec0 columns without importing the encoder — loading embeddings.ts pulls
 * in transformers.js and mutates its global `env`, which `moe-memory stats` and
 * `moe-memory show` have no business doing.
 */
export declare const EMBEDDING_DIMENSIONS = 384;
