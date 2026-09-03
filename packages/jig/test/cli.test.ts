import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function run(...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
  }).trim();
}

describe("moe-jig CLI", () => {
  it("prints help with --help", () => {
    const out = run("--help");
    expect(out).toContain("moe-jig");
    expect(out).toContain("worktree");
    expect(out).toContain("plan");
    expect(out).toContain("spec");
    expect(out).toContain("review");
    expect(out).toContain("commit");
    expect(out).toContain("iterations");
    expect(out).toContain("context");
    expect(out).toContain("adr");
    expect(out).toContain("progress");
  });

  it("prints version with --version", () => {
    const out = run("--version");
    expect(out).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
