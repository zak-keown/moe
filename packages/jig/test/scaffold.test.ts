import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("iterationsInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-scaffold-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the full directory structure with all skeleton files", async () => {
    const { iterationsInit } = await import("../src/scaffold.js");
    const result = iterationsInit({ cwd: dir });
    expect(result).toBe(join(dir, "docs", "moe", "iterations"));
    expect(existsSync(join(result, "requirements"))).toBe(true);
    expect(existsSync(join(result, "behavior-scenarios.md"))).toBe(true);
    expect(existsSync(join(result, "behavior-corpus.md"))).toBe(true);
    expect(existsSync(join(result, "roadmap.md"))).toBe(true);
    expect(existsSync(join(result, "progress.md"))).toBe(true);
  });

  it("writes correct skeleton content in behavior-scenarios.md", async () => {
    const { iterationsInit } = await import("../src/scaffold.js");
    const result = iterationsInit({ cwd: dir });
    const content = readFileSync(join(result, "behavior-scenarios.md"), "utf-8");
    expect(content).toContain("# Behavior Scenarios");
    expect(content).toContain("SCENARIO-NNNN");
  });

  it("writes correct skeleton content in progress.md", async () => {
    const { iterationsInit } = await import("../src/scaffold.js");
    const result = iterationsInit({ cwd: dir });
    const content = readFileSync(join(result, "progress.md"), "utf-8");
    expect(content).toContain("**Phase:** not started");
    expect(content).toContain("**Iterations:** 0/0 done");
  });

  it("refuses to overwrite when directory has existing content", async () => {
    const { iterationsInit } = await import("../src/scaffold.js");
    iterationsInit({ cwd: dir });
    expect(() => iterationsInit({ cwd: dir })).toThrow(/already has content/);
  });

  it("succeeds when docs/moe/iterations/ exists but is empty", async () => {
    const { iterationsInit } = await import("../src/scaffold.js");
    mkdirSync(join(dir, "docs", "moe", "iterations"), { recursive: true });
    const result = iterationsInit({ cwd: dir });
    expect(existsSync(join(result, "behavior-scenarios.md"))).toBe(true);
  });
});

describe("contextInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-context-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates CONTEXT.md with a placeholder heading when no name is given", async () => {
    const { contextInit } = await import("../src/scaffold.js");
    const result = contextInit(undefined, { cwd: dir });
    expect(result).toBe(join(dir, "CONTEXT.md"));
    expect(existsSync(result)).toBe(true);
    const content = readFileSync(result, "utf-8");
    expect(content).toContain("# {Context Name}");
    expect(content).toContain("## Language");
  });

  it("creates CONTEXT.md with the provided name in the heading", async () => {
    const { contextInit } = await import("../src/scaffold.js");
    const result = contextInit("Ordering", { cwd: dir });
    const content = readFileSync(result, "utf-8");
    expect(content).toContain("# Ordering");
    expect(content).not.toContain("{Context Name}");
  });

  it("refuses to overwrite an existing CONTEXT.md", async () => {
    const { contextInit } = await import("../src/scaffold.js");
    contextInit(undefined, { cwd: dir });
    expect(() => contextInit(undefined, { cwd: dir })).toThrow(/already exists/);
  });

  it("writes skeleton matching the domain-modeling CONTEXT-FORMAT structure", async () => {
    const { contextInit } = await import("../src/scaffold.js");
    contextInit("Billing", { cwd: dir });
    const content = readFileSync(join(dir, "CONTEXT.md"), "utf-8");
    expect(content).toContain("## Language");
    expect(content).toContain("_Avoid_:");
    expect(content).toContain("**Term**:");
  });

  it("treats empty string name the same as omitted", async () => {
    const { contextInit } = await import("../src/scaffold.js");
    contextInit("", { cwd: dir });
    const content = readFileSync(join(dir, "CONTEXT.md"), "utf-8");
    expect(content).toContain("# {Context Name}");
  });
});

describe("adrCreate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-adr-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the first ADR as 0001 when docs/adr/ is empty", async () => {
    const { adrCreate } = await import("../src/scaffold.js");
    const result = adrCreate("Use SQLite for local state", { cwd: dir });
    expect(result).toMatch(/docs\/adr\/0001-use-sqlite-for-local-state\.md$/);
    expect(existsSync(result)).toBe(true);
  });

  it("auto-detects the next number from existing ADR files", async () => {
    const { adrCreate } = await import("../src/scaffold.js");
    // Pre-create files to simulate existing ADRs
    const adrDir = join(dir, "docs", "adr");
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, "0001-first.md"), "# 0001. First\n");
    writeFileSync(join(adrDir, "0003-third.md"), "# 0003. Third\n");
    const result = adrCreate("fourth decision", { cwd: dir });
    expect(result).toMatch(/0004-fourth-decision\.md$/);
  });

  it("writes the ADR skeleton with correct number, title, and date", async () => {
    const { adrCreate } = await import("../src/scaffold.js");
    const result = adrCreate("Adopt TypeScript", { cwd: dir });
    const content = readFileSync(result, "utf-8");
    expect(content).toContain("# 0001. Adopt TypeScript");
    expect(content).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
    expect(content).toContain("## Status");
    expect(content).toContain("Proposed");
    expect(content).toContain("## Context");
    expect(content).toContain("## Decision");
    expect(content).toContain("## Consequences");
  });

  it("rejects an empty title", async () => {
    const { adrCreate } = await import("../src/scaffold.js");
    expect(() => adrCreate("   ", { cwd: dir })).toThrow(/title is required/);
  });

  it("slugifies titles with special characters and whitespace", async () => {
    const { adrCreate } = await import("../src/scaffold.js");
    const result = adrCreate("Use C++ & Rust!  For Speed", { cwd: dir });
    expect(result).toMatch(/0001-use-c-rust-for-speed\.md$/);
  });
});
