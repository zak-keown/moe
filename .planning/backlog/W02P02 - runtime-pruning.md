---
slug: runtime-pruning
title: Prune Dead Runtime Targets
idea: |
  - Runtime pruning: Gemini is discontinued in favor of Antigravity, and Grok must be removed.
status: backlog
size: M
estimate: 4-6 h
depends_on: [DO-NOW-1, DO-NOW-3]
blocks: []
conflicts_with: [native-renderers, installer-hq-dx, moe-tone-and-branding, contributing-flow-docs]
touches:
  - packages/mint/src/adapters/
  - packages/mint/src/config.ts
  - packages/mint/src/docs-emit.ts
  - packages/mint/test/
  - packages/mint/checks/run-checks.sh
  - packages/mint/docs/CONFIG.md
  - packages/mint/README.md
  - packages/mint/docs/BROCHURE.md
  - packages/core/README.md
  - packages/flight/README.md
  - infra/container/Dockerfile
  - infra/container/bin/harness-versions
  - ARCHITECTURE.md
  - PARITY.md
decision_needed: yes
---

# Prune Dead Runtime Targets

*(This is `~/Code/moe`, the Superpowers hard fork — not `~/Code/tools/moe` and not
`~/.claude/moe-core`.)*

## The idea

> Runtime pruning: Gemini is discontinued in favor of Antigravity, and Grok must be removed.

Moe names agent CLIs in three structurally different places, and each has a different
cost to change: a **mint adapter** (emits a native manifest format — deleting one changes
generated output, install docs, the support matrix and a 940-line snapshot), a **container
tool install** (affects only the eval image), and a **doc mention**. Gemini appears in all
three. Grok appears in the container and in mint's prose but has no adapter of its own — it
rides the `agents-marketplace` descriptor. This is a census-then-delete job, not a rewrite.

## Debate-review decisions (2026-08-31)

One question this item is uniquely placed to answer and does not currently ask.

- **Does the skill set work on the weaker targets?** mint emits for eleven
  harnesses; Codex, Kimi, OpenCode, Pi and Hermes run whatever model the user
  configures. The panel review's one claim that genuinely applies to this fork is
  that semantic autoload degrades below the frontier — spotty on mid-tier models,
  silently confident on small local ones. This item decides which of those
  targets survive, so it is where the question belongs.
- **The instrument now exists.** `verification-split-and-firing-rate` Part C
  counts `Skill` tool invocations per session from the transcript. Run it per
  harness before concluding anything; zero firing on a target is a reason to
  prune the target, not only the skill.
- **This is an added open question, not a change to the recommendation.** Option 1
  (remove only, no Antigravity adapter) stands.

## Why it matters

Every dead harness is a lie the docs tell and a row in a support matrix ~20 internal people
read to decide what to install. `packages/mint/docs/CONFIG.md:19-20` still advertises "Gemini
CLI" as a supported target for a CLI that stopped serving requests in June. Worse, DO-NOW-3
is about to make `/plugins/` real and add a CI job asserting it regenerates identically — so
whatever adapter set exists when that lands gets frozen into a drift gate. Pruning after that
is a churn of generated files; pruning as the first thing after it is one clean regeneration.
The container also carries two npm installs and two version checks nobody will ever use, in a
~15 GB image that has not been built yet.

## External facts

