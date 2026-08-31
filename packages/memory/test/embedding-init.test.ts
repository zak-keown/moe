import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The model-loading contract, ported from private-journal-mcp's "initialization
 * timeout" block.
 *
 * Those two tests could not survive a literal port. ts-jest's transform forced
 * `module: 'commonjs'`, which turned `import { pipeline } from '@xenova/transformers'`
 * into a live property lookup on a module object — so the tests `require()`d the
 * module and REASSIGNED `transformers.pipeline` three times to simulate a hang
 * and then a recovery. Under vitest's ESM you cannot assign to a module namespace
 * property, so they are rewritten against `vi.mock` + `vi.mocked(...)`.
 *
 * The behaviour under test is real and worth keeping: a hung model load must time
 * out rather than wedge the MCP server forever, and the NEXT call must retry
 * rather than await the dead promise. episodic-memory had neither — its
 * `initEmbeddings` awaited `pipeline()` with no timeout and no memo.
 */
const pipelineMock = vi.hoisted(() => vi.fn());

vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
  env: {} as Record<string, unknown>,
}));

const { generateEmbedding, initEmbeddings, resetEmbeddings } = await import("../src/embeddings.js");

describe("embedding model initialization", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "moe-memory-model-cache-"));
    process.env.MOE_MEMORY_MODEL_CACHE_DIR = cacheDir;
    process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS = "100";
    pipelineMock.mockReset();
    resetEmbeddings();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.MOE_MEMORY_MODEL_CACHE_DIR;
    delete process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS;
    resetEmbeddings();
    vi.restoreAllMocks();
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it("times out if model loading hangs", async () => {
    pipelineMock.mockImplementation(() => new Promise(() => {}));

    await expect(generateEmbedding("test")).rejects.toThrow(/timed out/i);
  });

  it("can retry after a timeout", async () => {
    pipelineMock.mockImplementationOnce(() => new Promise(() => {}));
    await expect(generateEmbedding("test")).rejects.toThrow(/timed out/i);

    pipelineMock.mockImplementation(async () =>
      vi.fn(async () => ({ data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]) })),
    );
    process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS = "30000";

    const embedding = await generateEmbedding("retry test");
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
  });

  it("loads the model only once for concurrent callers", async () => {
    pipelineMock.mockImplementation(async () =>
      vi.fn(async () => ({ data: new Float32Array([1, 0, 0]) })),
    );

    await Promise.all([initEmbeddings(), initEmbeddings(), initEmbeddings()]);

    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("pins the model cache directory instead of letting transformers.js choose", async () => {
    // Upstream set neither cacheDir nor a local model path, so the download
    // landed wherever transformers.js defaulted to — under pnpm, a path inside
    // the content-addressed store.
    const { env } = await import("@huggingface/transformers");
    pipelineMock.mockImplementation(async () =>
      vi.fn(async () => ({ data: new Float32Array([1, 0, 0]) })),
    );

    await initEmbeddings();

    expect((env as unknown as { cacheDir?: string }).cacheDir).toBe(cacheDir);
  });

  it("truncates input, because longer inputs degrade mean-pooled embeddings", async () => {
    const inner = vi.fn(async () => ({ data: new Float32Array([1, 0, 0]) }));
    pipelineMock.mockImplementation(async () => inner);

    await generateEmbedding("x".repeat(5000));

    expect(inner).toHaveBeenCalledWith("x".repeat(2000), { pooling: "mean", normalize: true });
  });
});
