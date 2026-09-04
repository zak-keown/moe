import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, globalAgent, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchAndSaveDoc,
  getClaudeCodeUrls,
} from "../skills/cc-config/scripts/update_docs.mjs";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CORE, "skills/cc-config/scripts/update_docs.mjs");

describe("update_docs", () => {
  let server: Server;
  let origin: string;
  let destination: string;

  beforeEach(async () => {
    destination = mkdtempSync(join(tmpdir(), "update-docs-"));
    server = createServer((request, response) => {
      if (request.url === "/llms.txt") {
        response.end(
          [
            "https://docs.claude.com/en/docs/claude-code/zeta.md",
            "[Alpha](https://docs.claude.com/en/docs/claude-code/alpha.md)",
            "https://docs.claude.com/en/docs/claude-code/zeta.md",
            "https://example.invalid/not-claude-code.md",
          ].join("\n"),
        );
      } else if (request.url === "/redirect.md") {
        response.writeHead(302, { location: "/split.md" });
        response.end();
      } else if (request.url === "/split.md") {
        response.write(Buffer.from([0x73, 0x6e, 0x6f, 0x77, 0x20, 0xe2]));
        setImmediate(() => response.end(Buffer.from([0x98, 0x83, 0x0a])));
      } else if (request.url === "/failure") {
        response.writeHead(503, "Unavailable");
        response.end("nope");
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    globalAgent.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(destination, { recursive: true, force: true });
  });

  it("extracts, deduplicates, and sorts Claude Code URLs", async () => {
    await expect(getClaudeCodeUrls(`${origin}/llms.txt`)).resolves.toEqual([
      "https://docs.claude.com/en/docs/claude-code/alpha.md",
      "https://docs.claude.com/en/docs/claude-code/zeta.md",
    ]);
  });

  it("follows redirects and decodes UTF-8 characters split across chunks", async () => {
    await expect(fetchAndSaveDoc(`${origin}/redirect.md`, destination)).resolves.toMatchObject({
      filename: "redirect.md",
      success: true,
    });
    expect(readFileSync(join(destination, "redirect.md"), "utf8")).toBe("snow ☃\n");
  });

  it("rejects unsafe filenames without writing", async () => {
    await expect(fetchAndSaveDoc(`${origin}/%2e%2e`, destination)).resolves.toMatchObject({
      success: false,
      error: "rejected filename",
    });
    await expect(fetchAndSaveDoc(`${origin}/bad%20name.md`, destination)).resolves.toMatchObject({
      success: false,
      error: "rejected filename",
    });
  });

  it("writes a successfully fetched document to the requested cache", async () => {
    const result = await fetchAndSaveDoc(`${origin}/split.md`, destination);
    expect(result).toEqual({ url: `${origin}/split.md`, filename: "split.md", success: true });
    expect(readFileSync(join(destination, "split.md"), "utf8")).toBe("snow ☃\n");
  });
});

it("exits nonzero when the top-level index fetch fails", () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, MOE_UPDATE_DOCS_INDEX_URL: "http://127.0.0.1:1/unreachable" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("❌ Error:");
});
