/**
 * The one embedding layer.
 *
 * Reconciled from two upstream `embeddings.ts` files that did the same job with
 * incompatible shapes and two releases of the same library — `@xenova/transformers`
 * is the former name of `@huggingface/transformers`.
 *
 *   WON  episodic-memory: module-level functions over a module-level pipeline,
 *        `@huggingface/transformers` ^4, `Xenova/bge-small-en-v1.5` at dtype q8,
 *        2000-char truncation, the asymmetric BGE query prefix, and the two
 *        import-time `env` mutations that keep transformers.js off stdout.
 *   LOST private-journal-mcp: an `EmbeddingService` singleton with a private
 *        constructor and a `private readonly modelName`, on `@xenova/transformers` ^2
 *        with `Xenova/all-MiniLM-L6-v2`, no dtype, no truncation, and no
 *        query/passage asymmetry. One process, one model, forever — which
 *        blocks a per-record-type encoder and blocks swapping the encoder in a
 *        test.
 *
 * Three things were carried FORWARD from the losing side, because they were
 * better there:
 *
 *   - the memoised init promise, so two concurrent callers load the model once;
 *   - the init timeout with retry-on-failure (the promise is cleared so the
 *     next call retries rather than awaiting a dead promise);
 *   - `resetEmbeddings()`, the seam its two timeout tests need.
 *
 * And one thing was FIXED: `env.cacheDir` is pinned. Upstream set neither
 * `cacheDir` nor a local model path, so the first `initEmbeddings()` fetched the
 * model into whatever transformers.js defaults to — under pnpm a path inside
 * the content-addressed store, shared across the workspace and possibly
 * read-only in a container.
 *
 * ⚠️ Anything that changes model, dtype, prefix, pooling, normalisation or
 * truncation MUST bump EMBEDDING_VERSION in embedding-migration.ts. Two
 * encoders' vectors are dimensionally identical at 384 and semantically
 * incomparable, so a mixed corpus does not error — it just ranks wrongly.
 */
export { EMBEDDING_DIMENSIONS } from "./constants.js";
export declare const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
export declare function initEmbeddings(): Promise<void>;
/**
 * Drop the loaded model and the init memo. Test seam — the two timeout tests
 * inherited from private-journal-mcp need to make loading fail, then succeed.
 */
export declare function resetEmbeddings(): void;
export declare function generateEmbedding(text: string): Promise<number[]>;
/**
 * Prepend the BGE retrieval prefix to a query string. Idempotent: returns
 * the input unchanged if the prefix is already present.
 */
export declare function withQueryPrefix(query: string): string;
/**
 * Generate an embedding for a search QUERY. Adds the model-specific prefix
 * before embedding, which gives a small but consistent recall lift on
 * retrieval tasks. Document/passage embeddings stay unmodified — that's the
 * asymmetric pattern BGE models are trained for.
 *
 * BOTH record types' queries route through here. private-journal-mcp embedded
 * its queries with the same call it used for documents, which under an
 * asymmetric encoder costs recall with no error and no log line.
 */
export declare function generateQueryEmbedding(query: string): Promise<number[]>;
/**
 * Document embedding for a conversation exchange (a harvested transcript turn).
 */
export declare function generateExchangeEmbedding(userMessage: string, assistantMessage: string, toolNames?: string[]): Promise<number[]>;
/**
 * Document embedding for a journal entry (deliberately written by the user).
 *
 * Same encoder, same normalisation, same truncation as an exchange — that is
 * the whole point of the merge — but named separately because the two record
 * types are separately queryable and a future divergence should be visible
 * here rather than hidden behind a shared call.
 */
export declare function generateEntryEmbedding(text: string): Promise<number[]>;
/** The signature both stores accept, so tests can inject a deterministic encoder. */
export type EmbedFn = (text: string) => Promise<number[]>;
