import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-069: the project exclusion list is matched against the walk's top-level
 * source directory name. Under `~/.claude/projects` that name IS the encoded
 * project path, so exclusion works. Under `~/.codex/sessions` the top level is
 * a YEAR (`2026`), and the real project name never appears there at all —
 * Codex nests as `<year>/<month>/<day>/rollout-*.jsonl`. So a project the user
 * excluded still gets every Codex session archived, embedded and indexed.
 *
 * Mock the encoder rather than the real model so this stays in the CI-safe
 * "unit" project — indexUnprocessed's exclusion check runs long before any
 * embedding is generated, so the fix under test needs no real vectors.
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

const { indexUnprocessed } = await import("../src/indexer.js");

function codexRolloutLines(cwd: string) {
  return [
    {
      timestamp: "2026-09-02T18:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "019e4c75-d5bf-7c71-9df7-77f5fb86b711",
        cwd,
        cli_version: "0.130.0",
        model_provider: "openai",
      },
    },
    {
      timestamp: "2026-09-02T18:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "What secrets are in this repo?" }],
      },
    },
    {
      timestamp: "2026-09-02T18:00:02.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Here is what I found." }],
      },
    },
  ];
}

function writeJsonl(path: string, lines: unknown[]): void {
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf-8");
}

describe("CR-069: project exclusion resolves the real (parsed) project for Codex", () => {
  let testDir: string;
  let sessionsDir: string;
  let archiveDir: string;
  let configDir: string;
  let dbPath: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-codex-exclude-"));
    sessionsDir = join(testDir, "sessions");
    archiveDir = join(testDir, "archive");
    configDir = join(testDir, "config");
    dbPath = join(testDir, "test.db");
    mkdirSync(sessionsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });

    process.env.TEST_PROJECTS_DIR = sessionsDir;
    process.env.TEST_ARCHIVE_DIR = archiveDir;
    process.env.MOE_MEMORY_CONFIG_DIR = configDir;
    process.env.TEST_DB_PATH = dbPath;
    // The value a user would actually type: the real project name, not "2026".
    process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS = "secret-repo";

    createBackendMock.mockReset();
    createBackendMock.mockResolvedValue({
      embed: vi.fn(async () => new Float32Array(384).fill(0.1)),
      embedQuery: vi.fn(async () => new Float32Array(384).fill(0.1)),
      close: vi.fn(async () => {}),
    });
    restoreConsole = suppressConsole();

    // Codex layout: <sessions>/<year>/<month>/<day>/rollout-*.jsonl — the only
    // name the walk's top-level check ever sees is "2026".
    const excludedDay = join(sessionsDir, "2026", "09", "02");
    mkdirSync(excludedDay, { recursive: true });
    writeJsonl(
      join(excludedDay, "rollout-secret.jsonl"),
      codexRolloutLines("/Users/someone/secret-repo"),
    );

    const keptDay = join(sessionsDir, "2026", "09", "03");
    mkdirSync(keptDay, { recursive: true });
    writeJsonl(
      join(keptDay, "rollout-other.jsonl"),
      codexRolloutLines("/Users/someone/other-repo"),
    );
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_PROJECTS_DIR;
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    delete process.env.TEST_DB_PATH;
    delete process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("does not index a Codex session whose real (cwd-derived) project is excluded", async () => {
    await indexUnprocessed(1, true);

    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT project, archive_path FROM exchanges").all() as Array<{
      project: string;
      archive_path: string;
    }>;
    db.close();

    expect(rows.some((r) => r.project === "secret-repo")).toBe(false);
    expect(rows.some((r) => r.archive_path.includes("rollout-secret"))).toBe(false);

    // Control: the non-excluded session in the very same top-level "2026"
    // directory is indexed normally, so this isn't just everything failing.
    expect(rows.some((r) => r.project === "other-repo")).toBe(true);
  });
});
