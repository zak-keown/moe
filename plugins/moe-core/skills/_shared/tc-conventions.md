# TC merge-request conventions

Shared reference for every core skill that opens, describes or replies to a
merge request on `gitlab.tcdevops.com`. Read this from
`finishing-a-development-branch`, `using-git-worktrees` and
`receiving-code-review` — do not restate it in each skill.

## Provenance

Vendored from two TC repositories. The pattern is the one PARITY.md's
"Attribution" carve-out permits: this file names the upstream project, path and
revision it was derived from, and a scheduled CI job in `.gitlab-ci.yml`
(`tc-conventions-drift`) fails when upstream has moved past the pinned SHA.

Machine-readable manifest — the `tc-conventions-drift` CI job greps for these
two lines and compares each SHA against the upstream `main`:

- `ai/skills@9228cc6c880df3a51c7b7f7782afc5826089c44f:skills/creating-merge-requests/SKILL.md`
- `ai/claude-code-platform-plugin@35096293343fe0493ba732fa3ea4d831612a996d:skills/tc-git-worktrees/SKILL.md`

**Bootstrapped 2026-09-01.** Both SHAs above are real, and each was verified by
fetching the named path at that exact revision — not merely by resolving `main`.
They replaced `<TC-BOOTSTRAP-PENDING>` sentinels that existed because the branch
was authored without read access to `gitlab.tcdevops.com`; the drift job
soft-passed on the sentinel by design until then.

To re-bootstrap or re-pin after a deliberate update:

```bash
glab -R gitlab.tcdevops.com/ai/skills api projects/:id/repository/commits/main --jq .id
glab -R gitlab.tcdevops.com/ai/claude-code-platform-plugin api projects/:id/repository/commits/main --jq .id
```

Note the two upstreams move at very different rates, and the pins record that:
`ai/skills` was last touched 2026-08-31 (MR !10, harness-specific skill
variants), while `ai/claude-code-platform-plugin` has not changed since
2026-04-23. The second is the sibling fork Moe replaces, so a moving SHA there
is more interesting than a still one.

Do not remove the drift-check job. Do not weaken the SHA format (`[0-9a-f]{40}`).
A stale convention that silently mislabels every agent-authored MR is the failure
mode this manifest exists to prevent.

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
