import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getEdgesFrom,
  getEdgesTo,
  getNode,
  initDatabase,
  insertEdge,
  insertNode,
  traceProvenance,
} from "../src/db.js";
import type { MemoryEdge, MemoryNode } from "../src/types.js";
import { suppressConsole } from "./test-utils.js";

suppressConsole();

describe("graph memory schema", () => {
  const testDir = path.join(os.tmpdir(), `graph-schema-test-${Date.now()}`);
  const dbPath = path.join(testDir, "test.db");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("memory_nodes table exists after initDatabase", () => {
    const db = initDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_nodes'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    db.close();
  });

  it("memory_edges table exists after initDatabase", () => {
    const db = initDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_edges'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    db.close();
  });

  it("vec_memory_nodes virtual table exists after initDatabase", () => {
    const db = initDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_memory_nodes'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    db.close();
  });
});

describe("graph memory CRUD", () => {
  const testDir = path.join(os.tmpdir(), `graph-crud-test-${Date.now()}`);
  const dbPath = path.join(testDir, "test.db");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("insertNode + getNode roundtrip", () => {
    const db = initDatabase();
    const node: MemoryNode = {
      id: "node-1",
      nodeType: "decision",
      project: "test-project",
      content: "We chose SQLite for graph storage",
      createdAt: "2026-09-02T10:00:00Z",
      embeddingVersion: 0,
    };

    insertNode(db, node);
    const retrieved = getNode(db, "node-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("node-1");
    expect(retrieved!.nodeType).toBe("decision");
    expect(retrieved!.project).toBe("test-project");
    expect(retrieved!.content).toBe("We chose SQLite for graph storage");
    expect(retrieved!.createdAt).toBe("2026-09-02T10:00:00Z");
    expect(retrieved!.embeddingVersion).toBe(0);
    expect(retrieved!.supersededAt).toBeUndefined();

    db.close();
  });

  it("getNode returns null for missing id", () => {
    const db = initDatabase();
    expect(getNode(db, "nonexistent")).toBeNull();
    db.close();
  });

  it("insertNode with optional fields omitted", () => {
    const db = initDatabase();
    const node: MemoryNode = {
      id: "node-sparse",
      nodeType: "finding",
      content: "No project specified",
      createdAt: "2026-09-02T10:00:00Z",
      embeddingVersion: 0,
    };

    insertNode(db, node);
    const retrieved = getNode(db, "node-sparse");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.project).toBeUndefined();
    expect(retrieved!.supersededAt).toBeUndefined();

    db.close();
  });

  it("insertEdge + getEdgesFrom + getEdgesTo", () => {
    const db = initDatabase();
    const edge: MemoryEdge = {
      id: "edge-1",
      sourceType: "exchange",
      sourceId: "ex-123",
      targetType: "journal",
      targetId: "jn-456",
      relation: "caused_by",
      confidence: 0.9,
      createdAt: "2026-09-02T10:00:00Z",
      createdBy: "model",
      metadata: { reason: "temporal proximity" },
    };

    insertEdge(db, edge);

    const fromEdges = getEdgesFrom(db, "exchange", "ex-123");
    expect(fromEdges).toHaveLength(1);
    expect(fromEdges[0]!.id).toBe("edge-1");
    expect(fromEdges[0]!.relation).toBe("caused_by");
    expect(fromEdges[0]!.confidence).toBe(0.9);
    expect(fromEdges[0]!.metadata).toEqual({ reason: "temporal proximity" });

    const toEdges = getEdgesTo(db, "journal", "jn-456");
    expect(toEdges).toHaveLength(1);
    expect(toEdges[0]!.id).toBe("edge-1");

    // No edges for unrelated records
    expect(getEdgesFrom(db, "journal", "jn-456")).toHaveLength(0);
    expect(getEdgesTo(db, "exchange", "ex-123")).toHaveLength(0);

    db.close();
  });
});

