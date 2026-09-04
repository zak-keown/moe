import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function gitIn(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
}

describe("worktreeRoot", () => {
  let repo: string;
  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "jig-util-")));
    gitIn(repo, "init", "--initial-branch", "main");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("returns the repo top-level from a nested subdirectory", async () => {
    const { worktreeRoot } = await import("../src/util.js");
    execFileSync("mkdir", ["-p", join(repo, "a", "b")]);
    expect(worktreeRoot(join(repo, "a", "b"))).toBe(repo);
  });
});

describe("slugify", () => {
  it("lowercases, strips specials, collapses dashes", async () => {
    const { slugify } = await import("../src/util.js");
    expect(slugify("Use C++ & Rust!  For Speed")).toBe("use-c-rust-for-speed");
  });
});
