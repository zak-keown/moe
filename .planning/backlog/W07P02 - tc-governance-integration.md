---
slug: tc-governance-integration
title: TC Governance And Guide Integration
idea: |
  - Brainstorm on how to integrate AI Governance doc/TC Guide skill
      - https://gitlab.tcdevops.com/ai/aigovernance
      - https://gitlab.tcdevops.com/ai/tc-guide
      - Explore how to keep these up-to-date
status: backlog
size: M
estimate: "3.5-4 h (add 3-4 h if the PreToolUse privacy gate is in scope)"
depends_on: [DO-NOW-1, DO-NOW-3, tc-standards-conformance, codegraph-context-layer]
blocks: []
conflicts_with: [native-renderers]
touches:
  - .ai-privacy.yml
  - .gitlab-ci.yml
  - packages/core/hooks/hooks.json
  - packages/core/hooks/
  - packages/core/README.md
decision_needed: yes
---

# TC Governance And Guide Integration

## The idea

> Brainstorm on how to integrate AI Governance doc/TC Guide skill
> - https://gitlab.tcdevops.com/ai/aigovernance
> - https://gitlab.tcdevops.com/ai/tc-guide
> - Explore how to keep these up-to-date

Both repos were read in full this session via the CodeGraph GitLab MCP tools. They are
two different jobs and this doc keeps them apart. `ai/aigovernance` is **constraint** — a
mandatory policy that must not be skippable. `ai/tc-guide` is **context** — a bootstrap
skill pointing at a retrieval surface. The finding that drives everything below: Moe's
correct move on the governance half is largely *not to vendor it*, leaving enforcement
plumbing plus two conformance findings.

## Debate-review decisions (2026-08-31)

- **The watch-only row kind is withdrawn.** PARITY.md is frozen at its current
  upstreams, and this item's own finding is that governance should *not* be
  vendored — so there is no copy to diff and nothing for a watch-only row to buy.
  Drop the design requirement handed to `tc-standards-conformance`.
- **Recommendation B is unaffected.** A SessionStart presence check needs no
  ledger row; it greps the installed policy and emits `additionalContext`.
- **Recommendation C is unaffected**, and gains a sibling: a second `Stop` hook
  lands in `hooks/hooks.json` from
  `verification-split-and-firing-rate`. Different event, no collision, but the
  two items both write that file and so cannot share a wave.

## Why it matters

Moe is TC's agent tooling for ~20 TC engineers, so every Moe session is a TC session and
Moe is the one place a check can be installed once instead of twenty times. Today nothing
in Moe references governance at all: `grep -rn -i 'governance\|ai-privacy\|PII\|redact'`
across all 27 skills in the core worktree returns **zero hits**. Twenty people each doing
a manual copy-paste is the current control.

## Current state

### The two TC repos (verified, read in full)

**`ai/aigovernance`** — two files: `Governance.md` (10,813 bytes, v1.0, 11 numbered
sections) and `README.md`. Created 2026-05-15 by Mike Anderson; last substantive change
2026-06-23 by Anthony Harkness-Gripe (`d6a53877`, MR !2). Eleven commits, two MRs — a
slow-moving document. `README.md` prescribes the distribution mechanism: "copy the
contents of Governance.md into `~/.claude/CLAUDE.md`" (Codex: `~/.codex/AGENTS.md`).
Sections bearing on Moe: §3 destructive actions, §6 code and dependency safety,
§7 escalation, §8 auditability, §10 `.ai-privacy.yml`, §11 enforcement.

**`ai/tc-guide`** — two files: `SKILL.md` (4,993 bytes) and `README.md`. Last change
2026-08-28 (`e900235d`, MR !3, Michael Trefry) — three days before this doc; actively
maintained. `SKILL.md` is a real Claude Code skill whose `description` reads
"PRE-RESPONSE REQUIRED: Invoke before your first reply in every session" — structurally
the same role as `using-moe`. Its README states three things that settle the design:
"Reading the Governance document is the only hard requirement"; "This skill is a starting
point - a template - and forking or writing your own skill is encouraged!"; and
"TC-wide conventions belong in `ai/kb`, not here. RAG indexes content there; this skill
is a bootstrap, not a knowledge base."

