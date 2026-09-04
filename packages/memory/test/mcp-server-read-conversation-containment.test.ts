import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryMcpServer } from "../src/mcp-server.js";
import { suppressConsole } from "./test-utils.js";

suppressConsole();

/**
 * CR-019: the `read_conversation` MCP tool handler did
 *
 *   if (!fs.existsSync(params.path)) throw ...
 *   const jsonlContent = fs.readFileSync(params.path, "utf-8");
 *
 * with no check that `params.path` resolves under the trusted archive root
 * (`getArchiveDir()`), unlike `read_journal_entry`'s two-stage
 * resolve/realpath containment guard (journal/search.ts's `readEntry`). Since
 * this tool is model-callable and the model's context is built largely from
 * `search_conversations` results — content harvested out of past transcripts,
 * which can carry attacker-supplied text — a prompt-injection payload could
 * direct the model to read an arbitrary file on disk and have its content
 * returned as though it were a conversation.
 *
 * This test drives the real MCP request/response boundary (Client +
 * InMemoryTransport, not a direct function call) so it proves what an actual
 * tool-calling model would receive: a file placed OUTSIDE the configured
 * archive directory must be refused, not read back.
 */
describe("CR-019: read_conversation refuses paths outside the archive root", () => {
  let archiveDir: string;
  let outsideDir: string;
  let client: Client;
  let previousArchiveDir: string | undefined;

  beforeEach(async () => {
    previousArchiveDir = process.env.TEST_ARCHIVE_DIR;
    archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-archive-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-outside-"));
    process.env.TEST_ARCHIVE_DIR = archiveDir;

    const server = createMemoryMcpServer({
      journalPath: fs.mkdtempSync(path.join(os.tmpdir(), "moe-memory-journal-")),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
    fs.rmSync(archiveDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    if (previousArchiveDir === undefined) delete process.env.TEST_ARCHIVE_DIR;
    else process.env.TEST_ARCHIVE_DIR = previousArchiveDir;
  });

  it("refuses to read a file outside the archive directory", async () => {
    const secretPath = path.join(outsideDir, "secret.jsonl");
    const secretLine = JSON.stringify({
      uuid: "u1",
      parentUuid: null,
      timestamp: "2026-01-01T00:00:00Z",
      type: "user",
      isSidechain: false,
      message: { role: "user", content: "TOP SECRET PAYLOAD" },
    });
    fs.writeFileSync(secretPath, `${secretLine}\n`, "utf-8");

    const result = await client.callTool({
      name: "read_conversation",
      arguments: { path: secretPath },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).not.toContain("TOP SECRET PAYLOAD");
  });

  it("still reads a file that is genuinely inside the archive directory", async () => {
    const insidePath = path.join(archiveDir, "conv.jsonl");
    const insideLine = JSON.stringify({
      uuid: "u2",
      parentUuid: null,
      timestamp: "2026-01-01T00:00:00Z",
      type: "user",
      isSidechain: false,
      message: { role: "user", content: "hello from inside the archive" },
    });
    fs.writeFileSync(insidePath, `${insideLine}\n`, "utf-8");

    const result = await client.callTool({
      name: "read_conversation",
      arguments: { path: insidePath },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("hello from inside the archive");
  });
});
