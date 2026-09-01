# Parity inventory

The fork's ledger. Every upstream repository, the exact revision forked, its
license, and where it lands. With no reachable upstream author for this fork,
this file is how a pre-fork decision gets reconstructed: find the artifact, not
the person.

**Snapshots are the spec, not upstream HEAD.** The 19 repositories live in
`../.moe-references/` (gitignored). They are shallow clones — one commit each, so there
is no upstream history to preserve and no `git subtree` or `filter-repo` import
to attempt. Do not consult upstream `main`: parity against a moving target is
unfalsifiable.

Regenerate the pinned column with:

```sh
cd ../.moe-references && for r in */; do n=${r%/}
  printf '| `%s` | %s | %s |\n' "$n" "$(git -C $n rev-parse --short HEAD)" "$(git -C $n log -1 --format=%cs)"
done
```

## Map

| Upstream repo | Pinned | Date | License | → lands as |
|---|---|---|---|---|
| `superpowers` | `b36e082` | 2026-08-12 | MIT | `@bubstack/moe-core` |
| `superpowers-lab` | `51111f7` | 2026-06-01 | MIT | `@bubstack/moe-core` |
| `superpowers-developing-for-claude-code` | `74afe93` | 2025-12-03 | MIT | `@bubstack/moe-core` |
| `iterative-development` | `c05889a` | 2026-06-06 | Apache-2.0 | `@bubstack/moe-core` |
| `the-elements-of-style` | `05fc4f0` | 2026-08-12 | Public domain | `@bubstack/moe-core` |
| `double-shot-latte` | `dfe7567` | 2026-02-25 | MIT | `@bubstack/moe-core` (hooks) |
| `mattpocock-skills` | `6654f6b` | 2026-08-24 | MIT | `@bubstack/moe-core` |
| `open-gsd/gsd-core` | `05092ff3` | 2026-09-01 | MIT | `@bubstack/moe-core` (10 references only — see below) |
| `greenfield` | `6e6d4b4` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-backstory` |
| `episodic-memory` | `1075769` | 2026-05-21 | MIT | `@bubstack/moe-memory` |
| `private-journal-mcp` | `016953f` | 2026-08-11 | MIT | `@bubstack/moe-memory` |
| `gauntlet` | `91b6f7e` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-flight` |
| `superpowers-evals` | `114f725` | 2026-08-25 | **none — see below** | `@bubstack/moe-flight` |
| `everyharness` | `4f7c5e2` | 2026-08-15 | MIT | `@bubstack/moe-mint` |
| `everyharness-container` | `2467bd7` | 2026-08-11 | MIT | `infra/container` |
| `claude-session-driver` | `d97d1eb` | 2026-06-14 | MIT | `@bubstack/moe-crew` |
| `superpowers-chrome` | `782358e` | 2026-08-07 | MIT | `@bubstack/moe-glass` |
| `obol` | `28e3dba` | 2026-08-06 | Apache-2.0 | `@bubstack/moe-tab` |
| `smevals` | `0c28dc6` | 2026-08-11 | MIT | `py/proof` |
| `superpowers-marketplace` | `1ab7b8e` | 2026-08-12 | MIT | `.claude-plugin/marketplace.json` |
| `prime-radiant-marketplace` | `49a45ef` | 2026-06-06 | Apache-2.0 | `.claude-plugin/marketplace.json` |

### `open-gsd/gsd-core`, evaluated in full and mostly declined

A census read all **71** of its `gsd-*` skills. Nine `debugger-*.md` references and
`security-asvs-levels.md` came in; nothing else did, and the ratio is the point —
this is what "provenance exists to be spent" looks like when the answer is mostly
*no*.

**What came in** (all MIT, pinned at `05092ff3`, `gsd-core/references/`): the nine
debugger references now in `packages/core/skills/systematic-debugging/`, and
`security-asvs-levels.md` in `packages/core/skills/requesting-code-review/references/`.
They were imported **from upstream, not from a local install** — an install has no
revision to pin and no repo to pin it against. Only their loader wiring was
rewritten: upstream's line 3 named which agent `@-include`d each file from which
phase of a state machine this fork does not have, so each now names the phase of
`systematic-debugging` that reaches it instead. The technique content is upstream's.