**`ai/kb` is the actual knowledge base** — 32 flat markdown docs (`git.md`, `consul.md`,
`dotnet-servicestack.md`, `angular-app-architecture.md`, …), reachable through CodeGraph
MCP `rag_search`/`rag_context`. A TC-context retriever therefore already exists.

### Moe today

- **No `.ai-privacy.yml`** anywhere in the repo (`find . -name '.ai-privacy.yml'` → empty).
- Root `.gitlab-ci.yml` has **no `include:`**, so the `add_ai_privacy` job from
  `Development.Infrastructure/gitlab-ci-files:ai/add_privacy.yml` will not run on
  `bubstack/moe` after DO-NOW-5. That job is `.pre`-stage, skips when the file already
  exists, curls the template from `ai/ai-privacy.yml`, commits and pushes; it needs an
  `AI_PRIVACY_KEY` CI variable.
- `packages/core/hooks/hooks.json` (core worktree `.claude/worktrees/wf_238bb49d-362-13`)
  is 16 lines and holds **one** entry: the `Stop` hook `claude-judge-continuation`.
  No `SessionStart` entry — mint appends that.
- `packages/core/hooks/claude-judge-continuation:6,14` is the in-repo precedent for a hook
  that is **off by default** behind an env var (`MOE_LATTE_ENABLED`).
- `packages/core/moe-mint.yaml`'s `bootstrap:` comment flags the generated `using-moe`
  wrapper as "a behaviour change to the single most load-bearing string in the merge …
  unverified behaviourally".

### The precedence collision (the load-bearing finding)

`packages/core/skills/using-moe/SKILL.md:72` — "User instructions (CLAUDE.md, AGENTS.md,
GEMINI.md, etc, direct requests) take precedence over skills, which in turn override
default behavior."

`Governance.md` header — these rules "cannot be overridden by user prompts or task
context" — and §11, which holds them regardless of framing, urgency, who is asking, or an
apparent in-session exception.

These are compatible **only while governance lives in CLAUDE.md**, where `using-moe`
already ranks it above every skill. They *contradict* the moment governance ships as a
Moe skill, because `using-moe:72` then lets a direct request outrank it. So: **do not
vendor `Governance.md` as a Moe skill.** Keep the `~/.claude/CLAUDE.md` install that
`ai/aigovernance/README.md` already prescribes. Moe's job is to check it is loaded.

**A second, independent reason not to add a skill** (verified this session in the core
worktree): `packages/core/test/metadata.test.ts:115` asserts `skills.length` is exactly
**27**, and `:153-190` asserts the skill-name set *equals* a hardcoded enumeration of the
upstream names — "Enumerated from the pinned snapshots at import time." A 28th skill in
`packages/core` fails both. `:242` additionally resolves `**REQUIRED SUB-SKILL:**` markers
against core's own names only, and `:470` pins the lean tier at 13. Those assertions exist
to pin the import's fidelity to upstream, so adding a core skill is a decision about
whether the fork admits non-upstream content — shared with at least three other backlog
items, and not this one's to make. The hook path does not touch any of them. Since the
precedence argument above already rules the skill out, this is corroboration rather than
the deciding factor; a *separate* package would sidestep the assertions but not
`using-moe:72`.

### Two conformance findings on settled decisions

**License, §6 — no conflict.** §6 requires "note their license" and blocks GPL-into-
proprietary without legal review. `PARITY.md:26-44` records every forked repo as MIT,
Apache-2.0 or public domain — no GPL in the tree. The one exception, `superpowers-evals`
(`PARITY.md:59-63`), is *unlicensed*, which §6 does not name; and §6's affirmative
requirement is satisfied by `PARITY.md` itself, which is precisely a license note. Zak's
2026-08-31 decision (`PARITY.md:65`) and `ARCHITECTURE.md:306` stand as written;
governance adds no constraint that reverses them. A factual check, not a proposal.

