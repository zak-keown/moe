---
slug: contributing-flow-docs
title: The Moe Contributor Flow, Written Down
idea: |
  - Documentation: ideal total flow for contributing to Moe--what to run when and why
status: backlog
size: M
estimate: 3.5-5 h, split across two passes (2.5-3.5 h now, ~1 h after DO-NOW-3)
depends_on: [DO-NOW-1, DO-NOW-3, tc-standards-conformance]
blocks: []
conflicts_with: [moe-tone-and-branding, tc-standards-conformance, installer-hq-dx]
touches: [CONTRIBUTING.md, AGENTS.md, CLAUDE.md, README.md, .gitignore]
decision_needed: yes
---

# The Moe Contributor Flow, Written Down

> Scope note: this is `~/Code/moe`, the Superpowers hard fork. Two unrelated projects
> share the name — `~/Code/tools/moe` and `~/.claude/moe-core`. Neither is in scope.

## The idea

> Documentation: ideal total flow for contributing to Moe--what to run when and why

There is no `CONTRIBUTING.md`, no `AGENTS.md` and no `CLAUDE.md` anywhere in the repo
(verified: `find . -maxdepth 3 -name 'CONTRIBUTING*' -o -name 'CLAUDE.md' -o -name
'AGENTS.md'` returns nothing). Everything a contributor needs is real and written down
— it is just scattered across `ARCHITECTURE.md`, `PARITY.md`, `pnpm-workspace.yaml`
comments and seven package READMEs. The work is to establish the actual flow command by
command, verify each command runs, and land it as one onboarding document plus one
machine-readable rules file.

## Why it matters

Twenty internal people, GitLab origin, no public contributors — which deletes most of an
open-source `CONTRIBUTING.md` and leaves the part that costs real time. A clean checkout
does not fully build without environment fixes that are recorded only in `ARCHITECTURE.md`
§6 and a `pnpm-workspace.yaml` comment, and four load-bearing conventions are invisible
from the code (the PARITY ledger, the generated `/plugins/`, the two-tsconfig rule,
snapshots-not-HEAD). Most contribution here is done by agents, and an
agent gets none of it unless a file it loads at session start says so.

## Current state

**What exists.** Eleven root scripts (`package.json:11-23`), grouped:

| Script | Is | In `pnpm check`? |
|---|---|---|
| `lint` / `lint:fix` | `biome check .` / `--write .` | yes / no |
| `typecheck` | `turbo run typecheck` | yes |
| `test` | `turbo run test` | yes |
| `build` | `turbo run build` | transitively (see below) |
| `check` | `pnpm lint && turbo run typecheck test` | — |
| `tab:build` / `tab:test` | cargo, `packages/tab/Cargo.toml` | **no** |
| `tab:test:bindings` | `tab:build` then pytest over the Python binding | **no, on purpose** |
| `proof:test` | `uv run --project py/proof pytest py/proof` | **no** |
| `mint` | `echo … && exit 1` (`package.json:16`) | **no — does not work yet** |

`turbo.json` makes `test` depend on the package's own `build` and `typecheck` on
dependencies' `build` (`turbo.json:10,14`), so `pnpm check` compiles the workspace on
its way through; CI still runs `pnpm build` as its own stage (`.gitlab-ci.yml:47-50`).
`turbo.json:18-20` defines a `lint` task that nothing at the root invokes — root `check`
uses one whole-tree `biome check .` instead. Verified today on `main`: `pnpm lint` →
exit 0, 299 files, 1 warning, 4 infos. Biome exits 0 on warnings, so warnings are noise,
not a gate.

`pnpm tab:test:bindings` is outside `pnpm test` **deliberately**: it needs the cdylib
built first, and it is the only check that the C ABI rename landed identically in the
Rust FFI, the committed header and all three bindings (`PARITY.md:178-182`).

**What CI verifies** (`.gitlab-ci.yml`): `install`, `lint`, `typecheck`, `test`, `build`
on `node:24`, plus a path-scoped `tab` job on `rust:latest` and a path-scoped `proof`
job on `python:3.12`. **Not in CI:** `tab:test:bindings`, `glass test:chrome`,
`memory test:model`, core's `test:python`/`test:brainstorm`/`test:shell`/`latte:evals`,
and crew's three tmux integration suites — `node:24` has no tmux, so 12 crew tests are
permanently skipped rather than passing (`packages/crew/README.md:259-266`).

