#!/usr/bin/env node
/**
 * Generate src/qa/agent/prompts/generated.ts from the seven prompt .md files.
 *
 * Upstream imported them with `import x from "./persona.md" with { type: "text" }`,
 * a Bun loader feature. `tsc` will not emit it, Node will not resolve it, and
 * vite wants a different specifier (`?raw`) — so no single source form satisfies
 * build and test. The loader's own docstring says the design exists to keep the
 * prompts available with *no runtime fs access*, which reverting to
 * `readFileSync` would throw away.
 *
 * Codegen keeps that property: the text ends up as string literals in the
 * emitted JavaScript, exactly as the text-imports did. The generated file is
 * committed so `tsc -b` needs no pre-step, `pnpm gen:prompts` refreshes it, and
 * test/qa/agent/prompts-drift.test.ts fails if it goes stale.
 *
 * Usage: node scripts/gen-prompts.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = join(here, "..", "src", "qa", "agent", "prompts");
const OUT = join(PROMPT_DIR, "generated.ts");

/** Order is the loader's declaration order; it is also the FILES key order. */
export const PROMPT_NAMES = [
  "persona",
  "evaluation",
  "context",
  "adapter-web",
  "adapter-cli",
  "adapter-tui",
  "shell-access",
];

const ident = (name) => name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());

function render() {
  const parts = [
    "// GENERATED FILE — do not edit.",
    "// Source: src/qa/agent/prompts/*.md. Regenerate with `pnpm gen:prompts`.",
    "// Guarded by test/qa/agent/prompts-drift.test.ts.",
    "//",
    "// Replaces upstream's `import … from \"./persona.md\" with { type: \"text\" }`,",
    "// which only Bun's loader understands. See scripts/gen-prompts.mjs.",
    "",
  ];
  const keys = [];
  for (const name of PROMPT_NAMES) {
    const text = readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8");
    const v = `${ident(name)}Text`;
    keys.push([name, v]);
    parts.push(`const ${v} = ${JSON.stringify(text)};`);
  }
  parts.push("");
  parts.push("export const PROMPT_TEXTS: Record<string, string> = {");
  for (const [name, v] of keys) parts.push(`  ${JSON.stringify(name)}: ${v},`);
  parts.push("};");
  parts.push("");
  return parts.join("\n");
}

const rendered = render();
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== rendered) {
    console.error(`${OUT} is stale. Run: pnpm gen:prompts`);
    process.exit(1);
  }
  console.log("prompts up to date");
} else {
  writeFileSync(OUT, rendered);
  console.log(`wrote ${OUT} (${PROMPT_NAMES.length} prompts)`);
}
