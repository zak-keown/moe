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

describe("routeReason + backlogDefer", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("routes reasons to states", async () => {
    const { routeReason } = await import("../src/backlog.js");
    expect(routeReason("no-runtime")).toBe("blocked");
    expect(routeReason("budget")).toBe("carry-over");
    expect(routeReason("i-was-low-on-context")).toBe("needs-triage");
  });

  it("a block reason sets blocked", async () => {
    const { backlogAdd, backlogDefer, parseItem } = await import("../src/backlog.js");
    const p = backlogAdd("needs a runtime", { cwd: repo });
    const r = backlogDefer(parseItem(readFileSync(p, "utf-8")).id, { reason: "no-runtime", note: "no python", cwd: repo });
    expect(r.status).toBe("blocked");
    expect(readFileSync(r.path, "utf-8")).toContain("status: blocked");
  });

  it("a carry reason WITH a next step sets carry-over and writes Resume", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("half done", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "budget", next: "wire the last binding", branch: "feat@abc", cwd: repo });
    expect(r.status).toBe("carry-over");
    const text = readFileSync(r.path, "utf-8");
    expect(text).toContain("## Resume");
    expect(text).toContain("- next: wire the last binding");
  });

  it("a carry reason WITHOUT a next step is triaged, not carried", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("no thread", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "budget", cwd: repo });
    expect(r.status).toBe("needs-triage");
    expect(r.triaged).toBe(true);
  });

  it("an unrecognized reason is triaged and preserves the raw reason", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("odd", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "just because", cwd: repo });
    expect(r.status).toBe("needs-triage");
    expect(readFileSync(r.path, "utf-8")).toContain("reason: just because");
  });
});

describe("transitions", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("claim moves open → in-progress and records claimedBy", async () => {
    const { backlogAdd, backlogClaim, parseItem } = await import("../src/backlog.js");
    backlogAdd("x", { cwd: repo });
    const p = backlogClaim("BL-0001", { cwd: repo, by: "agent-7" });
    const item = parseItem(readFileSync(p, "utf-8"));
    expect(item.status).toBe("in-progress");
    expect(item.claimedBy).toBe("agent-7");
  });

  it("resume: blocked → open, carry-over → in-progress", async () => {
    const { backlogAdd, backlogDefer, backlogResume, parseItem } = await import("../src/backlog.js");
    backlogAdd("b", { cwd: repo });
    backlogDefer("BL-0001", { reason: "no-runtime", cwd: repo });
    expect(parseItem(readFileSync(backlogResume("BL-0001", { cwd: repo }).path, "utf-8")).status).toBe("open");

    backlogAdd("c", { cwd: repo });
    backlogDefer("BL-0002", { reason: "budget", next: "step", cwd: repo });
    expect(parseItem(readFileSync(backlogResume("BL-0002", { cwd: repo }).path, "utf-8")).status).toBe("in-progress");
  });

  it("resume refuses a non-resumable state", async () => {
    const { backlogAdd, backlogResume } = await import("../src/backlog.js");
    backlogAdd("open item", { cwd: repo });
    expect(() => backlogResume("BL-0001", { cwd: repo })).toThrow(/cannot resume/);
  });

  it("done is terminal; decline requires a decline reason", async () => {
    const { backlogAdd, backlogDone, backlogDecline, parseItem } = await import("../src/backlog.js");
    backlogAdd("d", { cwd: repo });
    const donePath = backlogDone("BL-0001", { cwd: repo, commit: "abc1234" });
    expect(parseItem(readFileSync(donePath, "utf-8")).status).toBe("done");
    backlogAdd("e", { cwd: repo });
    expect(() => backlogDecline("BL-0002", { reason: "nope", cwd: repo })).toThrow(/decline reason/);
    const p = backlogDecline("BL-0002", { reason: "wont-fix", cwd: repo });
    expect(parseItem(readFileSync(p, "utf-8")).status).toBe("declined");
  });

  it("done honors an explicit --commit over the current HEAD sha", async () => {
    const { backlogAdd, backlogDone, parseItem } = await import("../src/backlog.js");
    backlogAdd("f", { cwd: repo });
    const p = backlogDone("BL-0001", { cwd: repo, commit: "abc1234" });
    expect(parseItem(readFileSync(p, "utf-8")).movedSha).toBe("abc1234");
  });

  it("done without --commit stamps the current HEAD sha", async () => {
    const { backlogAdd, backlogDone, parseItem } = await import("../src/backlog.js");
    backlogAdd("g", { cwd: repo });
    const p = backlogDone("BL-0001", { cwd: repo });
    const sha = parseItem(readFileSync(p, "utf-8")).movedSha;
    expect(sha).toBeTruthy();
    expect(sha).not.toBe("abc1234");
  });
});