**Prerequisites, honestly.** Verified on this machine just now:

| Tool | Needed for | State here |
|---|---|---|
| Node ≥ 24 | everything | v24.19.0 ✓ |
| pnpm 11.23.0 | everything (`packageManager` pin; CI does `corepack enable`, `.gitlab-ci.yml:23`) | 11.23.0 ✓ |
| `uv` ≥ 0.12 | `proof:test` | 0.12.7 ✓ |
| `cargo` ≥ 1.98 | `tab:*` | **not on PATH.** `~/.cargo/bin` does not exist; the binary is at `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo` |
| tmux | crew integration (12 tests) | absent → suites self-skip |
| Chrome | `glass test:chrome` (3 suites, `packages/glass/vitest.config.ts:3-11`) | present ✓ |
| graphviz `dot` | 5 core shell assertions | absent → self-skip |
| `python3` ≥ 3.11 | 6 mint TOML tests; core `test:python` | 3.9.6 → tomllib missing |

The cargo fix, quoted from `ARCHITECTURE.md:230`:

```sh
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
```

Permanent, either of (`ARCHITECTURE.md:232-234`): `brew unlink rustup && brew link
--overwrite rust`, or `rustup default stable` once rustup's shim dir is on PATH. Repo
scripts call bare `cargo` on purpose — a machine-specific path in `package.json` would
not survive a second developer.

**The install gotcha.** pnpm 11 refuses to install until every transitive postinstall is
approved by name under `allowBuilds` (`pnpm-workspace.yaml:17-27`), which supersedes
pnpm 10's `onlyBuiltDependencies` — the old key is silently ignored. `esbuild` arrives via
vitest. Miss one and `pnpm install --frozen-lockfile` fails in CI with
`ERR_PNPM_IGNORED_BUILDS` (`ARCHITECTURE.md:238-244`).

**Main vs the in-flight worktrees.** `packages/core`, `packages/memory` and
`packages/flight` on `main` are stubs; the real imports are on `import/packages-{core,
memory,flight}` under `.claude/worktrees/` and add five more scripts the flow must
mention — core's `test:python`, `test:brainstorm`, `test:shell` and `latte:evals`, all
outside `pnpm test` by choice (`packages/core/README.md:568-597`, core worktree), and
memory's `test:model`, which pulls a ~35 MB model from huggingface.co.

## Prerequisites

- **DO-NOW-1 (Wave B/C integration).** Half the script inventory and every green-test
  number changes when core, memory and flight merge, and each demands root edits —
  `biome.json` globs, a `.gitignore` line, `NOTICE` corrections, a lockfile regen
  (`packages/core/README.md:668-708`, core worktree). Writing the flow first guarantees
  a rewrite.
- **DO-NOW-3 (mint → `/plugins/`).** The mint step is part of the flow and does not
  exist: `pnpm mint` is a deliberate `exit 1`, `/plugins/` is gitignored (`.gitignore:18`)
  and absent, and `.claude-plugin/marketplace.json` already points six plugins at paths
  that do not resolve. **The one part that cannot be written honestly yet.**
- **`tc-standards-conformance`** owns MR templates and `sc-{card}/{slug}` branch naming.
  Land it first and link to it; do not restate it.

## Proposed approach

1. **One `CONTRIBUTING.md`, humans only.** Cheapest; leaves the audience doing most of
   the work — agents — with nothing loaded at session start.
2. **`CONTRIBUTING.md` + root `CLAUDE.md`.** Covers both, but duplicates the flow, and
   `CLAUDE.md` is Claude-only in a repo whose product generates plugins for eleven
   harnesses (`packages/mint/src/adapters/`).
3. **`CONTRIBUTING.md` (human narrative) + `AGENTS.md` (harness-neutral rules) + a
   two-line `CLAUDE.md` that imports it.** Claude Code reads `CLAUDE.md`, not `AGENTS.md`,
   and the documented fix is exactly this import — an `@AGENTS.md` line or a symlink
   ([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)). One source
   of truth, and it matches the repo's own multi-harness stance.

