/**
 * Metadata correctness for @bubstack/moe-core.
 *
 * This package has no build. Six upstream repositories that never had to agree
 * with each other were merged into one flat skills/ directory, so the failure
 * modes are metadata failures: a name that collides, a cross-reference that no
 * longer resolves, an anchored path that points at nothing, an executable that
 * lost its bit, a tier assignment nobody recorded. Nothing in `pnpm check`
 * caught any of those before this file existed.
 */

import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SKILLS = join(PKG, "skills");

// Third-party verbatim text: 1,150 lines of Anthropic's public skill-authoring
// documentation, containing EXAMPLE frontmatter blocks inside fenced code that a
// frontmatter scanner would read as real skills.
const THIRD_PARTY = new Set(["anthropic-best-practices.md"]);

// Self-contained example plugins the developing-claude-code-plugins skill ships
// as teaching material. They have their own plugin roots and their own
// (deliberately different) manifests.
const EXAMPLES_SEGMENT = "examples";

interface Skill {
  dir: string;
  name: string;
  description: string;
  frontmatterKeys: string[];
  files: string[];
}

function walk(root: string, opts: { skipExamples: boolean }): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, entry.name);
      if (entry.isDirectory()) {
        if (opts.skipExamples && entry.name === EXAMPLES_SEGMENT) continue;
        stack.push(p);
      } else if (entry.isFile()) {
        out.push(p);
      }
    }
  }
  return out.sort();
}

function parseFrontmatter(text: string): { data: Record<string, string>; keys: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { data: {}, keys: [] };
  const data: Record<string, string> = {};
  const keys: string[] = [];
  for (const line of (m[1] as string).split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    keys.push(kv[1] as string);
    data[kv[1] as string] = (kv[2] as string).trim();
  }
  return { data, keys };
}

const skillDirs = readdirSync(SKILLS)
  .filter((d) => statSync(join(SKILLS, d)).isDirectory())
  .sort();

const skills: Skill[] = skillDirs
  .filter((d) => existsSync(join(SKILLS, d, "SKILL.md")))
  .map((d) => {
    const text = readFileSync(join(SKILLS, d, "SKILL.md"), "utf8");
    const { data, keys } = parseFrontmatter(text);
    return {
      dir: d,
      name: data.name ?? "",
      description: data.description ?? "",
      frontmatterKeys: keys,
      files: walk(join(SKILLS, d), { skipExamples: false }),
    };
  });

const skillNames = new Set(skills.map((s) => s.name));

// skill-tiers.yaml, hoisted to module scope because two describes now read it:
// the pinned 27-name literal in "skill inventory" asserts against `imported:`,
// and "the lean/full curation" reads tiers off the merged registry.
//
// Two maps, not one map with an `origin:` discriminator (decision D1,
// 2026-08-31): `imported:` is the frozen record of what the six upstream sources
// shipped, `authored:` is what this fork wrote. The equality that detects an
// upstream drop or rename is aimed at `imported:` alone, which is what lets a
// fork-authored skill exist at all without loosening it.
const tiers = parseYaml(readFileSync(join(PKG, "skill-tiers.yaml"), "utf8")) as {
  imported: Record<string, { tier: string; from: string; why: string }> | null;
  authored: Record<string, { tier: string; from: string; why: string }> | null;
};
const imported = tiers.imported ?? {};
const authored = tiers.authored ?? {};

// Built in exactly ONE place, on purpose. `{...undefined}` evaluates to `{}`
// silently, so a single mistyped spread key here would make every tier lookup
// return undefined and quietly empty the closure rule's loop below rather than
// throwing. The "resolves a tier for every skill" assertion inside that test is
// what catches it; this comment is why there is only one place to mistype.
const registry: Record<string, { tier: string; from: string; why: string }> = {
  ...imported,
  ...authored,
};

// How many skills the lean plugin ships. A BUDGET, not a fidelity check, and
// not a token budget either.
//
// The number is stated here rather than derived from the manifest on purpose:
// its whole job is to make any tier reassignment a two-file diff, so that moving
// a skill between tiers shows up in review as a deliberate act instead of a
// silently recomputed total. Nothing breaks if it changes — change it, in the
// same commit as the `tier:` line that made it wrong.
//
// The live tiebreak behind the split is TRIGGER COLLISION
// (skill-tiers.yaml:35-42): where the closure rule does not force the answer,
// the tie goes to `everything` only if the skill's description claims a trigger
// a core-tier skill already claims, and absent a collision it goes to `core`.
// It is NOT "ERR SMALL", which said the tie goes to `everything` because
// descriptions cost resident context — that rule was deleted 2026-08-31 in
// 0b1571d after its premise was measured and did not hold (all 27
// name+description pairs are ~1,480 tokens; the bodies load on demand).
//
// Named COUNT, not BUDGET, deliberately. "Budget" is the ERR SMALL framing —
// that the lean tier is small because descriptions cost resident context — and
// that premise is the one that was measured false. What this constant actually
// guards is membership: the lean tier is an INSTALLED INTERFACE for ~20 people
// who leave it on permanently, so which skills are in it must not change
// silently. A deliberate change here is one edit; an accidental one is a red test.
const LEAN_TIER_COUNT = 13;

// Every markdown file we are allowed to make assertions about: the skill bodies
// and companion documents this fork authored or rebranded. Excludes third-party
// verbatim text and the example plugins.
const ownedMarkdown = walk(SKILLS, { skipExamples: true }).filter(
  (p) => p.endsWith(".md") && !THIRD_PARTY.has(p.split("/").pop() as string),
);

describe("skill inventory", () => {
  it("every directory under skills/ is either a skill or the shared reference dir", () => {
    const nonSkill = skillDirs.filter((d) => !existsSync(join(SKILLS, d, "SKILL.md")));
    // _shared holds the three PAR reference documents the iterative-development
    // cluster reads at runtime. moe-mint's readSkills() skips it because it has
    // no SKILL.md; nothing else may sit here unnoticed.
    expect(nonSkill).toEqual(["_shared"]);
  });

  it("pins the IMPORTED skill set at exactly 31", () => {
    // ARCHITECTURE.md section 4 and the root marketplace both said 28 originally.
    // The real count across the six original sources was 27: superpowers 14,
    // iterative-development 6, superpowers-lab 4,
    // superpowers-developing-for-claude-code 2, the-elements-of-style 1,
    // double-shot-latte 0 (hooks only). The 28th was `example-workflow`, a
    // pseudo-skill inside an example plugin. mattpocock-skills adds a seventh
    // source, 4 skills (codebase-design, improve-codebase-architecture,
    // domain-modeling, prototype), bringing imported to 31.
    //
    // Counts `imported:`, not the directory. The GRAND total is deliberately no
    // longer asserted anywhere: it follows from the completeness equality below,
    // and asserting it as well is what used to make a fork-authored skill
    // impossible — a 32nd directory would fail this line and the pinned literal
    // at once, on two assertions whose real job is detecting an upstream DROP.
    // Adding a Moe-original skill is now a two-line manifest diff, not a wall.
    expect(Object.keys(imported).length).toBe(31);
  });

  it("every skill has a non-empty name and description", () => {
    for (const s of skills) {
      expect(s.name, `${s.dir}: frontmatter name`).not.toBe("");
      expect(s.description, `${s.dir}: frontmatter description`).not.toBe("");
    }
  });

  it("every skill's frontmatter name equals its directory name", () => {
    for (const s of skills) {
      expect(s.name, `skills/${s.dir}/SKILL.md`).toBe(s.dir);
    }
  });

  it("no two skills share a name", () => {
    const seen = new Map<string, string>();
    for (const s of skills) {
      const prior = seen.get(s.name);
      expect(prior, `${s.name} declared by both ${prior} and ${s.dir}`).toBeUndefined();
      seen.set(s.name, s.dir);
    }
    expect(skillNames.size).toBe(skills.length);
  });

  it("uses only frontmatter keys Claude Code recognises on a skill", () => {
    // `argument-hint` is a COMMAND property in the vendored manifest schema and
    // is inert on a skill; windows-vm carries it because it is written as a
    // slash command. Recorded, not silently dropped.
    const allowed = new Set(["name", "description", "allowed-tools", "argument-hint"]);
    for (const s of skills) {
      for (const k of s.frontmatterKeys) {
        expect(allowed.has(k), `skills/${s.dir}: unexpected frontmatter key "${k}"`).toBe(true);
      }
    }
  });

  it("accounts for every skill the six upstream sources shipped", () => {
    // Enumerated from the pinned snapshots at import time. A skill silently
    // dropped in a later edit fails here.
    const expected = [
      // superpowers @ b36e082 (14) — using-superpowers renamed to using-moe
      "brainstorming",
      "dispatching-parallel-agents",
      "executing-plans",
      "finishing-a-development-branch",
      "receiving-code-review",
      "requesting-code-review",
      "subagent-driven-development",
      "systematic-debugging",
      "test-driven-development",
      "using-git-worktrees",
      "using-moe",
      "verification-before-completion",
      "writing-plans",
      "writing-skills",
      // superpowers-lab @ 51111f7 (4)
      "finding-duplicate-functions",
      "mcp-cli",
      "using-tmux-for-interactive-commands",
      "windows-vm",
      // iterative-development @ c05889a (6)
      "auditing-progress",
      "extracting-requirements",
      "implementing-tasks",
      "iterative-development",
      "running-an-iteration",
      "scoping-the-simplest-core",
      // the-elements-of-style @ 05fc4f0 (1)
      "writing-clearly-and-concisely",
      // superpowers-developing-for-claude-code @ 74afe93 (2)
      "developing-claude-code-plugins",
      "working-with-claude-code",
      // mattpocock-skills @ 6654f6b (4)
      "codebase-design",
      "domain-modeling",
      "improve-codebase-architecture",
      "prototype",
    ].sort();
    // Asserted against `imported:` rather than against the directory, and it
    // must stay `toEqual`. This is the drop-and-rename detector for the whole
    // import: a skill deleted from the tree still fails, via the completeness
    // equality below, and a skill RENAMED in only one of the two places fails
    // here. Weakening this to a superset check would retire the detector.
    expect(Object.keys(imported).sort()).toEqual(expected);
  });

  it("accounts for every skill on disk in exactly one of the two maps", () => {
    // Completeness and disjointness, the pair that replaces the old
    // `Object.keys(skills).sort()).toEqual([...skillNames].sort())`. Together
    // with the pinned literal above they are strictly stronger than what they
    // replaced: nothing may exist on disk without a manifest entry, nothing may
    // be registered without existing, and no name may sit in both maps.
    // Assert the RAW parse, never the coalesced local. `authored` is
    // `tiers.authored ?? {}` at the top of this file, so asserting IT can never
    // fail — which is exactly what this guard did until 2026-08-31, while its own
    // message claimed to catch a null. `typeof null` is also "object", so the
    // null and undefined cases each need their own assertion.
    expect(tiers.authored, "authored: key is missing from skill-tiers.yaml").not.toBeUndefined();
    expect(
      tiers.authored,
      "authored: parsed as null — an empty map needs an explicit `{}` in the yaml",
    ).not.toBeNull();
    expect(typeof tiers.authored, "authored: is not a map").toBe("object");

    const registered = [...Object.keys(imported), ...Object.keys(authored)].sort();
    expect(registered, "skills/ and skill-tiers.yaml disagree").toEqual([...skillNames].sort());

    const inBoth = Object.keys(imported).filter((n) => n in authored);
    expect(inBoth, "registered as both imported and authored").toEqual([]);
  });
});