describe("read surface", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("list AND-filters and hides terminal items by default", async () => {
    const { backlogAdd, backlogDone, backlogList } = await import("../src/backlog.js");
    backlogAdd("keep me", { cwd: repo, severity: "high", tags: ["tab"] });
    backlogAdd("done one", { cwd: repo });
    backlogDone("BL-0002", { cwd: repo });
    const open = backlogList({ cwd: repo });
    expect(open.map((i) => i.id)).toEqual(["BL-0001"]); // done hidden
    expect(backlogList({ cwd: repo, tag: "tab", severity: "high" }).map((i) => i.id)).toEqual(["BL-0001"]);
    expect(backlogList({ cwd: repo, tag: "nope" })).toEqual([]);
    expect(backlogList({ cwd: repo, status: "done" }).map((i) => i.id)).toEqual(["BL-0002"]);
  });

  it("triage lists only needs-triage items", async () => {
    const { backlogAdd, backlogDefer, backlogTriage } = await import("../src/backlog.js");
    backlogAdd("triage me", { cwd: repo });
    backlogDefer("BL-0001", { reason: "mystery", cwd: repo });
    backlogAdd("fine", { cwd: repo });
    expect(backlogTriage({ cwd: repo }).map((i) => i.id)).toEqual(["BL-0001"]);
  });

  it("show returns the full item text", async () => {
    const { backlogAdd, backlogShow } = await import("../src/backlog.js");
    backlogAdd("show me", { cwd: repo });
    expect(backlogShow("BL-0001", { cwd: repo })).toContain("id: BL-0001");
  });

  it("AND-combines status filter with tag filter", async () => {
    const { backlogAdd, backlogDone, backlogList } = await import("../src/backlog.js");
    backlogAdd("done foo", { cwd: repo, tags: ["foo"] });
    backlogDone("BL-0001", { cwd: repo });
    backlogAdd("done bar", { cwd: repo, tags: ["bar"] });
    backlogDone("BL-0002", { cwd: repo });
    expect(backlogList({ cwd: repo, status: "done", tag: "foo" }).map((i) => i.id)).toEqual(["BL-0001"]);
    expect(backlogList({ cwd: repo, status: "done", tag: "bar" }).map((i) => i.id)).toEqual(["BL-0002"]);
  });

  it("AND-combines status filter with severity filter", async () => {
    const { backlogAdd, backlogDone, backlogList } = await import("../src/backlog.js");
    backlogAdd("done high", { cwd: repo, severity: "high" });
    backlogDone("BL-0001", { cwd: repo });
    backlogAdd("done low", { cwd: repo, severity: "low" });
    backlogDone("BL-0002", { cwd: repo });
    expect(backlogList({ cwd: repo, status: "done", severity: "high" }).map((i) => i.id)).toEqual(["BL-0001"]);
    expect(backlogList({ cwd: repo, status: "done", severity: "low" }).map((i) => i.id)).toEqual(["BL-0002"]);
  });

  it("formatLine includes id, status, and title", async () => {
    const { backlogAdd, formatLine, parseItem } = await import("../src/backlog.js");
    const p = backlogAdd("test item", { cwd: repo, severity: "high" });
    const item = parseItem(readFileSync(p, "utf-8"));
    const line = formatLine(item);
    expect(line).toContain(item.id);
    expect(line).toContain(item.status);
    expect(line).toContain(item.title);
  });
});
