# @bubstack/moe-backstory

Recover a behavioral spec from a codebase that never had one. Reads source,
docs, SDKs, community chatter, runtime behavior, git history, test suites, UI and
machine-readable contracts, then emits behavioral specs, test vectors,
acceptance criteria and a provenance trail — describing *what* the software does,
not *how* this particular codebase does it.

Ships as the **`moe-backstory`** plugin, generated into `/plugins/moe-backstory`
by `@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** imported. Content only — 22 skills, 2 agents, 2 commands, 11,358
lines of Markdown. No TypeScript, no build step, no tests.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `greenfield` | `6e6d4b4` | Apache-2.0 |

Snapshot lives in `../../../.moe-references/greenfield` (gitignored). The
snapshot is the spec, not upstream `main`. See [PARITY.md](../../PARITY.md).

### Statement of changes (Apache-2.0 §4(b))

Apache-2.0 requires that modified files carry prominent notice of the change.
**Every file under `skills/`, `agents/` and `commands/` in this package is a
modified copy of the corresponding file in `greenfield` at `6e6d4b4`.** The
modification is the rebrand described below — 99 identifier and prose
substitutions across 10 of the 26 imported files; the other 16 are
byte-identical to `6e6d4b4` (verified with `diff -rq` against the snapshot). No
methodology, no prompt, no gate, no threshold and no output format was changed.
Upstream `LICENSE` (Copyright 2026 Prime Radiant, Inc.) is retained verbatim.

## Layout

```
skills/           22 skills, one SKILL.md each. The methodology.
agents/           analyzer (the workhorse) and sanitizer (rewrites raw → output).
commands/         analyze.md — the seven-layer pipeline. sanitize.md — the re-run.
docs/history/     Upstream README, ABOUT.md and catalog-info.yaml. Verbatim record.
LICENSE           Apache-2.0, upstream copyright, verbatim.
```

The 22 skills, grouped the way the pipeline uses them:

| Group | Skills |
|---|---|
| Cross-cutting | `analysis-pipeline`, `provenance-methodology`, `validation-methodology` |
| L1 evidence | `autonomous-discovery`, `source-analysis`, `doc-research`, `ecosystem-analysis`, `community-intelligence`, `runtime-observation`, `container-execution`, `binary-analysis`, `git-archaeology`, `test-suite-analysis`, `visual-exploration`, `contract-detection` |
| L2–L3 synthesis | `multi-source-synthesis`, `behavioral-spec-writing` |
| Gates | `source-completeness`, `second-pass-review`, `fidelity-validation` |
| L5 sanitization | `spec-sanitization` |
| Re-runs | `incremental-analysis` |

## Two agents, thirty-odd roles

The whole pipeline runs on two agent definitions. `analyzer` is dispatched under
role names — 29 are listed in `docs/history/UPSTREAM-README.md`, and
`commands/analyze.md` names several the upstream README does not
(`integration-test-miner`, `web-ui-explorer`, `ux-documenter`,
`binary-surveyor`, `binary-deep-analyzer`, `test-reader`, `test-runner`,
`contamination-judge`) — each with a role prompt naming which skill to follow;
`sanitizer` handles Layer 5 and remediation. The roles are prompt-level, not
file-level — so `agents/` has two files, and `commands/analyze.md` (1,396 lines)
carries the role prompts. That is why the command file is the largest thing here
and why it must not be treated as documentation.

## What changed on import

**The two commands are imported. The scaffold README and the survey behind it
said "22 skills and 2 agents" and stopped there.** Upstream ships
`commands/analyze.md` and `commands/sanitize.md`, and `analyze.md` alone is 1,396
lines containing every role prompt, every quality gate and the whole workspace
contract. Without it the 22 skills are methodology with nothing to drive them.
Upstream's `.claude-plugin/plugin.json` does not enumerate commands — Claude Code
discovers `commands/` by convention — which is the likely reason the survey
missed them.

**Nothing else structural changed.** No files were split, merged, renamed or
reflowed. There is no source tree, no toolchain to normalize, no test runner to
convert, and no `tsconfig.json` — the strict base has nothing to typecheck here.
`package.json` carries a single `lint` script; `turbo run typecheck test` simply
skips this package.

**Relocated to `docs/history/`, verbatim:**

- `README.md` → `UPSTREAM-README.md`. The user-facing pipeline table and 29 of
  the analyzer role names live here. Kept because this fork has no reachable
  upstream author, and this is the only place upstream states what the plugin
  claimed to do in its own words.
- `ABOUT.md` → `UPSTREAM-ABOUT.md`. A generated project-map descriptor
  ("Maintained by the maintaining-project-map skill. Do not hand-edit;
  regenerated"). **That skill is in none of the 19 pinned snapshots** — only its
  output is, in nine of them. There is nothing in this fork that can regenerate
  the file, so hand-editing it would produce a permanently stale artifact
  claiming to be generated. Left as the upstream record instead.
- `catalog-info.yaml` → `UPSTREAM-catalog-info.yaml`. A Backstage component
  descriptor for a *repository* — `owner: user:obra`, `system: superpowers`, and
  a `prime-radiant.com/repo-map-rev` annotation pointing at a commit in
  someone else's repo map. `packages/backstory` is not a repository, so a
  per-package descriptor has no referent here. See follow-ups.

**Dropped:**

- `.claude-plugin/plugin.json` — `@bubstack/moe-mint` generates manifests. Read
  first as a checklist: its 22 `./skills/*` entries and 2 `./agents/*.md` entries
  match what was imported exactly, no additions and no omissions.
- `.gitignore` — one line, `inspo`, for a directory that does not exist in the
  snapshot. The root `.gitignore` governs.
- `skills/.gitkeep`, `agents/.gitkeep`, `commands/.gitkeep` — placeholders for
  directories that now hold 26 files.

Upstream ships no `.private-journal/`, no `.github/` and no CI, so there was
nothing to exclude on those fronts and no workflows to report.

## Rebrand, and what was deliberately left alone

99 substitutions across 10 files. Applied longest-token-first, four rules only:

| Kind | Upstream | Moe | Count |
|---|---|---|---|
| Plugin namespace for agent + skill refs | `greenfield:` | `moe-backstory:` | 78 |
| Container name prefix | `greenfield-${WORKSPACE}-target` | `moe-backstory-${WORKSPACE}-target` | 17 |
| Spec-frontmatter metadata key | `greenfield_version` | `backstory_version` | 1 |
| Prose | `Greenfield` | `Backstory` | 3 |

The first is the load-bearing one: it is `subagent_type` and the agents'
`skills:` frontmatter, so a stale `greenfield:analyzer` is a dispatch that fails
at runtime, not a cosmetic miss. The third is an interface change in the other
direction — it is written *into* every spec file the pipeline produces, so
workspaces created by upstream `greenfield` will read as version-less to this
fork and vice versa. `incremental-analysis` diffs against that frontmatter; a
workspace produced by the upstream plugin should be re-analyzed from scratch, not
resumed.

**No brand token appears in any skill `name:` field.** All 22 are descriptive
(`source-analysis`, `git-archaeology`, …) and each matches its directory name.
None collides with any of the 30 distinct `name:` values found in the six
repositories bound for `@bubstack/moe-core` — checked against the pinned
snapshots, not guessed. (30, not the 28 ARCHITECTURE.md projects: two of the 30
are not skills at all. `example-workflow` is inside
`superpowers-developing-for-claude-code/examples/full-featured-plugin/`, and
`Skill-Name-With-Hyphens` is a frontmatter example quoted inside the body of
`superpowers/skills/writing-skills/SKILL.md`. Both are noise in the census, and
neither is a name backstory could collide with.)

**`Cobra` in `skills/source-completeness/SKILL.md` is not the upstream author.**
It is the Go CLI framework, in a list beside `clap` and `argparse`. A
case-insensitive `obra` sweep hits it. This is the concrete reason the rebrand
here is four explicit rules rather than a token sweep.

**Untouched: `LICENSE` and everything in `docs/history/`.** They describe a
project that *was* called greenfield, owned by `user:obra`, distributed through
`prime-radiant-marketplace`. Rewriting them would falsify the record and, for
`LICENSE`, break the copyright notice Apache-2.0 requires retained. Upstream's
GitHub URLs in `docs/history/UPSTREAM-README.md` are provenance and stay GitHub;
there were no self-referential URLs anywhere in `skills/`, `agents/` or
`commands/` to move to GitLab.

**The command names `analyze` and `sanitize` keep their upstream names.** They
describe what they do and neither collides with anything in the fork — none of
the six `moe-core` repositories ships a `commands/` directory at all. See
follow-ups for the ambiguity that remains.

**The skill vocabulary keeps its upstream names.** `workspace/raw/`,
`workspace/output/`, `workspace/provenance/`, the `SPEC-*` / `TV-*` id prefixes,
the seven layer numbers and the two gate numbers are all referenced across
multiple files and buy no identity by changing. Same reasoning glass applied to
`chrome-ws`.

## Follow-ups

- **`mint` must emit `commands/`.** Upstream's `plugin.json` enumerates `agents`
  and `skills` explicitly and relies on convention for commands. If
  `@bubstack/moe-mint` generates manifests from an enumerated config, this
  package's two commands are exactly the thing a skills-and-agents-shaped
  generator will silently drop, and the failure is invisible until someone types
  `/analyze`.
- **`/analyze` and `/sanitize` are generic names in a shared namespace.** Nothing
  in the fork collides today, but both are the kind of verb a future `moe-core`
  or `moe-flight` command would want. Claude Code namespaces them as
  `/moe-backstory:analyze`; the bare forms are first-come-first-served across
  installed plugins. Worth settling as a fork-wide convention before a second
  package claims one.
- **One Backstage descriptor for the monorepo, not nineteen inherited ones.**
  `docs/history/UPSTREAM-catalog-info.yaml` is the first of these to land. If Moe
  registers in a service catalog it wants a single root `catalog-info.yaml`
  describing one component with Moe owners — not a per-package copy of an
  upstream repo descriptor. Decide once, at the root, rather than per import.
- **`ABOUT.md` is a generated artifact whose generator was not forked.** Nine of
  the 19 snapshots ship one, so four other packages will face this same call.
  Either fork `maintaining-project-map` from wherever upstream keeps it and run
  it over `packages/*`, or accept that every `ABOUT.md` in the fork is history.
  A per-package coin flip is the one outcome to avoid.
- **No tests, and none are obviously missing.** Nothing here executes. The
  invariants that *could* be checked mechanically are structural: every
  `moe-backstory:<skill>` reference in `agents/` and `commands/` resolves to a
  `skills/<name>/SKILL.md`, and every skill's `name:` matches its directory. Both
  hold today — the 24 distinct `moe-backstory:*` references resolve to the 22
  skills plus the 2 agents, with nothing dangling and nothing orphaned. A
  `mint`-level manifest validation would cover that for every content package at
  once, and is a better home for it than a vitest suite in a package with no
  runtime.
