import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("progressUpdate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-progress-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a progress file with all fields populated", async () => {
    const { progressUpdate } = await import("../src/progress.js");
    const result = progressUpdate({
      phase: "implementing ITER-0003",
      task: "4/7 (CleanupPipeline integration)",
      iterations: "3/18",
      sentinel: "10/10",
      event: "Task 3 committed",
      cwd: dir,
    });
    expect(existsSync(result)).toBe(true);
    const content = readFileSync(result, "utf-8");
    expect(content).toContain("# Progress");
    expect(content).toContain("**Phase:** implementing ITER-0003");
    expect(content).toContain("**Task:** 4/7 (CleanupPipeline integration)");
    expect(content).toContain("**Iterations:** 3/18 done, 15 pending");
    expect(content).toContain("**Sentinel corpus:** 10/10 passing");
    expect(content).toContain("Task 3 committed");
  });

  it("overwrites (not appends) on repeated calls", async () => {
    const { progressUpdate } = await import("../src/progress.js");
    progressUpdate({ phase: "first", task: "1/1", cwd: dir });
    progressUpdate({ phase: "second", task: "2/2", cwd: dir });
    const content = readFileSync(join(dir, "docs", "moe", "iterations", "progress.md"), "utf-8");
    expect(content).toContain("**Phase:** second");
    expect(content).not.toContain("**Phase:** first");
    const headings = content.match(/# Progress/g);
    expect(headings).toHaveLength(1);
  });

  it("omits optional lines when flags are absent", async () => {
    const { progressUpdate } = await import("../src/progress.js");
    progressUpdate({ phase: "scoping ITER-0001", task: "1/3 (skeleton)", cwd: dir });
    const content = readFileSync(join(dir, "docs", "moe", "iterations", "progress.md"), "utf-8");
    expect(content).not.toContain("**Iterations:**");
    expect(content).not.toContain("**Sentinel corpus:**");
    expect(content).not.toContain("**Last event:**");
  });

  it("rejects malformed --iterations format", async () => {
    const { progressUpdate } = await import("../src/progress.js");
    expect(() =>
      progressUpdate({ phase: "x", task: "y", iterations: "three of five", cwd: dir }),
    ).toThrow(/--iterations must be in done\/total format/);
  });

  it("creates the iterations directory if it does not exist", async () => {
    const { progressUpdate } = await import("../src/progress.js");
    const result = progressUpdate({ phase: "boot", task: "0/1", cwd: dir });
    expect(existsSync(result)).toBe(true);
  });
});