One further substitution, recorded so the sentence above stays true: three files
said `npm-tier` where they meant an npm-sized test suite. This repo enforces a
`tier` vocabulary rule by test — `tier` is not the name of a workflow depth here —
so they now say `npm-scale`, which is what upstream meant.

**No new skill directory**, which is why this import cost no fidelity assertion.
`skill-tiers.yaml`'s `imported:` map and its pinned key set are untouched, and
`from:` gains no sixth value. Reference files inside an existing skill are not
skills.

**What was declined, and why.** Roughly 70 of the 71 skills duplicate what this
fork already ships. The phase runtime — 10 MB, 206 CJS modules into a
TypeScript-only pnpm workspace, 39 agents, a second planning methodology competing
with `writing-plans` / `executing-plans`, and a `.planning/` state machine
`sequencing-plans` already covers — was rejected outright.

**One honest caveat, recorded rather than hidden.** `debugger-sbfl.md` needs
per-test coverage — which test executed which line. Checked 2026-09-01: this repo
configures no coverage at all, and TC's shared Angular jest config sets a single
global `coverageThreshold`, which is aggregate by construction. So that technique
will usually skip itself, which upstream designed it to do. It is the reference
that fires least; the other nine are unconditional.

### Excluded

| Upstream repo | Pinned | Why |
|---|---|---|
| `superpowers-autoresearch` | `6e6f33f` | 16 MB of research campaigns, logs, raw captures and reports. Data, not code, and no LICENSE. Kept as a reference snapshot only. |

## Upstream tracking, frozen

**Decided 2026-08-31.** This ledger is **frozen at the upstreams it already
names.** No new drift-tracking rows.

On the record because it reverses a pattern three backlog items were about to
extend. Every upstream here is pinned to a shallow, single-commit snapshot in
`../.moe-references/`, and this file's own rule is that the snapshots are the
spec, not upstream HEAD — Moe pulls from nobody. So what the ledger holds is not
a dependency. It is provenance, and provenance exists to be **spent**: every row
resolves, eventually, to keep, prune, or rewrite. A ledger that only grows is an
archive, and an archive of decisions nobody makes is the maintenance tax without
the benefit.

**Carve-out, non-negotiable.** The freeze covers drift tracking only. License and
attribution obligations — `NOTICE`, the per-package `licenses/` directories, an
Apache-2.0 statement of changes — are legal requirements and are unaffected. New
inbound material still records its provenance here.

**What the freeze changes elsewhere.** `tc-standards-conformance` may no longer
justify a pinned-SHA-plus-drift-CI mechanism by citing this file as precedent;
`tc-governance-integration`'s request for a watch-only row kind is withdrawn;
`skill-set-fidelity-refactor`'s `imported:` `from:` value set stays at five
names.

### Inherited skills, resolved

The freeze's first payment. The same external panel review recommended removing
six inherited skills. Each was argued against the file rather than the name, and
**all six are kept.** Recorded so the argument is not re-run from scratch.

| Skill | Objection | What the file says | Resolution |
|---|---|---|---|
| `brainstorming` | Meta-cognitive; demote to a slash-command | `SKILL.md:14-20` is the `<HARD-GATE>` — the human approval gate — plus a seven-row table of label-gaming | **Keep.** An approval gate that fires only when invoked is not a gate |
| `receiving-code-review` | Meta-reflection; frontier models do not need it | `:27-38` bans "You're absolutely right!" and "Great point!" — an anti-sycophancy catch | **Keep.** Claude Code's own system prompt ships an independently authored version of the same catch |
| `writing-plans` | Wrong shape for long-horizon attention | External-memory artifact — `Files:` / `Interfaces:` / `Consumes:` / `Produces:`, because "a task's implementer sees only their own task" (`:96-99`) | **Keep.** The objection is an argument *for* the artifact |
| `using-moe` | Self-referential loader loop | mint's `bootstrap: { skill: }` target, injected deterministically at session start | **Keep.** The only skill already meeting the explicit-invocation bar |
| `subagent-driven-development` | 568 lines, wasteful even at frontier | Bodies load on demand; resident cost is one description, ~55 tokens (ARCHITECTURE.md §2) | **Keep.** And `writing-plans:61,166` REQUIRE it, so a tier move would trip `it("no core-tier skill REQUIREs an everything-tier skill")` in `metadata.test.ts` — cited by test name, not line, because the fidelity refactor moves it from `:475` to `:687`, and `:475` then lands on an unrelated passing test |
| `dispatching-parallel-agents` | Harmful below frontier | Deliberately invoked, by name, when you already know you want it | **Keep at `everything`** — which is `skill-tiers.yaml`'s own criterion. See `parallel-execution-option` |