**Auditability, §8 — real gap.** §8 requires AI-assisted commits/MRs to be tagged
(trailer or label). `grep -rn -i 'co-authored-by\|commit trailer'` across all 27 core
skills returns **zero hits**, including `finishing-a-development-branch` and
`requesting-code-review`, both lean-tier in `packages/core/skill-tiers.yaml`. TC's own
practice does it: `ai/tc-guide` commit `085187d9` carries `Co-Authored-By: Claude Fable 5`,
and `ai/skills` ships a `creating-merge-requests` skill that applies an `AI` MR label.
**`tc-standards-conformance` should make this edit** — it already rewrites the same
skills for MR and branch conventions, and two slugs editing
`finishing-a-development-branch/SKILL.md` is a merge conflict. This doc supplies the citation.

## Prerequisites

- **DO-NOW-1** — `packages/core/` is a stub on `main`; hooks and skills only exist on
  `import/packages-core`.
- **DO-NOW-3** — the verification step asserts the hook reaches
  `plugins/moe-core/hooks/moe-mint/hooks.json`, which does not exist until mint generates
  `/plugins/`.
- **`tc-standards-conformance`** — the update-mechanism half and the §8 trailer edit.
- **`codegraph-context-layer`** — the TC-context pointer only, for the provider
  abstraction it names.

**The three halves are separable, and the orchestrator should know it.** The governance
work — `.ai-privacy.yml`, the `tc-governance-check` hook, the mapping table — depends on
nothing but DO-NOW-1 and DO-NOW-3 and can land in an early wave on its own. The watch-list
rows need `tc-standards-conformance`; the retrieval pointer needs
`codegraph-context-layer`. If the full `depends_on` set pushes this too late, split the
governance half out and let the other two follow their owners.

Not a prerequisite: DO-NOW-2 (tiering). Nothing here adds or moves a skill — deliberately,
per `metadata.test.ts` above.

## Proposed approach

### Governance (constraint)

**A. Document only.** Put the `~/.claude/CLAUDE.md` install in Moe's README and stop.
Zero cost, zero detection — a machine that never did the copy is invisible.

**B. SessionStart presence check.** One new entry in `packages/core/hooks/hooks.json`
running `hooks/tc-governance-check`: grep `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`
for the governance marker (`# AI Governance & Security Policy`); if absent, emit
`additionalContext` telling the agent to fetch `Governance.md` from `ai/aigovernance`
before proceeding — which is exactly what `ai/tc-guide/SKILL.md`'s AI Governance section
already instructs. **No mint change needed:** `packages/mint/src/bootstrap/shell-hook.ts:51-52`
`structuredClone`s the user's `hooks.json` verbatim and only *appends* mint's bootstrap
entry, and `packages/mint/src/adapters/claude-code.ts:10-26` records the empirically
confirmed behaviour (2026-08-11, Claude Code 2.1.217) that Claude Code reads both files
and dedupes identical entries. A nudge, not a gate.

**C. PreToolUse privacy gate.** A `PreToolUse` hook on Read/Grep/Glob/Bash that resolves
`.ai-privacy.yml` per §10 (most-restrictive-wins, inherited down the path, default 3) and
denies level-1 reads. The only option that enforces rather than reminds, and §10 is the
only mechanically checkable part of the policy. `PreToolUse` is a documented event
(`packages/core/skills/developing-claude-code-plugins/references/plugin-structure.md:255`).
Cost is real: the resolver, plus a hook on every file read, plus false positives that
block work. Its value is cross-repo — Moe itself has no level-1 paths; the payoff is when
Moe's agents work in other TC repos.

**Recommendation: B now, C behind an opt-in env var, A's documentation either way.** B
makes the one hard requirement verifiable per machine without moving the policy to a rank
where `using-moe:72` can demote it. C follows as a second step, gated exactly the way
`claude-judge-continuation:14` gates itself — do not default it on before someone has run
it against a real TC repo with level-1 paths. Plus: add `.ai-privacy.yml` at the root
(`global_privacy_level: 3`) rather than relying on §10's default, and decide whether to
`include:` `add_privacy.yml` in `.gitlab-ci.yml`.

### TC Guide (context)

**A. Install alongside, vendor nothing.** `tc-guide` has its own documented install and
sync flow (clone to the user-level skills dir; "sync latest changes from `origin/main`").
Two always-on bootstraps both fire; ~5 KB of extra session context. Zero Moe work.

