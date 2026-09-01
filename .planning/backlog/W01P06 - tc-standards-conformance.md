---
slug: tc-standards-conformance
title: TC Standards Conformance For Git Skills
idea: |
  - Mutate skills to conform to TC standards - start with MRs and branch formatting
      - https://gitlab.tcdevops.com/ai/skills
      - Branch format is `sc-{cardNumber}/{slug}
      - Explore how to keep these up-to-date
status: done
size: M
estimate: 12-17 h
depends_on: [DO-NOW-1, DO-NOW-2, DO-NOW-3, DO-NOW-5]
blocks: [tc-governance-integration]
conflicts_with: [moe-tone-and-branding, native-renderers, tiered-workflow-naming, contributing-flow-docs]
touches:
  - packages/core/skills/_shared/
  - packages/core/skills/finishing-a-development-branch/
  - packages/core/skills/using-git-worktrees/
  - packages/core/skills/receiving-code-review/
  - packages/core/skills/verification-before-completion/
  - .gitlab/merge_request_templates/
  - CODEOWNERS
  - .gitlab-ci.yml
decision_needed: no
---

# TC Standards Conformance For Git Skills

> Repo read for this doc: `~/Code/moe` — the Superpowers hard fork. Not
> `~/Code/tools/moe`, not `~/.claude/moe-core`.

## Supersession note (2026-09-01)

The narrow standards work described here—shared conventions, GitLab/branch
guidance, CODEOWNERS, the MR template and drift plumbing—merged. The later
expansion to port or reconcile all 17 `tc-*` skills did not happen and is now
**canceled, not completed**. The census in `tc-domain-skills-port` records the
replacement decision: thirteen duplicates are declined, three tool-wrapper
capabilities are superseded by the now-built `tracing-across-the-stack` skill,
and the one knowledge artifact belongs in `ai/kb`.

Accordingly, the `done` frontmatter applies only to the narrow implementation
that merged. It must not be cited as evidence that the accepted 12–17 hour,
17-skill expansion shipped. The historical analysis below is preserved to show
how that expansion arose.

## The idea

> Mutate skills to conform to TC standards - start with MRs and branch formatting
> — https://gitlab.tcdevops.com/ai/skills — Branch format is `sc-{cardNumber}/{slug}`
> — Explore how to keep these up-to-date

Moe's skills inherit GitHub vocabulary and `gh`-shaped tooling from upstream, but
Moe's origin is self-hosted GitLab and its users work Shortcut cards. Three things
have to change: the *vocabulary* (PR → MR), the *tooling* (`gh api` → `glab` /
`gitlab_create_mr`), and the *inputs* (a branch name derived from a Shortcut card
rather than invented). The fourth part — keeping TC's conventions from drifting
away from Moe's vendored copy — is the half with no obvious answer, and is
where most of the estimate goes.

## Debate-review decisions (2026-08-31)

- **PARITY.md is frozen at its current upstreams** (see its "Upstream tracking,
  frozen" section). No new drift-tracking rows.
- **So option 2 loses its stated justification.** Its recommendation rests on
  "it is the mechanism PARITY.md already uses for every upstream — so it adds a
  pattern the repo has rather than a new one." That precedent is withdrawn.
  Re-argue option 2 on its own merits against option 3 (runtime reference) and
  option 4 (`@tc/skills` from ProGet), or place the manifest in a TC-scoped file
  that is not this ledger.
- **The freeze does not block the vendoring itself.** `_shared/tc-conventions.md`
  and its provenance header are attribution, which is the freeze's explicit
  carve-out. What is blocked is growing PARITY into a live drift tracker for
  three more repos.
- **`tc-governance-integration`'s watch-only row kind is withdrawn**, so that
  design requirement is off this item's plate.

## Why it matters

Every one of the ~20 users opens MRs in `gitlab.tcdevops.com` against branches
their teammates expect to find by card number. Today a Moe-driven session
produces a branch named whatever the agent felt like and an MR with no `AI`
label, which means it is invisible to the GitLab filter TC uses to audit
AI-authored changes (`ai/skills:skills/creating-merge-requests/SKILL.md`). That
is not cosmetic: the label is TC's only handle on agent output.

## Current state

**Moe side (core worktree `.claude/worktrees/wf_238bb49d-362-13`, branch
`import/packages-core` — `packages/core/skills/` on `main` is a stub).**

28 skill directories. 15 `.md` files match forge vocabulary; 9 once
`developing-claude-code-plugins/` and `writing-skills/anthropic-best-practices.md`
are excluded. Only **six** carry behaviour worth changing:

| File | What is there |
|---|---|
| `finishing-a-development-branch/SKILL.md:61,72,113,121,208,220` | "create a Pull Request", "### Option 2: Push and Create PR", "| 2. Create PR |". Line 121 already reads "create the pull/merge request … with the forge's tooling" — partly de-GitHub'd during the fork, but forge-*agnostic*, not GitLab. |
| `receiving-code-review/SKILL.md:203-205` | "## GitHub Thread Replies" + `gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`. The only live `gh` invocation in core. |
| `verification-before-completion/SKILL.md:3,54,112` | "before committing or creating PRs", "About to commit/push/PR". Includes frontmatter `description:`, so it affects trigger matching. |
| `writing-clearly-and-concisely/SKILL.md:27`, `writing-skills/SKILL.md:666`, `using-moe/references/codex-tools.md:93,104,108` | "pull request descriptions"; "contributing back via PR (if broadly useful)" — wrong for a repo that publishes nothing; "commit/push/PR via App UI". Vocabulary only. |

`using-git-worktrees/SKILL.md` contains **no branch-naming content at all**
(grep for `branch name|naming|feature/|sc-` returns nothing). `writing-plans/` and
`requesting-code-review/` contain **zero** forge references — the brief listed them
as prime suspects; they are clean.

`packages/core/skills/_shared/` holds 3 fragments referenced by 10 skills —
an existing include mechanism, and the right home for a conventions fragment.

**Other packages (on `main`).** `packages/backstory/skills/git-archaeology/SKILL.md`
has the densest `gh pr` usage (lines 137-144, 176) — but it already branches on
forge at line 149 ("If the remote is GitLab rather than GitHub") on purpose,
because it *mines* other people's repos. Out of scope. `packages/crew/skills/` and
`packages/glass/skills/` have one skill each; neither raises MRs.

**Root.** `.gitlab-ci.yml` exists. `CODEOWNERS` and `.gitlab/` **do not** (`ls`
fails on both), so PARITY.md's two routings are unfilled:
`superpowers-evals/.github/CODEOWNERS` → root `CODEOWNERS`, and
`*/.github/PULL_REQUEST_TEMPLATE.md` → `.gitlab/merge_request_templates/`.

**TC side — `gitlab.tcdevops.com/ai/skills`** (read via `gitlab_list_tree` /
`gitlab_get_file`; both worked). Six skills as plain SKILL.md dirs under
`skills/` — no plugin manifest — plus a generated `index.json` and a
dependency-free Node CLI (`bin/skills.mjs`) published to ProGet as `@tc/skills`.
The MR standard is one file, `skills/creating-merge-requests/SKILL.md`: every
agent-opened MR carries the **`AI`** label plus a scoped **`agent::<name>`**
label; `gitlab_create_mr` merges both server-side; `glab`/web UI/raw API must add
them by hand; editing labels later must keep `AI` in the set. Nothing there
mentions branch format (searching `sc-` returns zero hits).

**TC side — `gitlab.tcdevops.com/ai/claude-code-platform-plugin`** (project 1124).
**The significant find, and not in the brief:** a *sibling fork of the same
upstream Superpowers tree*, already TC-mutated. 17 `tc-*` skills, and
`skills/tc-using-platform/SKILL.md` carries a 12-row override map
(`superpowers:finishing-a-development-branch` → `tc-platform:tc-finishing-branch`,
etc.) that lines up almost 1:1 with Moe's core. The branch convention lives
there, not in `ai/skills` — `skills/tc-git-worktrees/SKILL.md:31`: "Branch name
format: `sc-{CARD_NUMBER}/{description}`", then `AskUserQuestion` for the card
number, an auto-generated slug, and `feature/{description}` with no card.
`skills/tc-finishing-branch/SKILL.md` Option 2 is a full `glab mr create` with
`-a`/`--reviewer` (GitLab group `ui-approvers`), `--remove-source-branch`,
`--squash-before-merge`; its Steps 2/2b add a trust-map gate
(`getTrustRating`/`analyzeTrust`/`approveTrustChanges`) with no Moe equivalent.

**Shortcut derivation works.** I called
`mcp__codegraph__shortcut_stories-get-branch-name` on story `136686`; it returned
`feature/sc-136686/nb2-admin-api-access-requests-grid`. A skill can *derive* the
branch rather than ask — but the tool prepends `feature/`, matching neither TC's
`sc-{CARD}/{desc}` nor the `sc-{cardNumber}/{slug}` this item was briefed with.

**Drift is already observable.** `ai/skills/README.md`'s row for
`creating-merge-requests` claims it covers "Conventional Commits titles for
auto-versioned repos"; the SKILL.md has no such section. Read the SKILL.md,
never the README row.

## Prerequisites

- **DO-NOW-1** — five of six target files live in the `core` worktree; editing
  them before the merge means resolving the same edits twice.
- **DO-NOW-2** — tiering decides whether the fragment's dependents land in
  lean(13) or full(27). Editing a skill nobody loads is wasted work.
- **DO-NOW-3** — skill edits only reach users through a regenerated `/plugins/`.
- **DO-NOW-5** — the GitLab remote is what makes `glab`, `CODEOWNERS` and the MR
  template real rather than aspirational, and what the drift job runs against.

## Proposed approach

The mutation itself is not controversial. The **up-to-date mechanism** is, so
that is where the options are.

1. **Git submodule** `ai/skills` under `packages/core/` — zero drift by
   construction, but pnpm/turbo/mint must all learn to ignore it and a clone that
   forgets `--recurse-submodules` silently loses the conventions.
2. **Vendor with a pinned SHA + a scheduled drift-check job** — one `_shared/`
   fragment, upstream project/path/SHA in a manifest, a scheduled pipeline that
   fires when upstream moves; costs one CI job and a manual reconcile, and lets
   Moe's copy differ from TC's deliberately.
3. **Runtime reference** — skills fetch the convention from `ai/skills` at
   invocation time; never stale, but fails closed without network + auth.
4. **Consume `@tc/skills` from ProGet** — real and already shipping, but it
   installs into `~/.claude/skills/` and competes with Moe's mint-generated
   plugin for the same namespace.

**Recommendation: option 2.** It is the mechanism PARITY.md already uses for
every upstream — pin a revision, record provenance, reconcile on purpose — so it
adds a pattern the repo has rather than a new one. It is also the only option
that survives the fact that TC's text *cannot* be copied verbatim:
`tc-finishing-branch` depends on a trust-map MCP server and a `ui-approvers`
group that do not exist in Moe. And the pattern already exists in TC's own CI —
`ai/skills/.gitlab-ci.yml:33-37` fails the build when the committed `index.json`
drifts from the catalog. Same shape, different artifact.

Steps:

1. `packages/core/skills/_shared/tc-conventions.md` — branch format, the `AI` +
   `agent::claude` labels, prefer `gitlab_create_mr` over `glab` over web UI, MR
   body shape. Referenced by the skills below, not inlined, matching how the
   other three `_shared/` fragments are used. Head it with the provenance
   manifest (`ai/skills@<sha>:skills/creating-merge-requests/SKILL.md`,
   `ai/claude-code-platform-plugin@<sha>:skills/tc-git-worktrees/SKILL.md`).
2. `finishing-a-development-branch/SKILL.md` — Option 2 becomes GitLab-first:
   `gitlab_create_mr` (labels automatic) or `glab mr create` (labels by hand),
   `--remove-source-branch`. Headings and the options table go PR → MR. Keep one
   short forge-agnostic fallback paragraph; do not delete the generic path.
3. `using-git-worktrees/SKILL.md` — net-new **Step 1b: Branch name**: call
   `shortcut_stories-get-branch-name` when a card number is known, strip the
   `feature/` prefix to land on `sc-{card}/{slug}`, fall back to TC's
   `AskUserQuestion` flow when there is no card.
4. `receiving-code-review/SKILL.md:203-205` — GitHub thread replies become GitLab
   discussion notes (`glab api projects/:id/merge_requests/:iid/discussions/:did/notes`).
5. Vocabulary pass on the four remaining files, frontmatter included.
6. Root `CODEOWNERS` and `.gitlab/merge_request_templates/Default.md`, per
   PARITY.md's "Not ported" routings.
7. `.gitlab-ci.yml` — a scheduled `tc-conventions-drift` job that reads the
   manifest SHAs and fails (or opens an MR) when upstream has moved.

## Scope boundary

**In:** the six core skill files above; the `_shared/tc-conventions.md` fragment;
the branch-name derivation step in `using-git-worktrees`; root `CODEOWNERS` and
`.gitlab/merge_request_templates/`; the drift-check manifest and CI job.

**Out:**
- `packages/backstory/skills/git-archaeology/SKILL.md` — deliberately dual-forge
  (line 149); it reads foreign repos, it does not raise MRs.
- Every GitHub URL in `developing-claude-code-plugins/` and
  `writing-skills/anthropic-best-practices.md` — upstream issue links and a
  vendored Anthropic document. PARITY.md's provenance rule: **keep**. Only
  self-referential URLs get rewritten, and there are none in these files.
- Replacing prose instructions with actual tool calls as a policy —
  `native-renderers`. This doc changes *which* forge the text names.
- Tone or voice over the same files — `moe-tone-and-branding`. Skill renames and
  tier moves — `tiered-workflow-naming`.
- `CONTRIBUTING.md` and the human contribution narrative —
  `contributing-flow-docs`. I take `.gitlab/merge_request_templates/` and
  `CODEOWNERS` because PARITY.md routes them and they encode TC MR conventions;
  that slug should link to them rather than author its own.
- TC's trust-map gate and `ui-approvers` auto-reviewer — blocked on Q2 below.
- The AI Governance doc and TC Guide — `tc-governance-integration`, which reuses
  the mechanism this doc lands.

## Decisions (2026-08-31, Zak)

**Q1 — superseded 2026-09-01.** Moe still replaces the sibling fork, but its
17 `tc-*` skills are not ported wholesale. Thirteen duplicates are explicitly
declined, three wrapper capabilities are replaced by the cross-stack-tracing
design, and one knowledge artifact belongs in `ai/kb`. This cancellation is the
resolved outcome; it is not a claim that the 17-skill work completed.

**Historical estimate for the now-canceled expansion:** 4-5 h
becomes **12-17 h**: 17 `tc-*` skills to reconcile rather than one fragment to
write. The doc's own earlier warning — "that turns a fragment into a 17-skill
reconciliation and is a different, larger item" — was accepted at the time but
was never implemented. Its scheduling consequences were:

- It becomes W01's co-critical path alongside `installer-hq-dx`, so the wave's wall
  clock is set by whichever of the two runs longer, not by installer alone.
- `contributing-flow-docs` and `tc-governance-integration` both `depends_on` this
  item. Tripling it delays them; neither moves wave, because both were already
  downstream.

**Q2 — retired with the canceled port.** Whether
`tc-finishing-branch`'s `getTrustRating`/`analyzeTrust` block and `ui-approvers`
auto-assignment should come across was a port decision inside the 17 skills. That
port is canceled; reopen this only as a separate concrete capability request.

**Q3 — canonical branch format: still open.** Three sources disagree and the
replace decision does not settle it. See the original question below; it now has to
be answered against `ai/claude-code-platform-plugin`'s own usage too, which is new
evidence the earlier framing did not have.

**Q4 — confirmed: this slug owns the shared up-to-date mechanism**, with
`tc-governance-integration` adding two rows to the same manifest. `blocks:` stays
as written.

*The original questions, kept as written:*

1. **`ai/claude-code-platform-plugin` is a sibling fork of the same upstream,
   already TC-mutated.** Does Moe replace it, coexist with it, or absorb its 17
   `tc-*` skills? This is not academic: Moe's `using-moe` and its
   `tc-using-platform` both claim the session-start bootstrap slot with a
   "you MUST invoke skills" directive, so installing both gives every user two
   competing bootstraps and two names for the same skill. If Moe replaces it,
   step 1 above should port its deltas wholesale instead of writing a fragment.
2. **Trust-map gate:** `tc-finishing-branch` Steps 2/2b block on
   `getTrustRating`/`analyzeTrust` and auto-assign reviewers from the GitLab
   `ui-approvers` group. Adopt, or leave out of Moe?
3. **Canonical branch format.** Three sources disagree. The brief for this item
   said `sc-{cardNumber}/{slug}` (recorded verbatim in this doc's `idea:`
   frontmatter, which is now the only copy — IDEA-LOG.md was cleared for a fresh
   list on 2026-08-31), `tc-git-worktrees/SKILL.md:31` says
   `sc-{CARD_NUMBER}/{description}` with a `feature/{description}` no-card
   fallback, and `shortcut_stories-get-branch-name` emits
   `feature/sc-136686/{slug}`. Which one does the skill enforce?
4. **Shared up-to-date mechanism.** `tc-governance-integration` has the identical
   problem for `ai/aigovernance` and `ai/tc-guide`. I recommend **this slug owns
   it** — it has the concrete failure mode (a stale convention silently
   mislabels MRs) and the manifest is the smaller half of its work — with
   `tc-governance-integration` adding two rows to the same manifest. Set
   `blocks: [tc-governance-integration]` on that basis. Confirm, or flip it.

## Historical effort for the narrow standards work

| Step | Time |
|---|---|
| `_shared/tc-conventions.md` + provenance manifest | 30 min |
| `finishing-a-development-branch` Option 2 rewrite | 45 min |
| `using-git-worktrees` Step 1b (MCP call + prefix strip + fallback) | 45 min |
| `receiving-code-review` GitLab discussions | 20 min |
| Vocabulary pass on the remaining 4 files | 20 min |
| `CODEOWNERS` + MR template | 20 min |
| Drift-check CI job + verifying it fails on a bumped SHA | 1-1.5 h |
| Regenerate `/plugins/`, run the suite | 30 min |

**~4-5 h.** The old Q1 answer temporarily expanded this into a 17-skill
reconciliation; that expansion is canceled as described above. The narrow work is slower
if the drift job needs a GitLab token with `ai/skills` read plus MR-create on
`Zak/moe`; if that provisioning stalls, land steps 1-6 and leave step 7
behind a follow-up.

## Verification

- `grep -rniE "pull request|gh pr|gh api|gh repo" packages/core/skills --include="*.md"`
  returns only the provenance-exempt allowlist
  (`developing-claude-code-plugins/`, `writing-skills/anthropic-best-practices.md`,
  `systematic-debugging/test-pressure-1.md` — a fixture).
- `packages/core/skills/_shared/tc-conventions.md` exists and names both upstream
  SHAs; each of the three behaviour-bearing skills references it.
- `test -f CODEOWNERS && test -f .gitlab/merge_request_templates/Default.md`.
- `pnpm mint` regenerates `/plugins/moe-core/` with the new fragment present, and
  DO-NOW-3's identical-regeneration CI job still passes.
- The `tc-conventions-drift` job passes against the recorded SHAs, and fails when
  a manifest SHA is hand-edited to a stale value.
- `pnpm lint && pnpm typecheck && pnpm test` green.
