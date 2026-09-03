---
name: docs-update
description: >-
  Generate or update project documentation verified against the codebase —
  use when docs are missing, stale, or need an accuracy audit
argument-hint: "[--only readme,api,...] [--force] [--verify-only]"
---

# docs-update

## Overview

Generates or updates a project's core docs — README, ARCHITECTURE, API,
CONTRIBUTING, CHANGELOG — and can instead audit existing docs for drift
against the codebase without touching a file. The core principle: one
subagent per doc type, dispatched in parallel, and every subagent reads the
actual code before writing a word. Nothing is filled in from a template with
plausible-sounding prose; every path, command, and signature it documents was
looked up in this run.

## Flags

Parse `$ARGUMENTS` as a plain string. A flag is active only when its literal
token appears in it — no abbreviation, no inference from context.

- `--only <types>` — comma-separated, drawn from `readme`, `architecture`,
  `api`, `contributing`, `changelog`. Read the token immediately following
  `--only`, split on commas, trim whitespace. Any name outside that set is a
  hard stop: report the offending name and the full valid set, and do not
  run. When present, `--only` replaces relevance discovery entirely — the
  named types are dispatched regardless of what discovery would have found.
- `--force` — overwrite every processed doc regardless of marker state.
- `--verify-only` — audit mode. No doc file is written; the run produces
  `DOCS-VERIFY-REPORT.md` instead.
- Both present — `--force` wins: the run generates/overwrites and produces no
  verify report. `--force` means "write now"; pairing it with an audit-only
  flag is contradictory, and the destructive flag has to be the one that
  wins, or a user who forgot they combined the two loses data silently.

## Relevance discovery

Before dispatching anything, the coordinator itself — no subagent — globs and
reads the project to decide which doc types apply. This runs even when
`--only` is present, so its result can still be reported, but `--only`
overrides the outcome.

- **readme, contributing** — always relevant.
- **architecture** — relevant when a `packages/` directory exists, OR when 10
  or more top-level directories each contain at least one source file.
- **api** — relevant when a repo-wide grep finds any of: HTTP route handlers
  (`app.get`, `app.post`, `router.`, `@Get`, `@Post`, `@Controller`), CLI
  command definitions (`commander`, `yargs`, `.command(`), or an exported
  public API surface (`export function`, `export class`, `export const`,
  `module.exports`).
- **changelog** — relevant only when `CHANGELOG.md` already exists AND
  contains at least one date-formatted entry. Never relevant for a project
  with no changelog; this type has no from-scratch generation mode — see
  `doc-types/changelog.md`.

Skip every type that fails its check. Name the skipped types and the reason
in the final report — dropping one silently is a red flag, not a
simplification.

## The marker

A doc this skill generates or regenerates opens with a stamped HTML comment,
always its first line, before any heading or content. Its shape: `<!-- `,
then the fixed prefix `moe:` glued directly — no space — to this skill's own
directory name, `docs-update`, then a space, `generated="YYYY-MM-DD"`, a
space, `type="<type>"`, a space, and the closing `-->`. `<type>` is whichever
of the five type identifiers that agent is writing.

The marker is the entire preservation protocol — no other metadata, and no
section-level partial markers in this version. (The design spec's open
questions flag section-level markers as a possible later addition; for now
this skill supports only whole-file generation and whole-file skip.)

| Existing doc? | Has marker? | Default behavior | With `--force` |
|---|---|---|---|
| No | — | Generate, add marker | Generate, add marker |
| Yes | Yes | Regenerate, refresh the `generated` date | Regenerate, refresh the `generated` date |
| Yes | No | **Skip. Report drift.** | Overwrite, add marker |

An unmarked existing doc, left alone by default, is still read: the
dispatched agent compares it against the codebase and reports references to
functions, files, or commands that no longer exist; setup steps naming
missing dependencies or wrong versions; and code examples that would not
compile or run. These land in the final report as drift findings, never as
file edits — the user decides whether to hand the file to this skill (add
the marker, or re-run with `--force`) or fix it by hand.

## Subagent dispatch