**B. Fold it into `using-moe`.** One bootstrap, no duplicate — but Moe then owns a drifting
copy of TC context, and `moe-mint.yaml` already flags `using-moe` as the riskiest string
in the merge.

**C. A tenth package, `moe-tc`, generated as its own plugin.** Buys nothing `tc-guide`'s
own install does not, and adds a package.

**Recommendation: A, plus one short pointer — placed in the governance hook's
`additionalContext`, not in `using-moe`.** The pointer is ~4 lines: search TC's knowledge
base before inferring a TC convention. Putting it in the hook rather than the bootstrap
skill avoids editing the string `moe-mint.yaml` flags as behaviourally unverified.

**Which store, and what happens when it is gone.** TC Guide's context is **not** in Moe's
local memory and should not be moved there. `ai/kb` (32 docs) is indexed server-side in
CodeGraph's RAG; `@bubstack/moe-memory` is semantic recall over past sessions and journal
entries, a different kind of store, so mirroring TC's corpus into it would be a category
error as well as a second copy to keep fresh. Per the 2026-08-31 decision that CodeGraph
memory is an *option* beside local memory (local stays the default), the pointer must be
provider-agnostic and degrade in this order:

1. A TC knowledge-base retrieval tool is available → search it first (today that is
   CodeGraph `rag_search`/`rag_context`).
2. No retrieval, but `git` or GitLab file access → fetch the specific `ai/kb` doc directly.
   This is what `ai/tc-guide/SKILL.md` already prescribes for governance itself: retrieve
   it "using `git` or CodeGraph GitLab tools".
3. Neither → the pointer is a no-op and the session proceeds without TC conventions, which
   is exactly today's behaviour, so nothing regresses. Note `tc-guide/SKILL.md` is stricter
   here — "Stop and prompt the user if either is unavailable." Whether Moe's hook should
   stop or degrade quietly is question 5 below.

**`codegraph-context-layer` owns provider selection and routing**; this slug consumes
whatever abstraction it lands and does not name a provider itself. Do not build a second
retriever. Only the pointer half of this doc depends on that slug — see Prerequisites.

Note: the `moedex` MCP server **failed to connect this session** (ConnectionRefused). It
is configured, not missing. If it turns out to be an intended delivery path for TC
context, that path is untested here.

### Keeping all three up to date — one mechanism

Change rates measured from commit history: `ai/aigovernance` ~2 substantive edits in
3.5 months; `ai/tc-guide` last touched 3 days ago; `ai/skills` releases `@tc/skills` to
ProGet on merge and already fails CI when its `index.json` is stale.

- **Submodules** — exact pinning, but a permanent pnpm-workspace and CI tax for 20 people,
  and it puts TC policy text inside the Moe tree, which the precedence finding argues against.
- **Runtime reference only** — zero maintenance, nothing pinned, nothing asserted.
- **Pinned-SHA manifest + scheduled drift-check job** — one tracked manifest records
  project/path/SHA per upstream; a scheduled pipeline fires when any moves.

**Recommendation: the pinned-SHA manifest, and `tc-standards-conformance` owns building
it.** That is the same mechanism its own doc recommends (its option 2) and the same one
`PARITY.md` already uses for every upstream, so all three TC repos ride one manifest and
one job. Its graph already says so — that doc sets `blocks: [tc-governance-integration]`
and this one's `depends_on` matches.