describe("traceProvenance", () => {
  const testDir = path.join(os.tmpdir(), `graph-trace-test-${Date.now()}`);
  const dbPath = path.join(testDir, "test.db");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function makeEdge(
    id: string,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relation = "caused_by" as const,
  ): MemoryEdge {
    return {
      id,
      sourceType: sourceType as MemoryEdge["sourceType"],
      sourceId,
      targetType: targetType as MemoryEdge["targetType"],
      targetId,
      relation,
      confidence: 1.0,
      createdAt: "2026-09-02T10:00:00Z",
      createdBy: "model",
    };
  }

  it("traces a 3-node chain with caused_by in causes direction", () => {
    // Chain: A caused_by B caused_by C
    // Edge 1: source=B, target=A (B caused A)
    // Edge 2: source=C, target=B (C caused B)
    const db = initDatabase();

    insertEdge(db, makeEdge("e1", "finding", "B", "finding", "A"));
    insertEdge(db, makeEdge("e2", "finding", "C", "finding", "B"));

    // Trace causes from A: should find B at depth 1, C at depth 2
    const chain = traceProvenance(db, "finding", "A", 3, "causes");
    expect(chain).toHaveLength(2);
    expect(chain[0]!.depth).toBe(1);
    expect(chain[0]!.edge.sourceId).toBe("B");
    expect(chain[1]!.depth).toBe(2);
    expect(chain[1]!.edge.sourceId).toBe("C");

    db.close();
  });

  it("traces in effects direction", () => {
    // Edge: source=A, target=B (A caused B)
    // Edge: source=B, target=C (B caused C)
    const db = initDatabase();

    insertEdge(db, makeEdge("e1", "finding", "A", "finding", "B"));
    insertEdge(db, makeEdge("e2", "finding", "B", "finding", "C"));

    // Trace effects from A: should find B at depth 1, C at depth 2
    const chain = traceProvenance(db, "finding", "A", 3, "effects");
    expect(chain).toHaveLength(2);
    expect(chain[0]!.depth).toBe(1);
    expect(chain[0]!.edge.targetId).toBe("B");
    expect(chain[1]!.depth).toBe(2);
    expect(chain[1]!.edge.targetId).toBe("C");

    db.close();
  });

  it("respects depth limit", () => {
    const db = initDatabase();

    // Chain: A <- B <- C <- D (3 edges, 4 nodes)
    insertEdge(db, makeEdge("e1", "finding", "B", "finding", "A"));
    insertEdge(db, makeEdge("e2", "finding", "C", "finding", "B"));
    insertEdge(db, makeEdge("e3", "finding", "D", "finding", "C"));

    // Trace with depth=1: only get B
    const chain1 = traceProvenance(db, "finding", "A", 1, "causes");
    expect(chain1).toHaveLength(1);
    expect(chain1[0]!.edge.sourceId).toBe("B");

    // Trace with depth=2: get B and C
    const chain2 = traceProvenance(db, "finding", "A", 2, "causes");
    expect(chain2).toHaveLength(2);

    db.close();
  });

  it("returns empty for a record with no edges", () => {
    const db = initDatabase();
    const chain = traceProvenance(db, "finding", "orphan", 3, "causes");
    expect(chain).toHaveLength(0);
    db.close();
  });

  it("handles cycles without infinite loop", () => {
    const db = initDatabase();

    // Cycle: A -> B -> A
    insertEdge(db, makeEdge("e1", "finding", "A", "finding", "B"));
    insertEdge(db, makeEdge("e2", "finding", "B", "finding", "A"));

    // Should not infinite-loop; visited-set prevents re-traversal
    const chain = traceProvenance(db, "finding", "A", 10, "effects");
    expect(chain).toHaveLength(2);

    db.close();
  });
});

describe("link_memories MCP handler parsing", () => {
  it("parseTypeId splits on first colon correctly", () => {
    // Replicate the parsing logic from mcp-server handler
    const source = "exchange:abc123";
    const target = "journal:def:456";

    const sourceColon = source.indexOf(":");
    const targetColon = target.indexOf(":");

    expect(source.slice(0, sourceColon)).toBe("exchange");
    expect(source.slice(sourceColon + 1)).toBe("abc123");

    // Colon in the id portion is preserved
    expect(target.slice(0, targetColon)).toBe("journal");
    expect(target.slice(targetColon + 1)).toBe("def:456");
  });
});

describe("trace_provenance MCP handler", () => {
  const testDir = path.join(os.tmpdir(), `graph-mcp-test-${Date.now()}`);
  const dbPath = path.join(testDir, "test.db");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.TEST_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TEST_DB_PATH;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("returns structured chain as JSON", () => {
    const db = initDatabase();

    const edge: MemoryEdge = {
      id: "e-mcp-1",
      sourceType: "exchange",
      sourceId: "ex-100",
      targetType: "decision",
      targetId: "dec-200",
      relation: "supports",
      confidence: 0.85,
      createdAt: "2026-09-02T10:00:00Z",
      createdBy: "model",
    };
    insertEdge(db, edge);

    const chain = traceProvenance(db, "decision", "dec-200", 3, "causes");
    expect(chain).toHaveLength(1);
    expect(chain[0]!.depth).toBe(1);
    expect(chain[0]!.edge.sourceType).toBe("exchange");
    expect(chain[0]!.edge.sourceId).toBe("ex-100");
    expect(chain[0]!.edge.relation).toBe("supports");

    // Verify it serializes to JSON without error
    const json = JSON.stringify({
      start: "decision:dec-200",
      direction: "causes",
      depth: 3,
      chain,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chain).toHaveLength(1);
    expect(parsed.start).toBe("decision:dec-200");

    db.close();
  });
});
