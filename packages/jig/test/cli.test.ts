import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function run(...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
  }).trim();
}

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jig-cli-bl-")));
  execFileSync("git", ["init", "--initial-branch", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: dir });
  execFileSync("touch", ["seed.txt"], { cwd: dir });
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function runIn(cwd: string, ...args: string[]): { stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
    const repo = makeRepo();
    try {
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "cli item"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(
        readdirSync(join(repo, ".moe", "backlog")).some((f) =>
          /^BL-[0-9a-f]{10}-cli-item\.md$/.test(f),
        ),
      ).toBe(true);
      const idMatch = /\bBL-[0-9a-f]{10}\b/.exec(addOut);
      expect(idMatch).not.toBeNull();
      const id = (idMatch as RegExpExecArray)[0];
      const out = execFileSync(
        process.execPath,
        [CLI, "backlog", "defer", id, "--reason", "no-runtime", "--note", "no py"],
        { cwd: repo, encoding: "utf-8" },
      );
      expect(out).toContain("blocked");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("defer warns with a carry-over-specific message when a carry reason is missing --next", () => {
    const repo = makeRepo();
    try {
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "no next item"], {
        cwd: repo,
        encoding: "utf-8",
      });
      const id = /\bBL-[0-9a-f]{10}\b/.exec(addOut)?.[0] ?? "";
      const { stderr } = runIn(repo, "backlog", "defer", id, "--reason", "budget");
      expect(stderr).toContain('carry-over reason "budget"');
      expect(stderr).toContain("requires a --next step");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("defer warns with the unrecognized-reason message for a reason that is not recognized at all", () => {
    const repo = makeRepo();
    try {
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "mystery item"], {
        cwd: repo,
        encoding: "utf-8",
      });
      const id = /\bBL-[0-9a-f]{10}\b/.exec(addOut)?.[0] ?? "";
      const { stderr } = runIn(repo, "backlog", "defer", id, "--reason", "just because");
      expect(stderr).toContain('reason "just because" is not a recognized deferral reason');
      expect(stderr).not.toContain("carry-over reason");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts a triaged item to open end-to-end", () => {
    const repo = makeRepo();
    try {
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "triage cli"], {
        cwd: repo,
        encoding: "utf-8",
      });
      const id = /\bBL-[0-9a-f]{10}\b/.exec(addOut)?.[0] ?? "";
      runIn(repo, "backlog", "defer", id, "--reason", "just because"); // → needs-triage
      const out = execFileSync(process.execPath, [CLI, "backlog", "accept", id], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(out).toContain(".moe/backlog");
      const show = execFileSync(process.execPath, [CLI, "backlog", "show", id], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(show).toContain("status: open");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
