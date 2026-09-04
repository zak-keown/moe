# Skill renaming — design

- **Date:** 2026-09-04
- **Status:** approved in chat; awaiting review of this written spec before `writing-plans`
- **Scope:** all 41 skills under `packages/core/skills/`
- **Depth:** feature (restructures an interface many surfaces depend on)

## Problem

The skill names are loquacious. Gerund phrases with articles and filler —
`subagent-driven-development`, `finishing-a-development-branch`,
`verification-before-completion`, `using-tmux-for-interactive-commands` — are a
mouthful to type, a wall to scan in the `/moe:` menu, and clunky in prose. The
worst offenders are almost all in the frozen imported set, so the fix is a
deliberate reopening of the freeze, not a routine edit.

## Decision

Rename to shorter names across **all 41 skills**, under one convention:
**idiomatic initialisms where they exist, verb-object otherwise, and leave
already-terse names alone.** Reopen the imported freeze *responsibly* — fidelity
is preserved by a recorded rename table, not discarded.

### Naming rules

1. **Idiomatic initialism** — only where the initialism is genuinely
   recognisable or reads cleanly. Applied to `tdd` and `sdd`. (`mcp-cli` already
   carries `mcp` and stays.)
2. **Verb-object, no filler** — imperative verb + object, articles and gerund
   bloat dropped: `finish-branch`, `resolve-conflicts`, `verify-completion`.
   Chosen over bare nouns because it stays descriptive enough to double as a
   discovery trigger and is collision-resistant against harness commands.
3. **Keep already-conformant names** — one or two words, no filler, already
   clear. Includes two deliberate gerund exceptions (`brainstorming`,
   `systematic-debugging`) that are branded and lose meaning if shortened.
4. **No name collides** with another skill or a known harness command. Verified
   against the final table below.

## The mapping

30 of 41 renamed; 11 kept. `renamed_from` is the upstream identity that anchors
fidelity (see *Fidelity mechanism*).

### Imported (32)

| current (`renamed_from`) | new name | rule |
|---|---|---|
| `using-superpowers` → `using-moe` | `using-moe` | keep (bootstrap anchor; already recorded) |
| `brainstorming` | `brainstorming` | keep (branded exception) |
| `systematic-debugging` | `systematic-debugging` | keep (branded exception) |
| `test-driven-development` | `tdd` | initialism |
| `subagent-driven-development` | `sdd` | initialism (coined — see Risks) |
| `verification-before-completion` | `verify-completion` | verb-object |
| `writing-plans` | `write-plan` | verb-object |
| `executing-plans` | `execute-plan` | verb-object |
| `using-git-worktrees` | `use-worktrees` | verb-object |
| `finishing-a-development-branch` | `finish-branch` | verb-object |
| `requesting-code-review` | `request-review` | verb-object |
| `receiving-code-review` | `receive-review` | verb-object |
| `writing-clearly-and-concisely` | `write-clearly` | verb-object |
| `dispatching-parallel-agents` | `dispatch-agents` | verb-object |
| `writing-skills` | `write-skill` | verb-object |
| `working-with-claude-code` | `cc-config` | topic (doc router) |
| `developing-claude-code-plugins` | `cc-plugins` | topic (doc router) |
| `finding-duplicate-functions` | `find-duplicates` | verb-object |
| `mcp-cli` | `mcp-cli` | keep |
| `using-tmux-for-interactive-commands` | `use-tmux` | verb-object |
| `windows-vm` | `windows-vm` | keep |
| `iterative-development` | `iterate` | verb |
| `extracting-requirements` | `extract-requirements` | verb-object |
| `scoping-the-simplest-core` | `scope-core` | verb-object |
| `running-an-iteration` | `run-iteration` | verb-object |
| `implementing-tasks` | `implement-tasks` | verb-object |
| `auditing-progress` | `audit-progress` | verb-object |
| `codebase-design` | `codebase-design` | keep |
| `improve-codebase-architecture` | `improve-architecture` | verb-object |
| `domain-modeling` | `domain-modeling` | keep |
| `prototype` | `prototype` | keep |
| `resolving-merge-conflicts` | `resolve-conflicts` | verb-object |

### Authored (9)

| current | new name | rule |
|---|---|---|
| `retrieving-context` | `retrieve-context` | verb-object |
| `sequencing-plans` | `sequence-plans` | verb-object |
| `reviewing-a-codebase` | `review-codebase` | verb-object |
| `fixing-a-code-review` | `fix-review` | verb-object |
| `docs-update` | `docs-update` | keep |
| `moe-discipline` | `moe-discipline` | keep |
| `merge-discipline` | `merge-discipline` | keep |
| `developing-for-moe` | `moe-dev` | topic |
| `smoothing-the-experience` | `smooth-experience` | verb-object |

All 41 new names are distinct; none matches a known Claude Code / harness
command. (A collision sweep against the eight harnesses is a verification step,
not an assumption.)

## Fidelity mechanism

Reopening the freeze must not delete the drop-and-rename detector. It changes
what the detector is anchored to.

- Each imported entry in `packages/core/skill-tiers.yaml` is keyed by its **new**
  name and gains a `renamed_from:` field naming its **upstream** identity. Kept
  names get `renamed_from` equal to their own name (or omit it — implementation
  detail). The existing `using-superpowers → using-moe` rename, currently only a
  comment in the test, becomes data: `using-moe` gets `renamed_from:
  using-superpowers`.
