#!/usr/bin/env node
// Asserts that every `## Forked from` table names an UPSTREAM repo, never a Moe
// package.
//
// ARCHITECTURE.md §8 states the rule: provenance is preserved, self-reference is
// rewritten. It has already been broken once. The flight import's rebrand sweep
// rewrote `gauntlet` in prose that names the upstream repo, and a human caught
// it, not a check — the correction is recorded at
// packages/flight/README.md:336-338. That sweep touched 257 occurrences and
// survived because someone was watching. The next one may not be, and a
// misattributed fork is a licence problem, not a style problem.
//
// The check is deliberately narrow. It reads column 1 of exactly ONE table per
// README — the first `|`-table under `## Forked from` — and requires every entry
// to be a row of PARITY.md's own upstream ledger. Narrowness is the point:
// packages/flight/README.md:293-313 is a rebrand MAPPING table whose third
// column is a Moe token by design, and a checker that wandered into it would
// fail on correct content and get switched off.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// PARITY.md's ledger, as two tables: `## Map` is what was imported, `###
// Excluded` is what was consciously left out. Both are legitimate provenance —
// a README may name a repo the fork declined to import.
const LEDGER_HEADINGS = [/^##\s+Map\s*$/, /^###\s+Excluded\s*$/];

// Where a package lives. Depth 1 only, which is what keeps
// packages/core/docs/history/*/UPSTREAM-README.md (inherited evidence, byte
// frozen) and packages/tab/bindings/*/README.md out of the sweep.
const PACKAGE_ROOTS = ["packages", "infra", "py"];

const BACKTICKED = /^`([^`]+)`$/;
const HEADING = /^#{2,3}\s/;
const FORKED_FROM = /^##\s+Forked from\s*$/;
const MOE_TOKEN = /^(@bubstack\/)?moe(-|$)/;

/** Cells of a `|`-delimited markdown row, without the empty outer edges. */
function cells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

/** The set of upstream repo names PARITY.md accounts for. */
function readLedger(root) {
  const lines = readFileSync(join(root, "PARITY.md"), "utf8").split("\n");
  const repos = new Set();
  let inTable = false;
  for (const line of lines) {
    if (HEADING.test(line)) {
      inTable = LEDGER_HEADINGS.some((h) => h.test(line));
      continue;
    }
    if (!inTable || !line.startsWith("|")) continue;
    const first = cells(line)[0] ?? "";
    const m = BACKTICKED.exec(first);
    if (m) repos.add(m[1]);
  }
  return repos;
}

/** Depth-1 READMEs that carry a `## Forked from` section. */
function findReadmes(root) {
  const found = [];
  for (const area of PACKAGE_ROOTS) {
    let entries;
    try {
      entries = readdirSync(join(root, area), { withFileTypes: true });
    } catch {
      continue; // an area a given tree does not have
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rel = join(area, entry.name, "README.md");
      const abs = join(root, rel);
      try {
        if (!statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      const text = readFileSync(abs, "utf8");
      if (text.split("\n").some((l) => FORKED_FROM.test(l))) {
        found.push({ rel, lines: text.split("\n") });
      }
    }
  }
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * The rows of the ONE table under `## Forked from`, as {lineNo, cells}.
 *
 * Stops at the next heading, and at the first non-table line AFTER the table has
 * started. That second clause is load-bearing twice over: packages/core/README.md
 * has two prose lines between the heading and its table, so the walk cannot stop
 * on the first non-`|` line; and packages/flight/README.md has a second,
 * unrelated table 280 lines further down, so it must stop on the first blank
 * line after the rows end.
 */
function forkedFromRows(lines) {
  const start = lines.findIndex((l) => FORKED_FROM.test(l));
  if (start === -1) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (HEADING.test(line)) break;
    if (line.startsWith("|")) {
      rows.push({ lineNo: i + 1, cells: cells(line) });
      continue;
    }
    if (rows.length > 0) break;
  }
  return rows.slice(2); // header row + `|---|` separator
}

function main(argv) {
  let root = ".";
  let minReadmes = 10; // the live count; a glob that matches nothing must fail loudly
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--min-readmes") {
      minReadmes = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(minReadmes) || minReadmes < 0) {
        console.error("--min-readmes needs a non-negative integer");
        return 2;
      }
      continue;
    }
    positional.push(argv[i]);
  }
  if (positional.length > 1) {
    console.error("usage: check-provenance.mjs [root] [--min-readmes N]");
    return 2;
  }
  if (positional.length === 1) root = positional[0];

  const upstreams = readLedger(root);
  const readmes = findReadmes(root);
  const offenders = [];
  let rowCount = 0;

  for (const { rel, lines } of readmes) {
    for (const { lineNo, cells: row } of forkedFromRows(lines)) {
      rowCount++;
      const raw = row[0] ?? "";
      const m = BACKTICKED.exec(raw);
      if (!m) {
        offenders.push(
          `${rel}:${lineNo} upstream column is not a backticked repo name: ${JSON.stringify(raw)}`,
        );
        continue;
      }
      const name = m[1];
      if (MOE_TOKEN.test(name)) {
        offenders.push(`${rel}:${lineNo} names a Moe package, not an upstream repo: ${name}`);
        continue;
      }
      if (!upstreams.has(name)) {
        offenders.push(`${rel}:${lineNo} names a repo PARITY.md does not account for: ${name}`);
      }
    }
  }

  console.log(
    `provenance: ${readmes.length} READMEs, ${rowCount} rows, ${upstreams.size} upstream repos in PARITY.md`,
  );

  if (readmes.length < minReadmes) {
    console.error(
      `provenance: found ${readmes.length} READMEs with a '## Forked from' section, expected at least ${minReadmes}.`,
    );
    console.error(
      "Either a README lost its provenance section, or discovery is broken. Both are failures.",
    );
    return 1;
  }

  if (offenders.length > 0) {
    console.error(`\nprovenance: ${offenders.length} offending row(s).`);
    for (const o of offenders) console.error(`  ${o}`);
    console.error(
      "\nA `## Forked from` table records who wrote the code first. A Moe name there means a rebrand sweep overwrote an attribution — restore the upstream repo name. See ARCHITECTURE.md §8.",
    );
    return 1;
  }

  console.log("provenance: 0 offenders.");
  return 0;
}

process.exit(main(process.argv.slice(2)));
