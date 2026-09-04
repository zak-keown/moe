import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CLIAdapter } from "../../../../src/qa/adapters/cli/adapter.js";
import type { EvidenceLogger } from "../../../../src/qa/evidence/logger.js";
import { withCredentialFixture } from "../../helpers/credential-fixture.js";

const mockLogger = { logAction: () => {} } as unknown as EvidenceLogger;

describe("CLIAdapter", () => {
  let adapter: CLIAdapter | null = null;
  let runDir: string;

  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), "cli-adapter-legacy-"));
  });

  afterEach(async () => {
    if (adapter) await adapter.close();
    adapter = null;
    rmSync(runDir, { recursive: true, force: true });
  });

  test("exposes tool definitions for the agent", () => {
    adapter = new CLIAdapter();
    const tools = adapter.toolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain("type");
    expect(names).toContain("press");
    expect(names).toContain("read_output");
  });

  test("includes `read` tool when context root is non-empty", () => {
    const tmp = mkdtempSync(join(tmpdir(), "moe-flight-cli-read-wire-"));
    try {
      mkdirSync(join(tmp, ".moe-flight", "context"), { recursive: true });
      writeFileSync(join(tmp, ".moe-flight", "context", "alice.md"), "A");
      adapter = new CLIAdapter({
        contextRoot: join(tmp, ".moe-flight", "context"),
      });
      const names = adapter.toolDefinitions().map((t) => t.name);
      expect(names).toContain("read");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("executeTool(read) returns file contents via the `read` tool", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "moe-flight-cli-read-exec-"));
    try {
      mkdirSync(join(tmp, ".moe-flight", "context", "alice"), { recursive: true });
      writeFileSync(
        join(tmp, ".moe-flight", "context", "alice", "credentials.md"),
        "Username: alice\nPassword: hunter2",
      );
      adapter = new CLIAdapter({
        contextRoot: join(tmp, ".moe-flight", "context"),
      });
      const result = await adapter.executeTool(
        "read",
        { path: "alice/credentials.md" },
        mockLogger,
      );
      expect(result.text).toContain("Username: alice");
      expect(result.text).toContain("Password: hunter2");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("defaultViewport returns null — CLI has no rendering surface", () => {
    const adapter = new CLIAdapter();
    expect(adapter.defaultViewport()).toBeNull();
  });

  test("registers fetch_credential when contextRoot and credentialResolver set", async () => {
    await withCredentialFixture(
      {
        contextFiles: { "alice.md": "anything" },
        resolverScript: "#!/bin/sh\necho ok\n",
      },
      ({ contextDir, resolverPath }) => {
        const adapter = new CLIAdapter({
          contextRoot: contextDir,
          credentialResolver: { path: resolverPath!, timeoutMs: 1000, includeInTranscripts: false },
        });
        expect(adapter.toolDefinitions().map((t) => t.name)).toContain("fetch_credential");
      },
    );
  });

  test("omits fetch_credential when credentialResolver is undefined", async () => {
    await withCredentialFixture({ contextFiles: { "alice.md": "anything" } }, ({ contextDir }) => {
      const adapter = new CLIAdapter({ contextRoot: contextDir });
      expect(adapter.toolDefinitions().map((t) => t.name)).not.toContain("fetch_credential");
    });
  });

  test("omits fetch_credential when contextRoot is empty even if resolver is set", async () => {
    await withCredentialFixture(
      { resolverScript: "#!/bin/sh\necho ok\n" },
      ({ contextDir, resolverPath }) => {
        const adapter = new CLIAdapter({
          contextRoot: contextDir,
          credentialResolver: { path: resolverPath!, timeoutMs: 1000, includeInTranscripts: false },
        });
        expect(adapter.toolDefinitions().map((t) => t.name)).not.toContain("fetch_credential");
      },
    );
  });

  test("toolDefinitions includes bash", () => {
    const adapter = new CLIAdapter({
      runDir: mkdtempSync(join(tmpdir(), "moe-flight-bash-adapter-")),
    });
    const names = adapter.toolDefinitions().map((d) => d.name);
    expect(names).toContain("bash");
  });
});
