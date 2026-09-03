import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function iterationsInit(opts?: { cwd?: string }): string {
  const root = opts?.cwd ?? process.cwd();
  const iterDir = join(root, "docs", "moe", "iterations");

  if (existsSync(iterDir)) {
    const entries = readdirSync(iterDir);
    const hasContent = entries.some((e) => e.endsWith(".md")) || entries.includes("requirements");
    if (hasContent) {
      throw new Error(
        "docs/moe/iterations/ already has content — refusing to overwrite. Remove it first or resume with the existing state.",
      );
    }
  }

  mkdirSync(join(iterDir, "requirements"), { recursive: true });

  writeFileSync(
    join(iterDir, "behavior-scenarios.md"),
    `# Behavior Scenarios

Reusable scenario cards with stable IDs. Each scenario describes an externally
observable behavior the product must exhibit.

<!-- Add scenarios as SCENARIO-NNNN cards during requirements extraction. -->
`,
    "utf-8",
  );

  writeFileSync(
    join(iterDir, "behavior-corpus.md"),
    `# Behavior Evidence Corpus

Execution index mapping scenarios to their evidence.

| Scenario ID | Seam | Cadence | Command | Status |
|---|---|---|---|---|
`,
    "utf-8",
  );

  writeFileSync(
    join(iterDir, "roadmap.md"),
    `# Iteration Roadmap

Ordered iteration plan produced by \`scoping-the-simplest-core\`.

## Iterations

<!-- ITER-0000 (walking skeleton) and follow-on iterations go here. -->
`,
    "utf-8",
  );

  writeFileSync(
    join(iterDir, "progress.md"),
    `# Progress

**Phase:** not started
**Task:** 0/0
**Iterations:** 0/0 done, 0 pending
**Sentinel corpus:** 0/0 passing
**Last event:** —
`,
    "utf-8",
  );

  return resolve(iterDir);
}

export function contextInit(name?: string, opts?: { cwd?: string }): string {
  const root = opts?.cwd ?? process.cwd();
  const filepath = join(root, "CONTEXT.md");

  if (existsSync(filepath)) {
    throw new Error(`${resolve(filepath)} already exists — refusing to overwrite`);
  }

  const heading = name && name.trim().length > 0 ? name : "{Context Name}";

  writeFileSync(
    filepath,
    `# ${heading}

{One or two sentence description of what this context is and why it exists.}

## Language

**Term**:
{Definition — one or two sentences. What it IS, not what it does.}
_Avoid_: {synonym1, synonym2}
`,
    "utf-8",
  );

  return resolve(filepath);
}
