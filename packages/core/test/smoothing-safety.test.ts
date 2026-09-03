import { describe, expect, it } from "vitest";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { classifyFilesystem } from "../skills/smoothing-the-experience/scripts/lib/safety/filesystem.mjs";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { classifyMcp } from "../skills/smoothing-the-experience/scripts/lib/safety/mcp.mjs";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { classifyNetwork } from "../skills/smoothing-the-experience/scripts/lib/safety/network.mjs";
// @ts-expect-error — the production helper is intentionally plain ESM.
import * as shellSafety from "../skills/smoothing-the-experience/scripts/lib/safety/shell.mjs";

const { classifyShell, parseConservativeShell, PROJECT_SHELL_CATALOG } = shellSafety;

describe("shell safety", () => {
  it.each([
    "git status && git push",
    "git status | cat",
    "FOO=x git status",
    "git $(echo status)",
    "git st*",
    "bash -lc 'git status'",
    "cp a b",
    "rm file",
  ])("rejects %s", (command) => {
    expect(parseConservativeShell(command)).toBeNull();
  });

  it("tokenizes only plain, optionally quoted arguments", () => {
    expect(parseConservativeShell("git show 'topic branch' \"src/a file.ts\"")).toEqual([
      "git",
      "show",
      "topic branch",
      "src/a file.ts",
    ]);
    expect(parseConservativeShell("git show 'unterminated")).toBeNull();
  });

  it.each([
    "git diff --ext-diff",
    "git diff --textconv",
    "git log --ext-diff",
    "git show --textconv",
    "git diff --output=status.txt",
    "git log --unsupported-option",
  ])("does not emit parser output for unsafe catalog arguments in %s", (command) => {
    expect(parseConservativeShell(command)).toBeNull();
  });

  it("emits parser output for an allowlisted exact Claude read form", () => {
    expect(parseConservativeShell("git diff --stat HEAD")).toEqual([
      "git",
      "diff",
      "--stat",
      "HEAD",
    ]);
  });

  it.each([
    [["git", "status"], true, true],
    [["git", "add", "src/index.ts"], true, false],
    [["git", "push"], false, false],
  ])("classifies %j", (argv, eligible, globalSafe) => {
    expect(
      classifyShell({ argv }, { projectRoot: "/fixture/repo-a", harness: "claude" }),
    ).toMatchObject({ eligible, globalSafe });
  });

  it.each([
    ["chain", ["git", "status", "&&", "git", "push"]],
    ["pipe", ["git", "status", "|", "cat"]],
    ["redirection", ["git", "status", ">", "status.txt"]],
    ["command substitution", ["git", "status", "$(echo status)"]],
    ["variable expansion", ["git", "status", "$HOME"]],
    ["glob", ["git", "status", "src/*"]],
    ["assignment", ["git", "status", "PAGER=cat"]],
    ["wrapper", ["bash", "-lc", "git status"]],
  ])("rejects native argv containing %s syntax", (_label, argv) => {
    expect(
      classifyShell({ argv }, { projectRoot: "/fixture/repo-a", harness: "claude" }).eligible,
    ).toBe(false);
  });

  it.each([
    ["git", "diff", "--ext-diff"],
    ["git", "diff", "--textconv"],
    ["git", "log", "--ext-diff"],
    ["git", "show", "--textconv"],
  ])("rejects external-execution Git arguments %j", (...argv) => {
    expect(
      classifyShell({ argv }, { projectRoot: "/fixture/repo-a", harness: "claude" }).eligible,
    ).toBe(false);
  });

  it.each(["git diff", "git log", "git show"])(
    "does not expose %s as a suffix-safe renderer prefix",
    (command) => {
      expect(PROJECT_SHELL_CATALOG.get(command)?.suffixSafe).toBe(false);
    },
  );

  it.each([
    ["git", "diff"],
    ["git", "log"],
    ["git", "show"],
  ])("keeps exact Claude read command %j selectable", (...argv) => {
    expect(
      classifyShell({ argv }, { projectRoot: "/fixture/repo-a", harness: "claude" }),
    ).toMatchObject({ eligible: true, normalized: { argv }, globalSafe: true });
  });

  it("keeps allowlisted read options exact for Claude and declines them for Codex", () => {
    const operation = { argv: ["git", "diff", "--stat", "HEAD"] };
    expect(
      classifyShell(operation, {
        projectRoot: "/fixture/repo-a",
        harness: "claude",
      }),
    ).toMatchObject({
      eligible: true,
      normalized: operation,
      globalSafe: false,
    });
    expect(
      classifyShell(operation, {
        projectRoot: "/fixture/repo-a",
        harness: "codex",
      }).eligible,
    ).toBe(false);
  });

  it("permits exact contained cp -n evidence for Claude only", () => {
    const context = {
      projectRoot: "/fixture/repo-a",
      realpath: (value: string) => value,
    };
    expect(
      classifyShell(
        { argv: ["cp", "-n", "src/a.txt", "tmp/a.txt"] },
        { ...context, harness: "claude" },
      ),
    ).toMatchObject({
      eligible: true,
      normalized: { argv: ["cp", "-n", "src/a.txt", "tmp/a.txt"] },
      globalSafe: false,
    });
    expect(
      classifyShell(
        { argv: ["cp", "-n", "src/a.txt", "tmp/a.txt"] },
        { ...context, harness: "codex" },
      ).eligible,
    ).toBe(false);
    expect(
      classifyShell(
        { argv: ["cp", "-n", "src/a.txt", "../a.txt"] },
        { ...context, harness: "claude" },
      ).eligible,
    ).toBe(false);
  });
});

