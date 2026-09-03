import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressConsole } from "./test-utils.js";

/**
 * CR-075/CR-076 (defense in depth): `repairIndex` must never summarize or
 * index a conversation carrying the DO-NOT-INDEX marker, even if it arrives
 * in `issues.missing` from a source other than `verifyIndex` — a saved
 * report, or a caller that assembled its own VerificationResult. Without
 * this, a marked file that reaches the list any other way still gets
 * `summarizeConversation` called on it (a live Claude Agent SDK query
 * carrying the full conversation text) and gets embedded and inserted.
 *
 * Mocks the transformers pipeline (real encoder not needed — `repairIndex`
 * calls `initEmbeddings()` unconditionally) and the summarizer, so this stays
 * in the CI-safe unit project rather than needing the real model or live
 * Claude auth.
 */
const pipelineMock = vi.hoisted(() => vi.fn());
vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
  env: {} as Record<string, unknown>,
}));

vi.mock("../src/summarizer.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/summarizer.js")>("../src/summarizer.js");
  return {
    ...actual,
    summarizeConversation: vi.fn(),
  };
});

import { summarizeConversation } from "../src/summarizer.js";
import { EXCLUSION_MARKER } from "../src/sync.js";
import { repairIndex } from "../src/verify.js";
import { openTestDatabase } from "./test-utils.js";

describe("repairIndex refuses a DO-NOT-INDEX conversation reached any other way", () => {
  const testDir = path.join(os.tmpdir(), `moe-memory-repair-marker-test-${Date.now()}`);
  const projectsDir = path.join(testDir, ".claude", "projects");
  const archiveDir = path.join(testDir, ".config", "moe", "memory", "conversation-archive");
  const dbPath = path.join(testDir, ".config", "moe", "memory", "conversation-index", "db.sqlite");
  let restoreConsole: () => void;

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, ".config", "moe", "memory", "conversation-index"), {
      recursive: true,
    });
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    process.env.TEST_PROJECTS_DIR = projectsDir;
    process.env.TEST_ARCHIVE_DIR = archiveDir;
    process.env.TEST_DB_PATH = dbPath;

    pipelineMock.mockReset();
    pipelineMock.mockImplementation(async () =>
      vi.fn(async () => ({ data: new Float32Array(384).fill(0.1) })),
    );
    vi.mocked(summarizeConversation).mockReset();
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_PROJECTS_DIR;
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.TEST_DB_PATH;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("never summarizes or indexes a marked conversation handed to it in issues.missing", async () => {
    const projectArchive = path.join(archiveDir, "test-project");
    fs.mkdirSync(projectArchive, { recursive: true });
    const conversationPath = path.join(projectArchive, "marked.jsonl");
    const messages = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: `Secret stuff. ${EXCLUSION_MARKER}` },
        timestamp: "2024-01-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Noted." },
        timestamp: "2024-01-01T00:00:01Z",
      }),
    ];
    fs.writeFileSync(conversationPath, messages.join("\n"));

    await repairIndex(
      {
        missing: [{ path: conversationPath, reason: "No summary file" }],
        orphaned: [],
        outdated: [],
        corrupted: [],
      },
      { noSummaries: false },
    );

    expect(summarizeConversation).not.toHaveBeenCalled();

    const db = openTestDatabase(dbPath);
    const row = db.prepare("SELECT COUNT(*) as n FROM exchanges").get() as { n: number };
    db.close();
    expect(row.n).toBe(0);
  });
});