**Gemini CLI is genuinely retired.** Announced at Google I/O on 2026-05-19; it stopped serving
requests for Google AI Pro/Ultra and free-tier users on 2026-06-18. The replacement is
Antigravity CLI, a closed-source Go binary (`agy`) — a shift away from Gemini CLI's
open-source model. Organizations on a Gemini Code Assist **Standard or Enterprise** licence
kept access, so a paid-seat holder is not hard-broken; that is the only reason to hesitate.
([Google Developers Blog](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/),
[The Register](https://www.theregister.com/ai-ml/2026/05/20/bye-bye-gemini-cli-google-nudges-devs-toward-antigravity/5243605))

**Antigravity does have a real plugin/skill manifest format**, so a mint adapter is buildable —
but it is not a rename of `gemini.ts`. A plugin is a directory with a required `plugin.json`
(`name`, matching `^[a-zA-Z0-9-_]+$`; optional `description`; `$schema` →
`https://antigravity.google/schemas/v1/plugin.json`) plus optional `mcp_config.json`,
`hooks.json`, `skills/`, `agents/`, `rules/`. Installed with `agy plugin install /path`, staged
to `~/.gemini/antigravity-cli/plugins/<name>/`. Skills are markdown with YAML frontmatter
(`name`, `description`) and auto-become slash commands — **there is no `commands/` directory
and no separate command file format**, and `plugin.json` carries no version, author or license
field. The docs make no claim of Agent Plugins 1.0 / agent-plugins.org compatibility.
([Antigravity CLI docs — Plugins & Skills](https://antigravity.google/docs/cli/plugins/))

**Grok is not discontinued.** The premise is wrong on the facts. `grok` is now Grok Build,
xAI's agentic CLI: beta 2026-05-14, broadened 2026-05-25, defaulting to Grok 4.6 as of
2026-08-12 and shipping updates through August. Removing it is a legitimate *policy* choice
(nobody here uses it, and it costs a Dockerfile pin plus two bash check functions) — just not a
forced one. ([Grok Build review](https://www.buildfastwithai.com/blogs/grok-build-xai-cli-ai-agents-2026),
[Releasebot changelog](https://releasebot.io/updates/xai/grok-build))

## Current state

**The fork already intends this.** `packages/mint/docs/CONFIG.md:37` reads: "generation works
via 11 adapters covering 12 harnesses (Antigravity, the 13th on the goal list, is still
roadmap)", and `packages/mint/docs/BROCHURE.md:37` says the same. The container is further
along than mint: `infra/container/Dockerfile:160-163` already installs `agy` and
`infra/container/bin/harness-versions:37` already version-checks it.

**Kind A — mint adapter (changes generated output).** `packages/mint/src/adapters/gemini.ts`
(7.1 KB, emits `gemini-extension.json`, `GEMINI.md`, `commands/*.toml`); registered at
`packages/mint/src/adapters/index.ts:7,16`; duplicated in `ADAPTER_NAMES` at
`packages/mint/src/config.ts:34`; display name at `packages/mint/src/docs-emit.ts:20`.
`packages/mint/src/matrix.ts:16` is registry-driven and needs no edit. Grok in mint is
**doc-only**: `packages/mint/src/adapters/agents-marketplace.ts:64,95-99,101` and
`packages/mint/src/docs-emit.ts:25,54` — the emitted `.agents/plugins/marketplace.json` never
names it, only `docs/install/agents-marketplace.md` does. Incidental comments naming gemini:
`claude-code.ts:187`, `cursor.ts:126`, `bootstrap/generated.ts:5`, `generate.ts:26,116`.

**Test blast radius.** `packages/mint/test/adapters/gemini.test.ts` — 24 tests, delete whole.
`packages/mint/test/__snapshots__/generate.test.ts.snap` (940 lines) — gemini at `:615-638`
(`docs/install/gemini.md`), `:741` (matrix row), `:754-762` (`gemini-extension.json`,
`GEMINI.md`); grok prose at `:487,511-517,750`. Hit counts elsewhere: `generate.test.ts` 11,
`cli.test.ts` 15, `docs-emit.test.ts` 15, `config.test.ts` 3, `init.test.ts` 3,
`test-command.test.ts` 4 (incl. `DEEP_HARNESSES` at `:56-69`), `adapters/opencode.test.ts` 2,
`adapters/agents-marketplace.test.ts` 3. `packages/mint/test/adapters/registry.test.ts` is the
tripwire that `ADAPTER_NAMES` matches the live array — it will fail loudly if only one of the
two lists is edited, which is what you want.

**The expensive one is dogfood.** `packages/mint/test/dogfood.test.ts` regenerates upstream
superpowers' hand-maintained manifests from the pinned `superpowers` @ `b36e082` snapshot and
deep-compares. `gemini-extension.json` is in `COMPARED_FILES` (`:52-61`, 8 entries);
`gemini-extension.json` and `GEMINI.md` are in `HAND_MAINTAINED_PATHS` (`:72-85`); there is a
documented expected-difference entry at `:148,191-196`. Deleting the adapter takes that
acceptance test from 8 manifests to 7 and permanently drops one assertion against the pinned
spec. It cannot be recovered later, because `packages/core` will have *generated* manifests
(the test's own header, `:21-27`, explains why the target must stay upstream).

**Kind B — container.** `infra/container/Dockerfile:89` (`@google/gemini-cli@0.50.0`) and
`:101` (`@xai-official/grok@0.2.101`); `infra/container/bin/harness-versions:24,28` (22 agent
CLIs → 20). Keep `Dockerfile:14` `ENV AGY_OAUTH_HOME=/auth/gemini` — that is Antigravity's own
state dir, which really is `~/.gemini`. `packages/mint/checks/run-checks.sh` has nine sites:
`check_gemini()` `:196-213`, path note `:218`, `deep_gemini()` `:309-325`, `deep_grok()`
`:397-410`, exec-bit sweeps `:617,621`, no-skills skip list `:661`, deep dispatch `:688,692`,
shallow dispatch `:718`.

**Kind C — doc mentions.** `packages/mint/docs/CONFIG.md:19-20,35,37`;
`packages/mint/README.md:5-6` and `:267-271` (the "six tests skip without python3 ≥ 3.11"
caveat exists *only* because `gemini.test.ts` validates TOML through `python3 -m tomllib` —
deleting the adapter deletes the caveat); `packages/mint/docs/BROCHURE.md:37`;
`packages/core/README.md:27-28`; `ARCHITECTURE.md:17,24`. Leave every
`packages/mint/docs/history/*` file (11 hits) alone — they are dated records, same rule
`packages/tab/README.md:58-60` states for tab's history.

**The flight half is not what the lead brief expected.** ARCHITECTURE.md:101 claims flight
"drives nine agent CLIs side by side", but on the in-flight worktree
`.claude/worktrees/wf_238bb49d-362-15` that code **is not there**:
`packages/flight/src/cli.ts:38` reads `lab   NOT IMPORTED YET (upstream: quorum)` and `:83`
throws `NOT_IMPORTED("lab", "quorum")`; `packages/flight/README.md:20` says superpowers-evals
"does not enter this package until [the licence question] is settled" (PARITY.md:36 and
PARITY.md:52-60). The nine live only in the pinned snapshot:
`../.moe-references/superpowers-evals/README.md:4-5` names Claude, Codex, **Antigravity**,
Gemini, Hermes, Kimi, OpenCode, Pi, Copilot, and
`../.moe-references/superpowers-evals/coding-agents/` holds 11 YAMLs (antigravity, claude,
claude-windows, codex, copilot, gemini, hermes, kimi, opencode, pi, serf), each with a
`<name>-context/{HOWTO.md,launch-agent}`. Two consequences: **quorum already migrated** —
`coding-agents/antigravity.yaml` exists (binary `agy`, normalizer `antigravity`, session log
`${QUORUM_AGENT_HOME}/.gemini/antigravity-cli/brain`) — and **there is no `grok.yaml` at all**.
Grok was only *planned* upstream
(`../.moe-references/superpowers-evals/docs/superpowers/plans/2026-06-19-grok-build-quorum-target.md`)
and the plan did not land by the pinned `114f725`. So the flight side of this idea is one
"do not import `gemini.yaml` / `gemini-context/`" line in flight's import notes — zero code.

**Models are not runtimes, and this is the boundary that keeps the job small.** Gemini *models*
are alive and are what Antigravity runs on. Out of scope entirely:
`py/proof/src/moe_proof/reference.md:144` (`gemini-2.5-flash`, a model id),
`packages/tab/crates/moe-tab-core/src/transcript/atif.rs:264` (model-prefix pricing match) and
`:438-444` (an antigravity fixture), `packages/tab/crates/moe-tab-core/prices/bundled.json`,
`packages/tab/bindings/testdata/gemini-mini.jsonl` and the crate's matching fixture. tab prices
historical transcripts; deleting a dialect fixture breaks reading last month's runs.

## Prerequisites

- **DO-NOW-1** (integrate Wave B/C). This edits `packages/flight/README.md` and touches files
  the three `import/*` merges also rewrite. Editing a locked worktree while its merge is
  pending is how you get a conflict you resolve twice.
- **DO-NOW-3** (wire `moe-mint` to generate `/plugins/`). Load-bearing in both directions.
  DO-NOW-3 must decide which adapters to emit, and `packages/core/moe-mint.yaml` already
  carries `harnesses.exclude: [opencode, pi]` for an unrelated reason (both emit a
  full-replacement `package.json` into a plugin root that is the pnpm workspace manifest). If
  DO-NOW-3 lands first, its regenerate-identically CI job becomes the exact test that proves
  this prune is complete, and there is no `gemini-extension.json` sitting in a committed
  `/plugins/` tree to delete by hand.

The flight-lab / quorum import is **not** a prerequisite and must not be pulled in: it is
blocked on the superpowers-evals licence question (PARITY.md:52-60), which is not this slug's
to resolve.

## Proposed approach

**Option 1 — Remove only; no Antigravity adapter.** Delete gemini everywhere it is a runtime
target, delete grok's container installs and check functions, recount the doc claims, add a
"do not import gemini-context" line to flight's import notes. Trade-off: honest and cheap, but
`packages/mint/docs/CONFIG.md:37`'s Antigravity-is-roadmap line stays true instead of getting
resolved.

**Option 2 — Remove and add an `antigravity` adapter in the same slug.** Trade-off: it is not a
rename of `gemini.ts` and it has a real design conflict. Antigravity's `plugin.json` must sit
at the plugin root and carries no path fields, so it cannot point at a relocated `skills/` —
exactly the constraint `packages/mint/src/adapters/agent-plugins.ts:11-15` documents for Agent
Plugins 1.0, which **writes the same filename to the same slot**
(`agent-plugins.ts:191`, `files.push({ path: 'plugin.json', ... })`). Two adapters, one path,
incompatible `$schema`s, and `mcp_config.json` vs `mcp.json`. That needs a decision, not an
afternoon.

**Option 3 — Rename `gemini` → `antigravity` in place.** Trade-off: fastest and wrong. It would
keep emitting `gemini-extension.json`, `GEMINI.md` and TOML commands, none of which Antigravity
reads.

**Recommendation: Option 1.** Do the removal cleanly, and let the Antigravity adapter be its
own item once the root-`plugin.json` collision with `agent-plugins-1.0` has an answer. A
removal is verifiable by a snapshot and a CI drift gate; an adapter for a closed-source binary
we cannot yet install-check in the container is not. Note that mint's install-check tier
already has no `agy` case (`run-checks.sh` `deep_*` functions), so an Antigravity adapter would
arrive unverifiable — one more reason to split it.

## Scope boundary

**In:** the `gemini` mint adapter and its test, snapshot and doc fallout; grok's prose in
`agents-marketplace` + `docs-emit`; both container npm installs and both `harness-versions`
entries; the four `run-checks.sh` gemini/grok functions and their five dispatch/list sites;
harness lists and counts in `CONFIG.md`, `mint/README.md`, `BROCHURE.md`, `core/README.md`,
`ARCHITECTURE.md`; new rows in PARITY.md's `### Not ported` table (`PARITY.md:222-229` — the
Path/Why table for inherited artifacts deliberately dropped, *not* the two identifier-rename
tables at `:138` and `:157`, which are for breaking renames); one import-note line in
`packages/flight/README.md`.

**Out:** writing an `antigravity` mint adapter — its own slug, and its root-`plugin.json`
collision with `agent-plugins-1.0` is a design decision. Out: anything in
`packages/*/docs/history/` (dated records). Out: every Gemini/Grok **model** id, price entry
and transcript fixture in `packages/tab` and `py/proof` — those are pricing and parsing of runs
that already happened. Out: which adapters `/plugins/` emits — that is DO-NOW-3's call; this
slug only shrinks the menu it chooses from. Out: importing quorum's coding-agents at all —
blocked on the licence question, and whichever slug owns the flight-lab import inherits the
"skip `gemini.yaml`" instruction from here. Out: touching `Dockerfile:14`'s
`AGY_OAUTH_HOME=/auth/gemini`, which looks like a Gemini leftover and is not.

## Open questions for Zak

1. **Grok is alive** (Grok Build, shipping as of 2026-08-12). Confirm you still want it out —
   it costs one Dockerfile pin, one `harness-versions` entry, `deep_grok()` and some install
   prose. Cheap to keep, cheap to remove; your call, not a forced one.
2. **The dogfood test drops from 8 hand-maintained manifests to 7.** That is one permanently
   unrecoverable assertion against the pinned `superpowers` @ `b36e082` spec — `packages/core`
   can never substitute, because its manifests will be generated. Accept the loss, or keep
   `gemini.ts` in the tree solely as a dogfood target while excluding it from every real
   config? Recommendation: accept the loss; a coverage assertion for a retired CLI is not
   coverage.
3. **Anyone here on a Gemini Code Assist Standard/Enterprise seat?** Those licences kept Gemini
   CLI access past the 2026-06-18 cutoff. If yes for even one person, the adapter is not dead
   yet and this becomes a deprecation warning instead of a delete.

## Effort

| Step | Time |
|---|---|
| Delete `gemini.ts` + its test; fix `index.ts`, `config.ts`, `docs-emit.ts`, four comments | 45 min |
| Regenerate `generate.test.ts.snap`; fix the 8 test files with gemini/grok hits | 1-1.5 h |
| `dogfood.test.ts` surgery (`COMPARED_FILES`, `HAND_MAINTAINED_PATHS`, expected-difference at `:148,191-196`) | 30 min |
| `run-checks.sh` (9 sites) + `DEEP_HARNESSES` in `test-command.test.ts` | 45 min |
| `Dockerfile:89,101` + `harness-versions:24,28` | 15 min |
| Docs: `CONFIG.md`, `mint/README.md` (incl. deleting the python3 caveat), `BROCHURE.md`, `core/README.md`, `ARCHITECTURE.md`; PARITY `### Not ported` rows; flight import note | 1 h |
| Verify: lint/typecheck/test/build + regenerate `/plugins/` | 30 min |

**What makes it slower:** `run-checks.sh` is "732 lines of untested-in-CI bash"
(`packages/mint/README.md:263-266`) and only `test-command.test.ts` observes it, indirectly, via
skip lines — an edit there is verified by inference, not execution. Recounting the harness
totals in `CONFIG.md:37` and `README.md:5-6` requires actually re-deriving them (11 adapters /
12 harnesses is an inherited count that mixes direct adapters with marketplace-descriptor
clients); do not guess a new number.

## Verification

- `pnpm --filter @bubstack/moe-mint test` green, including
  `packages/mint/test/adapters/registry.test.ts` (proves `ADAPTER_NAMES` and the live registry
  were edited in lockstep) and `packages/mint/test/dogfood.test.ts` at 7 compared files.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green at the root.
- `rg -i 'gemini|grok' packages/mint/src packages/mint/checks packages/mint/test infra/container`
  returns nothing outside `Dockerfile:14`'s `AGY_OAUTH_HOME`.
- `moe-mint matrix` prints 10 harness rows, no `gemini`.
- DO-NOW-3's regenerate-identically CI job passes with no `gemini-extension.json`, no
  `GEMINI.md`, no `commands/*.toml` and no `docs/install/gemini.md` anywhere under `/plugins/`.
- `infra/container/bin/harness-versions` lists 20 agent CLIs; `agy` still among them.
- `bash packages/mint/checks/run-checks.sh` against the fixture with no harness CLIs on `PATH`
  emits no `install-gemini` or `install-grok` line — asserted by `DEEP_HARNESSES` in
  `packages/mint/test/test-command.test.ts:56`.
- `PARITY.md`'s `### Not ported` table names the dropped gemini adapter, the dropped grok
  container installs, and `superpowers-evals/coding-agents/gemini*` as not-imported.
