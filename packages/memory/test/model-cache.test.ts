import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureModelSet, inspectModelCache, adoptLegacyCache } from "../src/model-cache.js";
import type { ModelFile, ModelManifest } from "../src/model-manifest.js";
import type { ModelSource } from "../src/model-source.js";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

const FIXTURE_DIR = path.join(import.meta.dirname, "fixtures", "model-set");

function fixtureFileContent(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURE_DIR, name));
}

function makeManifestFile(name: string): ModelFile {
  const content = fixtureFileContent(name);
  return { name, url: `https://example.com/${name}`, bytes: content.length, sha256: sha256(content) };
}

function makeManifest(override?: Partial<ModelManifest>): ModelManifest {
  return {
    schema: 1,
    model: "Test/model",
    revision: "abc123def456",
    variant: "q8" as const,
    license: "MIT",
    dimensions: 384,
    maxTokens: 512,
    maxInputChars: 2000,
    queryPrefix: "",
    files: [
      makeManifestFile("config.json"),
      makeManifestFile("tokenizer.json"),
      makeManifestFile("model_quantized.onnx"),
    ],
    ...override,
  };
}

class FixtureModelSource implements ModelSource {
  downloadCount = 0;
  private readonly validFiles: ReadonlyMap<string, Buffer>;
  shouldFail = false;

  constructor(files?: Map<string, Buffer>) {
    if (files) {
      this.validFiles = files;
    } else {
      const m = new Map<string, Buffer>();
      for (const name of ["config.json", "tokenizer.json", "model_quantized.onnx"]) {
        m.set(name, fixtureFileContent(name));
      }
      this.validFiles = m;
    }
  }

  async fetch(file: ModelFile, destination: string, _signal: AbortSignal): Promise<void> {
    if (this.shouldFail) throw new Error("network failure");
    const content = this.validFiles.get(file.name);
    if (!content) throw new Error(`fixture missing: ${file.name}`);
    this.downloadCount++;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}

describe("model cache", () => {
  let cacheDir: string;
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-model-cache-test-"));
    for (const key of ["MOE_MEMORY_MODEL_CACHE_DIR", "MOE_MEMORY_CONFIG_DIR"]) {
      savedEnv.set(key, process.env[key]);
    }
    process.env.MOE_MEMORY_MODEL_CACHE_DIR = cacheDir;
  });