One `general-purpose` agent per relevant doc type (after `--only` and
relevance discovery are applied), dispatched with multiple Agent calls in a
single response so they run in parallel. If parallel dispatch is unavailable
— session policy, runtime limits, a harness without it — dispatch the same
agents serially, in the order `readme, architecture, api, contributing,
changelog`. The output is identical either way; only wall clock changes.

Before dispatching, the coordinator reads each relevant doc type's template —
for example `${CLAUDE_PLUGIN_ROOT}/skills/docs-update/doc-types/readme.md`,
swapping the file name for `architecture.md`, `api.md`, `contributing.md`, or
`changelog.md` as appropriate — plus the project's existing doc file, if one
exists. Each agent's prompt carries:

- The full template text for its doc type.
- The project root.
- The existing doc's content, or a note that none exists.
- The marker state for this run: `generate` (no doc), `regenerate` (doc +
  marker), `skip-drift` (doc, no marker, no `--force`), or `force-overwrite`
  (`--force` set, any prior state).

Each agent's prompt also states two things plainly, regardless of what its
template already covers: verify every fact against the code in this run
(open the file, grep the symbol) rather than trust memory or the existing
doc, and never invent a path, command, or signature that does not check out.

**REQUIRED SUB-SKILL:** Every dispatched agent must invoke `writing-clearly-and-concisely` before finalizing prose.

A `skip-drift` agent still reads and reports; it just does not write the file
— see the marker section above. In verify mode, every dispatched agent
produces findings only and writes nothing (below).

## Verify mode

`--verify-only`, with `--force` not set, skips writing entirely and audits
instead.

1. Run relevance discovery and `--only` as normal, then drop any type whose
   target file does not exist on disk — there is nothing to verify — and
   record it in the final report as "no doc to verify." This filter is
   verify-mode-only, separate from the generate-mode relevance check above.
2. Dispatch the same one-agent-per-type pattern. Each agent reads its doc and
   the codebase, then reports findings as a YAML list matching its
   template's "Verify mode" section: `type` (`stale_reference`,
   `missing_coverage`, or `factual_error`), `file`, `anchor`, `actual`, and
   `severity` (`high`, `medium`, or `low` — never `critical`; stale
   documentation is never "exploitable now or destroys data").
3. For each agent's findings, write a JSON array to
   `.moe/docs-verify/<type>.json` — the same four content fields plus
   `severity`, dropping the template's `id` placeholder (the script assigns
   real IDs).
4. Once every dispatched agent has staged its findings, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/docs-update/scripts/docs-verify-report.mjs" \
     --staging .moe/docs-verify --out DOCS-VERIFY-REPORT.md
   ```

   It assigns `DV-###` IDs in severity order, builds the frontmatter, and
   writes `DOCS-VERIFY-REPORT.md` at the project root — same frontmatter
   shape, same severity ladder, same stable-ID principle as
   `reviewing-a-codebase`'s `CR-###` report, so `fixing-a-code-review` can
   consume it directly.

## Final report

After every dispatched agent completes, in either mode, summarize in the
reply:

- Which doc types were generated, regenerated, or left unmarked-and-skipped
  — with the drift summary, per type, for the skipped ones.
- Which doc types relevance discovery or `--only` excluded, and why.
- In verify mode: which types had no doc to verify, and a pointer to
  `DOCS-VERIFY-REPORT.md` with its finding counts by severity.
- Any agent that errored or returned nothing usable, named explicitly —
  never folded silently into "docs updated."

## Red flags

- Writing a doc without first determining its marker state — that is how a
  hand-written file gets silently clobbered.
- Dispatching an agent for a doc type relevance discovery ruled out, with no
  `--only` naming it.
- A subagent's doc citing a path, command, or signature it did not look up
  in this run.
- Regenerating `CHANGELOG.md` wholesale instead of inserting only the
  entries since the last dated entry, above the existing content.
- A verify-mode run that writes to `README.md`, `ARCHITECTURE.md`, or any
  target doc, instead of only staging findings.
- A verify finding above `high` severity, or a `--force` run that produces
  `DOCS-VERIFY-REPORT.md` instead of overwriting docs.
- A final report that omits a doc type instead of naming it skipped and why.
