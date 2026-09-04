---
name: review-codebase
description: Use when reviewing a whole repository rather than a diff — an inherited codebase, a pre-release sweep, a security pass, or any request to find what is wrong across a tree too large to hold in one context
argument-hint: "[--depth shallow|medium|deep] [--verify]"
---

# Reviewing A Codebase

## Overview

**You already know how to review code. What you do not do reliably is emit a
report another program can consume.**

That is measured, not assumed. Eleven baseline runs against this repository
produced severity labels, per-finding file and line, retracted findings kept
with their reasons, and a section naming what was examined and found clean —
none of it prompted. The same runs produced positional finding numbers that
renumber on every re-run, no frontmatter, and a coverage statement filed in a
different document from the report. One run collapsed four findings under a
single `12-15. Smaller items` heading, leaving them impossible to address.

So this skill is a contract, not a lecture. Judgement is yours. The five
elements below are the ones that were missing every time, and `fix-review`
cannot work without them.

## The output contract

Write `CODEBASE-REVIEW.md` to the root of the repository under review. It has
exactly this shape, and every REQUIRED element earns its place by being
something a later program reads.

```markdown
---
report: codebase-review          # REQUIRED
generated: <ISO date>            # REQUIRED
base_sha: <short sha>            # REQUIRED — what you actually read
depth: shallow|medium|deep       # REQUIRED
denominator: <n> <definition>    # REQUIRED — see Coverage
files_opened: <n>                # REQUIRED
findings: {critical, high, medium, low, total}   # REQUIRED
verified: true|false             # REQUIRED — whether --verify ran
status: clean|issues_found       # REQUIRED
---

# Codebase Review — <repo>

## Coverage                       <!-- REQUIRED, and it comes FIRST -->

## Critical
### CR-001: <title>              <!-- one heading per finding, never a range -->
**File:** `path`
**Anchor:** `symbol`, test name, or a short quoted sentence
**Severity:** critical
<what is wrong, why it is wrong, and the fix>

## High
## Medium
## Low
## Checked and found sound        <!-- optional, and worth writing -->
```

### Finding IDs

`CR-###`, zero-padded to three, assigned once at merge in severity order —
critical first, then high, medium, low; within a severity, by path. **Never a
positional integer.** `fix-review` addresses findings by ID and stamps
dispositions back against them, so an ID that shifts when a finding is added
silently repoints every record. A heading covering more than one finding is the
same defect in a worse form: it cannot be addressed at all.

### Finding anchors

Use the repository path plus a stable symbol, test name, or short quoted
sentence. Never use a line number. Parallel workers can read adjacent commits,
and the repair itself moves lines; a line offset becomes false evidence while
the named symbol or behavior still identifies the defect.

### Severity

`critical` / `high` / `medium` / `low`. Four, fixed, stated here because
otherwise it is invented per run — baseline runs produced `High/Medium/Low`,
`High/Medium/Low/Policy`, and one that filed credential capture on a shared host
as High with no critical rung at all.

- **critical** — exploitable now, or destroys data, or leaks a credential
- **high** — wrong under ordinary conditions, or a security control that does
  not hold
- **medium** — wrong under conditions a reader would not expect to be excluded
- **low** — real, small, and safe to defer

A policy decision worth recording rather than fixing is not a finding. Put it
under `## Checked and found sound` or its own section, outside the ID sequence.

### Coverage

**The coverage section goes in the report, above the findings, and it names its
own denominator.** Every baseline run stated coverage honestly when asked and
then filed it somewhere the report does not travel with. The report is what
reaches the reader.

Three runs counting "source files" in the same tree got 874, 935 and 943. A
ratio whose denominator is undefined is decoration, so state the rule you used:

```
Denominator: 903 files matching *.ts,*.js,*.mjs,*.cjs,*.py,*.rs,*.sh under
`git ls-files`, excluding lockfiles, dist/, and generated output.
Opened: 31 (5 partial). Not opened: 872.
Absence of findings in an unopened area is evidence nobody looked, not
evidence it is clean.
```

Name the unopened areas by package or directory. "I did not reach
`packages/flight`" is worth more to the reader than three more low findings.

## Depth

`--depth shallow|medium|deep`, default `medium`. It widens the file set and adds
review lenses together.

| | files | lenses | model |
|---|---|---|---|
| `shallow` | entrypoints, plus files changed most often in git history | correctness, security | the configured default |
| `medium` | all tracked source after exclusions | plus tests, error handling, API contracts | the configured default |
| `deep` | plus tests, config, scripts, infrastructure | plus performance, coupling, dependency risk | **a deep-reasoning model from the current spawn allowlist** |

Credential-bearing paths — `.env`, `*.pem`, `id_rsa`, `.npmrc` and the like —
are in scope at **every** depth regardless of extension. A committed secret is
the highest-severity thing a review can find and it never lives in a file with a
code extension, so an extension filter is exactly the wrong instrument for it.

Only `deep` escalates the model, by passing `model:` a deep-reasoning model from the current spawn allowlist when dispatching
`review-shard`. Shallow is cheaper by scope, not by capability.

**This is review breadth. It is not the `patch` / `change` / `feature` workflow
depth that `brainstorming` defines** — that axis classifies a unit of work
before planning it; this one sizes a review of work that already exists. The two
never appear in the same decision.

## Running it

Resolve [skills/review-codebase/scripts/review-scope.mjs](scripts/review-scope.mjs) relative to this loaded document, then invoke it as:

```bash
node "<resolved-review-scope.mjs>" \
  --depth medium --out .moe/review-shards
```

It enumerates via `git ls-files`, applies the exclusions, groups by top-level
directory, splits any group over 30 files, and writes a shard manifest plus one
file list per shard. The default `.moe/review-shards/` workspace is
repository-local and self-ignoring: shard reports survive session boundaries
without leaking into a broad `git add`. Do this with the script rather than by
hand: it is the part that must be identical across runs, and reproducing it in
prose costs tokens on every invocation to get a different answer each time.

Then dispatch one `review-shard` agent per shard, in waves of at most 8
concurrent. Each writes its own shard report; none of them commit. The agent
definition carries an off-limits list for the host it runs on; the dispatch
prompt may add to it, never subtract.

As reports land, resolve [skills/review-codebase/scripts/review-check.mjs](scripts/review-check.mjs) relative to this loaded document and validate each one before the merge ever sees it:

```bash
node "<resolved-review-check.mjs>" \
  --shards .moe/review-shards
```

It applies the merge's own grammar per report the moment the report exists,
plus the lint the merge cannot see: a `###` inside a fenced block, a
line-number citation in a body, a `**File:**` the tree does not contain. One
malformed record fails the whole merge, so fix the report (or re-dispatch the
shard) while that reviewer is still around. Pass `--require-all` for the final
pass before merging; `--shard <id>` checks one report.

**If parallel dispatch is unavailable** — session policy, runtime limits, a
harness without subagents — run the shards yourself, serially, in manifest
order. The output is identical and only the wall clock changes. See
`../_shared/parallel-adversarial-review.md` for the fallback this follows.

Finally, resolve [skills/review-codebase/scripts/review-merge.mjs](scripts/review-merge.mjs) relative to this loaded document:

```bash
node "<resolved-review-merge.mjs>" \
  --shards .moe/review-shards --out CODEBASE-REVIEW.md
```

The merge assigns the `CR-###` sequence, builds the frontmatter, and fails loudly
if a shard report is missing rather than silently reporting a smaller tree. It
also requires every shard's machine-readable base SHA and opened-file count to
match the manifest, requires `HEAD` still to be that base, and refuses a dirty
tracked tree. Do not change source between scope and merge; restart the review
from a new clean commit if the tree moves.

## `--verify`

With `--verify`, every critical and high finding goes to a `verify-finding`
agent whose job is to **refute it** — reproduce the defect or show it cannot
happen. Findings that survive are marked `verified: confirmed`; those that fall
are demoted or dropped, with the refutation kept.

Run the ordinary merge first so the serious findings have their stable
`CR-###` IDs. Resolve [skills/review-codebase/scripts/review-verify-scope.mjs](scripts/review-verify-scope.mjs) relative to this loaded document, then split them out:

```bash
node "<resolved-review-verify-scope.mjs>" \
  --shards .moe/review-shards --report CODEBASE-REVIEW.md
```

That writes one `.moe/review-shards/verify/CR-###.md` per critical and high
finding, plus a manifest of the ID set. Dispatch one `verify-finding` agent per
file, pointing it at its file. Every reply ends in a `VERDICT-JSON:` line.
Resolve [skills/review-codebase/scripts/review-verify-record.mjs](scripts/review-verify-record.mjs)
relative to this loaded document and record each reply as it arrives, from the
saved reply or the bare object:

```bash
node "<resolved-review-verify-record.mjs>" \
  --shards .moe/review-shards --from-file reply.txt
node "<resolved-review-verify-record.mjs>" \
  --shards .moe/review-shards \
  '{"id":"CR-001","verdict":"confirmed","evidence":"Reproduced from the public route."}'
```

Valid verdicts are `confirmed`, `confirmed-lower`, `refuted`, and `unproven`.
Only `confirmed-lower` carries a replacement severity, and it must be lower
than the original. Evidence is REQUIRED for every result. The recorder refuses
an ID outside the manifest, a verdict outside those four, a `confirmed-lower`
that does not lower, empty or over-long evidence, and a second verdict for an
ID unless `--replace` is passed; it rewrites
`.moe/review-shards/verifications.json` whole on every call. When its tally
shows nothing missing, finalize:

```bash
node "<resolved-review-merge.mjs>" \
  --shards .moe/review-shards \
  --verification-results .moe/review-shards/verifications.json \
  --out CODEBASE-REVIEW.md
```

The merge refuses a mismatched base, duplicate/extra results, or a missing
verdict for any critical/high ID. A bare `--verified` flag is rejected: the
report can say `verified: true` only after consuming a complete ledger.

This follows `_shared/parallel-adversarial-review.md`, adapted: PAR pairs two
reviewers over the same code, this pairs a challenger against one finding.

**PAR says it is always-on with no opt-out. That rule is scoped to the
iterate cluster's gates**, so a flag here is not a violation of
it. Verification costs one dispatch per serious finding, which is worth choosing
deliberately on a large tree.

## Red flags

- A finding heading covering a range (`12-15. Smaller items`)
- Positional integers where `CR-###` belongs
- A coverage number whose denominator is not stated next to it
- Reporting only what you found, with no line naming what you did not open
- Inventing a fifth severity rung, or filing a credential leak below critical
- Merging a shard report that `review-check.mjs` has not passed
- A verify reply with no `VERDICT-JSON:` line, or a verdict typed into the
  ledger by hand
- A worker that ran a repository script to prove the script touches `$HOME`
