import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBackend = vi.hoisted(() => ({
  embed: vi.fn(async () => new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])),
  embedQuery: vi.fn(async () => new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])),
  close: vi.fn(async () => {}),
}));

const createBackendMock = vi.hoisted(() => vi.fn());

vi.mock("../src/embedding-runtime.js", () => ({
  createEmbeddingBackend: createBackendMock,
}));

vi.mock("../src/model-cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/model-cache.js")>();
  return {
    ...actual,
    ensureModelSet: vi.fn(async () => ({
      root: "/fake/model",
      revision: "abc123",
      variant: "q8" as const,
      files: new Map([
        ["config.json", { path: "/fake/config.json", sha256: "a", bytes: 100 }],
        ["tokenizer.json", { path: "/fake/tokenizer.json", sha256: "b", bytes: 200 }],
        ["model_quantized.onnx", { path: "/fake/model.onnx", sha256: "c", bytes: 300 }],
      ]),
    })),
  };
});

vi.mock("../src/model-manifest.js", () => ({
  loadModelManifest: vi.fn(() => ({
    schema: 1,
    model: "Xenova/bge-small-en-v1.5",
    revision: "abc123",
    variant: "q8",
    license: "MIT",
    dimensions: 384,
    maxTokens: 512,
    maxInputChars: 2000,
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    files: [],
  })),
}));

import "./test-utils.js";

const { generateEmbedding, initEmbeddings, resetEmbeddings } = await import("../src/embeddings.js");

describe("embedding model initialization", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "moe-memory-model-cache-"));
    process.env.MOE_MEMORY_MODEL_CACHE_DIR = cacheDir;
    process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS = "100";
    createBackendMock.mockReset();
    createBackendMock.mockResolvedValue(mockBackend);
    mockBackend.embed.mockReset();
    mockBackend.embed.mockResolvedValue(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]));
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
    createBackendMock.mockImplementation(() => new Promise(() => {}));

    await expect(generateEmbedding("test")).rejects.toThrow(/timed out/i);
  });

  it("can retry after a timeout", async () => {
    createBackendMock.mockImplementationOnce(() => new Promise(() => {}));
    await expect(generateEmbedding("test")).rejects.toThrow(/timed out/i);

    process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS = "30000";
    createBackendMock.mockResolvedValue(mockBackend);

    const embedding = await generateEmbedding("retry test");
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
  });

  it("loads the model only once for concurrent callers", async () => {
    await Promise.all([initEmbeddings(), initEmbeddings(), initEmbeddings()]);

    expect(createBackendMock).toHaveBeenCalledTimes(1);
  });

  it("truncates input to 2000 characters", async () => {
    await generateEmbedding("x".repeat(5000));

    expect(mockBackend.embed).toHaveBeenCalledTimes(1);
    const calledText = mockBackend.embed.mock.calls[0]![0] as string;
    expect(calledText.length).toBeLessThanOrEqual(2000);
  });
});
