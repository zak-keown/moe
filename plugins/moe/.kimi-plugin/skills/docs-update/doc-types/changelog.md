# changelog — doc-type template

You are updating or verifying a project's `CHANGELOG.md`.

Changelog is update-only. There is no from-scratch generation mode: a project
with no `CHANGELOG.md` is skipped by the coordinator's relevance check, not
handed a blank file to fill from the entire git history.

## What to read

- The existing `CHANGELOG.md` — find the date, or version heading, of the
  most recent entry. This is the cutoff.
- `git log --oneline --since="<last entry's date>"` — every commit since the
  cutoff. Use `--since` with the actual date found above, not a guessed
  window.
- Commit subjects — check whether the project already follows the
  Conventional Commits convention (`feat:`, `fix:`, `chore:`, `docs:`, and so
  on). If most recent commits carry a type prefix, group new entries by that
  type; if not, list them in a flat list matching the changelog's existing
  style.
- The changelog's existing formatting — heading style (a version heading vs.
  a date heading), bullet style, whether it links commit SHAs or PR numbers —
  so new entries match without a visible seam.

## What to write

- New entries only, for commits since the last entry's date, grouped by
  conventional-commit type if the project uses that convention.
- Insert the new entries **above** the existing entries. Never touch a line
  below the insertion point.
- Match the existing heading and bullet format exactly. A changelog with a
  mixed format, because this rule was violated, is worse than one with no
  new entries.

## Rules

- **Never regenerate the full changelog.** If there is no existing
  `CHANGELOG.md`, do not create one — report that the file is absent and
  stop.
- Every entry you add must correspond to a real commit — run `git log`
  first, do not summarize from memory or from unrelated context.
- Do not rewrite, reformat, or remove any existing entry.
- Do not invent a version number or release date; use the commit dates from
  `git log`, or leave the entry under an "Unreleased" heading if the
  project's format already has one.
- Invoke `write-clearly` before finalizing prose.

## Verify mode

When verifying rather than generating, compare the changelog's most recent
entries against actual git history since the previous entry's date, and
report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: CHANGELOG.md
  anchor: "<quoted text from the doc>"
  actual: "<what git log actually shows>"
  severity: high | medium | low
```

Severity guide:
- **high** — a documented change that does not correspond to any commit in
  `git log`
- **medium** — a commit that changed public behavior since the last entry
  but is not represented in the changelog
- **low** — a changelog entry that is technically accurate but does not
  match the wording or grouping of the actual commit
