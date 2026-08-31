import { PROMPT_TEXTS } from "./generated.js";

/**
 * The seven prompt bodies, keyed by name.
 *
 * Upstream these were seven `import … from "./persona.md" with { type: "text" }`
 * statements — a Bun loader feature with no `tsc`, Node or vite equivalent.
 * `generated.ts` is codegen'd from the same .md files by
 * `scripts/gen-prompts.mjs`, which preserves the property the text-imports
 * were chosen for: the prompt bodies are string literals in the emitted
 * JavaScript, so there is no runtime fs access. `pnpm gen:prompts` refreshes
 * it and test/qa/agent/prompts-drift.test.ts fails if it is stale.
 */
const FILES: Record<string, string> = PROMPT_TEXTS;

/**
 * Return the text of a prompt file by name (no `.md` extension).
 * Trims trailing whitespace so .md files can end with a trailing newline
 * without breaking the \n\n joiner. A zero-byte file is valid and returns "".
 * An unknown name throws.
 */
export function loadPromptFile(name: string): string {
  const text = FILES[name];
  if (text === undefined) {
    throw new Error(`Required prompt file not found: ${name}.md`);
  }
  return text.replace(/\s+$/, "");
}

/**
 * Names of all bundled prompt files. Exposed for tests and tooling that
 * want to enumerate the prompt surface.
 */
export const BUNDLED_PROMPT_NAMES: readonly string[] = Object.keys(FILES);
