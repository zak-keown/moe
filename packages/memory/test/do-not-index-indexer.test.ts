import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-070: `sync.ts` defines the in-transcript DO-NOT-INDEX opt-out
 * (shouldSkipConversation) and honours it in exactly two places, both inside
 * sync.ts. None of indexer.ts's three entry points — indexConversations,
 * indexSession, indexUnprocessed — ever called it, so `moe-memory index` (the
 * default command) and `moe-memory index --session` both archived, embedded,
 * summarized and indexed a conversation the user had explicitly marked
 * DO NOT INDEX.
 *
 * Mocks the encoder (not `../src/embeddings.js` itself — the real underlying
 * `@huggingface/transformers` pipeline, same seam as embedding-init.test.ts)
 * so this stays in the CI-safe "unit" project rather than needing the real
 * ~35MB model.
 */
const createBackendMock = vi.hoisted(() => vi.fn());
vi.mock("../src/embedding-runtime.js", () => ({
  createEmbeddingBackend: createBackendMock,
}));
vi.mock("../src/model-cache.js", () => ({
  ensureModelSet: vi.fn(async () => ({ root: "/fake", revision: "x", variant: "q8", files: new Map() })),
}));
vi.mock("../src/model-manifest.js", () => ({
  loadModelManifest: vi.fn(() => ({ schema: 1, model: "test", revision: "x", variant: "q8", license: "MIT", dimensions: 384, maxTokens: 512, maxInputChars: 2000, queryPrefix: "", files: [] })),
}));

const { indexConversations, indexSession } = await import("../src/indexer.js");
const { EXCLUSION_MARKER } = await import("../src/sync.js");

function makeExchangeLines(opts: { seq: number; sessionId: string; extra?: string }): string {
  const { seq, sessionId, extra = "" } = opts;
  const userUuid = `user-${seq}-${sessionId}`;
  const ts = new Date(2026, 0, 1 + seq).toISOString();
  const userLine = JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    userType: "external",
    cwd: "/test/project",
    sessionId,
    version: "2.0.9",
    gitBranch: "main",
    type: "user",
    message: { role: "user", content: `User question ${seq} in session ${sessionId}${extra}` },
    uuid: userUuid,
    timestamp: ts,
  });
  const assistantLine = JSON.stringify({
    parentUuid: userUuid,
    isSidechain: false,
    userType: "external",
    cwd: "/test/project",
    sessionId,
    version: "2.0.9",
    gitBranch: "main",
    type: "assistant",
    message: {
      model: "claude-sonnet-4-5",
      role: "assistant",
      content: [{ type: "text", text: `Reply ${seq} in session ${sessionId}` }],
    },
    uuid: `asst-${seq}-${sessionId}`,
    timestamp: ts,
  });
  return `${userLine}\n${assistantLine}\n`;
}

describe("CR-070: DO-NOT-INDEX marker is honored by indexer.ts entry points", () => {
  let testDir: string;
  let projectsDir: string;
  let archiveDir: string;
  let configDir: string;
  let dbPath: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-do-not-index-"));
    projectsDir = join(testDir, "projects");
    archiveDir = join(testDir, "archive");
    configDir = join(testDir, "config");
    dbPath = join(testDir, "test.db");
    mkdirSync(projectsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });

    process.env.TEST_PROJECTS_DIR = projectsDir;
    process.env.TEST_ARCHIVE_DIR = archiveDir;
    process.env.MOE_MEMORY_CONFIG_DIR = configDir;
    process.env.TEST_DB_PATH = dbPath;

    createBackendMock.mockReset();
    createBackendMock.mockResolvedValue({
      embed: vi.fn(async () => new Float32Array(384).fill(0.1)),
      embedQuery: vi.fn(async () => new Float32Array(384).fill(0.1)),
      close: vi.fn(async () => {}),
    });
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_PROJECTS_DIR;
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  function exchangeCount(): number {
    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT COUNT(*) as n FROM exchanges").get() as { n: number };
    db.close();
    return row.n;
  }

  it("indexConversations (the default `moe-memory index` path) never inserts a marked conversation", async () => {
    const projectDir = join(projectsDir, "project-a");
    mkdirSync(projectDir, { recursive: true });

    writeFileSync(
      join(projectDir, "kept.jsonl"),
      makeExchangeLines({ seq: 1, sessionId: "kept-session" }),
      "utf-8",
    );
    writeFileSync(
      join(projectDir, "marked.jsonl"),
      makeExchangeLines({ seq: 2, sessionId: "marked-session", extra: ` ${EXCLUSION_MARKER}` }),
      "utf-8",
    );

    await indexConversations(undefined, undefined, 1, true);

    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT session_id FROM exchanges").all() as Array<{
      session_id: string;
    }>;
    db.close();

    expect(rows.some((r) => r.session_id === "marked-session")).toBe(false);
    expect(rows.some((r) => r.session_id === "kept-session")).toBe(true);
  });

  it("indexSession never inserts a session the user marked DO-NOT-INDEX", async () => {
    const projectDir = join(projectsDir, "project-a");
    mkdirSync(projectDir, { recursive: true });

    writeFileSync(
      join(projectDir, "marked-session.jsonl"),
      makeExchangeLines({ seq: 1, sessionId: "marked-session", extra: ` ${EXCLUSION_MARKER}` }),
      "utf-8",
    );

    await indexSession("marked-session", 1, true);

    expect(exchangeCount()).toBe(0);
  });
});
