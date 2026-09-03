import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const CANONICAL_SKILLS = join(PACKAGE_ROOT, "skills");
const GENERATED_PLUGIN = resolve(PACKAGE_ROOT, "../../plugins/moe");
const GENERATED_SKILL_ROOTS = [
  "skills",
  ".claude-plugin/skills",
  ".cursor-plugin/skills",
  ".codex-plugin/skills",
  ".kimi-plugin/skills",
  ".opencode/skills",
  ".pi/skills",
] as const;

// This is the complete, hand-audited inventory of resolved resource paths
// used directly as executable shell positions. Assignment-only and prose-only
// placeholders are deliberately absent.
const EXECUTABLE_RESOLVED_RESOURCES = {
  "brainstorming/visual-companion.md#resolved-start-server.sh": 6,
  "brainstorming/visual-companion.md#resolved-stop-server.sh": 1,
  "docs-update/SKILL.md#resolved-docs-verify-report.mjs": 1,
  "extracting-requirements/SKILL.md#resolved-validate-requirements-index.py": 1,
  "extracting-requirements/SKILL.md#resolved-validate-scenarios.py": 1,
  "fixing-a-code-review/SKILL.md#resolved-stamp-disposition.mjs": 1,
  "reviewing-a-codebase/SKILL.md#resolved-review-check.mjs": 1,
  "reviewing-a-codebase/SKILL.md#resolved-review-merge.mjs": 2,
  "reviewing-a-codebase/SKILL.md#resolved-review-scope.mjs": 1,
  "reviewing-a-codebase/SKILL.md#resolved-review-verify-record.mjs": 2,
  "reviewing-a-codebase/SKILL.md#resolved-review-verify-scope.mjs": 1,
  "sequencing-plans/SKILL.md#resolved-plan-set.mjs": 4,
  "subagent-driven-development/SKILL.md#resolved-review-package": 1,
  "subagent-driven-development/SKILL.md#resolved-sdd-workspace": 1,
  "subagent-driven-development/SKILL.md#resolved-task-brief": 1,
  "subagent-driven-development/SKILL.md#resolved-task-set.mjs": 2,
  "systematic-debugging/root-cause-tracing.md#resolved-find-polluter.sh": 1,
  "writing-plans/SKILL.md#resolved-task-set.mjs": 1,
  "writing-skills/SKILL.md#resolved-render-graphs.mjs": 2,
} as const;

function markdownFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(root, path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function executableInventory(root: string): Record<string, number> {
  const inventory: Record<string, number> = {};
  for (const file of markdownFiles(root)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/(?<!=)"<(resolved-[^>]+)>"/g)) {
      const key = `${relative(root, file)}#${match[1]}`;
      inventory[key] = (inventory[key] ?? 0) + 1;
    }
  }
  return inventory;
}

function unquotedExecutableLines(root: string): string[] {
  const findings: string[] = [];
  for (const file of markdownFiles(root)) {
    const content = readFileSync(file, "utf8");
    for (const [index, line] of content.split("\n").entries()) {
      if (
        /\b(?:node|python3|bash)\s+<resolved-[^>]+>/.test(line) ||
        /^\s*<resolved-[^>]+>/.test(line) ||
        /[;&|($]\s*<resolved-[^>]+>/.test(line)
      ) {
        findings.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  return findings;
}

describe("resolved executable resource quoting", () => {
  it("matches the complete canonical executable inventory and has no unquoted shell position", () => {
    expect(executableInventory(CANONICAL_SKILLS)).toEqual(EXECUTABLE_RESOLVED_RESOURCES);
    expect(unquotedExecutableLines(CANONICAL_SKILLS)).toEqual([]);
  });

  it.each(GENERATED_SKILL_ROOTS)("keeps the complete %s profile inventory quoted", (root) => {
    const generatedRoot = join(GENERATED_PLUGIN, root);
    expect(executableInventory(generatedRoot)).toEqual(EXECUTABLE_RESOLVED_RESOURCES);
    expect(unquotedExecutableLines(generatedRoot)).toEqual([]);
  });

  it("preserves the tmux helper as a quoted assignment before indirect execution", () => {
    const content = readFileSync(
      join(CANONICAL_SKILLS, "using-tmux-for-interactive-commands/SKILL.md"),
      "utf8",
    );
    expect(content).toContain('WRAPPER="<resolved-tmux-wrapper.sh>"');
    expect(content).toContain('"$WRAPPER" start');
  });
});
