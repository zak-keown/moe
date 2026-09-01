import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const HOOK = join(PKG, "hooks/tc-governance-enforce");
const FIXTURE = join(HERE, "fixtures/tc-governance");

function runHook(input: string, enabled: boolean): string {
  const env = { ...process.env };
  if (enabled) env.MOE_TC_GOVERNANCE_ENFORCE = "1";
  else delete env.MOE_TC_GOVERNANCE_ENFORCE;

  return execFileSync(process.execPath, [HOOK], {
    cwd: FIXTURE,
    encoding: "utf8",
    env,
    input,
  });
}

function event(toolName: string, toolInput: Record<string, string>): string {
  return JSON.stringify({ cwd: FIXTURE, tool_name: toolName, tool_input: toolInput });
}

describe("tc-governance-enforce registration", () => {
  const manifest = JSON.parse(readFileSync(join(PKG, "hooks/hooks.json"), "utf8")) as {
    hooks: Record<
      string,
      Array<{
        matcher?: string;
        hooks: Array<{
          type?: string;
          command: string;
          shell?: string;
          async?: boolean;
        }>;
      }>
    >;
  };

  it("registers one opt-in PreToolUse command for the four file-access surfaces", () => {
    const registrations = manifest.hooks.PreToolUse;
    expect(registrations).toHaveLength(1);
    expect(registrations?.[0]?.matcher).toBe("Read|Grep|Glob|Bash");
    expect(registrations?.[0]?.hooks).toEqual([
      {
        type: "command",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin variable
        command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/tc-governance-enforce"',
        shell: "bash",
        async: false,
      },
    ]);
  });

  it("leaves both nonblocking SessionStart checks registered together", () => {
    const sessionStart = manifest.hooks.SessionStart;
    expect(sessionStart).toHaveLength(1);
    expect(sessionStart?.[0]?.matcher).toBe("startup|clear|compact");
    expect(sessionStart?.[0]?.hooks.map(({ command }) => command)).toEqual([
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin variable
      '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" plan-set-notice',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin variable
      '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" tc-governance-check',
    ]);
  });
});

describe("tc-governance-enforce behavior", () => {
  const restrictedRead = event("Read", { file_path: "restricted/secret.txt" });

  it("fails open by default, even for a level-1 fixture", () => {
    expect(runHook(restrictedRead, false)).toBe("");
  });

  it("denies a level-1 read only after explicit opt-in", () => {
    const output = JSON.parse(runHook(restrictedRead, true)) as {
      hookSpecificOutput: {
        hookEventName: string;
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };

    expect(output.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    });
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      "privacy level 1 (Restricted)",
    );
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain("restricted/secret.txt");
  });

  it.each([
    ["Read", { file_path: "public.txt" }],
    ["Bash", { command: "git status" }],
  ])("allows an in-policy non-restricted %s call", (toolName, toolInput) => {
    expect(runHook(event(toolName, toolInput), true)).toBe("");
  });

  it.each([
    ["Grep", { path: "." }],
    ["Glob", { path: "." }],
    ["Bash", { command: "cat restricted/secret.txt" }],
  ])("denies an opted-in %s call that reaches the level-1 fixture", (toolName, toolInput) => {
    const output = JSON.parse(runHook(event(toolName, toolInput), true)) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("fails open on malformed hook input while opted in", () => {
    expect(runHook("{not-json", true)).toBe("");
  });
});
