import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
