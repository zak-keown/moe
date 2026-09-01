import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SKILL = readFileSync(join(PKG, "skills/retrieving-context/SKILL.md"), "utf8");
const CODEGRAPH_AGENT = readFileSync(join(PKG, "agents/search-codegraph.md"), "utf8");
const MODEX_AGENT = readFileSync(join(PKG, "agents/search-moedex.md"), "utf8");

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("retrieving-context contract", () => {
  it("routes working-tree files to direct reads before any corpus", () => {
    const firstRule = section(SKILL, "## The rule that fires first");
    expect(firstRule).toContain("A file in the working tree is read, never retrieved");
    expect(firstRule).toMatch(/`Read` and `Grep`, every\s+time/);
  });

  it("keeps CodeGraph baseline, Moedex optional, and local memory complete", () => {
    expect(SKILL).toContain("CodeGraph baseline");
    expect(SKILL).toContain("moedex absent, or up but not answering");
    expect(SKILL).toMatch(/Answer the code-structure rows\s+from the CodeGraph baseline/);

    const absent = section(SKILL, "## When a backend is missing or slow");
    expect(absent).toContain("**CodeGraph absent.**");
    expect(absent).toContain("`search_conversations`, `search_journal`, `process_thoughts`");
    expect(absent).toMatch(/do not[^\n]+`memory_store`/);
  });

  it("requires reproducible CodeGraph citations for shared Moedex discoveries", () => {
    const reproducibility = section(SKILL, "## Reproducibility, and what may be cited");
    expect(reproducibility).toContain("cites the CodeGraph baseline");
    expect(reproducibility).toContain("Use moedex to find the answer faster");
  });

  it("uses bounded delegated searches with explicit tool surfaces", () => {
    expect(CODEGRAPH_AGENT).toMatch(/model: haiku/);
    expect(CODEGRAPH_AGENT).toMatch(/tools: [^\n]*mcp__codegraph__rag_search/);
    expect(CODEGRAPH_AGENT).toMatch(/tools: [^\n]*mcp__codegraph__memory_read/);
    expect(CODEGRAPH_AGENT).toContain("200-1000 words total");

    expect(MODEX_AGENT).toMatch(/model: haiku/);
    expect(MODEX_AGENT).toMatch(/tools: [^\n]*mcp__moedex__search_context/);
    expect(MODEX_AGENT).toContain("Always pass `token_budget`");
    expect(MODEX_AGENT).toContain("Optional backend");
  });

  it("does not turn an absolute retrieval score into a false rejection rule", () => {
    expect(SKILL).toContain("score as a warning signal, not a universal cutoff");
    expect(CODEGRAPH_AGENT).toContain("score is a warning signal rather than a");
    expect(CODEGRAPH_AGENT).toContain("universal cutoff");
    expect(SKILL).not.toContain("a top hit around 0.03 is a miss");
    expect(CODEGRAPH_AGENT).not.toContain("A top result scoring around 0.03 is a miss");
  });
});