  afterEach(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch {}
  });

  it("activates only a complete hash-verified revision", async () => {
    const manifest = makeManifest();
    const source = new FixtureModelSource();
    const [a, b] = await Promise.all([
      ensureModelSet(manifest, source),
      ensureModelSet(manifest, source),
    ]);
    expect(a.root).toBe(b.root);
    expect(source.downloadCount).toBe(manifest.files.length);
    expect(fs.readFileSync(path.join(a.root, ".complete"), "utf8")).toContain(manifest.revision);
  });

  it("returns warm cache without network", async () => {
    const manifest = makeManifest();
    const source = new FixtureModelSource();
    await ensureModelSet(manifest, source);
    const initialCount = source.downloadCount;

    const result = await ensureModelSet(manifest, source);
    expect(source.downloadCount).toBe(initialCount);
    expect(result.variant).toBe("q8");
    expect(result.files.size).toBe(manifest.files.length);
  });

  it("rejects wrong file size", async () => {
    const manifest = makeManifest();
    const badFiles = new Map<string, Buffer>();
    for (const name of ["config.json", "tokenizer.json", "model_quantized.onnx"]) {
      badFiles.set(name, name === "config.json" ? Buffer.from("short") : fixtureFileContent(name));
    }
    const source = new FixtureModelSource(badFiles);
    await expect(ensureModelSet(manifest, source)).rejects.toThrow(/expected \d+ bytes/i);
  });

  it("rejects wrong file hash", async () => {
    const manifest = makeManifest();
    const badFiles = new Map<string, Buffer>();
    for (const name of ["config.json", "tokenizer.json", "model_quantized.onnx"]) {
      const content = fixtureFileContent(name);
      if (name === "config.json") {
        const tampered = Buffer.alloc(content.length);
        content.copy(tampered);
        tampered[0] = tampered[0]! ^ 0xff;
        badFiles.set(name, tampered);
      } else {
        badFiles.set(name, content);
      }
    }
    const source = new FixtureModelSource(badFiles);
    await expect(ensureModelSet(manifest, source)).rejects.toThrow(/hash/i);
  });

  it("handles fetch failure", async () => {
    const manifest = makeManifest();
    const source = new FixtureModelSource();
    source.shouldFail = true;
    await expect(ensureModelSet(manifest, source)).rejects.toThrow("network failure");
  });

  it("cleans up staging on failure", async () => {
    const manifest = makeManifest();
    const source = new FixtureModelSource();
    source.shouldFail = true;
    await expect(ensureModelSet(manifest, source)).rejects.toThrow();
    const entries = fs.readdirSync(cacheDir);
    const stagingDirs = entries.filter((e) => e.startsWith(".staging-"));
    expect(stagingDirs).toHaveLength(0);
  });

  it("cleans up stale staging from a previous crash", async () => {
    const manifest = makeManifest();
    const slug = `${manifest.model.replace("/", "--")}--${manifest.variant}--${manifest.revision.slice(0, 12)}`;
    const staleStaging = path.join(cacheDir, `.staging-${slug}`);
    fs.mkdirSync(staleStaging, { recursive: true });
    fs.writeFileSync(path.join(staleStaging, "leftover"), "crash debris");

    const source = new FixtureModelSource();
    const result = await ensureModelSet(manifest, source);
    expect(result.revision).toBe(manifest.revision);
    expect(fs.existsSync(staleStaging)).toBe(false);
  });

  describe("inspectModelCache", () => {
    it("reports missing when no cache exists", () => {
      const manifest = makeManifest();
      expect(inspectModelCache(manifest)).toEqual({ state: "missing" });
    });

    it("reports ready for a valid cache", async () => {
      const manifest = makeManifest();
      const source = new FixtureModelSource();
      await ensureModelSet(manifest, source);
      const status = inspectModelCache(manifest);
      expect(status.state).toBe("ready");
      expect(status.root).toBeDefined();
    });

    it("reports incomplete when .complete marker is missing", async () => {
      const manifest = makeManifest();
      const source = new FixtureModelSource();
      const result = await ensureModelSet(manifest, source);
      fs.unlinkSync(path.join(result.root, ".complete"));
      expect(inspectModelCache(manifest).state).toBe("incomplete");
    });

    it("reports corrupted when a file hash does not match", async () => {
      const manifest = makeManifest();
      const source = new FixtureModelSource();
      const result = await ensureModelSet(manifest, source);
      fs.writeFileSync(path.join(result.root, "config.json"), "tampered");
      const status = inspectModelCache(manifest);
      expect(status.state).toBe("corrupted");
      expect(status.detail).toContain("config.json");
    });
  });

  describe("adoptLegacyCache", () => {
    it("copies verified files from a legacy location", () => {
      const manifest = makeManifest();
      const legacyDir = path.join(cacheDir, "legacy");
      fs.mkdirSync(legacyDir, { recursive: true });
      for (const f of manifest.files) {
        fs.copyFileSync(path.join(FIXTURE_DIR, f.name), path.join(legacyDir, f.name));
      }
      const adopted = adoptLegacyCache(manifest, legacyDir);
      expect(adopted).toBe(true);
      const status = inspectModelCache(manifest);
      expect(status.state).toBe("ready");
      for (const f of manifest.files) {
        expect(fs.existsSync(path.join(legacyDir, f.name))).toBe(true);
      }
    });

    it("returns false when legacy files do not match", () => {
      const manifest = makeManifest();
      const legacyDir = path.join(cacheDir, "bad-legacy");
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, "config.json"), "wrong content");
      expect(adoptLegacyCache(manifest, legacyDir)).toBe(false);
    });

    it("returns false when legacy directory does not exist", () => {
      const manifest = makeManifest();
      expect(adoptLegacyCache(manifest, "/nonexistent/path")).toBe(false);
    });

    it("skips when cache already complete", async () => {
      const manifest = makeManifest();
      const source = new FixtureModelSource();
      await ensureModelSet(manifest, source);
      expect(adoptLegacyCache(manifest, "/nonexistent")).toBe(true);
    });
  });
});