**Recommendation: option 3, in two passes.** Pass one, right after DO-NOW-1, writes
everything except the mint step, which gets a stub that says plainly that `/plugins/`
generation does not exist and points at DO-NOW-3. Pass two replaces the stub with the
real command. Keep `AGENTS.md` under 200 lines — that is the adherence threshold Claude
Code's own docs give, and Moe has eight packages' worth of conventions to fit in it.

Claude Code's `.claude/rules/` path-scoped alternative is closed off today: `.gitignore:27`
ignores all of `.claude/` deliberately, so nothing under it can be committed (open
question 2).

**The content that earns its place.** Four sections: **Setup** (the prerequisite table,
the cargo `export PATH`, the `allowBuilds` failure string); **The inner loop** (`pnpm
check` and what it does not cover, the four commands outside it and why, scoping via
`pnpm --filter @bubstack/moe-crew run test` or `turbo run typecheck test --filter=…`
per `packages/crew/README.md:233-241`, and the CI-coverage statement above stated as
bluntly as it is here); **Repo law**; and **the import contract** below.

Repo law is the section that does not exist anywhere today. Three files carry it —
`ARCHITECTURE.md` (target shape and decisions), `PARITY.md` (the ledger: every upstream,
pinned rev, license, rebrand token), `NOTICE` (attribution) — and the rule that follows:
**edit an imported file without touching `PARITY.md` and the ledger is broken.** Plus four
conventions invisible from the code: `/plugins/` is generated, never hand-edited
(`README.md:39-42`); the two tsconfigs must agree, test-only and upward edges in
`tsconfig.tests.json` or you get `TS6202` (`ARCHITECTURE.md:202-213`); the snapshots in
`../.moe-references/` are the spec, not upstream HEAD (`PARITY.md:8-12`); provenance URLs
stay GitHub while self-referential URLs become GitLab (`PARITY.md:188-200`).

## The import documentation contract

