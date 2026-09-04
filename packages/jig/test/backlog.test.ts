import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("item model", () => {
  it("round-trips serialize → parse", async () => {
    const { serializeItem, parseItem } = await import("../src/backlog.js");
    const item = {
      id: "BL-0007", title: "tab FFI ABI drift", status: "carry-over" as const,
      reason: "budget", severity: "high" as const, source: "code-review:CR-012",
      created: "2026-09-04", updated: "2026-09-04",
      filedBy: "wave3", filedSha: "a1b2c3d",
      blockedBy: ["BL-0003"], blocks: [], tags: ["tab", "ffi"],
      body: "## Context\n\nwhy\n\n## Resume\n\n- next: bindings\n",
    };
    const back = parseItem(serializeItem(item));
    expect(back.id).toBe("BL-0007");
    expect(back.status).toBe("carry-over");
    expect(back.blockedBy).toEqual(["BL-0003"]);
    expect(back.tags).toEqual(["tab", "ffi"]);
    expect(back.body).toContain("## Resume");
  });

  it("throws on text with no frontmatter", async () => {
    const { parseItem } = await import("../src/backlog.js");
    expect(() => parseItem("no frontmatter here")).toThrow(/frontmatter/);
  });

  it("allocates the next zero-padded id, ignoring gaps", async () => {
    const { allocateId } = await import("../src/backlog.js");
    expect(allocateId(["0001-a.md", "0003-c.md"])).toEqual({ num: 4, id: "BL-0004" });
    expect(allocateId([])).toEqual({ num: 1, id: "BL-0001" });
  });
});

function gitIn(dir: string, ...a: string[]): string {
  return execFileSync("git", a, { cwd: dir, encoding: "utf-8" }).trim();
}
function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jig-bl-")));
  gitIn(dir, "init", "--initial-branch", "main");
  gitIn(dir, "config", "user.email", "t@t.com");
  gitIn(dir, "config", "user.name", "T");
  execFileSync("touch", ["seed.txt"], { cwd: dir });
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-m", "init");
  return dir;
}

describe("backlogAdd", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("creates an open item under .moe/backlog/ with correct id and fields", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    const { parseItem } = await import("../src/backlog.js");
    const p = backlogAdd("Tab FFI ABI drift", { cwd: repo, source: "code-review:CR-012", severity: "high", tags: ["tab"] });
    expect(p).toBe(join(repo, ".moe", "backlog", "0001-tab-ffi-abi-drift.md"));
    const item = parseItem(readFileSync(p, "utf-8"));
    expect(item).toMatchObject({ id: "BL-0001", status: "open", severity: "high", source: "code-review:CR-012" });
    expect(item.tags).toEqual(["tab"]);
  });

  it("refuses a second open item with the same slug", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    backlogAdd("dup title", { cwd: repo });
    expect(() => backlogAdd("dup title", { cwd: repo })).toThrow(/already exists/);
  });

  it("survives worktree teardown: an item filed in a linked worktree merges home", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    const wt = join(repo, ".moe", "worktrees", "feat");
    gitIn(repo, "worktree", "add", "-b", "feat", wt, "main");
    backlogAdd("filed in worktree", { cwd: wt });
    gitIn(wt, "add", ".moe/backlog");
    gitIn(wt, "commit", "-m", "backlog: item");
    gitIn(repo, "merge", "--no-ff", "feat", "-m", "merge feat");
    // The item is present at the primary checkout after merge:
    expect(existsSync(join(repo, ".moe", "backlog", "0001-filed-in-worktree.md"))).toBe(true);
    gitIn(repo, "worktree", "remove", "--force", wt);
    expect(existsSync(join(repo, ".moe", "backlog", "0001-filed-in-worktree.md"))).toBe(true);
  });

  it("the real repo does not gitignore .moe/backlog/", () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    let code = 0;
    try { execFileSync("git", ["check-ignore", ".moe/backlog/probe.md"], { cwd: repoRoot }); }
    catch (e: unknown) { code = (e as { status?: number }).status ?? 0; }
    expect(code).toBe(1); // 1 = not ignored
  });
});
