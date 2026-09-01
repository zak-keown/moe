# TC merge-request conventions

Shared reference for every core skill that opens, describes or replies to a
merge request on `gitlab.tcdevops.com`. Read this from
`finishing-a-development-branch`, `using-git-worktrees` and
`receiving-code-review` — do not restate it in each skill.

## Provenance

The merge-request standard is vendored from `ai/skills`. Moe owns the branch
and worktree derivation locally. The pattern is the one PARITY.md's
"Attribution" carve-out permits: this file names the upstream project, path and
revision it was derived from, and a scheduled CI job in `.gitlab-ci.yml`
(`tc-conventions-drift`) fails when upstream has moved past the pinned SHA.

Machine-readable manifest — `scripts/check-tc-drift-manifest.mjs` validates
these three rows and, in remote-check mode, compares every SHA against the
project's upstream `main`. A `content` row names text deliberately incorporated
into this file. A `watch-only` row records an operational dependency without
vendoring its body or making it imported work for `PARITY.md` or `NOTICE`.

<!-- tc-drift-manifest:start -->
- `content|ai/skills@aa27d97d2551f7341ef606a8e427f060091ad627:skills/creating-merge-requests/SKILL.md`
- `watch-only|ai/aigovernance@d6a5387789ab5818acc6eb3d205914d7e844f501`
- `watch-only|ai/tc-guide@e900235d1de8afb969b0698653dceb500eeb9701`
<!-- tc-drift-manifest:end -->

**Bootstrapped 2026-09-01.** All three SHAs above are real. The `content` row was
verified by fetching the named path at that exact revision — not merely by
resolving `main`. The two `watch-only` rows were resolved directly from their
current `main` refs through TC's CodeGraph GitLab read surface. A
`<TC-BOOTSTRAP-PENDING>` sentinel is structurally valid for an unauthenticated
bootstrap, but remote comparison reports it as pending and fails rather than
claiming equality.

**Refreshed 2026-09-01.** A live comparison found that only `ai/skills` had
moved. Its two intervening commits changed `shortcut-triage` and the README;
`gitlab_compare_refs` showed no change to
`skills/creating-merge-requests/SKILL.md`. The content pin therefore advanced to
`aa27d97d2551f7341ef606a8e427f060091ad627` without changing the incorporated
convention text.

To re-bootstrap or re-pin after a deliberate update:

```bash
glab -R gitlab.tcdevops.com/ai/skills api projects/:id/repository/commits/main --jq .id
glab -R gitlab.tcdevops.com/ai/aigovernance api projects/:id/repository/commits/main --jq .id
glab -R gitlab.tcdevops.com/ai/tc-guide api projects/:id/repository/commits/main --jq .id
```

`ai/skills` advanced again on 2026-09-01 (MR !11, `shortcut-triage` evidence and
redaction rules), while the incorporated merge-request convention remained
unchanged. Branch naming remains a Moe-owned downstream decision.

Do not remove the drift-check job. Do not weaken the SHA format (`[0-9a-f]{40}`).
A stale convention that silently mislabels every agent-authored MR, or an
unnoticed policy/context change in a watch-only source, is the failure mode this
manifest exists to prevent.

## Branch name

Format: `sc-{CARD_NUMBER}/{slug}`.

Derivation, in order:

1. **Card number known** — call `shortcut_stories-get-branch-name` on the card;
   it returns `feature/sc-{CARD_NUMBER}/{slug}`. Strip the `feature/` prefix.
2. **No card** — fall back to `feature/{slug}`. Never invent a card number.

The prefix strip matters because `shortcut_stories-get-branch-name` prepends
`feature/` unconditionally, and the TC filter that surfaces AI-authored MRs
matches on the `sc-` prefix rather than on `feature/`. A branch that keeps
`feature/` gets filed under the wrong slice.

## Labels

Every agent-opened MR carries two labels:

- `AI` — TC's audit filter matches on this exact string.
- `agent::claude` — the scoped `agent::<name>` label, per
  `ai/skills:skills/creating-merge-requests/SKILL.md`.

Editing labels later must keep `AI` in the set. Removing it hides the MR from
the audit filter, which is the point of the label.

## Tool preference

Prefer, in order:

1. **`gitlab_create_mr`** MCP tool if available in the current session. It
   accepts a `labels` array server-side, so both labels land atomically with
   MR creation. Nothing else does.
2. **`glab mr create`** if the MCP tool is not available. Labels must be added
   by hand — pass `--label AI --label agent::claude`. Also pass
   `--remove-source-branch` and, when a squash policy is set,
   `--squash-before-merge`.
3. **Web UI** as a last resort. Add both labels before submitting.

Never open an MR via raw `curl` or `glab api projects/:id/merge_requests` —
those bypass the label-safety layer above with no benefit.

## MR body shape

```
## Summary

<one to three bullets>

## Test plan

- [ ] <verification step>
- [ ] <verification step>

Card: sc-{CARD_NUMBER}
```

The `Card:` trailer is what links the MR to the Shortcut story in TC's tooling.
If the branch was derived from a card number, include it. If not, omit the
trailer rather than inventing one.
