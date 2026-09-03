import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("planInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-plan-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a plan file with correct path and date", async () => {
    const { planInit } = await import("../src/plan.js");
    const path = planInit("my-feature", { cwd: dir });
    expect(path).toMatch(/docs\/moe\/plans\/\d{4}-\d{2}-\d{2}-my-feature\.md$/);
    expect(existsSync(path)).toBe(true);
  });

  it("writes a plan skeleton with the feature name in the header", async () => {
    const { planInit } = await import("../src/plan.js");
    const path = planInit("test-feature", { cwd: dir });
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# test-feature Implementation Plan");
    expect(content).toContain("**Goal:**");
    expect(content).toContain("**Architecture:**");
    expect(content).toContain("### Task 1:");
  });

  it("refuses to overwrite an existing file", async () => {
    const { planInit } = await import("../src/plan.js");
    planInit("no-clobber", { cwd: dir });
    expect(() => planInit("no-clobber", { cwd: dir })).toThrow(/already exists/);
  });
});

describe("specInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jig-spec-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a spec file with correct path and -design suffix", async () => {
    const { specInit } = await import("../src/plan.js");
    const path = specInit("my-topic", { cwd: dir });
    expect(path).toMatch(/docs\/moe\/specs\/\d{4}-\d{2}-\d{2}-my-topic-design\.md$/);
    expect(existsSync(path)).toBe(true);
  });

  it("writes a spec skeleton with the topic name", async () => {
    const { specInit } = await import("../src/plan.js");
    const path = specInit("auth-flow", { cwd: dir });
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# auth-flow");
    expect(content).toContain("**Status:**");
  });
});
