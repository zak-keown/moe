---
name: reviewing-a-codebase
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
elements below are the ones that were missing every time, and `fixing-a-code-review`
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
**File:** `path:line`
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
positional integer.** `fixing-a-code-review` addresses findings by ID and stamps
dispositions back against them, so an ID that shifts when a finding is added
silently repoints every record. A heading covering more than one finding is the
same defect in a worse form: it cannot be addressed at all.

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
| `shallow` | entrypoints, plus files changed most often in git history | correctness, security | Sonnet |
| `medium` | all tracked source after exclusions | plus tests, error handling, API contracts | Sonnet |
| `deep` | plus tests, config, scripts, infrastructure | plus performance, coupling, dependency risk | **Opus** |

Only `deep` escalates the model, by passing `model: opus` when dispatching
`review-shard`. Shallow is cheaper by scope, not by capability.

**This is review breadth. It is not the `patch` / `change` / `feature` workflow
depth that `brainstorming` defines** — that axis classifies a unit of work
before planning it; this one sizes a review of work that already exists. The two
never appear in the same decision.

## Running it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/reviewing-a-codebase/scripts/review-scope.mjs" \
  --depth medium --out .review-shards
```

It enumerates via `git ls-files`, applies the exclusions, groups by top-level
directory, splits any group over 30 files, and writes a shard manifest plus one
file list per shard. Do this with the script rather than by hand: it is the part
that must be identical across runs, and reproducing it in prose costs tokens on
every invocation to get a different answer each time.

Then dispatch one `review-shard` agent per shard, in waves of at most 8
concurrent. Each writes its own shard report; none of them commit.

**If parallel dispatch is unavailable** — session policy, runtime limits, a
harness without subagents — run the shards yourself, serially, in manifest
order. The output is identical and only the wall clock changes. See
`../_shared/parallel-adversarial-review.md` for the fallback this follows.

Finally:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/reviewing-a-codebase/scripts/review-merge.mjs" \
  --shards .review-shards --out CODEBASE-REVIEW.md
```

The merge assigns the `CR-###` sequence, builds the frontmatter, and fails loudly
if a shard report is missing rather than silently reporting a smaller tree.

## `--verify`

With `--verify`, every critical and high finding goes to a `verify-finding`
agent whose job is to **refute it** — reproduce the defect or show it cannot
happen. Findings that survive are marked `verified: confirmed`; those that fall
are demoted or dropped, with the refutation kept.

This follows `_shared/parallel-adversarial-review.md`, adapted: PAR pairs two
reviewers over the same code, this pairs a challenger against one finding.

**PAR says it is always-on with no opt-out. That rule is scoped to the
iterative-development cluster's gates**, so a flag here is not a violation of
it. Verification costs one dispatch per serious finding, which is worth choosing
deliberately on a large tree.

## Red flags

- A finding heading covering a range (`12-15. Smaller items`)
- Positional integers where `CR-###` belongs
- A coverage number whose denominator is not stated next to it
- Reporting only what you found, with no line naming what you did not open
- Inventing a fifth severity rung, or filing a credential leak below critical
