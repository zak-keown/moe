# TC decoupling — design

Moe is becoming an upstream that a TC-customized fork sits *downstream* of.
This design removes every TC-specific customization currently in the tree, so
the upstream repository carries only generic Moe. TC (or any other downstream)
re-adds its own customizations on top.

**Guiding rule.** Upstream owns generic mechanisms. Anything whose only reason
to exist is TC — a policy, a corpus, a repo URL, a convention — is either
deleted outright or genericized so its TC-specific parts move out of the tree.

## New upstream identity

- **New home:** `https://gitlab.com/moe-ai/moe`
- **Old home:** `https://gitlab.tcdevops.com/Zak/moe`
- Every occurrence of the old URL becomes the new one. The metadata test that
  currently asserts the old URL becomes the guarded surface that enforces the
  new one.
- The repo stays on GitLab, so `.gitlab-ci.yml`, `.gitlab/`, and CODEOWNERS
  stay in place structurally — only their TC-specific *content* changes.

## What downstream carries, not upstream

The three tools we are letting go:

- **The TC MR conventions.** `sc-{CARD}/{slug}` branch format, the `AI` +
  `agent::claude` label pair, the `Card: sc-` trailer, and the tool-preference
  ladder that ends at `glab mr create`. All of this is vendored from
  `gitlab.tcdevops.com/ai/skills` and
  `gitlab.tcdevops.com/ai/claude-code-platform-plugin` and only makes sense on
  a TC GitLab instance.
- **The TC AI Governance policy check.** `packages/core/hooks/tc-governance-check`
  greps for `# AI Governance & Security Policy` in the user's `CLAUDE.md`. Both
  the marker and the policy live in TC's `ai/aigovernance`.
- **CodeGraph.** The `search-codegraph` agent addresses a TC-owned MCP server
  (`mcp__codegraph__*`) over ~620 TC GitLab repos, structured docs, and wikis.

The mechanism behind the governance check is generic; the policy is not. So
the hook is *renamed and genericized* (below), not deleted.

## What upstream keeps

- **moedex.** `gitlab.com/moe-ai/moedex` is Moe-owned. The `search-moedex`
  agent stays and the `retrieving-context` skill is rewritten around it as the
  sole corpus-search tool, with all TC-specific framing removed.
- **The `governance-marker-check` hook** (renamed from `tc-governance-check`):
  configurable via environment variables and off by default. Downstream sets
  its marker and hint strings to re-enable it against its own policy.
- **The generic MR / merge-request template** at
  `.gitlab/merge_request_templates/Default.md`, with the TC-conventions block
  and `Card: sc-` trailer removed. What remains is Summary + Test plan.
- **The `.gitlab-ci.yml` pipeline** minus the `tc-conventions-drift` scheduled
  job.

## Changes by category

### 1. Delete outright

| Path | Reason |
|---|---|
| `packages/core/skills/_shared/tc-conventions.md` | TC MR conventions, vendored from two TC repos. |
| `packages/core/agents/search-codegraph.md` | Addresses TC-owned MCP tools over the TC corpus. |
| `.planning/backlog/W01P06 - tc-standards-conformance.md` | Pure-TC backlog item. |
| `.planning/backlog/W03P02 - tc-governance-integration.md` | Pure-TC backlog item. |
| `.planning/backlog/W05P02 - tc-domain-skills-port.md` | Pure-TC backlog item. |

Also delete the `tc-conventions-drift` job in `.gitlab-ci.yml`, including
the block of preamble comments above it that only exist to explain it. The
job greps `packages/core/skills/_shared/tc-conventions.md` for pinned SHAs;
with that file gone the job cannot run and has no reason to.

The `tc-governance-check` hook is *not* in this list — it becomes
`governance-marker-check` under §2.

### 2. Genericize

**`packages/core/hooks/tc-governance-check` → `packages/core/hooks/governance-marker-check`.**

The rewritten hook:

- Is off by default. If `MOE_GOVERNANCE_MARKER` is unset, the hook exits 0
  silently. This flips the current TC-default posture; upstream Moe has no
  opinion about a governance policy.
- Reads `MOE_GOVERNANCE_MARKER` for the exact H1 to grep for, matched with
  `grep -F` as today.
- Reads `MOE_GOVERNANCE_POLICY_HINT` for the human-readable string appended
  to the SessionStart context when the marker is missing (installation
  instructions, where to fetch the policy). Optional; when absent, the hook
  emits a short generic notice.
- Reads `MOE_GOVERNANCE_MARKER_CHECK_DISABLED` as the kill switch (matches
  the old `MOE_TC_GOVERNANCE_DISABLED` shape).
- Keeps the existing search paths (`$HOME/.claude/CLAUDE.md` and
  `$HOME/.codex/AGENTS.md`), the "no jq" rule, the "every failure exits 0"
  rule, and the printf-based JSON emission. None of that is TC-specific.
