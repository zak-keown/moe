import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEdgesFrom, initDatabase } from "../src/db.js";
import { createMemoryMcpServer } from "../src/mcp-server.js";
import { suppressConsole } from "./test-utils.js";

suppressConsole();

/**
 * CR-057: `link_memories` and `trace_provenance` only checked that the
 * `type:id` string had a colon in it — the `type` half was never checked
 * against the five declared `SourceType` values (`types.ts`). The handler did
 * `params.source.slice(0, sourceColon) as SourceType`, which is a
 * compile-time-only cast; nothing at runtime rejected `source: "anything:123"`.
 * `insertEdge` would happily persist an edge with an arbitrary `source_type`,
 * silently corrupting the graph the model was told has a closed set of types
 * (the tool's own `inputSchema` description advertises
 * "e.g. 'exchange:abc123', 'journal:def456', 'decision:ghi789'").
 *
 * This drives the real MCP client/server boundary so it proves what an
 * actual tool-calling model would receive: a hallucinated/typo'd type prefix
 * must be rejected with a clear error, and no edge must be persisted.
 */
describe("CR-057: link_memories and trace_provenance validate the type prefix", () => {
  let dbPath: string;
  let client: Client;
  let previousDbPath: string | undefined;

  beforeEach(async () => {
    previousDbPath = process.env.TEST_DB_PATH;
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-graph-")), "test.db");
    process.env.TEST_DB_PATH = dbPath;

    const server = createMemoryMcpServer({
      journalPath: fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-journal-")),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
    if (previousDbPath === undefined) delete process.env.TEST_DB_PATH;
    else process.env.TEST_DB_PATH = previousDbPath;
  });

  it("rejects link_memories with a source type outside the declared SourceType set", async () => {
    const result = await client.callTool({
      name: "link_memories",
      arguments: { source: "anything:123", target: "exchange:abc123", relation: "supports" },
    });

    expect(result.isError).toBe(true);

    // No edge was persisted for the rejected call.
    const db = initDatabase();
    try {
      expect(getEdgesFrom(db, "anything", "123")).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("rejects link_memories with a target type outside the declared SourceType set", async () => {
    const result = await client.callTool({
      name: "link_memories",
      arguments: { source: "exchange:abc123", target: "bogus:456", relation: "supports" },
    });

    expect(result.isError).toBe(true);
  });

  it("still links a valid type:id pair", async () => {
    const result = await client.callTool({
      name: "link_memories",
      arguments: { source: "exchange:abc123", target: "journal:def456", relation: "supports" },
    });

    expect(result.isError).toBeFalsy();

    const db = initDatabase();
    try {
      expect(getEdgesFrom(db, "exchange", "abc123")).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("rejects trace_provenance with a type outside the declared SourceType set", async () => {
    const result = await client.callTool({
      name: "trace_provenance",
      arguments: { id: "hallucinated:xyz" },
    });

    expect(result.isError).toBe(true);
  });
});