The dominant contribution shape so far, and uniform across all seven imported READMEs. Branch `import/packages-<name>` (or `import/py-proof`), one package per git
worktree under `.claude/worktrees/` — created by the agent harness, not a repo script.
Integrate as a **wave**, not one merge at a time: `87912e0` ("Integrate Wave A: five
packages in, 1420 tests green") sits on five merge commits, because every import wants
root edits plus a lockfile regeneration and they all conflict
(`packages/mint/README.md:236-245`; `packages/core/README.md:702-705`, worktree: "It will
conflict with every other concurrent import and should be regenerated at integration").

What an import must produce, distilled from `crew`, `mint`, `backstory`, `tab`, `glass`,
`core` and `memory`:

1. What the package does, its plugin destination, and "Never hand-edit the generated
   manifest."
2. A **Status:** line with a real test count.
3. `## Forked from` — upstream repo, pinned short rev, license — plus which license
   actually governs where the scaffold disagreed (`packages/glass/README.md:11-18`,
   `packages/crew/README.md:15-23`).
4. For Apache-2.0 inbound, a `### Statement of changes (Apache-2.0 §4(b))` with
   **identical-vs-modified file counts verified by `diff -rq` against the snapshot** —
   `packages/backstory/README.md:24-33` is the model: "99 identifier and prose
   substitutions across 10 of the 26 imported files; the other 16 are byte-identical".
5. `## Layout` — annotated tree, one line per directory.
6. `## What changed on import` — every behaviour-affecting change with its reason.
7. `## Rebrand, and what was deliberately left alone` — a **counted** rename table
   (`packages/crew/README.md:163-170`: 313, 229, 59, 9, 4, 3 by kind), plus `### Where
   the upstream files went` and `### Not imported`, each row carrying a Why.
8. `## Verification` — the exact commands with the exact numbers they produced, and an
   explicit statement of what was *not* verified and how the gap was covered by hand.
   `packages/crew/README.md:233-260` is the model.
9. `## Root changes needed` — root-file edits the import cannot make from its worktree.
10. `## Follow-ups` — known defects, recorded rather than silently carried.

Say plainly in the doc that after DO-NOW-1 the import work is **done** — all 19 upstreams
in `PARITY.md:22-44` are accounted for across the nine packages. The contract is written
down not because more imports are coming, but because it is the discipline that keeps a
fork with no reachable upstream author auditable, and any future re-parity pass will use it.

## Scope boundary

**In:** `CONTRIBUTING.md`, `AGENTS.md`, a two-line `CLAUDE.md` importing it, one link row
in `README.md`. Running every command the doc lists and quoting its real output. The
import contract section.

**Out:**
- MR templates and `sc-{card}/{slug}` branch naming → `tc-standards-conformance`.
- Consumer-side install and HQ DX → `installer-hq-dx`; this item is contributor setup only.
- Voice and tone across the prose → `moe-tone-and-branding`.
- Building the `/plugins/` mint step → DO-NOW-3. This item documents it, nothing more.
- `CODEOWNERS` and GitLab issue templates: `PARITY.md:222-229` says they should exist and
  they do not. **No backlog slug owns them** — they need their own item.
- A git-hooks mechanism. `ARCHITECTURE.md:196` promises "one root-level mechanism"; there
  is none (no lefthook config, `core.hooksPath` unset, no active hooks in `.git/hooks`).
  **Also unowned.** The doc should say nothing runs on commit rather than paper over it.
- CLA, code of conduct, issue-triage policy, "good first issue". Twenty internal people
  on a self-hosted GitLab with no public contributors; none of it applies.

## Open questions for Zak

1. **`AGENTS.md` + a `CLAUDE.md` import, or just `CLAUDE.md`?** Cheap either way. The
   fork's whole product is cross-harness, which argues for the harness-neutral file; a
   single `CLAUDE.md` is one less thing to keep in sync.
2. **Narrow `.gitignore:27` from `.claude/` to `.claude/worktrees/`?** It would let
   `.claude/rules/` and a shared `.claude/settings.json` be committed, at the cost of the
   `git add -A` safety that `.gitignore:25-26` names explicitly. Recommend no for now.
3. **Should `pnpm check` become the whole gate?** Today a contributor can be green on
   `pnpm check` and have broken the Rust crate or the C ABI bindings; CI catches it
   path-scoped, but only after push. Either add a `check:all` that also runs `tab:test`,
   `tab:test:bindings` and `proof:test`, or document that `pnpm check` is deliberately
   the Node-only gate. This changes what the doc tells people to run before an MR.

## Effort

| Step | Time |
|---|---|
| Run and record every command on a clean checkout, incl. the cargo PATH fix | 60-75 min |
| Write `CONTRIBUTING.md` | 60-90 min |
| Write `AGENTS.md` + two-line `CLAUDE.md` | 30-45 min |
| Distil the import contract from seven READMEs | 30 min |
| `README.md` link row and cross-refs | 5 min |
| Pass two: replace the mint stub after DO-NOW-3 | 20-30 min |

**Total 3.5-5 h.** Slower if `tab:test:bindings` needs a cold `cargo build --release` and
the C ABI check fails first time (that becomes a bug hunt, not a docs task), or if you
install tmux, graphviz and python3 ≥ 3.11 so the doc can quote real numbers for the ~25
currently-skipped tests instead of "skips here".

## Verification

- `git ls-files CONTRIBUTING.md AGENTS.md CLAUDE.md` lists all three.
- Every fenced command in `CONTRIBUTING.md` was run on a fresh `git clone` into a temp
  dir and reproduced the stated exit code and count. At minimum: `pnpm install`,
  `pnpm check`, `pnpm tab:test`, `pnpm tab:test:bindings`, `pnpm proof:test`.
- In a Claude Code session, `/context` lists `CLAUDE.md` under **Memory files** — the
  check the docs themselves prescribe
  ([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)).
- Optional and cheap, and it catches the real drift mode: a `docs` job in `.gitlab-ci.yml`
  that greps every `pnpm <script>` token out of `CONTRIBUTING.md` and asserts each names a
  live script in root `package.json`. A rename then fails CI instead of rotting the doc.
