import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const {
  classifyClaudePermission,
  discoverClaude,
  loadClaudePermissions,
  matchClaudePermission,
  readClaudeSession,
} = await import(
  // @ts-expect-error — the production helper is intentionally plain ESM.
  "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs"
);

const fixture = fileURLToPath(
  new URL("fixtures/smoothing-the-experience/claude/root.jsonl", import.meta.url),
);
const subagentFixture = fileURLToPath(
  new URL("fixtures/smoothing-the-experience/claude/subagents/agent.jsonl", import.meta.url),
);
const settingsFixture = fileURLToPath(
  new URL("fixtures/smoothing-the-experience/claude/settings.json", import.meta.url),
);

function makeFixtureFs(userSettings: string) {
  const files = new Map([
    ["/fixture/claude/settings.json", userSettings],
    [
      "/fixture/repo-a/.claude/settings.json",
      JSON.stringify({
        permissions: { deny: [], ask: ["Bash(git status)"], allow: [] },
      }),
    ],
    [
      "/fixture/repo-a/.claude/settings.local.json",
      JSON.stringify({
        permissions: {
          deny: [],
          ask: [],
          allow: ["Bash(git status)", "Read(src/index.ts)"],
        },
      }),
    ],
    [
      "/fixture/malformed/settings.json",
      JSON.stringify({ permissions: { allow: "not-an-array" } }),
    ],
  ]);
  return {
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return value;
    },
    realpath: async (path: string) => path,
  };
}

describe("Claude smoothing reader", () => {
  it("projects four evidence classes without retaining tool payload prose", async () => {
    const result = await readClaudeSession(fixture, {
      cutoffMs: Date.parse("2026-08-04T00:00:00Z"),
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
    });

    expect(result.evidence.map((row: { class: string }) => row.class)).toEqual([
      "shell",
      "filesystem",
      "network",
      "mcp",
    ]);
    expect(result.evidence.map((row: { operation: unknown }) => row.operation)).toEqual([
      { command: "git status" },
      { action: "read", path: "/fixture/repo-a/src/index.ts" },
      { hostname: "docs.example.invalid" },
      { toolId: "mcp__plugin_moe-memory_moe-memory__search_conversations" },
    ]);
    expect(JSON.stringify(result)).not.toContain("discard");
    expect(
      new Set(result.evidence.map((row: { rootSessionId: string }) => row.rootSessionId)),
    ).toEqual(new Set(["root-a"]));
  });

  it("collapses subagents by session and records recognized denials", async () => {
    const result = await readClaudeSession(subagentFixture, {
      cutoffMs: Date.parse("2026-08-04T00:00:00Z"),
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
    });

    expect(result.evidence.map((row: { rootSessionId: string }) => row.rootSessionId)).toEqual([
      "root-a",
      "root-a",
    ]);
    expect(result.evidence.map((row: { outcome: string }) => row.outcome)).toEqual([
      "success",
      "denied",
    ]);
    expect(result.diagnostics.unknownShapes).toBe(1);
    expect(JSON.stringify(result)).not.toContain("agent-a");
  });

  it("skips invalid URLs without retaining them", async () => {
    const file = `${fixture}.invalid-url`;
    const result = await readClaudeSession(file, {
      cutoffMs: 0,
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
      readFile: async () =>
        JSON.stringify({
          type: "assistant",
          sessionId: "root-a",
          cwd: "/fixture/repo-a",
          timestamp: "2026-09-01T10:00:00.000Z",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-invalid-url",
                name: "WebFetch",
                input: { url: "not a URL with discard" },
              },
            ],
          },
        }),
    });

    expect(result.evidence).toEqual([]);
    expect(result.diagnostics.invalidOperations).toBe(1);
    expect(JSON.stringify(result)).not.toContain("not a URL");
  });

  it("skips valid URLs whose hostnames cannot enter the evidence contract", async () => {
    const result = await readClaudeSession(`${fixture}.localhost`, {
      cutoffMs: 0,
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
      readFile: async () =>
        JSON.stringify({
          type: "assistant",
          sessionId: "root-a",
          cwd: "/fixture/repo-a",
          timestamp: "2026-09-01T10:00:00.000Z",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-localhost",
                name: "WebFetch",
                input: { url: "https://localhost/private?discard" },
              },
            ],
          },
        }),
    });

    expect(result.evidence).toEqual([]);
    expect(result.diagnostics.invalidOperations).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it.each([
    ["stale", "2026-08-31T23:59:59.000Z"],
    ["invalid", "not-a-timestamp"],
  ])("does not join a %s tool result across the cutoff", async (_label, resultTimestamp) => {
    const result = await readClaudeSession(`${fixture}.${_label}-result`, {
      cutoffMs: Date.parse("2026-09-01T00:00:00Z"),
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
      readFile: async () =>
        [
          JSON.stringify({
            type: "assistant",
            sessionId: "root-a",
            cwd: "/fixture/repo-a",
            timestamp: "2026-09-01T00:00:01.000Z",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "tool-with-old-result",
                  name: "Bash",
                  input: { command: "git status" },
                },
              ],
            },
          }),
          JSON.stringify({
            type: "user",
            sessionId: "root-a",
            timestamp: resultTimestamp,
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tool-with-old-result",
                  is_error: true,
                },
              ],
            },
          }),
        ].join("\n"),
    });

    expect(result.evidence.map((row: { outcome: string }) => row.outcome)).toEqual(["unknown"]);
  });

  it.each([
    ["empty", ""],
    ["null", null],
  ])("fails closed when a tool result has a %s denial marker", async (_label, toolDenialKind) => {
    const result = await readClaudeSession(`${fixture}.${_label}-denial`, {
      cutoffMs: 0,
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
      readFile: async () =>
        [
          JSON.stringify({
            type: "assistant",
            sessionId: "root-a",
            cwd: "/fixture/repo-a",
            timestamp: "2026-09-01T00:00:00.000Z",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "tool-with-denial-marker",
                  name: "Bash",
                  input: { command: "git status" },
                },
              ],
            },
          }),
          JSON.stringify({
            type: "user",
            sessionId: "root-a",
            timestamp: "2026-09-01T00:00:01.000Z",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tool-with-denial-marker",
                  is_error: false,
                  toolDenialKind,
                },
              ],
            },
          }),
        ].join("\n"),
    });

    expect(result.evidence.map((row: { outcome: string }) => row.outcome)).toEqual(["denied"]);
  });
});

