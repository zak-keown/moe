import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HOOKS_DIR = join(import.meta.dirname, "..", "..", "core", "hooks");

function runHook(script: string, input: object): { code: number; stderr: string } {
  try {
    execFileSync("bash", [join(HOOKS_DIR, script)], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      env: { ...process.env, MOE_JIG_RAW_WORKTREE: "" },
    });
    return { code: 0, stderr: "" };
  } catch (e: any) {
    return { code: e.status ?? 1, stderr: e.stderr ?? "" };
  }
}

describe("jig-worktree-guard", () => {
  it("blocks git worktree add", () => {
    const result = runHook("jig-worktree-guard", {
      tool_name: "Bash",
      tool_input: { command: "git worktree add .worktrees/my-branch -b my-branch main" },
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("moe jig worktree create");
  });

  it("passes non-worktree git commands through", () => {
    const result = runHook("jig-worktree-guard", {
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });
    expect(result.code).toBe(0);
  });

  it("passes when escape hatch is set", () => {
    try {
      execFileSync("bash", [join(HOOKS_DIR, "jig-worktree-guard")], {
        input: JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: "git worktree add foo -b foo main" },
        }),
        encoding: "utf-8",
        env: { ...process.env, MOE_JIG_RAW_WORKTREE: "1" },
      });
    } catch (e: any) {
      expect.fail(`hook should pass with escape hatch, got exit ${e.status}`);
    }
  });

  it("passes non-Bash tools through", () => {
    const result = runHook("jig-worktree-guard", {
      tool_name: "Read",
      tool_input: { file_path: "/some/file" },
    });
    expect(result.code).toBe(0);
  });
});

describe("jig-review-format-guard", () => {
  it("blocks a malformed fix(review) commit message", () => {
    const result = runHook("jig-review-format-guard", {
      tool_name: "Bash",
      tool_input: { command: 'git commit -m "fix(review): bad format"' },
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("CR-");
  });

  it("passes a correctly formatted fix(review) commit", () => {
    const result = runHook("jig-review-format-guard", {
      tool_name: "Bash",
      tool_input: { command: 'git commit -m "fix(review): CR-001 — handle nil pointer"' },
    });
    expect(result.code).toBe(0);
  });

  it("passes non-commit commands through", () => {
    const result = runHook("jig-review-format-guard", {
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
    });
    expect(result.code).toBe(0);
  });

  it("passes commits without fix(review) through", () => {
    const result = runHook("jig-review-format-guard", {
      tool_name: "Bash",
      tool_input: { command: 'git commit -m "feat: add new feature"' },
    });
    expect(result.code).toBe(0);
  });
});