## License exposure

Everything forked is MIT, Apache-2.0, or public domain, and all three require
retaining the notices — so upstream `LICENSE` files travel with the code they
cover, under each package, and `NOTICE` at the root carries attribution. Apache-2.0
also requires stating that files were changed; the rebrand does change them.

**One item, knowingly accepted.** `superpowers-evals` ships **no `LICENSE` file
and no `package.json` license field**. No grant of rights has been located, so the
default is all rights reserved. It is the single largest body of forked material —
796 files, 17 MB, roughly half the rebrand surface — and it lands in
`@bubstack/moe-flight` alongside Apache-2.0 `gauntlet`.

**Decision, 2026-08-31, Zak Keown: imported anyway, on internal-use grounds.** Moe
is an internal tool for roughly twenty people in one company, and `flight` is not
distributed. That is a low-magnitude risk the company accepts.

The risk is not uniform, and the boundary is distribution, not use. These are the
conditions under which the decision above stops holding:

| Condition | Effect |
|---|---|
| `@bubstack/moe-flight` published to any registry — npm, the GitLab Package Registry, anywhere | Decision void. Do not publish. |
| Moe open-sourced, or any part of `flight` shipped to a customer or contractor | Decision void. Revisit first. |
| Moe distributed outside the company by any other means | Decision void. |
| Prime Radiant states a license | Risk goes to zero. Update this section. |

Enforced in code, not only in prose: `@bubstack/moe-flight` and its two frontends
carry `"private": true`, and `flight` is absent from
`.claude-plugin/marketplace.json`. Anyone removing either should read this section
first.

**The cheap resolution is exhausted, not pending.** A license request was opened on
`prime-radiant-inc/superpowers-evals` around 2026-08-01 and is still unacknowledged
thirty days later. Do not open another; that path has been tried.

Two things follow, and they point in opposite directions:

- **It strengthens the position.** There is a documented, public, good-faith attempt
  to clarify, made before the fork and left unanswered.
- **It grants nothing.** Silence is not permission. Thirty days of no response is
  evidence that the repository is inattentive or abandoned — not evidence of a
  grant. Anyone reading this later should not round "we asked and they did not
  answer" up to "they said it was fine."

So the *Prime Radiant states a license* row above is now unlikely to ever fire. The
distribution boundary is not a stopgap until an answer arrives; it is the permanent
control. Treat it that way.

This is also the second independent signal that the upstream is unreachable — the
first being that every snapshot in `../.moe-references/` is a shallow, single-commit
clone with no history to consult. Which is exactly why this file exists: when there
is no author to ask, the written record is the only way a decision survives.

## Rebrand footprint

19 in-scope repositories, 2964 files. **1632 of them (55%) contain at least one
brand token** — `superpowers`, `gauntlet`, `quorum`, `obol`, `greenfield`,
`everyharness`, `elements-of-style`, `episodic-memory`, `private-journal`,
`double-shot-latte`, `claude-session-driver`, `smevals`, `obra`, `prime-radiant`.

| Upstream repo | Files to touch |
|---|---|
| `superpowers-evals` | 796 |
| `gauntlet` | 276 |
| `superpowers` | 125 |
| `obol` | 95 |
| `everyharness` | 75 |
| `episodic-memory` | 59 |
| `superpowers-chrome` | 50 |
| `the-elements-of-style` | 31 |
| `smevals` | 23 |
| `iterative-development` | 22 |
| `claude-session-driver` | 22 |
| `greenfield` | 15 |
| `private-journal-mcp` | 14 |
| `superpowers-developing-for-claude-code` | 9 |
| `double-shot-latte` | 7 |
| `prime-radiant-marketplace` | 5 |
| `superpowers-marketplace` | 3 |
| `everyharness-container` | 3 |
| `superpowers-lab` | 2 |

