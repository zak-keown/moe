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

import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";
import { getModelCacheDir } from "./paths.js";

export { EMBEDDING_DIMENSIONS } from "./constants.js";

// Disable progress callbacks to prevent stdout pollution in MCP context.
// In MCP, stdout is reserved for JSON-RPC communication. These two are
// import-time side effects on the library's shared `env`, deliberately: every
// entry point that reaches the encoder needs them, including the journal half.
env.allowLocalModels = true;
env.useBrowserCache = false;

/**
 * Embedding model configuration.
 *
 * Using BAAI's bge-small-en-v1.5 (via Xenova's ONNX export) instead of the
 * older all-MiniLM-L6-v2 — measured +6.34 R@1 on a 17K-corpus retrieval test
 * against real production data. Same 384 dimensions, so vec_exchanges schema
 * is unchanged.
 *
 * `Xenova/` here is a Hugging Face org namespace inside a model id, not a
 * vendor brand. It is resolved over the network and must not be swept.
 *
 * BGE models recommend prepending a task prefix to QUERY embeddings only
 * (passages/documents go through unmodified). See `withQueryPrefix` and
 * `generateQueryEmbedding` below.
 */
const MODEL_ID = "Xenova/bge-small-en-v1.5";
const MODEL_DTYPE = "q8";
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

/** Longer inputs degrade mean-pooled embeddings; 2000 chars measured best. */
const MAX_INPUT_CHARS = 2000;

const DEFAULT_INIT_TIMEOUT_MS = 180_000;

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;

function initTimeoutMs(): number {
  const raw = Number(process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INIT_TIMEOUT_MS;
}

async function loadPipeline(): Promise<void> {
  const timeoutAfter = initTimeoutMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(
            `Embedding model loading timed out after ${timeoutAfter / 1000}s. ` +
              `The model cache is ${getModelCacheDir()}; a stale lock or a failed ` +
              `partial download there is the usual cause. Remove it and retry.`,
          ),
        ),
      timeoutAfter,
    );
  });

  try {
    // Pin the cache so the download lands somewhere writable that moves with
    // MOE_MEMORY_CONFIG_DIR. Set here rather than at import time so nothing
    // creates directories just by loading this module.
    env.cacheDir = getModelCacheDir();

    console.error("Loading embedding model (first run may take time)...");
    embeddingPipeline = await Promise.race([
      pipeline("feature-extraction", MODEL_ID, {
        dtype: MODEL_DTYPE,
        progress_callback: () => {},
      }),
      timeout,
    ]);
    console.error("Embedding model loaded");
  } catch (error) {
    // Clear the memo so the next call retries instead of awaiting a dead promise.
    initPromise = null;
    embeddingPipeline = null;
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function initEmbeddings(): Promise<void> {
  if (embeddingPipeline) return;
  if (!initPromise) initPromise = loadPipeline();
  return initPromise;
}

/**
 * Drop the loaded model and the init memo. Test seam — the two timeout tests
 * inherited from private-journal-mcp need to make loading fail, then succeed.
 */
export function resetEmbeddings(): void {
  embeddingPipeline = null;
  initPromise = null;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  await initEmbeddings();
  const pipe = embeddingPipeline;
  if (!pipe) throw new Error("Embedding model not initialized");

  // Truncate to avoid token limits (512 tokens max for bge-small).
  const truncated = text.substring(0, MAX_INPUT_CHARS);

  const output = await pipe(truncated, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

/**
 * Prepend the BGE retrieval prefix to a query string. Idempotent: returns
 * the input unchanged if the prefix is already present.
 */
export function withQueryPrefix(query: string): string {
  if (query.startsWith(BGE_QUERY_PREFIX)) return query;
  return BGE_QUERY_PREFIX + query;
}

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
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(withQueryPrefix(query));
}

/**
 * Document embedding for a conversation exchange (a harvested transcript turn).
 */
export async function generateExchangeEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
): Promise<number[]> {
  // Combine user question, assistant answer, and tools used for better searchability
  let combined = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;

  if (toolNames && toolNames.length > 0) {
    combined += `\n\nTools: ${toolNames.join(", ")}`;
  }

  return generateEmbedding(combined);
}

/**
 * Document embedding for a journal entry (deliberately written by the user).
 *
 * Same encoder, same normalisation, same truncation as an exchange — that is
 * the whole point of the merge — but named separately because the two record
 * types are separately queryable and a future divergence should be visible
 * here rather than hidden behind a shared call.
 */
export async function generateEntryEmbedding(text: string): Promise<number[]> {
  return generateEmbedding(text);
}

/** The signature both stores accept, so tests can inject a deterministic encoder. */
export type EmbedFn = (text: string) => Promise<number[]>;