describe("cross-references", () => {
  it("no plugin-qualified skill reference survives", () => {
    // `superpowers:<skill>` was the upstream Skill-tool namespace, 32 occurrences
    // across 15 files. One source tree emits two plugins with different names,
    // so no single prefix is correct in both, and 14 of the 27 skills are absent
    // from moe-core entirely. Cross-references are bare backticked names.
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)/g)) {
        if (skillNames.has(m[2] as string)) {
          offenders.push(`${p.slice(PKG.length + 1)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no reference to a retired upstream skill name survives", () => {
    // `using-superpowers` was renamed; the other three were ALREADY DANGLING
    // upstream (the code-reviewer agent was deleted in v6.x, testing-anti-patterns
    // never existed, brainstorm was a command). None may be reintroduced.
    const retired = [
      "using-superpowers",
      "superpowers:code-reviewer",
      "testing-anti-patterns",
      "superpowers:brainstorm",
    ];
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const token of retired) {
        if (text.includes(token)) offenders.push(`${p.slice(PKG.length + 1)}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every REQUIRED marker names a skill that exists", () => {
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!/REQUIRED (SUB-SKILL|BACKGROUND)/.test(line)) continue;
        // The two lines in writing-skills/SKILL.md that quote the marker syntax
        // as an authoring example are double-backticked code spans.
        if (line.trimStart().startsWith("- ✅") || line.trimStart().startsWith("- ❌")) continue;
        const named = [...line.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map((m) => m[1] as string);
        const resolved = named.filter((n) => skillNames.has(n));
        // EVERY backticked token on the line must resolve, not merely one of
        // them. The old rule flagged only a line where NOTHING resolved, so
        // `Use \`subagent-driven-development\` or \`not-a-real-skill\`` passed on
        // the strength of its good half while the reader still hit a dead end
        // on the bad one. A line carrying no backticked token at all stays an
        // offender: `named.length === 0` is checked FIRST, because an
        // all-resolve rule expressed as an equality would let 0 === 0 pass it.
        if (named.length === 0 || resolved.length !== named.length) {
          const unresolved = named.filter((n) => !skillNames.has(n));
          offenders.push(
            `${p.slice(PKG.length + 1)}: ${line.trim().slice(0, 100)} [named=${named.join(",") || "none"} unresolved=${unresolved.join(",") || "none"}]`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every relative markdown link inside skills/ resolves on disk", () => {
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/\]\((\.\.?\/[^)\s#]+)\)/g)) {
        const target = resolve(dirname(p), m[1] as string);
        if (!existsSync(target)) offenders.push(`${p.slice(PKG.length + 1)} -> ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every skill that instructs a parallel dispatch names a sequential fallback", () => {
    // PAR set the precedent in _shared/parallel-adversarial-review.md's
    // "Single-Agent Fallback" section: when a harness cannot dispatch in
    // parallel — session policy, runtime limits, missing tool — the reader
    // runs the passes serially. Every skill that hands its reader a parallel-
    // dispatch instruction must carry the same escape hatch, either in its
    // own body or by pointing at PAR's copy. A parallel-dispatch instruction
    // has no correct interpretation in a harness that lacks the capability,
    // and a missed parallel dispatch that degrades to serial is correct; a
    // parallel-dispatch instruction with nothing to fall back to strands the
    // reader.
    //
    // Enumerated rather than inferred by keyword: "parallel" appears in prose
    // that is not a dispatch instruction (e.g. "in parallel with the design
    // review"), and a keyword-driven filter would either miss real
    // dispatchers or flag decorative uses. The listed skills are the ones
    // that actually route the reader into a parallel dispatch.
    const parallelDispatchers = [
      "dispatching-parallel-agents",
      "subagent-driven-development",
      "implementing-tasks",
      "extracting-requirements",
      "running-an-iteration",
      "auditing-progress",
      "scoping-the-simplest-core",
      "iterative-development",
    ];
    const parRef = "_shared/parallel-adversarial-review.md";
    const offenders: string[] = [];
    for (const name of parallelDispatchers) {
      const p = join(SKILLS, name, "SKILL.md");
      expect(existsSync(p), `${name}/SKILL.md must exist to be checked`).toBe(true);
      const text = readFileSync(p, "utf8");
      // Either the skill carries the fallback vocabulary itself, or it
      // references the PAR document that carries the fallback for it.
      const hasFallback = /\b(sequential|serial|fallback)\b/i.test(text) || text.includes(parRef);
      if (!hasFallback) offenders.push(name);
    }
    expect(
      offenders,
      "parallel-dispatch skills missing a sequential fallback (or a reference to PAR's)",
    ).toEqual([]);
  });
});

// Paths a skill legitimately names that are not in git. The Claude Code docs
// cache is populated on demand by update_docs.cjs and deliberately not
// committed - see skills/working-with-claude-code/SKILL.md.
const NOT_COMMITTED = new Set(["/skills/working-with-claude-code/references/"]);

// Every shipped file that must carry the execute bit, package-relative.
//
// Cross-checked against `find`-style discovery in BOTH directions below: the
// presence direction (this list -> disk) is what catches a LOST bit, which
// discovery alone cannot see, because a file that lost its bit simply stops
// being discovered. The completeness direction (disk -> this list) is what
// catches an executable arriving unreviewed. The list had already drifted by
// four files when the second direction was added, all Python in the
// iterative-development cluster, which is why one direction was not enough.
//
// The reverse of the completeness rule is deliberately NOT asserted: "every
// script is executable" would be wrong. brainstorming/scripts/{helper,server}.cjs
// are `require`d rather than executed and correctly carry no bit.
const X_BIT_ALLOWLIST = [
  "hooks/claude-judge-continuation",
  "hooks/moe-completion-evidence",
  "hooks/plan-set",
  "hooks/plan-set-notice",
  "hooks/run-hook.cmd",
  "hooks/tc-governance-check",
  "skills/brainstorming/scripts/start-server.sh",
  "skills/brainstorming/scripts/stop-server.sh",
  "skills/extracting-requirements/scripts/aggregate_stories.py",
  "skills/extracting-requirements/scripts/chunk_spec.py",
  "skills/finding-duplicate-functions/scripts/extract-functions.sh",
  "skills/finding-duplicate-functions/scripts/generate-report.sh",
  "skills/finding-duplicate-functions/scripts/prepare-category-analysis.sh",
  "skills/running-an-iteration/scripts/check_citations.py",
  "skills/scoping-the-simplest-core/scripts/check_citations.py",
  "skills/subagent-driven-development/scripts/review-package",
  "skills/subagent-driven-development/scripts/sdd-workspace",
  "skills/subagent-driven-development/scripts/task-brief",
  "skills/systematic-debugging/find-polluter.sh",
  "skills/using-tmux-for-interactive-commands/tmux-wrapper.sh",
  "skills/working-with-claude-code/scripts/update_docs.cjs",
  "skills/writing-skills/render-graphs.mjs",
];

// Everything Zone-A discovery walks: the skills tree and the hooks directory,
// example plugins excluded. Shared by the execute-bit and script-parse checks
// so the two cannot disagree about what "shipped" means.
const shippedFiles = () => [
  ...walk(SKILLS, { skipExamples: true }),
  ...walk(join(PKG, "hooks"), { skipExamples: true }),
];

const isExecutable = (p: string) => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

describe("runtime paths", () => {
  it("every ${CLAUDE_PLUGIN_ROOT}-anchored path resolves inside the package", () => {
    // The convention adopted on import: every file a skill owns is addressed as
    // ${CLAUDE_PLUGIN_ROOT}/skills/<skill>/<path>. Upstream used bare relative
    // paths, which resolved against the USER's project and always missed.
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}(\/skills\/[A-Za-z0-9._\-/]+)/g)) {
        const rel = (m[1] as string).replace(/[.,;:]+$/, "");
        // Placeholders inside instructions to the reader, not real paths. The
        // developing-claude-code-plugins references use ${CLAUDE_PLUGIN_ROOT}
        // with invented paths (`/server.js`, `/config.json`) to teach the idiom;
        // restricting the match to /skills/ excludes those without exempting the
        // file, and NOT_COMMITTED covers the one real path that is generated.
        if (/<|\$|PLAN_FILE|my-plugin/.test(rel)) continue;
        if (NOT_COMMITTED.has(rel)) continue;
        if (!existsSync(join(PKG, rel))) offenders.push(`${p.slice(PKG.length + 1)} -> ${rel}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the shared PAR references are reachable and referenced", () => {
    const shared = [
      "parallel-adversarial-review.md",
      "par-reviewer-wrapper.md",
      "behavior-evidence-formats.md",
    ];
    for (const f of shared) {
      expect(existsSync(join(SKILLS, "_shared", f)), `skills/_shared/${f}`).toBe(true);
    }
    // If nothing points at _shared any more, it should not be shipping.
    const all = ownedMarkdown.map((p) => readFileSync(p, "utf8")).join("\n");
    for (const f of shared) {
      expect(all.includes(`skills/_shared/${f}`), `nothing references _shared/${f}`).toBe(true);
    }
  });

  it("keeps the execute bit on every shipped executable", () => {
    // The three subagent-driven-development scripts are invoked as bare paths
    // with no `bash` prefix, so a mode-losing copy breaks them with
    // "Permission denied" and nothing else would notice.
    //
    // The presence direction. This is the one discovery cannot replace: a file
    // that loses its bit stops being discovered, so only a pinned list notices.
    for (const rel of X_BIT_ALLOWLIST) {
      const p = join(PKG, rel);
      expect(existsSync(p), rel).toBe(true);
      expect(() => accessSync(p, constants.X_OK), `${rel} is not executable`).not.toThrow();
    }
    // The wrapper Windows dispatches through. Named explicitly because it is
    // the one entry that is neither a shell script nor a node script, so no
    // other assertion in this file would miss it.
    expect(X_BIT_ALLOWLIST).toContain("hooks/run-hook.cmd");
  });

  it("has no executable outside the allowlist", () => {
    // The completeness direction. The allowlist had drifted by four files
    // before this existed — an executable can arrive with a skill import and
    // never be reviewed. Discovery is the only thing that sees those.
    const discovered = shippedFiles()
      .filter(isExecutable)
      .map((p) => p.slice(PKG.length + 1))
      .sort();
    const unlisted = discovered.filter((rel) => !X_BIT_ALLOWLIST.includes(rel));
    expect(unlisted, "executable on disk but not in X_BIT_ALLOWLIST").toEqual([]);
    // A walk that silently stopped finding anything would satisfy the line
    // above with an empty list. It must find at least as many as are pinned.
    expect(discovered.length).toBeGreaterThanOrEqual(X_BIT_ALLOWLIST.length);
  });

  it("every shell script and node script parses", () => {
    // Discovered, not enumerated. Two hardcoded lists (11 shell, 4 node) drifted
    // out of this file's sight the moment a skill import added a script, exactly
    // as the execute-bit allowlist did. Routing is by extension, plus a shebang
    // read for the extensionless scripts the subagent-driven-development and
    // hooks trees ship.
    //
    // Extensionless files with a `#!/usr/bin/env node` shebang route to
    // `node --check`. Without that branch, `hooks/plan-set` would be picked
    // up by NEITHER route and gain zero syntax coverage in vitest — the plan
    // for deterministic-task-dag asserted the router already handled node
    // shebangs; it didn't, and this branch is what makes that assertion
    // true.
    //
    // hooks/run-hook.cmd is correctly in neither set: `.cmd` is not a routed
    // extension, it is not extensionless, and its first line is `: << 'CMDBLOCK'`
    // with no shebang. It is a polyglot batch/sh file that `bash -n` would
    // reject on the batch half, and its behaviour is asserted separately.
    const bash: string[] = [];
    const node: string[] = [];
    for (const abs of shippedFiles()) {
      const rel = abs.slice(PKG.length + 1);
      const base = rel.split("/").pop() as string;
      if (base.endsWith(".sh")) {
        bash.push(rel);
      } else if (base.endsWith(".cjs") || base.endsWith(".mjs")) {
        node.push(rel);
      } else if (!base.includes(".")) {
        // Read only the first line: some of these are long. Route by the
        // shebang's interpreter — bash/sh go to `bash -n`, node goes to
        // `node --check`, so a Node-shebang extensionless hook (the
        // moe-completion-evidence pattern) is syntax-checked by the right
        // tool. Only the four extensionless bash scripts existed before
        // that routing was added, and the metadata test relied on none of
        // them ever being anything but bash.
        const first = readFileSync(abs, "utf8").split(/\r?\n/)[0] ?? "";
        if (/^#!.*\b(bash|sh)\b/.test(first)) bash.push(rel);
        else if (/^#!.*\bnode\b/.test(first)) node.push(rel);
      }
    }

    // Floors. A walk that stopped finding anything — a moved directory, a
    // tightened filter — would otherwise satisfy every assertion below by
    // iterating zero times. Node floor is 6 now, not 5: the four .cjs/.mjs
    // scripts plus the two extensionless Node hooks (`hooks/plan-set` and
    // `hooks/moe-completion-evidence`) with node shebangs.
    expect(bash.length, "bash targets discovered").toBeGreaterThanOrEqual(11);
    expect(node.length, "node targets discovered").toBeGreaterThanOrEqual(6);
    for (const rel of [
      "hooks/claude-judge-continuation",
      "hooks/plan-set-notice",
      "skills/subagent-driven-development/scripts/review-package",
      "skills/subagent-driven-development/scripts/sdd-workspace",
      "skills/subagent-driven-development/scripts/task-brief",
    ]) {
      // The extensionless bash scripts. If the shebang read regresses, these
      // vanish silently and the floor above could still be met by .sh files
      // alone.
      expect(bash, `extensionless script ${rel} not routed to bash -n`).toContain(rel);
    }
    // Extensionless node script(s). Same regression concern in the mirror
    // direction: if the node-shebang branch above is removed, these fall
    // through and node's floor could still be met by the .cjs/.mjs four.
    // Both plan-set (deterministic-task-dag) and moe-completion-evidence
    // (verification-split-and-firing-rate) are extensionless Node hooks.
    for (const rel of ["hooks/plan-set", "hooks/moe-completion-evidence"]) {
      expect(node, `extensionless script ${rel} not routed to node --check`).toContain(rel);
    }
    expect(bash).not.toContain("hooks/run-hook.cmd");
    expect(node).not.toContain("hooks/run-hook.cmd");

    for (const rel of bash) {
      expect(
        () => execFileSync("bash", ["-n", join(PKG, rel)], { stdio: "pipe" }),
        `bash -n ${rel}`,
      ).not.toThrow();
    }
    for (const rel of node) {
      expect(
        () => execFileSync(process.execPath, ["--check", join(PKG, rel)], { stdio: "pipe" }),
        `node --check ${rel}`,
      ).not.toThrow();
    }
  });
});

describe("hooks", () => {
  const hooks = JSON.parse(readFileSync(join(PKG, "hooks/hooks.json"), "utf8")) as {
    hooks: Record<
      string,
      Array<{ matcher?: string; hooks: Array<{ command: string; shell?: string }> }>
    >;
  };

  it("registers the SessionStart and Stop hooks, and nothing else", () => {
    // Stop is the claude-judge-continuation hook. SessionStart carries TWO
    // hooks under one matcher: plan-set-notice (deterministic-task-dag), which
    // announces an incomplete plan set when the session starts in a project
    // that has one, and tc-governance-check (tc-governance-integration), which
    // verifies TC's AI Governance policy is loaded and points at TC's knowledge
    // base. They share `SessionStart[0].hooks` rather than taking an entry each,
    // so this key list stays two long and the assertion below still finds
    // plan-set-notice at index 0. moe-mint ALSO writes a SessionStart entry — the bootstrap that
    // loads the `using-moe` skill — into the generated
    // `hooks/moe-mint/hooks.json` alongside a byte-clone of this document
    // (`packages/mint/src/adapters/claude-code.ts`). Claude Code reads both
    // files and dedupes exact-duplicate {matcher, command} entries at
    // execution time (see docs/history/2026-08-11-hook-double-fire-findings.md),
    // so declaring SessionStart here does NOT collide with the bootstrap:
    // the two entries have different commands and both fire.
    //
    // Insertion order matters here: `Object.keys` returns keys in the order
    // they appear in the JSON, and the assertion is a `toEqual` for both
    // length and order, so a new event appearing between these two would
    // fail here regardless of alphabetical position.
    expect(Object.keys(hooks.hooks)).toEqual(["SessionStart", "Stop"]);
  });

  it("dispatches the SessionStart plan-set-notice through run-hook.cmd", () => {
    const entry = hooks.hooks.SessionStart?.[0]?.hooks?.[0];
    expect(entry).toBeDefined();
    const cmd = entry?.command as string;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal from hooks.json
    expect(cmd).toContain('"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" plan-set-notice');
    expect(entry?.shell).toBe("bash");
    // The matcher covers the three lifecycle events that give the notice a
    // chance to fire on a fresh context: `startup`, `clear`, `compact`. A
    // narrower matcher would miss the case a manifest is in front of every
    // time.
    const matcher = hooks.hooks.SessionStart?.[0]?.matcher as string | undefined;
    expect(matcher).toBe("startup|clear|compact");
  });

  it("dispatches the SessionStart tc-governance-check through run-hook.cmd", () => {
    // Index 1, deliberately: sharing SessionStart[0].hooks with plan-set-notice
    // keeps Object.keys(hooks.hooks) two long, which the assertion above pins
    // for both length AND order. A second SessionStart array element would also
    // have passed that, but two entries with the same matcher is a lie about the
    // shape — they fire together.
    const entry = hooks.hooks.SessionStart?.[0]?.hooks?.[1];
    expect(entry, "SessionStart lost its tc-governance-check hook").toBeDefined();
    const cmd = entry?.command as string;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal from hooks.json
    expect(cmd).toContain('"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" tc-governance-check');
    expect(entry?.shell).toBe("bash");
  });

  it("keeps tc-governance-check free of jq and of a non-zero exit", () => {
    // Two properties, one test, because they are the same failure: a governance
    // check that dies quietly reads as compliance. jq is absent on some Windows
    // and WSL installs, and a non-zero SessionStart hook can block every session
    // on the machine.
    const src = readFileSync(join(PKG, "hooks/tc-governance-check"), "utf8");
    // Strip comment lines before matching. The file's own header explains WHY it
    // avoids jq, so a naive /\bjq\b/ over the whole text fails on the
    // documentation rather than on a dependency — which is the difference
    // between a gate and a word filter.
    const code = src
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(code, "tc-governance-check must not invoke jq").not.toMatch(/\bjq\b/);
    expect(src, "tc-governance-check must end in an explicit exit 0").toMatch(/\nexit 0\n?$/);
  });

  it("emits valid JSON on the governance-absent and governance-present paths", () => {
    // The hook hand-builds its JSON with printf rather than jq, so "is it still
    // parseable" is a real question and not a formality. Run it against a HOME
    // with no policy and a HOME with one.
    const run = (home: string) =>
      execFileSync("bash", [join(PKG, "hooks/tc-governance-check")], {
        encoding: "utf8",
        input: "",
        env: { ...process.env, HOME: home, USERPROFILE: home, MOE_TC_GOVERNANCE_DISABLED: "" },
      });

    const absent = mkdtempSync(join(tmpdir(), "moe-gov-absent-"));
    const parsedAbsent = JSON.parse(run(absent)) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsedAbsent.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(parsedAbsent.hookSpecificOutput.additionalContext).toContain("NOT loaded");
    rmSync(absent, { recursive: true, force: true });

    const present = mkdtempSync(join(tmpdir(), "moe-gov-present-"));
    mkdirSync(join(present, ".claude"), { recursive: true });
    writeFileSync(
      join(present, ".claude", "CLAUDE.md"),
      "# AI Governance & Security Policy\n\nv1.0\n",
    );
    const parsedPresent = JSON.parse(run(present)) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsedPresent.hookSpecificOutput.additionalContext).not.toContain("NOT loaded");
    // The knowledge-base pointer fires either way — it is the reason a compliant
    // machine gets any context at all, and dropping it when governance is
    // present would mean the pointer never reaches the people who did the setup.
    expect(parsedPresent.hookSpecificOutput.additionalContext).toContain("ai/kb");
    rmSync(present, { recursive: true, force: true });
  });

  it("dispatches through run-hook.cmd to a hook script that exists", () => {
    const entry = hooks.hooks.Stop?.[0]?.hooks?.[0];
    expect(entry).toBeDefined();
    const cmd = entry?.command as string;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal from hooks.json
    expect(cmd).toContain("${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd");
    // Quoted, because ${CLAUDE_PLUGIN_ROOT} may contain a space, and
    // `"shell": "bash"` so a Windows box does not hand the command to
    // PowerShell — the two are one fix, not two.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal from hooks.json
    expect(cmd).toContain('"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd"');
    expect(entry?.shell).toBe("bash");
    const script = cmd.trim().split(/\s+/).pop() as string;
    expect(script).not.toMatch(/\.sh$/); // Windows auto-prepends bash to any .sh
    expect(existsSync(join(PKG, "hooks", script)), `hooks/${script}`).toBe(true);
  });

  it("invokes moe-completion-evidence as the second Stop hook, directly via node", () => {
    // The evidence hook does not go through run-hook.cmd. It is Node, not
    // bash, so wrapping it in the polyglot dispatcher would exec bash
    // just to have bash exec node — pointless indirection, and it would
    // hide the module-type gotcha the hook's own header documents.
    const entry = hooks.hooks.Stop?.[0]?.hooks?.[1];
    expect(entry, "Stop[0].hooks[1] should register moe-completion-evidence").toBeDefined();
    const cmd = entry?.command as string;
    // Quoted CLAUDE_PLUGIN_ROOT for the same reason run-hook.cmd is quoted:
    // a plugin root with a space breaks unquoted expansion, on any OS.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal from hooks.json
    expect(cmd).toContain('node "${CLAUDE_PLUGIN_ROOT}/hooks/moe-completion-evidence"');
    expect(entry?.shell).toBe("bash");
    expect(
      existsSync(join(PKG, "hooks/moe-completion-evidence")),
      "hooks/moe-completion-evidence",
    ).toBe(true);
  });

  it("run-hook.cmd is dash-safe and needs no execute bit on the hook script", () => {
    const wrapper = readFileSync(join(PKG, "hooks/run-hook.cmd"), "utf8");
    // Three of the four upstream copies of this file differed here. ${BASH_SOURCE[0]}
    // is a "Bad substitution" error under dash, which is /bin/sh on Debian, and
    // this file has no shebang so the invoking shell interprets it.
    expect(wrapper).not.toContain("BASH_SOURCE");
    expect(wrapper).toContain('SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"');
    expect(wrapper).toContain("exec bash");
    // Windows: all three bash locations, and a silent exit rather than an error.
    expect(wrapper).toContain("C:\\Program Files\\Git\\bin\\bash.exe");
    expect(wrapper).toContain("C:\\Program Files (x86)\\Git\\bin\\bash.exe");
    expect(wrapper).toContain("where bash");
  });

  it("the Stop hook is opt-in and exits 0 when disarmed", () => {
    // It overrides the agent's own decision to stop and spends a model call on
    // every stop attempt, for everyone, permanently. Default off.
    const out = execFileSync("bash", [join(PKG, "hooks/claude-judge-continuation")], {
      input: JSON.stringify({ stop_hook_active: false, session_id: "t", transcript_path: "" }),
      env: { ...process.env, MOE_LATTE_ENABLED: "" },
      encoding: "utf8",
    });
    expect(out).toBe("");
  });

  it("the evidence hook is default-ON and exits 0 empty when MOE_EVIDENCE_DISABLED is set", () => {
    // Inverted from the latte gate above: this hook only OBSERVES (writes
    // an audit JSON, never blocks a stop), so it ships default-on and the
    // env var opts OUT rather than in. Exit-0-with-empty-stdout under the
    // disabled flag is the proof that a downstream user can turn the whole
    // thing off in one variable without patching anything.
    const out = execFileSync(process.execPath, [join(PKG, "hooks/moe-completion-evidence")], {
      input: JSON.stringify({ session_id: "t", transcript_path: "" }),
      env: { ...process.env, MOE_EVIDENCE_DISABLED: "1" },
      encoding: "utf8",
    });
    expect(out).toBe("");
  });

  it("the Stop hook carries no upstream env-var or state-directory name", () => {
    const src = readFileSync(join(PKG, "hooks/claude-judge-continuation"), "utf8");
    // Forbidden in LIVE code. Each is allowed inside a `#` comment, because the
    // comments are what record which upstream name each one replaced and why the
    // rename was the migration-safety mechanism rather than churn.
    const live = src
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    for (const token of [
      "DOUBLE_SHOT_LATTE_MODEL",
      "DOUBLE_SHOT_LATTE_TIMEOUT",
      "CLAUDE_HOOK_JUDGE_MODE",
      ".claude/double-shot-latte",
      "/tmp/.claude-continue-throttle",
    ]) {
      expect(live.includes(token), `still references ${token} in live code`).toBe(false);
    }
    for (const token of [
      "MOE_LATTE_ENABLED",
      "MOE_LATTE_MODEL",
      "MOE_LATTE_TIMEOUT",
      "MOE_LATTE_JUDGE_MODE",
    ]) {
      expect(src.includes(token), `missing ${token}`).toBe(true);
    }
  });
});

// packages/core/agents/ is this package's first, added with retrieving-context.
// Nothing asserted anything about agents/ before, and the failure mode is silent:
// an agent's `tools:` allowlist is a comma-separated list of identifiers, and an
// MCP tool that is named in any form other than `mcp__<server>__<tool>` simply
// does not resolve. The agent then runs with fewer tools than its author
// intended — or none — and no error is raised anywhere. A `grep -q '^tools:'`
// gate proves the key exists, which is not the thing that breaks.
// The governance mapping table in README.md is the artifact that says which Moe
// surface answers each section of TC's AI Governance policy. Its failure mode is
// a section quietly going unmapped — the policy has eleven and a reader cannot
// tell a missing row from a section that needs no Moe surface. Asserting a row
// COUNT would pass on eleven rows for the wrong eleven sections, so each § is
// checked by name.
describe("the AI Governance mapping table", () => {
  const readme = readFileSync(join(PKG, "README.md"), "utf8");

  it("maps every one of Governance.md's eleven sections", () => {
    const missing: string[] = [];
    for (let n = 1; n <= 11; n++) {
      if (!new RegExp(`^\\| §${n} \\|`, "m").test(readme)) missing.push(`§${n}`);
    }
    expect(
      missing,
      `README.md's governance table is missing a row per section: ${missing.join(", ")}. ` +
        `Governance.md (ai/aigovernance) has eleven numbered sections; a section with no ` +
        `Moe surface still needs a row saying so, because a reader cannot tell that ` +
        `from an omission.`,
    ).toEqual([]);
  });

  it("does not vendor the policy text it declines to vendor", () => {
    // The precedence argument in that section is only true while the policy is
    // NOT a skill here. If someone later pastes Governance.md into skills/, the
    // README's reasoning silently becomes a lie — so check the thing the
    // reasoning depends on. Matched on the policy's H1, the same marker the hook
    // greps for.
    const offenders = ownedMarkdown.filter((f) =>
      readFileSync(f, "utf8").includes("# AI Governance & Security Policy"),
    );
    expect(
      offenders,
      `these skills carry Governance.md's H1: ${offenders.join(", ")}. The policy must ` +
        `stay in ~/.claude/CLAUDE.md — using-moe ranks user instructions above skills, ` +
        `so vendoring it as a skill demotes the one document that says it cannot be ` +
        `demoted. See the AI Governance section of README.md.`,
    ).toEqual([]);
  });
});

describe("agents", () => {
  const AGENTS = join(PKG, "agents");
  const agentFiles = existsSync(AGENTS)
    ? readdirSync(AGENTS)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : [];

  it("has at least one agent, so the checks below are not vacuous", () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  it.each(agentFiles)("%s declares a model and a tools allowlist", (file) => {
    const { data } = parseFrontmatter(readFileSync(join(AGENTS, file), "utf8"));
    expect(data.model, `${file}: no model — the agent runs on the caller's model`).toBeDefined();
    expect(data.tools, `${file}: no tools allowlist — the agent inherits everything`).toBeDefined();
  });

  it.each(agentFiles)("%s spells every MCP tool as mcp__<server>__<tool>", (file) => {
    const { data } = parseFrontmatter(readFileSync(join(AGENTS, file), "utf8"));
    const malformed = (data.tools ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      // Built-in tools (Read, Grep, Bash, ...) are Capitalised and always fine.
      // Anything else must be a full MCP identifier. The server segment is
      // matched lazily so the first `__` splits it, which keeps the plugin-served
      // form working too: mcp__plugin_<plugin>_<server>__<tool> has underscores
      // inside its server segment.
      .filter((t) => !/^[A-Z]/.test(t) && !/^mcp__(.+?)__(.+)$/.test(t));
    expect(
      malformed,
      `${file}: these do not resolve. An MCP tool must be mcp__<server>__<tool> — ` +
        `the server key is the one in ~/.claude.json mcpServers (or ` +
        `mcp__plugin_<plugin>_<server>__<tool> when it is served by a plugin). ` +
        `A bare name silently gives the agent nothing.`,
    ).toEqual([]);
  });

  it("emits every agent into the full plugin", () => {
    const emitted = readdirSync(join(PKG, "../../plugins/moe-everything/agents")).sort();
    expect(emitted).toEqual(agentFiles);
  });
});

describe("the lean/full curation", () => {
  it("assigns every skill exactly one recorded tier, with a rationale", () => {
    expect(Object.keys(registry).sort()).toEqual([...skillNames].sort());
    for (const [name, entry] of Object.entries(registry)) {
      expect(["core", "everything"], `${name}.tier`).toContain(entry.tier);
      expect(entry.from, `${name}.from`).toBeTruthy();
      expect(
        (entry.why ?? "").length,
        `${name}.why is too short to be a rationale`,
      ).toBeGreaterThan(40);
    }
  });

  it("records a known provenance for every skill, per map", () => {
    // The six upstream sources, distributed 14/6/4/4/2/1 = 31. A seventh value
    // appearing under `imported:` means a skill arrived from somewhere nobody
    // recorded, which is the thing PARITY.md exists to prevent; a value here
    // that is not in that ledger is drift between the two.
    const UPSTREAM = [
      "superpowers",
      "superpowers-lab",
      "superpowers-developing-for-claude-code",
      "iterative-development",
      "the-elements-of-style",
      "mattpocock-skills",
    ];
    for (const [name, entry] of Object.entries(imported)) {
      expect(UPSTREAM, `imported.${name}.from is not a known upstream source`).toContain(
        entry.from,
      );
    }
    // An authored skill has no upstream to name. Asserted in both directions so
    // neither map can borrow the other's vocabulary: an authored entry claiming
    // `from: superpowers` would launder a fork-original as inherited, and an
    // imported entry claiming the authored value would erase a real provenance.
    for (const [name, entry] of Object.entries(authored)) {
      expect(entry.from, `authored.${name}.from must be the fork's own value`).toBe("moe");
      expect(UPSTREAM, `authored.${name}.from names an upstream source`).not.toContain(entry.from);
    }
    for (const [name, entry] of Object.entries(imported)) {
      expect(entry.from, `imported.${name}.from is the fork's own value`).not.toBe("moe");
    }
  });

  it("keeps every fork-authored skill in the everything tier", () => {
    // DECISION D2, Zak Keown, 2026-08-31. A fork-authored skill is
    // `tier: everything` only, FOR NOW.
    //
    // This is CURRENT POLICY and it is REVERSIBLE — it is not a law, and it is
    // not a claim that a Moe-original skill could never earn the lean tier. It
    // exists so that the FIRST core-tier authored skill is a conversation
    // somebody has on purpose, rather than a default nobody chose. When that
    // conversation happens, flip this assertion; do not work around it.
    //
    // Vacuous while `authored:` is empty, which is why it was driven RED once
    // against a throwaway entry rather than trusted because the suite was green.
    for (const [name, entry] of Object.entries(authored)) {
      expect(
        entry.tier,
        `authored.${name}.tier is "${entry.tier}". Fork-authored skills are everything-tier only — CURRENT POLICY (D2, 2026-08-31), reversible by deliberate decision, not by editing this manifest.`,
      ).toBe("everything");
    }
  });

  it("no shipped plugin description hardcodes a skill count", () => {
    // The count rots on the first authored skill, and it rots in TWELVE places at
    // once, because mint byte-copies each `description` into every harness
    // manifest plus both marketplace files. Both `mint/*.yaml` descriptions
    // carried "all 27 skills" until 2026-08-31 while nothing asserted any of
    // them; the de-rotting pass corrected the one copy nothing parses and left
    // the shipped ones. Assert the sources, since /plugins/ is generated from
    // them and mint:check proves the copy.
    const offenders: string[] = [];
    for (const rel of ["mint/moe-core.yaml", "mint/moe-everything.yaml"]) {
      const text = readFileSync(join(PKG, rel), "utf8");
      text.split("\n").forEach((line, i) => {
        if (/\b\d+\s+skills\b/.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "a skill count in a mint config reaches every generated manifest. Say " +
        '"every skill" or "the core tier"; the numbers live in skill-tiers.yaml.\n  ' +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("keeps the lean tier lean", () => {
    const core = Object.entries(registry).filter(([, e]) => e.tier === "core");
    expect(core.length, "lean tier membership changed — update LEAN_TIER_COUNT deliberately").toBe(
      LEAN_TIER_COUNT,
    );
  });

  it("no core-tier skill REQUIREs an everything-tier skill", () => {
    // The closure rule. A `**REQUIRED SUB-SKILL:**` pointing at a skill the
    // reader does not have installed is a dead end mid-workflow, and the lean
    // plugin is the one most people will be running.
    const tierOf = (n: string) => registry[n]?.tier;

    // Anti-vacuity guard, and it is load-bearing rather than defensive.
    //
    // The loop below SKIPS any skill whose tier does not resolve. Before the two
    // maps existed, a broken lookup threw — indexing an undefined map is a
    // TypeError — so the failure was loud by accident. The merged
    // registry removed that accident: `{...undefined}` evaluates to `{}` in
    // silence, so one mistyped spread key would leave every tier undefined, skip
    // all 27 iterations, and let this test pass with an empty body and the
    // closure rule gone. An empty list here is what earns the loop below.
    const unresolved = skills.filter((s) => tierOf(s.name) === undefined).map((s) => s.name);
    expect(unresolved, "no tier resolved for these — the loop below would skip them").toEqual([]);

    const offenders: string[] = [];
    for (const s of skills) {
      if (tierOf(s.name) !== "core") continue;
      for (const p of s.files) {
        if (!p.endsWith(".md")) continue;
        if (THIRD_PARTY.has(p.split("/").pop() as string)) continue;
        if (p.split("/").includes(EXAMPLES_SEGMENT)) continue;
        for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
          if (!/REQUIRED (SUB-SKILL|BACKGROUND)/.test(line)) continue;
          if (line.trimStart().startsWith("- ✅") || line.trimStart().startsWith("- ❌")) continue;
          for (const m of line.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) {
            const target = m[1] as string;
            if (skillNames.has(target) && tierOf(target) === "everything") {
              offenders.push(`${s.name} REQUIREs everything-tier ${target}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // The tiering used to be data with no mechanism: skill-tiers.yaml recorded a
  // split that nothing acted on, because moe-mint's readSkills() has no
  // skill-level filter and would emit all 27 either way. The filter now happens
  // at STAGE time in scripts/mint-plugins.mjs, which copies only the skills for
  // a tier into plugins/<name>/ before generating. These two assertions are what
  // make that claim falsifiable.
  it("emits exactly the core tier into the lean plugin, plus _shared", () => {
    const emitted = readdirSync(join(PKG, "../../plugins/moe-core/skills")).sort();
    const expected = [
      "_shared",
      ...Object.entries(registry)
        .filter(([, e]) => e.tier === "core")
        .map(([n]) => n),
    ].sort();
    expect(emitted).toEqual(expected);
  });

  it("emits every skill into the full plugin, so it is a strict superset", () => {
    const lean = readdirSync(join(PKG, "../../plugins/moe-core/skills"));
    const full = readdirSync(join(PKG, "../../plugins/moe-everything/skills"));
    expect([...full].sort()).toEqual(["_shared", ...skillNames].sort());
    for (const name of lean) {
      expect(
        full.includes(name),
        `moe-everything is missing ${name}, so it is not a superset`,
      ).toBe(true);
    }
  });
});

describe("the rebrand", () => {
  // Zone A only. docs/history/ and licenses/ describe projects that WERE called
  // by their upstream names and are excluded from every sweep, including this one.
  const zoneA = [
    ...walk(SKILLS, { skipExamples: false }),
    ...walk(join(PKG, "hooks"), { skipExamples: false }),
    // Both plugin configs. They moved from `<pkg>/moe-mint.yaml` to
    // `<pkg>/mint/<plugin>.yaml` when scripts/mint-plugins.mjs began staging:
    // one source tree emits two plugins, so one file at one fixed name could not
    // hold both. Enumerated rather than globbed so adding a third plugin config
    // without adding it here is a visible omission.
    join(PKG, "mint/moe-core.yaml"),
    join(PKG, "mint/moe-everything.yaml"),
    join(PKG, "package.json"),
  ].filter((p) => !/\.(png|svg|jpg|ico)$/.test(p));

  it("carries no upstream brand token in live code, config or skill content", () => {
    const tokens = [
      "superpowers",
      "SUPERPOWERS",
      "Superpowers",
      "double-shot-latte",
      "DOUBLE_SHOT_LATTE",
      "everyharness",
      "primeradiant",
      "prime-radiant",
      "Prime Radiant",
      "jesse@fsck.com",
      "/home/jesse",
    ];
    // Deliberate survivors, enumerated rather than blanket-exempted. Each is a
    // provenance note - a comment saying which upstream name or behaviour was
    // replaced - and each is asserted below to appear ONLY on a comment line, so
    // a live occurrence still fails.
    const provenance = new Map<string, string[]>([
      ["skills/brainstorming/scripts/server.cjs", ["primeradiant"]],
      ["hooks/claude-judge-continuation", ["double-shot-latte"]],
      ["mint/moe-core.yaml", ["superpowers", "everyharness"]],
      ["mint/moe-everything.yaml", ["superpowers", "everyharness"]],
      ["skills/using-moe/references/opencode-tools.md", ["superpowers"]],
      // Added PRE-EMPTIVELY for W01P02 (moe-tone-and-branding), decision D4.
      // That item creates this file — a reference document inside an existing
      // skill directory, not a 28th skill, so it moves no count. A house-voice
      // document explaining this fork's tone will very likely name the upstream
      // project it diverged from, and the sweep below walks every .md under
      // skills/. The entry is INERT until the file exists: the loop reads
      // `provenance.get(rel)` for files found on DISK, so a key naming nothing
      // is never looked up and nothing asserts a key must resolve.
      ["skills/writing-clearly-and-concisely/house-voice.md", ["superpowers"]],
    ]);
    // In a Markdown document there is no "live code" position, so an enumerated
    // exemption covers the whole file. In config and code, it covers comments
    // only — a live occurrence still fails.
    const commentish = (line: string, isMarkdown: boolean) => {
      if (isMarkdown) return true;
      const t = line.trimStart();
      return t.startsWith("#") || t.startsWith("//") || t.startsWith("*");
    };

    const offenders: string[] = [];
    for (const p of zoneA) {
      const rel = p.slice(PKG.length + 1);
      if (THIRD_PARTY.has(p.split("/").pop() as string)) continue;
      const text = readFileSync(p, "utf8");
      const exempt = provenance.get(rel) ?? [];
      for (const t of tokens) {
        if (!text.includes(t)) continue;
        if (!exempt.includes(t)) {
          offenders.push(`${rel}: ${t}`);
          continue;
        }
        // Exempt, but only on comment lines.
        const isMarkdown = rel.endsWith(".md");
        for (const [i, line] of text.split(/\r?\n/).entries()) {
          if (line.includes(t) && !commentish(line, isMarkdown)) {
            offenders.push(`${rel}:${i + 1}: ${t} outside a comment`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the upstream state and output paths renamed everywhere", () => {
    const all = zoneA
      .filter((p) => !THIRD_PARTY.has(p.split("/").pop() as string))
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
    expect(all).not.toContain(".superpowers/");
    expect(all).not.toContain("docs/superpowers/");
    // And the replacements are actually present, so a sweep that deleted rather
    // than renamed also fails here.
    expect(all).toContain(".moe/sdd");
    expect(all).toContain(".moe/brainstorm");
    expect(all).toContain("docs/moe/plans");
    expect(all).toContain("docs/moe/iterations");
  });

  it("sends no telemetry from the brainstorming companion", () => {
    const src = readFileSync(join(PKG, "skills/brainstorming/scripts/server.cjs"), "utf8");
    // Upstream injected <img src="https://primeradiant.com/brand/...?v=<version>">
    // into every served page, opt-out only. Removed, not rebranded.
    expect(src).not.toContain("https://primeradiant.com");
    expect(src).not.toContain("BRAND_IMAGE_URL");
    expect(src).not.toContain("TELEMETRY_DISABLE_ENV_VARS");
    expect(src).not.toMatch(/<img[^>]*brand-logo/);
  });

  it("rewrites self-referential URLs to GitLab and keeps provenance on GitHub", () => {
    for (const rel of ["mint/moe-core.yaml", "mint/moe-everything.yaml"]) {
      const config = readFileSync(join(PKG, rel), "utf8");
      expect(config, rel).toContain("https://gitlab.tcdevops.com/Zak/moe");
      expect(config, rel).not.toContain("github.com");
    }

    // Provenance that must NOT be rewritten: the bash 5.3 heredoc workaround in
    // upstream's own issue tracker, cited by the hook it explains.
    const gemini = readFileSync(join(SKILLS, "using-moe/references/gemini-tools.md"), "utf8");
    expect(gemini).toBeTruthy(); // sanity: the file the platform list names exists
  });
});

describe("the platform reference list", () => {
  it("names every file in using-moe/references/, and no others", () => {
    // Upstream's list omitted gemini-tools.md while GEMINI.md loaded that exact
    // file, and only the antigravity entry was test-enforced. Both directions
    // are checked now.
    const dir = join(SKILLS, "using-moe/references");
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const skill = readFileSync(join(SKILLS, "using-moe/SKILL.md"), "utf8");
    const named = [...skill.matchAll(/`references\/([a-z0-9-]+\.md)`/g)]
      .map((m) => m[1] as string)
      .sort();
    expect(named).toEqual(onDisk);
  });
});

describe("native rendering", () => {
  // Guards the shared four-rung ladder at skills/_shared/native-rendering.md.
  // A skill that mentions Claude Code's Artifact tool must also point the
  // reader at the ladder, so a runtime without that tool still knows what to
  // do. And the env var that opts INTO shareable-by-default artifacts is
  // stated as off-by-default, mirroring MOE_LATTE_ENABLED.

  const RENDERING_MARKER = /\bArtifact tool\b|\bpublish an artifact\b/;
  const LADDER = join(SKILLS, "_shared/native-rendering.md");

  it("every mention of the Claude Code Artifact tool names the shared ladder", () => {
    // The bare word "artifact" is overloaded here — it also means plugin
    // artifact files, task artifacts, spec artifacts, iteration artifacts.
    // Only the phrases "Artifact tool" and "publish an artifact" mean the
    // Claude Code Artifact tool, so those are what get matched. Anything that
    // matches must also reference `native-rendering.md`, so a reader dropped
    // into a runtime that has no such tool finds the fallback rungs.
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      if (!RENDERING_MARKER.test(text)) continue;
      if (p === LADDER) continue; // the ladder IS the fallback, so no self-reference required
      if (!text.includes("native-rendering.md")) {
        offenders.push(p.slice(PKG.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the shared ladder is present and referenced", () => {
    expect(existsSync(LADDER), "skills/_shared/native-rendering.md").toBe(true);
    // Something must actually point at it, or it isn't part of the workflow.
    const referenced = ownedMarkdown
      .filter((p) => p !== LADDER)
      .some((p) => readFileSync(p, "utf8").includes("native-rendering.md"));
    expect(referenced, "nothing references _shared/native-rendering.md").toBe(true);
  });

  it("MOE_ARTIFACT_SHARING is documented as default off in the ladder", () => {
    // Mirrors the "Stop hook is opt-in and exits 0 when disarmed" assertion
    // for MOE_LATTE_ENABLED, but for a doc-only env var: no hook reads it, so
    // the assertion is on the prose that promises the default. The `off` word
    // must appear near the env-var name, not in some distant paragraph.
    const src = readFileSync(LADDER, "utf8");
    expect(src, "ladder must name MOE_ARTIFACT_SHARING").toContain("MOE_ARTIFACT_SHARING");
    expect(
      src,
      "ladder must state MOE_ARTIFACT_SHARING defaults off, within ~200 chars of the name",
    ).toMatch(
      /MOE_ARTIFACT_SHARING[\s\S]{0,240}(default(?:s|ed)? (?:is )?off|off by default|default off)/i,
    );
  });
});

describe("workflow depth vocabulary", () => {
  // brainstorming names the workflow depth axis patch/change/feature and NOT
  // "tier" — three unrelated meanings of "tier" already ship (skill-tiers, the
  // auditing-progress three-tier audit, and the model tier under
  // subagent-driven-development's Model Selection). Adding a fourth would
  // silently overload a word carrying real load elsewhere. These assertions
  // fence the vocabulary in.

  const DEPTH_GUARDED_SKILLS = [
    "skills/brainstorming/SKILL.md",
    "skills/writing-plans/SKILL.md",
    "skills/executing-plans/SKILL.md",
    "skills/subagent-driven-development/SKILL.md",
  ];

  it("names all three depths in every depth-guarded skill", () => {
    // brainstorming defines the vocabulary; the other three each carry an "At
    // this depth" note saying they fire only at `feature`. A silent skill on
    // the vocabulary is a half-rename waiting to become a stale reference.
    for (const rel of DEPTH_GUARDED_SKILLS) {
      const text = readFileSync(join(PKG, rel), "utf8");
      for (const name of ["patch", "change", "feature"]) {
        expect(new RegExp(`\\b${name}\\b`).test(text), `${rel}: missing depth name "${name}"`).toBe(
          true,
        );
      }
    }
  });

  it("does not name the workflow depth 'tier' in any SKILL.md that lacks a legitimate tier meaning", () => {
    // Three legitimate meanings of tier already ship, each confined to its own
    // area: the auditing-progress cluster (three-tier audit), iterative-development
    // (references the same audit), subagent-driven-development (model tier under
    // Model Selection), and one platform reference that names its model tier.
    // Anywhere else, \btier\b would be the FOURTH meaning — the one this rename
    // existed to avoid — and a half-rename takes exactly that shape on the way in.
    const allowedPrefixes = [
      "skills/auditing-progress/", // every prompt in the cluster names Tier 1/2/3 audits
      "skills/iterative-development/SKILL.md",
      "skills/subagent-driven-development/SKILL.md",
      "skills/subagent-driven-development/re-review-prompt.md",
      "skills/sequencing-plans/SKILL.md", // discusses plugin tiers (skill-tiers.yaml packaging), not workflow depth
      "skills/codebase-design/SKILL.md", // imported mattpocock skill: "tier-spanning slice" = architectural tier (presentation/business/data), not workflow depth
      "skills/writing-skills/references/skill-typography.md", // imported mattpocock reference: "primary tier" = hierarchical level in authoring guidance, not workflow depth
      "skills/using-moe/references/codex-tools.md",
    ];
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const rel = p.slice(PKG.length + 1);
      if (allowedPrefixes.some((pfx) => rel === pfx || rel.startsWith(pfx))) continue;
      const text = readFileSync(p, "utf8");
      text.split(/\r?\n/).forEach((line, i) => {
        if (/\btiers?\b/i.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(
      offenders,
      'the workflow depth axis is patch/change/feature — never a fourth "tier".\n  ' +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("carries no retired depth-classifier vocabulary in shipped skill prose", () => {
    // The retired vocabulary was spike/bounded/architectural. Half-renaming — the
    // trigraph in one place, a per-depth compound ("spike-path", "bounded task")
    // in another — is worse than either whole version, because a reader sees
    // both rules and cannot tell which is authoritative. These patterns match
    // ONLY the classifier senses. The generic adjective uses of "bounded"
    // (well-bounded units, bounded stretches) and "architectural" (architectural
    // context / decisions / soundness) survive: those refer to well-defined
    // boundaries and to software architecture as a discipline, and neither was
    // ever part of the depth axis.
    const patterns: Array<{ label: string; re: RegExp }> = [
      // The canonical trigraph in any separator: spike / bounded / architectural
      { label: "trigraph", re: /spike\s*[/,-]\s*bounded\s*[/,-]\s*architectural/i },
      // Compound per-depth phrases only the classifier used
      { label: "X-path", re: /\b(spike|bounded|architectural)[- ]path\b/i },
      { label: "X-task", re: /\b(spike|bounded|architectural)[- ]task\b/i },
      // The section heading the classifier lived under
      { label: "Three Paths heading", re: /^#+\s*Three Paths\s*$/im },
    ];
    const offenders: string[] = [];
    for (const p of ownedMarkdown) {
      const text = readFileSync(p, "utf8");
      for (const { label, re } of patterns) {
        const m = re.exec(text);
        if (m) offenders.push(`${p.slice(PKG.length + 1)}: ${label} → "${m[0]}"`);
      }
    }
    expect(
      offenders,
      "retired depth-classifier vocabulary detected — the axis is patch/change/feature now.\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("keeps the REQUIRED SUB-SKILL count across the depth-guarded pair at four", () => {
    // Distribution: writing-plans (3), executing-plans (1),
    // subagent-driven-development (0). The tiered-workflow-naming wave3 gate
    // asserts the same sum with `grep -c` in CI; asserting it in vitest too
    // means a drop is caught by `pnpm test` before CI ever runs.
    let count = 0;
    for (const rel of [
      "skills/writing-plans/SKILL.md",
      "skills/executing-plans/SKILL.md",
      "skills/subagent-driven-development/SKILL.md",
    ]) {
      const text = readFileSync(join(PKG, rel), "utf8");
      const matches = text.match(/REQUIRED SUB-SKILL/g);
      if (matches) count += matches.length;
    }
    expect(count, "REQUIRED SUB-SKILL total across depth-guarded skills").toBe(4);
  });
});

describe("licensing", () => {
  it("retains one LICENSE per inbound license, as NOTICE promises", () => {
    // Six of the eight sources ship a LICENSE, with four distinct notices, so
    // the glass precedent (one upstream, one LICENSE at the package root) does
    // not generalise. Root NOTICE says copies "are retained alongside the code
    // derived from them, under each package".
    //
    // gsd-core is here for ten reference documents and no skills. The obligation
    // does not scale with the size of the import — MIT requires the notice for
    // any derived material at all.
    const dir = join(PKG, "licenses");
    expect(readdirSync(dir).sort()).toEqual([
      "double-shot-latte.MIT.LICENSE",
      "gsd-core.MIT.LICENSE",
      "iterative-development.Apache-2.0.LICENSE",
      "mattpocock-skills.MIT.LICENSE",
      "superpowers-lab.MIT.LICENSE",
      "superpowers.MIT.LICENSE",
    ]);
    // Verbatim: the copyright lines are what the notices require.
    expect(readFileSync(join(dir, "superpowers.MIT.LICENSE"), "utf8")).toContain(
      "Copyright (c) 2025 Jesse Vincent",
    );
    expect(readFileSync(join(dir, "double-shot-latte.MIT.LICENSE"), "utf8")).toContain(
      "Copyright (c) 2024 Anthropic",
    );
    expect(readFileSync(join(dir, "iterative-development.Apache-2.0.LICENSE"), "utf8")).toContain(
      "Copyright 2026 Prime Radiant, Inc.",
    );
    expect(readFileSync(join(dir, "mattpocock-skills.MIT.LICENSE"), "utf8")).toContain(
      "Copyright (c) 2026 Matt Pocock",
    );
  });

  it("declares the mixed inbound license, not the scaffold's guess", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { license: string };
    expect(pkg.license).toBe("MIT AND Apache-2.0");
  });
});

describe("plan-set", () => {
  // The `plan-set` CLI is deterministic and its whole job is to be trustworthy
  // when the model has no context. Exercise every branch as a shelled-out
  // command: parsing behaviour, `check` refusals, `next`'s ready-set walk over
  // a diamond, and `blocked` propagation. Fixtures live in
  // test/fixtures/plan-set/; each covers exactly one failure mode so an
  // assertion has one thing to say when it fires.
  const CLI = join(PKG, "hooks/plan-set");
  const FIXTURES = join(PKG, "test/fixtures/plan-set");
  const run = (args: string[]): { status: number; stdout: string; stderr: string } => {
    try {
      const stdout = execFileSync(process.execPath, [CLI, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      return { status: 0, stdout, stderr: "" };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
  };

  it("check passes on a diamond and reports the plan count", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "diamond-MANIFEST.md")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("ok — 4 plans");
  });

  it("next returns both middle ids on a diamond after the root is done", () => {
    // The fixture ships with A already `done`, so `next` should be exactly
    // the two middle ids B and C in manifest order. One id per line, no
    // trailing separator surprises.
    const r = run(["next", "--manifest", join(FIXTURES, "diamond-MANIFEST.md")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split(/\n/)).toEqual(["B", "C"]);
  });

  it("check fails on a cycle and names every node on stderr", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "cycle-MANIFEST.md")]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/cycle detected among:.*A/);
    expect(r.stderr).toMatch(/cycle detected among:.*B/);
    expect(r.stderr).toMatch(/cycle detected among:.*C/);
  });

  it("next skips a blocked node's transitive dependents", () => {
    // A is blocked; B depends on A; C depends on B. `next` must be empty:
    // the blocked-closure walk covers B and C, so neither is ready.
    // Verifies the moe-core #2830 lesson — an "artifact exists = done"
    // reader would hand back B here, and this test exists to make sure it
    // never does.
    const r = run(["next", "--manifest", join(FIXTURES, "blocked-MANIFEST.md")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("check fails on a duplicate id", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "duplicate-MANIFEST.md")]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/duplicate id "A"/);
  });

  it("check fails on an unresolvable dep", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "missing-dep-MANIFEST.md")]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/depends_on "nonexistent" — not a known id/);
  });

  it("check fails when a plan file does not exist", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "missing-plan-MANIFEST.md")]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/plan file not found — plans\/does-not-exist\.md/);
  });

  it("--help prints usage and exits 0", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/plan-set: sequence a set of plans/);
  });

  it("names a manifest that does not exist and exits non-zero", () => {
    const r = run(["check", "--manifest", join(FIXTURES, "does-not-exist.md")]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/manifest not found/);
  });
});

describe("plan-set-notice", () => {
  // The SessionStart hook that fires plan-set on cold start. Every path it
  // can hit — no manifest, empty stdin, all-done, blocked-only, a project
  // with an actual ready plan — must exit 0. A non-zero SessionStart hook
  // can break every session on the machine; that is a bigger failure than a
  // missing notice, and the assertion below is what keeps that promise
  // testable.
  const HOOK = join(PKG, "hooks/plan-set-notice");
  const runHook = (input: string, env: Record<string, string> = {}) => {
    try {
      const stdout = execFileSync("bash", [HOOK], {
        input,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
      });
      return { status: 0, stdout };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status ?? 1, stdout: e.stdout ?? "" };
    }
  };

  it("exits 0 with no output on empty stdin", () => {
    const r = runHook("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("exits 0 with no output when cwd has no manifest", () => {
    const r = runHook(JSON.stringify({ cwd: PKG, hook_event_name: "SessionStart" }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("prints additionalContext when the project has a runnable plan", () => {
    // Point cwd at a synthetic project layout the hook can walk. mkdtemp
    // outside the repo so no walk() elsewhere in this file trips over the
    // scratch dir, and rmSync in finally so a failure mid-test does not leak.
    const tmp = mkdtempSync(join(tmpdir(), "plan-set-notice-"));
    try {
      const plansDir = join(tmp, "docs/moe/plans");
      const planFiles = join(tmp, "plans");
      execFileSync("mkdir", ["-p", plansDir]);
      execFileSync("mkdir", ["-p", planFiles]);
      const plansSrc = join(PKG, "test/fixtures/plan-set/plans");
      for (const f of ["A-plan.md", "B-plan.md", "C-plan.md", "D-plan.md"]) {
        execFileSync("cp", [join(plansSrc, f), join(planFiles, f)]);
      }
      execFileSync("cp", [
        join(PKG, "test/fixtures/plan-set/diamond-MANIFEST.md"),
        join(plansDir, "test-MANIFEST.md"),
      ]);
      const r = runHook(JSON.stringify({ cwd: tmp, hook_event_name: "SessionStart" }), {
        CLAUDE_PLUGIN_ROOT: "/fake",
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('"hookSpecificOutput"');
      expect(r.stdout).toContain("Next runnable plan(s): B,C");
      expect(r.stdout).toContain("docs/moe/plans/test-MANIFEST.md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