describe("Claude permissions", () => {
  it("applies deny before ask and allow across effective settings", async () => {
    const fixtureFs = makeFixtureFs(await readFile(settingsFixture, "utf8"));
    const state = await loadClaudePermissions({
      configDir: "/fixture/claude",
      projectRoot: "/fixture/repo-a",
      primaryCwd: "/fixture/repo-a",
      fsOps: fixtureFs,
    });

    expect(classifyClaudePermission({ class: "shell", argv: ["git", "status"] }, state)).toBe(
      "denied",
    );
    expect(
      classifyClaudePermission(
        { class: "filesystem", action: "read", path: "src/index.ts" },
        state,
      ),
    ).toBe("existing-rule");
    expect(
      matchClaudePermission("Bash(git status)", { class: "shell", command: "git status" }, {}),
    ).toBe(true);
  });

  it("fails closed on malformed permission lists", async () => {
    await expect(
      loadClaudePermissions({
        configDir: "/fixture/malformed",
        projectRoot: "/fixture/repo-a",
        primaryCwd: "/fixture/repo-a",
        fsOps: makeFixtureFs("{}"),
      }),
    ).rejects.toThrow(/permissions.allow must contain strings/);

    const fixtureFs = makeFixtureFs("{}");
    await expect(
      loadClaudePermissions({
        configDir: "/fixture/claude",
        projectRoot: "/fixture/repo-a",
        primaryCwd: "/fixture/repo-a",
        fsOps: {
          ...fixtureFs,
          readFile: async (path: string) =>
            path === "/fixture/claude/settings.json"
              ? JSON.stringify({ permissions: { deny: [], ask: [], allow: null } })
              : fixtureFs.readFile(path),
        },
      }),
    ).rejects.toThrow(/permissions.allow must contain strings/);
  });
});

it("discovers only sorted JSONL session files under Claude's projects root", async () => {
  const tree = new Map([
    ["/fixture/claude/projects", ["z.jsonl", "nested", "skip.txt", "a.jsonl"]],
    ["/fixture/claude/projects/nested", ["b.jsonl"]],
  ]);
  const discovery = await discoverClaude({
    env: { CLAUDE_CONFIG_DIR: "/fixture/claude" },
    homeDir: "/fixture/home",
    cwd: "/fixture/repo-a",
    cutoffMs: 0,
    fsOps: {
      readdir: async (path: string) =>
        (tree.get(path) ?? []).map((name) => ({
          name,
          isDirectory: () => name === "nested",
          isFile: () => name.endsWith(".jsonl") || name.endsWith(".txt"),
        })),
    },
  });

  expect(discovery.files).toEqual([
    "/fixture/claude/projects/a.jsonl",
    "/fixture/claude/projects/nested/b.jsonl",
    "/fixture/claude/projects/z.jsonl",
  ]);
  expect(discovery.sessionRoot).toBe("/fixture/claude/projects");
});