Half the work is one package. Import `flight` last, once the license question is
settled and the rename conventions have been proven on smaller packages.

### Identifiers that change

Not text substitutions — each is a breaking interface change, and each needs a
deliberate mapping rather than a regex:

| Kind | Upstream | Moe |
|---|---|---|
| MCP server key | `episodic-memory` | `moe-memory` |
| MCP server key | `chrome` | `moe-glass` |
| bin | `episodic-memory`, `-index`, `-search`, `-mcp-server` | `moe-memory` + subcommands |
| bin | `private-journal-mcp` | folded into `moe-memory` |
| bin | `gauntlet` | `moe-flight` |
| bin | `quorum`, `evals-appliance` | `moe-flight` subcommands |
| bin | `everyharness` | `moe-mint` |
| bin | `obol` | `moe-tab` |
| bin | `superpowers-chrome-mcp` | `moe-glass` |
| npm package | `@primeradianthq/obol` | `@bubstack/moe-tab` (`workspace:*`) |
| PyPI package | `smevals` | `moe-proof` |

### Identifiers confirmed by the imports of 2026-08-31

Surfaced by the nine package imports; each is as breaking as a bin rename for
anyone holding an artifact produced by the upstream tool. On-disk paths, wire
keys and resolver-visible names qualify; a source-level type rename does not,
and the one that appears here is marked.

| Package | Kind | Upstream | Moe |
|---|---|---|---|
| crew | env vars (229 occurrences) | `CSD_*` | `MOE_CREW_*` |
| crew | bundle | `csd.cjs` | `moe-crew.cjs` |
| mint | config file | `everyharness.yaml` | `moe-mint.yaml` |
| mint | state dir | `.everyharness/` | `.moe-mint/` |
| mint | generated hooks dir | `hooks/everyharness/` | `hooks/moe-mint/` |
| mint | env vars | `EH_PLUGIN_NAME`, `EH_PLUGIN_ROOT` | `MOE_MINT_PLUGIN_NAME`, `MOE_MINT_PLUGIN_ROOT` |
| mint | container image | GHCR image | `registry.gitlab.tcdevops.com/...` — must exist before `moe-mint test` works without `--image` |
| tab | cargo crates | `obol-core`, `obol-cli`, `obol-ffi` | `moe-tab-core`, `moe-tab-cli`, `moe-tab-ffi` |
| tab | C ABI symbols + cdylib | 4 exported symbols, `libobol_ffi` | 4 renamed symbols, `libmoe_tab_ffi` |
| tab | env vars | `OBOL_*` | `MOE_TAB_{PRICING_DIR,LIB,WHEEL_PLAT}` |
| tab | XDG data dir | `$XDG_DATA_HOME/obol` | `$XDG_DATA_HOME/moe/tab` |
| tab | Go module path, PyPI dist/import | obol forms | moe-tab / `moe_tab` |
| proof | module dir | `smevals/` | `moe_proof/` |
| core | skill-tool namespace (32 occurrences, 11 targets) | `superpowers:<skill>` | bare backticked name — no prefix |
| core | bootstrap skill name, load-bearing in five resolvers | `using-superpowers` | `using-moe` |
| core | state dir **in the user's repo** | `.superpowers/{sdd,brainstorm}/` | `.moe/{sdd,brainstorm}/` |
| core | taught output path, 57 occurrences, prose only | `docs/superpowers/{plans,specs,iterations}/` | `docs/moe/…` |
| memory | data dir + the env var pointing at it | `~/.config/superpowers/`, `PERSONAL_SUPERPOWERS_DIR` | `~/.config/moe/memory/`, `MOE_DATA_DIR` |
| memory | env vars, 14 distinct | `EPISODIC_MEMORY_*` | `MOE_MEMORY_*` |
| memory | plugin-id prefix | `episodic-memory@episodic-memory-dev` | `moe-memory@moe` |
| memory | marketplace name | `episodic-memory-dev` | `moe` |
| memory | Claude Code tool name (two renamed identifiers in one string) | `mcp__plugin_episodic-memory_episodic-memory__search` | `mcp__plugin_moe-memory_moe-memory__search_conversations` |
| memory | Codex's underscore-normalised tool name | `mcp__episodic_memory__` | `mcp__moe_memory__` |
| flight | state dir, on disk, per project | `.gauntlet/` | `.moe-flight/` |
| flight | env vars, 26 distinct | `GAUNTLET_*` | `MOE_FLIGHT_*` |
| flight | `config --json` object key — a wire surface | `.gauntlet` | `.flight`, **not** `.moe-flight` (not a legal property access) |
| flight | static-report hydration id | `__GAUNTLET_RUN__` | `__MOE_FLIGHT_RUN__` |
| flight | XDG cache namespace, shared with glass | `~/.cache/superpowers/` | `~/.cache/moe/` |
| flight | Chrome profile — never `moe-glass`, sharing a `--user-data-dir` is what upstream warns against | `gauntlet` | `moe-flight` |
| flight | usage-sidecar wire row type, cross-package with tab | `obol.usage` | `moe.tab.usage` |
| flight | skill frontmatter `name:` | `writing-gauntlet-stories` | `writing-flight-stories` |
| flight | **source-only**, not artifact-visible — see below | `VetResult`, `VetStatus`, `VET_STATUSES` | `VerdictResult`, `VerdictStatus`, `VERDICT_STATUSES` |