describe("filesystem safety", () => {
  it.each([
    "../outside",
    ".env",
    ".git/config",
    ".claude/settings.local.json",
    "secrets/api-key.txt",
  ])("rejects unsafe path %s", async (path) => {
    const result = await classifyFilesystem(
      { action: "read", path },
      {
        projectRoot: "/fixture/repo-a",
        anchorProven: true,
        realpath: async (value: string) => (value.includes("outside") ? "/fixture/outside" : value),
      },
    );
    expect(result.eligible).toBe(false);
  });

  it("rejects unproven anchors, canonical escapes, and case-folded policy paths", async () => {
    const base = {
      projectRoot: "/fixture/repo-a",
      realpath: async (value: string) => value,
    };
    expect(
      (
        await classifyFilesystem(
          { action: "read", path: "src/index.ts" },
          { ...base, anchorProven: false },
        )
      ).eligible,
    ).toBe(false);
    expect(
      (
        await classifyFilesystem(
          { action: "read", path: "linked/index.ts" },
          {
            ...base,
            anchorProven: true,
            realpath: async () => "/fixture/outside/index.ts",
          },
        )
      ).eligible,
    ).toBe(false);
    expect(
      (
        await classifyFilesystem(
          { action: "read", path: "config/.ENV.Local" },
          { ...base, anchorProven: true },
        )
      ).eligible,
    ).toBe(false);
  });

  it("keeps read and modify exact and separate", async () => {
    const result = await classifyFilesystem(
      { action: "modify", path: "src/index.ts" },
      {
        projectRoot: "/fixture/repo-a",
        anchorProven: true,
        realpath: async (value: string) => value,
      },
    );
    expect(result).toMatchObject({
      eligible: true,
      normalized: { action: "modify", path: "src/index.ts" },
      globalSafe: false,
    });
  });
});

describe("network safety", () => {
  it.each([
    "127.0.0.1",
    "localhost",
    "10.0.0.2",
    "*.example.invalid",
    "169.254.169.254",
    "service.local",
  ])("rejects network target %s", (hostname) => {
    expect(classifyNetwork({ hostname }).eligible).toBe(false);
  });

  it("retains only an exact normalized hostname", () => {
    expect(classifyNetwork({ hostname: "Docs.Example.Invalid" })).toMatchObject({
      eligible: true,
      normalized: { hostname: "docs.example.invalid" },
    });
    expect(classifyNetwork({ hostname: "BÜCHER.Example" })).toMatchObject({
      eligible: true,
      normalized: { hostname: "xn--bcher-kva.example" },
    });
  });
});

describe("MCP safety", () => {
  it("allows only exact Moe-owned read-only MCP identifiers", () => {
    expect(
      classifyMcp({
        toolId: "mcp__plugin_moe-memory_moe-memory__search_conversations",
      }).eligible,
    ).toBe(true);
    expect(classifyMcp({ toolId: "mcp__unknown__read" }).eligible).toBe(false);
  });
});
