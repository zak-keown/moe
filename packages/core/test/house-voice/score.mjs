#!/usr/bin/env node
// Scores a package README against the house voice, mechanically.
//
// Usage: node score.mjs <file.md> [...]   (add --json for machine output)
//
// The rubric is split into two groups on purpose, because only one of them can
// tell you anything about the pointer under test:
//
//   STRUNK-REACHABLE  Rules the 1918 text already supplies. Both arms of the
//                     experiment should pass these. They are NOT evidence — an
//                     agent holding elements-of-style.md gets them for free, so
//                     counting them toward the discrimination would credit the
//                     pointer with something Strunk did.
//
//   HOUSE-SPECIFIC    The moves Strunk cannot supply, because they are facts
//                     about this repo in 2026: a bare verb-phrase verdict, a
//                     counted Status line, an explicit plugin-or-not
//                     declaration, a refutation named out loud, and a closed
//                     tavern vocabulary. These are the discriminators.
//
// Every detector is a PROXY, and the verdict-opening one is the loosest of them.
// There is no regex for "verb phrase", so it is scored as the absence of the
// noun-phrase and copular openings that generic technical writing reaches for,
// plus a length ceiling. fixtures/house-shaped.md and fixtures/generic.md exist
// to prove each detector fires in both directions; they verify the INSTRUMENT,
// not the voice.

/** The first line of body prose: after the `#` title, before anything else. */
function openingLine(text) {
  const lines = text.split("\n");
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 === -1) return "";
  for (let i = h1 + 1; i < lines.length; i++) {
    if (lines[i].trim() !== "") return lines[i].trim();
  }
  return "";
}

// Openers that announce a noun phrase rather than a verdict. Closed list.
const NOUN_PHRASE_OPENERS = /^(This|That|These|Those|A|An|The|It|There|Moe|`?@bubstack|`?moe-)\b/;

// Copular and permission-granting constructions: the sentence describes the
// package's category instead of saying what it does to what.
const COPULAR =
  /\b(is|are)\s+(a|an|the)\b|\b(provides|allows|enables|offers|serves as|acts as|is designed to|is intended to|is responsible for)\b/i;

// ARCHITECTURE.md §7 names exactly four measures. `core`, `backstory`, `memory`,
// `mint` and `crew` are plain descriptions, not measures, and no new measure gets
// coined — so a fifth tavern noun used AS a measure is the failure.
const COINED_MEASURE =
  /\bmoe[- ](cellar|barrel|keg|pour|round|shot|dram|pint|stein|tankard|bottle|cork|bar|barkeep|bartender|tavern|pub|saloon|nightcap|chaser|snifter|tab-?run|last-call)\b/i;

const HEDGES =
  /\b(probably|arguably|fairly|quite|somewhat|generally|basically|essentially|simply|actually|really|very)\b/i;

const PASSIVE_OPENING = /^(Is|Are|Was|Were|Being)\b|^\w+\s+(is|are|was|were)\s+\w+ed\b/;

const HOUSE_SPECIFIC = [
  {
    id: "verdict-opening",
    what: "opens on a bare verb-phrase verdict, not a category description",
    test(text) {
      const line = openingLine(text);
      if (line === "") return false;
      if (NOUN_PHRASE_OPENERS.test(line)) return false;
      if (COPULAR.test(line)) return false;
      // A verdict is short. The description comes in the paragraph after it.
      const firstSentence = line.split(/(?<=[.!?])\s/)[0] ?? line;
      return firstSentence.trim().split(/\s+/).length <= 12;
    },
  },
  {
    id: "counted-status",
    what: "a **Status:** line carrying at least one number",
    test(text) {
      return text.split("\n").some((l) => /\*\*Status:?\*\*/.test(l) && /\d/.test(l));
    },
  },
  {
    id: "plugin-declaration",
    what: "declares plugin-or-not explicitly",
    test(text) {
      return /Ships as the\b[^\n]{0,60}\bplugin\b/i.test(text) || /\bNot a plugin\b/.test(text);
    },
  },
  {
    id: "named-refutation",
    what: "names a refutation or a non-completion out loud",
    test(text) {
      return (
        /\bREFUTED\b/.test(text) ||
        /\brefuted\b/.test(text) ||
        /\bis \*\*not\*\*/.test(text) ||
        /\bnot imported\b/.test(text) ||
        /\bskip themselves\b/.test(text) ||
        /\bwe were wrong\b/i.test(text)
      );
    },
  },
  {
    id: "closed-vocabulary",
    what: "coins no new tavern measure",
    test(text) {
      return !COINED_MEASURE.test(text);
    },
  },
];

const STRUNK_REACHABLE = [
  {
    id: "no-hedging",
    what: "no hedging adverb from the closed list",
    test(text) {
      return !HEDGES.test(text);
    },
  },
  {
    id: "no-passive-opening",
    what: "the opening line is not passive",
    test(text) {
      const line = openingLine(text);
      return line !== "" && !PASSIVE_OPENING.test(line);
    },
  },
];

export function score(text) {
  const run = (group) => group.map((d) => ({ id: d.id, what: d.what, pass: d.test(text) }));
  const house = run(HOUSE_SPECIFIC);
  const strunk = run(STRUNK_REACHABLE);
  return {
    house,
    strunk,
    houseScore: house.filter((d) => d.pass).length,
    houseMax: HOUSE_SPECIFIC.length,
    strunkScore: strunk.filter((d) => d.pass).length,
    strunkMax: STRUNK_REACHABLE.length,
  };
}

// Standalone CLI, so a later arm can be scored by hand without vitest.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { readFileSync } = await import("node:fs");
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const files = args.filter((a) => a !== "--json");
  if (files.length === 0) {
    console.error("usage: node score.mjs <file.md> [...] [--json]");
    process.exit(2);
  }
  const results = files.map((f) => ({ file: f, ...score(readFileSync(f, "utf8")) }));
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n${r.file}`);
      console.log(`  house-specific   ${r.houseScore}/${r.houseMax}`);
      for (const d of r.house) console.log(`    ${d.pass ? "PASS" : "FAIL"}  ${d.id}  — ${d.what}`);
      console.log(`  strunk-reachable ${r.strunkScore}/${r.strunkMax}`);
      for (const d of r.strunk)
        console.log(`    ${d.pass ? "PASS" : "FAIL"}  ${d.id}  — ${d.what}`);
    }
  }
}
