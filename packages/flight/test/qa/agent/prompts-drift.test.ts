import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  BUNDLED_PROMPT_NAMES,
  loadPromptFile,
} from "../../../src/qa/agent/prompts/loader.js";

/**
 * Upstream bundled the seven prompt bodies with Bun's
 * `import … with { type: "text" }`, which guaranteed by construction that the
 * shipped text was the .md text. `src/qa/agent/prompts/generated.ts` replaces
 * that with codegen (scripts/gen-prompts.mjs), and codegen can go stale — so
 * the guarantee becomes this test.
 *
 * If it fails: run `pnpm --filter @bubstack/moe-flight gen:prompts`.
 */
const PROMPT_DIR = join(import.meta.dirname, "..", "..", "..", "src", "qa", "agent", "prompts");

describe("prompt codegen", () => {
  test("every bundled prompt matches its .md source", () => {
    expect(BUNDLED_PROMPT_NAMES.length).toBe(7);
    for (const name of BUNDLED_PROMPT_NAMES) {
      const onDisk = readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8");
      expect(loadPromptFile(name)).toBe(onDisk.replace(/\s+$/, ""));
    }
  });

  test("the bundled set is exactly the .md set", () => {
    expect([...BUNDLED_PROMPT_NAMES].sort()).toEqual(
      [
        "adapter-cli",
        "adapter-tui",
        "adapter-web",
        "context",
        "evaluation",
        "persona",
        "shell-access",
      ].sort(),
    );
  });
});
