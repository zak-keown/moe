import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { insertExchange } from "../src/db.js";
import type { SnapshotSidecar, SnapshotSourceRecord } from "../src/database-snapshot.js";
import {
  applySourceReconciliation,
  planSourceReconciliation,
  type ReconciliationPlan,
} from "../src/rollback/reconcile.js";
import { fakeEmbed, openTestDatabase } from "./test-utils.js";

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function makeSnapshotSidecar(sources: SnapshotSourceRecord[]): SnapshotSidecar {
  return {
    schema: 1,
    dbIdentity: "test-db",
    dbSha256: "a".repeat(64),
    dbBytes: 1000,
    fromVersion: 2,
    toVersion: 3,
    sourceArtifactIntegrity: "",
    sources,
    createdAt: new Date().toISOString(),
  };
}

describe("source reconciliation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-reconcile-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects unchanged sources by content hash", () => {
    const content = "unchanged content";
    const filePath = path.join(tmpDir, "unchanged.jsonl");
    fs.writeFileSync(filePath, content);

    const sidecar = makeSnapshotSidecar([
      { family: "transcript", identity: "e-1", canonicalPath: filePath, sha256: sha256(content) },
    ]);

    const current = new Map([
      ["e-1", { family: "transcript" as const, canonicalPath: filePath }],
    ]);

    const plan = planSourceReconciliation(sidecar, current);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.created).toHaveLength(0);
    expect(plan.modified).toHaveLength(0);
    expect(plan.deleted).toHaveLength(0);
  });

  it("detects modified sources by content hash difference", () => {
    const originalContent = "original content";
    const modifiedContent = "modified content";
    const filePath = path.join(tmpDir, "modified.jsonl");
    fs.writeFileSync(filePath, modifiedContent);

    const sidecar = makeSnapshotSidecar([
      {
        family: "transcript",
        identity: "e-1",
        canonicalPath: filePath,
        sha256: sha256(originalContent),
      },
    ]);

    const current = new Map([
      ["e-1", { family: "transcript" as const, canonicalPath: filePath }],
    ]);

    const plan = planSourceReconciliation(sidecar, current);
    expect(plan.modified).toHaveLength(1);
    expect(plan.modified[0]!.identity).toBe("e-1");
  });

  it("detects created sources (in current but not snapshot)", () => {
    const filePath = path.join(tmpDir, "new.jsonl");
    fs.writeFileSync(filePath, "new content");

    const sidecar = makeSnapshotSidecar([]);

    const current = new Map([
      ["e-new", { family: "transcript" as const, canonicalPath: filePath }],
    ]);

    const plan = planSourceReconciliation(sidecar, current);
    expect(plan.created).toHaveLength(1);
    expect(plan.created[0]!.identity).toBe("e-new");
  });

  it("detects deleted sources (in snapshot but not current)", () => {
    const sidecar = makeSnapshotSidecar([
      {
        family: "journal",
        identity: "j-gone",
        canonicalPath: "/gone/entry.md",
        sha256: "a".repeat(64),
      },
    ]);

    const plan = planSourceReconciliation(sidecar, new Map());
    expect(plan.deleted).toHaveLength(1);
    expect(plan.deleted[0]!.identity).toBe("j-gone");
  });

  it("handles mixed create/modify/delete/unchanged", () => {
    const unchangedPath = path.join(tmpDir, "unchanged.jsonl");
    const modifiedPath = path.join(tmpDir, "modified.jsonl");
    const createdPath = path.join(tmpDir, "created.jsonl");

    const unchangedContent = "same";
    fs.writeFileSync(unchangedPath, unchangedContent);
    fs.writeFileSync(modifiedPath, "new-modified-content");
    fs.writeFileSync(createdPath, "new-created");

    const sidecar = makeSnapshotSidecar([
      {
        family: "transcript",
        identity: "e-same",
        canonicalPath: unchangedPath,
        sha256: sha256(unchangedContent),
      },
      {
        family: "transcript",
        identity: "e-mod",
        canonicalPath: modifiedPath,
        sha256: sha256("old-content"),
      },
      {
        family: "journal",
        identity: "j-del",
        canonicalPath: "/deleted.md",
        sha256: "b".repeat(64),
      },
    ]);

    const current = new Map([
      ["e-same", { family: "transcript" as const, canonicalPath: unchangedPath }],
      ["e-mod", { family: "transcript" as const, canonicalPath: modifiedPath }],
      ["e-new", { family: "transcript" as const, canonicalPath: createdPath }],
    ]);

    const plan = planSourceReconciliation(sidecar, current);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.modified).toHaveLength(1);
    expect(plan.created).toHaveLength(1);
    expect(plan.deleted).toHaveLength(1);
  });
});

describe("apply reconciliation to staged database", () => {
  let dataDir: string;
  let db: MemoryDatabase;
  const embed = fakeEmbed();

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-reconcile-apply-"));
    db = openTestDatabase(path.join(dataDir, "staged.db"));

    // Seed the database with test rows
    insertExchange(
      db,
      {
        id: "e-mod",
        project: "test",
        timestamp: new Date().toISOString(),
        userMessage: "hello",
        assistantMessage: "world",
        archivePath: "/test.jsonl",
        lineStart: 1,
        lineEnd: 10,
      },
      await embed("hello world"),
    );

    insertExchange(
      db,
      {
        id: "e-del",
        project: "test",
        timestamp: new Date().toISOString(),
        userMessage: "delete me",
        assistantMessage: "ok",
        archivePath: "/deleted.jsonl",
        lineStart: 1,
        lineEnd: 5,
      },
      await embed("delete me ok"),
    );
  });

  afterEach(async () => {
    db.close();
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("resets modified rows to embedding_version 0 and removes vectors", () => {
    const plan: ReconciliationPlan = {
      created: [],
      modified: [{ family: "transcript", identity: "e-mod", canonicalPath: "/test.jsonl" }],
      deleted: [],
      unchanged: [],
    };

    applySourceReconciliation(db, plan);

    const row = db.prepare("SELECT embedding_version FROM exchanges WHERE id = ?").get("e-mod") as {
      embedding_version: number;
    };
    expect(row.embedding_version).toBe(0);

    const vec = db.prepare("SELECT COUNT(*) as c FROM vec_exchanges WHERE id = ?").get("e-mod") as {
      c: number;
    };
    expect(vec.c).toBe(0);
  });

  it("deletes removed rows and their vectors and tool calls", () => {
    const plan: ReconciliationPlan = {
      created: [],
      modified: [],
      deleted: [{ family: "transcript", identity: "e-del", canonicalPath: "/deleted.jsonl" }],
      unchanged: [],
    };

    applySourceReconciliation(db, plan);

    const row = db.prepare("SELECT COUNT(*) as c FROM exchanges WHERE id = ?").get("e-del") as {
      c: number;
    };
    expect(row.c).toBe(0);

    const vec = db.prepare("SELECT COUNT(*) as c FROM vec_exchanges WHERE id = ?").get("e-del") as {
      c: number;
    };
    expect(vec.c).toBe(0);
  });

  it("leaves unchanged rows intact", () => {
    const plan: ReconciliationPlan = {
      created: [],
      modified: [],
      deleted: [],
      unchanged: [{ family: "transcript", identity: "e-mod", canonicalPath: "/test.jsonl" }],
    };

    applySourceReconciliation(db, plan);

    const row = db
      .prepare("SELECT embedding_version FROM exchanges WHERE id = ?")
      .get("e-mod") as { embedding_version: number };
    expect(row.embedding_version).toBeGreaterThan(0);
  });
});
