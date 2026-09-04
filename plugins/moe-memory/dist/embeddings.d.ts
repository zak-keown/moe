/**
 * The one embedding layer.
 *
 * Replaced the @huggingface/transformers pipeline with a direct ORT-WASM
 * backend. Same model (Xenova/bge-small-en-v1.5, q8, 384 dims), same
 * BGE query prefix, same 2000-char truncation, same masked mean pooling
 * and L2 normalization — but no transformers.js dependency.
 *
 * ⚠️ Anything that changes model, dtype, prefix, pooling, normalisation or
 * truncation MUST bump EMBEDDING_VERSION in embedding-migration.ts.
 */
export { EMBEDDING_DIMENSIONS } from "./constants.js";
export declare const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
export declare function initEmbeddings(): Promise<void>;
export declare function resetEmbeddings(): void;
export declare function generateEmbedding(text: string): Promise<number[]>;
export declare function withQueryPrefix(query: string): string;
export declare function generateQueryEmbedding(query: string): Promise<number[]>;
export declare function generateExchangeEmbedding(userMessage: string, assistantMessage: string, toolNames?: string[]): Promise<number[]>;
export declare function generateEntryEmbedding(text: string): Promise<number[]>;
export type EmbedFn = (text: string) => Promise<number[]>;