- Drops the CodeGraph knowledge-base pointer entirely. That was a TC-only
  routing hint.

Wiring: `packages/core/hooks/hooks.json` line 15 changes
`tc-governance-check` → `governance-marker-check`.

**`packages/core/skills/retrieving-context/SKILL.md`.**

- Remove the CodeGraph row from the tool table.
- Remove every mention of "TC", "TurnCommerce", "~620 TC GitLab repos",
  "ai/kb", `rag_search`, and the CodeGraph example queries.
- Rewrite the intro and worked examples around moedex as the sole corpus
  tool, and describe moedex generically ("the code corpus indexed by
  moedex", not "the TC GitLab code corpus").
- If the skill's shape depends on there being *two* tools with different
  scopes (baseline vs addon), collapse to a single-tool skill; do not invent
  a placeholder second tool.

**`packages/core/agents/search-moedex.md`.**

- Replace `TurnCommerce corpus` and any TC-corpus size numbers with generic
  phrasing ("the code corpus indexed by moedex").
- Keep the tool-invocation mechanics; those are moedex, not TC.

### 3. URL rewrite

Every `gitlab.tcdevops.com/Zak/moe` becomes `gitlab.com/moe-ai/moe`:

- `packages/core/mint/moe-core.yaml` — `repository` and `homepage`
- `packages/core/mint/moe-everything.yaml` — `repository` and `homepage`
- `packages/core/test/metadata.test.ts` — the assertion that expects
  `"https://gitlab.tcdevops.com/Zak/moe"` in every mint config; guarded
  surface, must match the new URL or the mint tests fail
- `ARCHITECTURE.md` — "canonical project" reference
- `INSTALL.md` — `claude plugin marketplace add` command
- `CODEOWNERS` — header comment naming the canonical GitLab project

The single `gitlab.tcdevops.com` mention in
`packages/core/skills/developing-claude-code-plugins/SKILL.md` is not the
Moe URL — it is naming a TC GitLab host in prose ("Do not push to the
default branch and do not tag a…"). Delete that sentence rather than
rewrite; the surrounding paragraph does not need it.

### 4. Surgical strips in shared skills

Each file loses its TC-specific block and keeps the rest of the skill
intact. Anchors below are content-based (per AGENTS.md's "cite by name, not
line number" rule).

- **`packages/core/skills/finishing-a-development-branch/SKILL.md`.**
  Remove the two references to `_shared/tc-conventions.md` and the
  surrounding sentences that only apply on `gitlab.tcdevops.com`. If a
  paragraph becomes empty, remove the paragraph.
- **`packages/core/skills/using-git-worktrees/SKILL.md`.**
  Remove the `sc-{CARD}/{slug}` derivation step, the sentence beginning
  "the TC filter that surfaces AI-authored work matches on `sc-`", and the
  table row that references "TC card → strip `feature/`". Restore the
  neighbouring text so the skill still reads as a coherent worktree flow.
- **`packages/core/skills/receiving-code-review/SKILL.md`.**
  Remove the "on `gitlab.tcdevops.com` reply into…" paragraph and the
  follow-up citation of "TC MR conventions (branch format, labels, tool
  preference)". Keep the generic reply-handling guidance around them.
- **`packages/core/skills/writing-skills/SKILL.md`.**
  Remove the trailing parenthetical "TC repos follow
  `_shared/tc-conventions.md`" from the "open an MR on the repo it belongs
  in" checklist item.
- **`packages/core/README.md`.**
  Remove the `MOE_TC_GOVERNANCE_DISABLED=1` sentence. The env var name is
  changing (to `MOE_GOVERNANCE_MARKER_CHECK_DISABLED`) and the README does
  not need to document either.

### 5. Backlog and prose sweep

- **`.planning/backlog/WAVES.md`.** Remove the three deleted items from
  every wave table, effort roll-up, and prose passage. The recorded "16
  items shipped" narrative stays true — those three items were part of it;
  the deletion here removes them from *this* upstream, not from what
  actually shipped historically. Edit prose so the running counts and
  scheduling arguments still parse.
- **Other backlog items (~15).** Strip references to the three deleted
  slugs — `tc-standards-conformance`, `tc-governance-integration`,
  `tc-domain-skills-port` — from `conflicts_with:`, `depends_on:`, `blocks:`
  and body prose. Do not touch dependencies between the *surviving* items.
  If removing a slug leaves a `conflicts_with:` list empty, keep the empty
  list rather than deleting the key, for schema stability.
- **`AGENTS.md`.** In the "Not this file's job" list, drop the bullet that
  ends with `— see tc-standards-conformance in the backlog.`. Leave the
  other bullets intact.
- **`CONTRIBUTING.md`.** Drop the sentence that points at
  `tc-standards-conformance` (and any adjacent sentence that only exists to
  set it up).
- **`.gitlab/merge_request_templates/Default.md`.** In the header HTML
  comment, remove the paragraph beginning "TC conventions for agent-authored
  MRs live in…". Keep the paragraph beginning "Fills the PARITY.md 'Not
  ported' routing…" — that explains why the template exists. Remove the
  footer HTML comment about the `Card: sc-` trailer entirely. The
  `gitlab.tcdevops.com/Zak/moe` URL in the top line is covered by §3.

### 6. Regenerate and verify

Run after every source change above lands:

1. `pnpm mint` — regenerates `/plugins/`. Expected diff: every occurrence
   of `tc-governance-check`, `tc-conventions.md`, and the old URL is gone;
   the renamed `governance-marker-check` appears; the new URL appears.
2. `pnpm mint:check` — CI gate; asserts `/plugins/` matches source. Must
   pass.
3. `pnpm check` — lint + typecheck + tests. Must pass. If the
   `metadata.test.ts` URL assertion was not updated in §3, this is where
   it fails.
4. `pnpm provenance` — validates the attribution register and license
   payloads. Should pass unchanged; TC-specific removals do not touch
   PARITY.md or NOTICE.

## Guarded surfaces

Per AGENTS.md "Guarded surfaces", these are the tests / assertions that will
fire if the changes above are inconsistent:

- **`packages/core/test/metadata.test.ts`.**
  - The `expect(config, rel).toContain("https://gitlab.tcdevops.com/Zak/moe")`
    assertion must be updated to the new URL in lockstep with the mint YAML
    changes. A partial update fails this test.
  - The "every skill on disk in exactly one map" test: this design does
    *not* delete a skill directory — `retrieving-context` stays, only its
    contents change. If §2 collapses `retrieving-context` in a way that
    removes the directory (it should not), `skill-tiers.yaml` must be
    updated at the same time.
- **`.claude-plugin/marketplace.json` `checkMarketplace()`.** Asserts
  registry and marketplace agree. The hook rename does not change any
  plugin name or top-level manifest, so this should be untouched. If it
  does fire, revisit the rename.
- **`packages/core/skills/_shared/` link check.** Every relative link to
  `_shared/tc-conventions.md` in an owned file must be gone by the time
  the file is deleted. §4 covers the known callers; a `grep -RIn
  _shared/tc-conventions.md packages/core/` should return empty after §4.
- **`packages/core/skill-tiers.yaml`.** Not modified by this design.
  Confirm the deleted agent (`search-codegraph.md`) is under `agents/`,
  not `skills/` — agents are not enumerated by the skill-tiers map, so no
  update is needed. Verify with the same `pnpm test` run above.

## Sequencing

Land as a single MR. The changes are interdependent — the metadata test's
URL assertion, the mint YAML `repository` field, and the regenerated plugin
tree all have to move together, and any half-landed state breaks
`pnpm check` or `pnpm mint:check`. Inside the MR, organize commits so a
reviewer can walk them in order:

1. URL rewrite (§3) — smallest and most mechanical.
2. Genericize the hook (§2, hook + hooks.json + README env-var mention).
3. Rewrite `retrieving-context` and `search-moedex` (§2).
4. Delete-outright surface (§1), including CI job removal.
5. Surgical strips in shared skills (§4).
6. Backlog and prose sweep (§5).
7. `pnpm mint` regeneration commit (§6) — the diff should be entirely
   `plugins/**`, no source files. If any source file appears here, an
   earlier commit was incomplete.

Intermediate commits will fail `pnpm mint:check` (source and `/plugins/`
disagree until commit 7) and may fail `pnpm check` (the metadata URL
assertion needs its source change and its test change together). Only the
MR's final state has to be green. Note this in the MR description so a
reviewer bisecting by commit does not chase a red they know about.

## What is deliberately out of scope

- **`@bubstack/*` package scope.** Unchanged. Bubstack is Zak's brand, not
  a TC customization.
- **Zak Keown copyright in `NOTICE`.** Unchanged.
- **`moe-tone-and-branding` backlog item.** Unchanged — Moe-owned, not TC.
- **Historical evidence.** Deleted TC content is preserved in git history;
  no `docs/history/` archive is created for it. If a future contributor
  needs to reconstruct the TC integration, `git log` and PARITY.md's
  "Historical evidence" clause cover it.
- **Provenance ledger changes.** `PARITY.md` and `NOTICE` are not touched.
  The TC MR conventions were vendored from TC repos but the pinned SHAs
  live only in `_shared/tc-conventions.md` (which is deleted here), not in
  PARITY.md.
- **`.gitattributes`, `.gitignore`, `.turbo/`, `.claude/worktrees/`, and
  other tooling.** Untouched. None reference TC.