**The `obol.usage` read alias expired on 2026-09-01.** Flight is the only in-tree
producer and now writes `moe.tab.usage`; tab therefore accepts only that canonical
row type. The temporary compatibility branch and its test were removed rather than
kept as a permanent tombstone for an artifact Moe never shipped.

**Dead `obol` import artifacts were pruned on 2026-09-01.** Thirteen transcript
fixtures for the seven dialects upstream had already deleted, plus the inert Go
module and manylinux-wheel publication scripts, had no live consumer. Their source
and intent remain recoverable from the pinned snapshot and `packages/tab/docs/history/`;
the live tree now carries only fixtures and scripts exercised by Moe. The same pass
declared pytest as the Python binding's development dependency; without it the
documented `pnpm tab:test:bindings` gate could not run in a fresh checkout.

**Dead Flight sync scaffolding was removed on 2026-09-01.** The per-session Chrome
override factory is the sole live API, so the unused module-global singleton and
load-time compatibility snapshots are gone. The same cleanup removed an uncalled
private popup helper and narrowed `models.available` source attribution to its two
reachable states. The underlying popup target primitive and its regression coverage
remain live.

**One-shot import gates were retired on 2026-09-01.** Core no longer sweeps the
live tree for names and paths that the rebrand already removed, and mint no longer
replays brochure output counts or pins the CLI smoke test to the full adapter list.
Current structural, safety, generated-output, and behavior contracts remain tested;
the brochure now documents commands and durable outputs without a transcript that
rots whenever the adapter registry changes.

**Live import reports were refreshed on 2026-09-01.** Resolved root-change and
follow-up bullets were removed, and Flight's docs now distinguish its imported
QA/UI/dashboard/tab surfaces from the quorum lab and appliance orchestration it
still refuses. These are documentation corrections only; no additional upstream
surface crossed the distribution boundary.

**`vet` was not a brand token and was renamed anyway.** It is a *pre-`gauntlet`*
name for the project — upstream's `bun.lock` still recorded the workspace as
`"vet"` — so it is brand residue that the token list simply never caught, and
`Verdict*` is both descriptive and the vocabulary the QA and lab halves already
share. 135 substitutions. It is listed as source-only because the on-disk
`result.json` never carried the token (`status`, `scenario`, `runId`), so unlike
every other row above it breaks no artifact. Recorded here because renaming a
token that is *not* on the list is a judgment call, and an unrecorded judgment
call is indistinguishable from an over-rename.

**`PRIVATE_JOURNAL_PATH` is the reverse call: a brand token deliberately kept.**
Unsetting an override does not error, it silently relocates data — a
containerised deployment writing to `/data/journals` would start writing to
`cwd` with no message. So `moe-memory` honours the upstream name,
`MOE_MEMORY_JOURNAL_PATH` wins when both are set, and a deprecation warning
prints once per process.

