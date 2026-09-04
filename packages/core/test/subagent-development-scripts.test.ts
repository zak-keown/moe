import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPTS = join(CORE, "skills/subagent-driven-development/scripts");
const SDD_WORKSPACE = join(SCRIPTS, "sdd-workspace.mjs");
const TASK_BRIEF = join(SCRIPTS, "task-brief.mjs");
const REVIEW_PACKAGE = join(SCRIPTS, "review-package.mjs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), "sdd-test-"));
  roots.push(dir);
  execFileSync("git", ["init", dir], { encoding: "utf8" });
  execFileSync("git", ["-C", dir, "config", "user.email", "test@test.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "Test"]);
  writeFileSync(join(dir, "init.txt"), "initial\n");
  execFileSync("git", ["-C", dir, "add", "init.txt"]);
  execFileSync("git", ["-C", dir, "commit", "-m", "initial"]);
  return dir;
}

const PLAN_CONTENT = `# Test Plan

### Task 1: First task

**Files:**
- Create: src/a.ts

- [ ] Step 1: Do something

\`\`\`markdown
### Task 2: This is inside a fence and should be ignored
\`\`\`

---

### Task 2: Second task

**Files:**
- Create: src/b.ts

- [ ] Step 1: Do other thing
`;

describe("sdd-workspace", () => {
  it("exits 2 with usage when no arguments given", () => {
    const r = spawnSync(process.execPath, [SDD_WORKSPACE], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it("exits 2 when plan file does not exist", () => {
    const r = spawnSync(process.execPath, [SDD_WORKSPACE, "/nonexistent-plan.md"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no such plan file");
  });

  it("creates a per-plan workspace and prints its path", () => {
    const dir = tmpRepo();
    const plan = join(dir, "docs", "my-plan.md");
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(plan, PLAN_CONTENT);

    const r = spawnSync(process.execPath, [SDD_WORKSPACE, plan], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    const workspace = r.stdout.trim();
    expect(workspace).toContain(".moe/sdd/my-plan");
    expect(readFileSync(join(dir, ".moe", "sdd", ".gitignore"), "utf8")).toBe("*\n");
  });
});

describe("task-brief", () => {
  it("exits 2 with usage when arguments are wrong", () => {
    const r = spawnSync(process.execPath, [TASK_BRIEF], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it("exits 2 when plan file does not exist", () => {
    const r = spawnSync(process.execPath, [TASK_BRIEF, "/nonexistent.md", "1"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no such plan file");
  });

  it("extracts the correct task and ignores headings inside fenced blocks", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);
    const out = join(dir, "brief.md");

    const r = spawnSync(process.execPath, [TASK_BRIEF, plan, "1", out], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("wrote");

    const brief = readFileSync(out, "utf8");
    expect(brief).toContain("### Task 1: First task");
    expect(brief).toContain("Do something");
    expect(brief).not.toContain("### Task 2: Second task");
  });

  it("extracts task 2 correctly (fence-guarded heading is not task 2)", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);
    const out = join(dir, "brief2.md");

    const r = spawnSync(process.execPath, [TASK_BRIEF, plan, "2", out], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);

    const brief = readFileSync(out, "utf8");
    expect(brief).toContain("### Task 2: Second task");
    expect(brief).toContain("Do other thing");
    expect(brief).not.toContain("inside a fence");
  });

  it("exits 3 when task number is not found", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);
    const out = join(dir, "brief99.md");

    const r = spawnSync(process.execPath, [TASK_BRIEF, plan, "99", out], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("not found");
  });

  it("uses the default output path from sdd-workspace when omitted", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);

    const r = spawnSync(process.execPath, [TASK_BRIEF, plan, "1"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("task-1-brief.md");
  });
});

describe("review-package", () => {
  it("exits 2 with usage when arguments are wrong", () => {
    const r = spawnSync(process.execPath, [REVIEW_PACKAGE], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it("exits 2 when plan file does not exist", () => {
    const r = spawnSync(process.execPath, [REVIEW_PACKAGE, "/no.md", "abc", "def"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no such plan file");
  });

  it("exits 2 on invalid git refs", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);

    const r = spawnSync(process.execPath, [REVIEW_PACKAGE, plan, "bad-ref-abc", "HEAD"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("bad BASE");
  });

  it("writes a multi-commit review package with commits, stat, and diff", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);
    execFileSync("git", ["-C", dir, "add", "plan.md"]);
    execFileSync("git", ["-C", dir, "commit", "-m", "add plan"]);

    const base = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();

    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["-C", dir, "add", "a.ts"]);
    execFileSync("git", ["-C", dir, "commit", "-m", "add a"]);

    writeFileSync(join(dir, "b.ts"), "export const b = 2;\n");
    execFileSync("git", ["-C", dir, "add", "b.ts"]);
    execFileSync("git", ["-C", dir, "commit", "-m", "add b"]);

    const out = join(dir, "review.diff");
    const r = spawnSync(process.execPath, [REVIEW_PACKAGE, plan, base, "HEAD", out], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("2 commit(s)");

    const pkg = readFileSync(out, "utf8");
    expect(pkg).toContain("## Commits");
    expect(pkg).toContain("add a");
    expect(pkg).toContain("add b");
    expect(pkg).toContain("## Files changed");
    expect(pkg).toContain("## Diff");
    expect(pkg).toContain("export const a");
    expect(pkg).toContain("export const b");
  });

  it("generates a range-named file when output is not specified", () => {
    const dir = tmpRepo();
    const plan = join(dir, "plan.md");
    writeFileSync(plan, PLAN_CONTENT);
    execFileSync("git", ["-C", dir, "add", "plan.md"]);
    execFileSync("git", ["-C", dir, "commit", "-m", "add plan"]);

    const base = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();

    writeFileSync(join(dir, "c.ts"), "export const c = 3;\n");
    execFileSync("git", ["-C", dir, "add", "c.ts"]);
    execFileSync("git", ["-C", dir, "commit", "-m", "add c"]);

    const r = spawnSync(process.execPath, [REVIEW_PACKAGE, plan, base, "HEAD"], {
      encoding: "utf8",
      cwd: dir,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/review-[a-f0-9]+\.\.[a-f0-9]+\.diff/);
  });
});