- `packages/core/test/metadata.test.ts` currently pins the imported literal
  against the **current directory names**. It is re-anchored to the **upstream
  identities**: the frozen literal becomes the 32 original superpowers names, and
  the assertion projects each entry through `renamed_from ?? name` before
  comparing. The frozen anchor therefore *never moves again* — a rename that is
  not accompanied by a `renamed_from` entry fails the test exactly as a silent
  drop does today.
- `"pins the IMPORTED skill set at exactly 32"` is unaffected: membership does
  not change, only names. Count stays 32; the self-referential title check keeps
  working.

Exact literal and assertion edits are finalised against the real test during
implementation; this section fixes the intent, not the diff.

## Blast radius — guarded surfaces

Every surface AGENTS.md names as guarded, and how the rename touches it:

- **`metadata.test.ts`** — the pinned literal + count (re-anchored, above); the
  **strict-marker rule** ("every backticked token on a line must resolve against
  `packages/core/skills/`") turns red the instant any backticked cross-reference
  falls out of lockstep, so cross-refs must move atomically with the dirs; the
  `REQUIRED SUB-SKILL` count of 4 is unaffected (markers stay on the renamed
  skills).
- **`skill-tiers.yaml`** — keys change; `renamed_from` added; the stale header
  comment ("27 upstream skills") is corrected to 32 while here.
- **`.claude-plugin/marketplace.json`** — `checkMarketplace()` asserts registry
  and marketplace agree both directions. Regenerated by `pnpm mint`; verify it
  does not hand-list skill names.
- **`packages/core/skills/_shared/`** — owned relative markdown links must
  resolve; any link into a renamed dir (`../writing-plans/…`) is rewritten by the
  sweep.
- **`repository-skill-runtime.test.ts`** — "every registered plugin passes skill
  runtime validation with zero diagnostics"; holds as long as each frontmatter
  `name:` matches its dir and mint regenerates.
- **`moe.yaml` provenance** — `imported_works.*.artifact_roots` reference
  `skills/<dir>` paths and feed `pnpm provenance`; every renamed dir path is
  updated. `bootstrap.skill: using-moe` is unchanged (anchor kept).

## Cross-reference sweep

`subagent-driven-development` alone appears ~461 times across ~153 files
(backlog, plans, wave skills, cross-refs, mint yaml). The sweep is therefore the
bulk of the work, and it must be **atomic**: rename all 30 directories,
frontmatter `name:` fields, and every live reference in one change, then one
`pnpm mint`, then one green gate. Incremental per-skill renaming would leave
dangling backticked refs that fail the strict-marker rule mid-flight.

- **Source of truth for old→new** is the `renamed_from` table in
  `skill-tiers.yaml`. Any archival reference that is deliberately left unswept
  (e.g. a closed backlog entry recording history) resolves through it.
- **In scope:** all live references repo-wide — core skills, other packages'
  skills that invoke by name, wave/orchestration skills, hooks, agent prompts,
  mint yaml, `_shared` links.
- **Excluded:** generated `/plugins/**` (regenerated by `pnpm mint`; never
  hand-edited per repo law #1) and `node_modules`.

## Multi-harness

The rename lives entirely in source (`skills/<dir>/` + frontmatter `name:`).
`pnpm mint` regenerates all eight plugins; no harness-specific naming logic is
added. All new names are lowercase-hyphen and short, within every harness's
discovery constraints. Verification runs `pnpm mint:check` (byte-identical
regen) so drift in any of the eight is caught.

## Back-compat / aliases

**No deprecation aliases.** A clean break. Seven of eight harnesses are preview
intent and the library is pre-1.0; aliases would reintroduce exactly the
name-indirection layer that was rejected earlier in favour of a real rename.
Muscle-memory and old plan docs are addressed by the sweep, not by a
compatibility shim. *(Confirm on review — this is the one reversible policy call
that affects anyone who typed an old name.)*

## Verification plan

1. `pnpm check` (lint + typecheck + test) — green, including the re-anchored
   `metadata.test.ts` and the strict-marker rule.
2. `pnpm mint:check` — `/plugins/` regenerates byte-identically across all eight.
3. `pnpm provenance` — attribution register and license payloads still validate
   with the updated `artifact_roots`.
4. Collision check: no new name shadows a harness built-in command.
5. Spot-invoke a renamed skill (e.g. `/moe:tdd`) to confirm discovery end-to-end.

## Risks

- **`sdd` discoverability.** `tdd` is universal; `sdd` is a moe coinage a human
  scanning the menu learns nothing from, and the name is one signal the model
  matches when deciding to fire a skill (the `description`/`triggers` fields
  carry most of that weight, so auto-firing should hold). Fallback if
  reconsidered: `drive-subagents`.
- **Sweep scale.** Hundreds of references; a missed backtick fails the gate
  loudly (good) but a missed *prose* mention in another package fails silently.
  Mitigation: drive the sweep from the `renamed_from` table and grep-verify zero
  residual old names outside `/plugins/` and closed archival docs.
- **Rule 2 tension.** `.moe-references/` parity is now carried by `renamed_from`,
  not a snapshot diff (the snapshots are not checked out here and gate no CI).
  This is a deliberate, recorded shift of where fidelity lives.

## Out of scope

- Renaming skills in sibling packages (`moe-crew`, `moe-glass`, `moe-backstory`,
  `moe-memory`) — this spec is `packages/core/skills/` only.
- Any change to skill *behaviour*, `description`, or `triggers` content beyond
  what a rename mechanically requires.
- A curation/tier split (retired 2026-09-01; not revived here).

## Open questions for the reviewer

1. `sdd` as drafted, or `drive-subagents`?
2. `cc-config` / `cc-plugins` / `moe-dev` — accept, or prefer spelled-out forms?
3. Clean break confirmed, or ship deprecation aliases for the old names?
