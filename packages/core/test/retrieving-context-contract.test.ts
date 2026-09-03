/**
 * Contract for retrieving-context and its delegated `search-moedex` agent.
 *
 * The skill is what makes the model spend a retrieval budget before answering
 * from first principles. That's a behavioral contract, not a piece of
 * mechanical code, so this file pins the sentences and shape decisions that
 * lock the behavior — a silent rewrite of any of them changes what agents do
 * without anything else noticing.
 *
 * The MR !1 (codex/backlog-completion-20260901) version of this file tested a
 * CodeGraph-baseline + Moedex-optional hybrid that TC decoupling removed
 * (2026-09-01). What survives is the general shape: two-backend routing,
 * working-tree-first, score-not-rank, budgets, delegated retrieval,
 * reproducibility, degradation. Assertions here target the moedex-only shape
 * on main.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SKILL = readFileSync(join(PKG, "skills/retrieving-context/SKILL.md"), "utf8");
const MOEDEX_AGENT = readFileSync(join(PKG, "agents/search-moedex.md"), "utf8");

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("retrieving-context contract", () => {
  it("routes working-tree files to direct reads before any corpus", () => {
    // The one rule that fires unconditionally. A retrieval call for a file
    // sitting on disk returns the corpus's snapshot, not the working tree,
    // and a delta as small as an uncommitted edit is enough to make the
    // answer wrong.
    const firstRule = section(SKILL, "## The rule that fires first");
    expect(firstRule).toContain("A file in the working tree is read, never retrieved");
    expect(firstRule).toMatch(/\{read\} and \{search\}, every\s+time/);
  });

  it("names exactly two retrieval backends: moedex and moe-memory", () => {
    // The two-backend table is the routing contract's floor. Adding a third
    // backend (or dropping one) is a design decision that must show up here.
    expect(SKILL).toContain("| **moedex** |");
    expect(SKILL).toContain("| **moe-memory** |");
    // CodeGraph was removed in TC decoupling; it must not reappear silently.
    expect(SKILL).not.toContain("CodeGraph");
    expect(SKILL).not.toContain("search-codegraph");
    expect(SKILL).not.toContain("mcp__codegraph__");
  });

  it("gates on score, not on rank", () => {
    // moedex always returns SOMETHING for any query. The invariant is that
    // the reader interprets a low top-score as "not found", not as
    // "here's the answer, rank 1."
    expect(SKILL).toContain("Gate on score, not on rank");
    expect(SKILL).toMatch(/top hit around 0\.03 is a miss/);
  });

  it("requires explicit token budgets on delegated corpus queries", () => {
    // The default is 8000 tokens per call; the whole point of the delegated
    // agent is spending less. The instruction lives in the search-moedex
    // agent, not in the skill body, because that agent is what actually
    // makes the call.
    expect(MOEDEX_AGENT).toContain("Always pass `token_budget`");
    expect(SKILL).toMatch(/takes `token_budget` and honours it/);
  });

  it("delegates retrieval through a haiku agent with a narrow tool allowlist", () => {
    // Two invariants together: cheap model + narrow tools. Broadening either
    // silently makes retrieval cost more per call and gives the subagent
    // access it does not need.
    expect(MOEDEX_AGENT).toMatch(/^model: haiku$/m);
    expect(MOEDEX_AGENT).toMatch(/^tools:.*mcp__moedex__search_context/m);
    // The agent must not be handed general model tools by default.
    expect(MOEDEX_AGENT).not.toMatch(/^tools:.*\*/m);
    // Word-cap is what keeps the delegated context small.
    expect(MOEDEX_AGENT).toContain("200-1000 words total");
  });

  it("warns that moedex answers are not reproducible for shared artifacts", () => {
    // Two engineers get different corpus contents for the same query
    // (access-scoped to their GitLab visibility). A moedex `abs_path`
    // in an MR description is unciteable for the reader.
    const reproducibility = section(SKILL, "## Reproducibility, and what may be cited");
    expect(reproducibility).toMatch(/scoped to the asking user's GitLab access/);
    expect(reproducibility).toMatch(/re-fetchable path in a public repo/);
    expect(MOEDEX_AGENT).toMatch(/not\s+reproducible/i);
  });

  it("degrades quietly when moedex is absent or slow — no retry loop, no user block", () => {
    // moedex is a local daemon with a large mmap to warm; a slow start is
    // routine, not an incident. The wrong failure mode is telling the user
    // the work is blocked.
    const degradation = section(SKILL, "## When a backend is missing or slow");
    expect(degradation).toMatch(/moedex absent, or up but not answering/);
    expect(degradation).toMatch(/Do not retry\s+in a loop/);
    expect(degradation).toMatch(/do not tell the user the work is blocked/);
  });

  it("routes durable facts to process_thoughts, saying so when moe-memory is absent", () => {
    // The write-back table encodes the record types. A durable fact with no
    // memory installed must still surface to the user, not vanish.
    expect(SKILL).toContain("`process_thoughts`");
    expect(SKILL).toMatch(/moe-memory absent[\s\S]*say it in the answer/);
  });
});