**`.superpowers/` → `.moe/` and `~/.config/superpowers/` → `~/.config/moe/memory/`
are user-data migrations, not renames.** Neither has a fallback read. core's
`sdd-workspace` will create a fresh empty directory beside the user's existing
SDD ledgers; memory's `findLegacyDataDir()` at least detects the old directory
and both `moe-memory sync` and `moe-memory doctor codex` print where it is,
because the alternative is silently re-downloading the model, re-embedding
everything and re-running *paid* summarisation over the user's whole history.
Both belong in a release note.

**The C ABI rename is the load-bearing one.** It has to land identically in the
Rust FFI, the committed header, and all three bindings, or nothing `dlopen`s. It is
verified by `pnpm tab:test:bindings`, which is deliberately outside `pnpm test`
because it needs the cdylib built first.

Watch for these beyond source: `${CLAUDE_PLUGIN_ROOT}` paths in plugin manifests,
skill frontmatter `name:` fields, hook script paths, and `catalog-info.yaml`
service identifiers.

## GitHub → GitLab

Origin is GitLab, self-hosted at `gitlab.tcdevops.com`. Upstream stays on
GitHub. **Two kinds of URL, opposite treatment** — a blanket
find-and-replace gets this wrong:

| URL kind | Example | Treatment |
|---|---|---|
| Provenance | "derived from `github.com/obra/superpowers`" | **Keep.** Rewriting it destroys attribution the licenses require. |
| Self-referential | `homepage`, `repository`, `bugs`, badges, issue links, clone instructions | **Rewrite** to GitLab. |

`README.md` badge rows are the densest offenders — `smevals` alone carries four
pointing at PyPI, GitHub releases, and GitHub Actions.

### CI to port

11 workflows across 7 repos, all of which are replaced by one root
`.gitlab-ci.yml`:

| Upstream repo | Workflows |
|---|---|
| `obol` | `ci.yml`, `release.yml`, `crates-release.yml`, `pypi-release.yml` — **resolved 2026-08-31: not ported.** The two release workflows are void under the no-public-publishing decision. `ci.yml` is covered by the turbo tasks; its five-language equivalence gate is not yet wired and needs an image with cargo + node + go + python. |
| `smevals` | `test.yml`, `publish.yml` |
| `claude-session-driver` | `ci.yml` |
| `everyharness` | `ci.yml` |
| `everyharness-container` | `build.yml` |
| `gauntlet` | `check.yml` |
| `superpowers-evals` | `test.yml` |

The four release workflows publish to crates.io and PyPI. **Decided 2026-08-31:
deleted, not ported.** Moe publishes nothing publicly; anything that must be
consumable outside the repo goes to the GitLab instance registry under
`@bubstack`. Same boundary as the License exposure decision above.

### Not ported

| Path | Why |
|---|---|
| `superpowers/.github/FUNDING.yml` | Solicits sponsorship for the upstream author. Delete. |
| `superpowers/.github/ISSUE_TEMPLATE/` | Rebuild as GitLab issue templates rather than translate. |
| `superpowers-evals/.github/CODEOWNERS` | Becomes root `CODEOWNERS` with Moe owners. |
| `*/.github/PULL_REQUEST_TEMPLATE.md` | Becomes `.gitlab/merge_request_templates/`. |
| `everyharness/src/adapters/gemini.ts` (Gemini CLI adapter) | dropped, not discontinued: the harness still ships, but the maintenance cost of a per-harness TOML translation, an `@`-imported `GEMINI.md`, and a two-prompt install path no longer earns its keep for this fork's audience. Removed in the runtime-pruning wave. |
| `everyharness`'s Grok Build CLI wiring (`grok plugin install …` in the agents-marketplace install doc, the deep `install-grok` check, and its container `npm install` line) | dropped, not discontinued: Grok still installs Claude-format plugins through the same descriptor Droid does, so keeping a bespoke install block and exec-bits check duplicated coverage a Droid-shaped user already gets. Removed in the runtime-pruning wave. |