**One design requirement this slug contributes:** the manifest needs a **watch-only** row
kind — pin and diff the upstream SHA, but vendor no copy. `tc-standards-conformance` must
vendor (it needs a `_shared/tc-conventions.md` that deliberately differs from TC's text);
governance must not, per the precedence finding above. Two rows, `ai/aigovernance` and
`ai/tc-guide`, both watch-only. Everything else about the mechanism is theirs.

## Scope boundary

**In:** root `.ai-privacy.yml`; the `add_privacy.yml` include decision; the
`tc-governance-check` SessionStart hook and its `hooks.json` entry; a governance-section →
Moe-surface mapping table in `packages/core/README.md`; the 4-line `ai/kb` retrieval
pointer; the two conformance findings above; two rows for the TC watch list.

**Out:**
- Vendoring `Governance.md` or `tc-guide/SKILL.md` into Moe. Argued against above.
- The §8 commit-trailer / `AI`-label skill edits, and building the pinned-SHA manifest
  and drift-check job → **`tc-standards-conformance`**.
- Any retrieval layer over `ai/kb` beyond the 4-line pointer → **`codegraph-context-layer`**.
- Shipping a `.mcp.json` that configures CodeGraph for users. Mint supports it
  (`packages/mint/src/adapters/claude-code.ts`, `manifest.mcpServers`) but it needs
  per-user PATs → **`installer-hq-dx`**.
- Reopening the `superpowers-evals` license decision or the publish-nothing decision.
- Governance for Moe's *own* contribution flow → **`contributing-flow-docs`**.

## Open questions for Zak

1. **Enforcement appetite.** Is B (a SessionStart nudge) the right ceiling, or do you want
   C — a `PreToolUse` gate that can actually refuse a read? C is the only real enforcement
   and the only thing that satisfies §10's "read first … before reading or transmitting",
   but it fires on every file read and a false positive blocks work.
2. **`add_privacy.yml` include.** Do we `include:` TC's `.pre` job (needs an
   `AI_PRIVACY_KEY` variable, and it commits and pushes to your branch), or hand-commit
   `.ai-privacy.yml` once and skip the include? Hand-committing is quieter; including keeps
   Moe on the fleet-wide default.
3. **Is `global_privacy_level: 3` right for Moe?** Level 3 is §10's default and looks
   correct for internal tooling, but the tree contains 27 skills' worth of prompt text and
   `flight`'s eval corpus, which I have not audited for anything level-2-shaped.
4. **Governance ownership.** `Governance.md` is owned outside this repo (Mike Anderson,
   Malick McGregor, Anthony Harkness-Gripe). If Moe's hook wants to assert a *version*
   rather than mere presence, `Governance.md` needs a stable version marker; today it says
   `v1.0` in body text and has changed since. Worth an MR against `ai/aigovernance`, or out
   of scope?
5. **Stop or degrade when TC context is unreachable?** `ai/tc-guide/SKILL.md` says "Stop
   and prompt the user" when CodeGraph MCP or `git` is unavailable. For Moe that is harsher
   than today's behaviour and would block offline work, so I have specced degrade-quietly
   (step 3 above). Governance presence is the part I would consider worth stopping for —
   but that turns option B from a nudge into a gate, which is question 1.

## Effort

| Step | Time |
|---|---|
| Governance-section → Moe-surface mapping table in `packages/core/README.md` | 45 min |
| Root `.ai-privacy.yml` + the `add_privacy.yml` include decision | 15 min |
| `hooks/tc-governance-check` script + `hooks.json` entry | 1 h |
| Test asserting the entry survives mint into `plugins/moe-core/hooks/moe-mint/hooks.json` | 45 min |
| `ai/kb` retrieval pointer in the hook's `additionalContext` | 15 min |
| Two rows contributed to the TC watch list | 30 min |
| **Total** | **3.5-4 h** |

Slower if option C is pulled in: the §10 resolver (inheritance, most-restrictive-wins,
repo-relative paths) plus its tests is another 3-4 h, and it needs a real TC repo with
level-1 paths to test against. Slower again if question 4 turns into an upstream MR.

## Verification

- `test -f .ai-privacy.yml` and it parses with `global_privacy_level: 3`.
- `packages/core/hooks/hooks.json` holds two entries — the existing `Stop` and the new
  `SessionStart` — and `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm build` stay green.
- After `pnpm mint` (DO-NOW-3), `plugins/moe-core/hooks/moe-mint/hooks.json` contains the
  `Stop` entry, the new `SessionStart` governance entry, **and** mint's own bootstrap
  `SessionStart` entry — three entries, mint's own last. Asserted by a new case in
  `packages/mint/test/bootstrap.test.ts`, which is where `mergedClaudeHooks` is already
  covered. This is the case that catches mint silently dropping a user hook.
- Manual, once: with the governance marker removed from `~/.claude/CLAUDE.md`, a fresh
  session shows the fetch instruction; with it present, the hook is silent.
- The mapping table in `packages/core/README.md` names all 11 governance sections, each
  either mapped to a Moe surface or marked "no Moe surface" with a reason.
