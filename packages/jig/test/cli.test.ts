import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("lists backlog in --help", () => {
    expect(run("--help")).toContain("backlog");
  });

  it("adds and defers an item end-to-end", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "jig-cli-bl-")));
    execFileSync("git", ["init", "--initial-branch", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "T"], { cwd: repo });
    execFileSync("touch", ["seed.txt"], { cwd: repo });
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repo });
    try {
      execFileSync(process.execPath, [CLI, "backlog", "add", "cli item"], { cwd: repo, encoding: "utf-8" });
      expect(existsSync(join(repo, ".moe", "backlog", "0001-cli-item.md"))).toBe(true);
      const out = execFileSync(process.execPath, [CLI, "backlog", "defer", "BL-0001", "--reason", "no-runtime", "--note", "no py"], { cwd: repo, encoding: "utf-8" });
      expect(out).toContain("blocked");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
