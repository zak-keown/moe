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

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDefaultPackageRoot } from "./db.js";
import { loadModelManifest } from "./model-manifest.js";
import { ensureModelSet, type VerifiedModelSet } from "./model-cache.js";
import { createEmbeddingBackend, type EmbeddingBackend, type VerifiedRuntimeAsset } from "./embedding-runtime.js";
import { getModelCacheDir } from "./paths.js";

export { EMBEDDING_DIMENSIONS } from "./constants.js";

export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

const DEFAULT_INIT_TIMEOUT_MS = 180_000;

let backend: EmbeddingBackend | null = null;
let initPromise: Promise<void> | null = null;

function initTimeoutMs(): number {
  const raw = Number(process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INIT_TIMEOUT_MS;
}

interface EmbeddingAssetManifest {
  schema: number;
  ort: {
    package: string;
    version: string;
    file: string;
    bytes: number;
    sha256: string;
  };
}

function loadEmbeddingAssets(packageRoot: string): VerifiedRuntimeAsset {
  const manifestPath = path.join(packageRoot, "runtime", "embedding-assets.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as EmbeddingAssetManifest;
  const wasmPath = path.join(packageRoot, "runtime", raw.ort.file);

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`packaged WASM not found at ${wasmPath}`);
  }

  const stat = fs.statSync(wasmPath);
  if (stat.size !== raw.ort.bytes) {
    throw new Error(`WASM size mismatch: expected ${raw.ort.bytes}, got ${stat.size}`);
  }

  return {
    path: wasmPath,
    sha256: raw.ort.sha256,
    bytes: raw.ort.bytes,
  };
}

/** Default model source that downloads from Hugging Face Hub. */
function createHttpModelSource(): import("./model-source.js").ModelSource {
  return {
    async fetch(file, destination, signal) {
      const response = await globalThis.fetch(file.url, { signal });
      if (!response.ok) throw new Error(`failed to fetch ${file.url}: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(destination, buffer);
    },
  };
}

async function loadBackend(): Promise<void> {
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
    const packageRoot = getDefaultPackageRoot();
    if (!packageRoot) {
      throw new Error(
        "Embedding init requires a package root — setDefaultPackageRoot() must be called first (from index.ts or cli.ts)",
      );
    }
    const manifest = loadModelManifest(packageRoot);
    const wasm = loadEmbeddingAssets(packageRoot);

    console.error("Loading embedding model (first run may take time)...");

    const init = async () => {
      const modelSet = await ensureModelSet(manifest, createHttpModelSource());
      return createEmbeddingBackend(modelSet, wasm);
    };

    backend = await Promise.race([init(), timeout]);
    console.error("Embedding model loaded");
  } catch (error) {
    initPromise = null;
    backend = null;
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function initEmbeddings(): Promise<void> {
  if (backend) return;
  if (!initPromise) initPromise = loadBackend();
  return initPromise;
}

export function resetEmbeddings(): void {
  backend = null;
  initPromise = null;
}

const MAX_INPUT_CHARS = 2000;

export async function generateEmbedding(text: string): Promise<number[]> {
  await initEmbeddings();
  if (!backend) throw new Error("Embedding model not initialized");
  const vector = await backend.embed(text.substring(0, MAX_INPUT_CHARS));
  return Array.from(vector);
}

export function withQueryPrefix(query: string): string {
  if (query.startsWith(BGE_QUERY_PREFIX)) return query;
  return BGE_QUERY_PREFIX + query;
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  await initEmbeddings();
  if (!backend) throw new Error("Embedding model not initialized");
  const vector = await backend.embedQuery(query);
  return Array.from(vector);
}

export async function generateExchangeEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
): Promise<number[]> {
  let combined = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;
  if (toolNames && toolNames.length > 0) {
    combined += `\n\nTools: ${toolNames.join(", ")}`;
  }
  return generateEmbedding(combined);
}

export async function generateEntryEmbedding(text: string): Promise<number[]> {
  return generateEmbedding(text);
}

export type EmbedFn = (text: string) => Promise<number[]>;
