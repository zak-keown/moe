import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const HOOK = join(PKG, "hooks/tc-governance-check");
const MARKER = "# AI Governance & Security Policy";

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

function runHook(home: string, disabled = false): string {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  if (disabled) env.MOE_TC_GOVERNANCE_DISABLED = "1";
  else delete env.MOE_TC_GOVERNANCE_DISABLED;
  return execFileSync("bash", [HOOK], { encoding: "utf8", env });
}

function withHome(run: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "tc-governance-home-"));
  try {
    run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("tc-governance-check behavior", () => {
  it("nudges without blocking when the mandatory policy marker is absent", () => {
    withHome((home) => {
      const output = JSON.parse(runHook(home)) as HookOutput;
      expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "AI Governance policy is NOT loaded",
      );
      expect(output.hookSpecificOutput.additionalContext).toContain(MARKER);
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "gitlab.tcdevops.com/ai/aigovernance",
      );
      expect(output.hookSpecificOutput.additionalContext).toContain("ai/kb");
    });
  });

  it.each([
    ["Claude", ".claude/CLAUDE.md"],
    ["Codex", ".codex/AGENTS.md"],
  ])("recognizes the marker in the %s user-instruction file", (_harness, relativePath) => {
    withHome((home) => {
      const file = join(home, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${MARKER}\n\nPolicy body.\n`);

      const output = JSON.parse(runHook(home)) as HookOutput;
      expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(output.hookSpecificOutput.additionalContext).not.toContain("NOT loaded");
      expect(output.hookSpecificOutput.additionalContext).toContain("ai/kb");
    });
  });

  it("is silent only after the explicit disable escape hatch", () => {
    withHome((home) => {
      expect(runHook(home, true)).toBe("");
    });
  });

  it("fails open when neither home-directory variable is available", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: "", USERPROFILE: "" };
    delete env.MOE_TC_GOVERNANCE_DISABLED;
    expect(execFileSync("bash", [HOOK], { encoding: "utf8", env })).toBe("");
  });
});
