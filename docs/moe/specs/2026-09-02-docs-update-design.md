# docs-update — design spec

> Generate or update project documentation verified against the codebase.

Each doc type is written by a subagent that explores the code directly — no
hallucinated paths, phantom endpoints, or stale signatures. A verify-only mode
audits existing docs without writing.

Inspired by GSD's `gsd-docs-update` concept; rebuilt as a self-contained Moe
skill with no external framework dependency.

## 1. Doc types

Five default doc types. The skill discovers which are relevant by reading the
project; a pure library skips API reference, a project with no tests skips the
testing section of CONTRIBUTING.

| Type | File | When relevant |
|---|---|---|
| **readme** | `README.md` | Always |
| **architecture** | `ARCHITECTURE.md` | 2+ packages, or 10+ source directories |
| **api** | `API.md` | Exported HTTP endpoints, CLI commands, or public library API |
| **contributing** | `CONTRIBUTING.md` | Always |
| **changelog** | `CHANGELOG.md` | Update mode only — derives from `git log` since the last entry's date; never full-regenerated |

Users narrow scope with `--only readme,architecture`. Unrecognized type names
fail loudly.

### Why these five

README and CONTRIBUTING rot the fastest because they promise setup steps and
commands that change every sprint. ARCHITECTURE rots silently — wrong diagrams
survive longer than wrong instructions. API reference is the doc most likely to
contain hallucinated signatures when generated without reading code. CHANGELOG is
included only in update mode because full regeneration is `git log` with
formatting, not a doc-writing task.

## 2. Subagent dispatch

One agent per doc type, dispatched in parallel. Each agent receives:

- The doc type's template (from `doc-types/<type>.md` inside the skill directory)
- The project root path
- The existing doc content, if any
- Whether the doc is marked as Moe-generated (the marker, below)
- The `--force` flag state

Each agent is responsible for:

1. Reading the actual codebase (package.json, source files, test files, config)
2. Writing or updating its assigned doc
3. Returning a structured result: `{ type, status, path, stale_refs_found, sections_updated }`

Dispatch follows Moe's existing `dispatching-parallel-agents` pattern. If
parallel dispatch is unavailable (harness limitation, session policy), agents
run serially in type order. The output is identical.

### Agent type

Use `general-purpose` agents. Each agent's prompt includes the doc-type
template and explicit instructions to:

- Read files before citing them
- Grep for symbols before documenting them
- Never invent function signatures, file paths, or CLI flags
- Invoke `writing-clearly-and-concisely` when drafting prose

### Relevance discovery

Before dispatching, the skill runs a lightweight discovery pass (no subagent —
just file reads and globs in the coordinator):

```
- Is there a package.json, Cargo.toml, pyproject.toml, or go.mod? → readme, contributing
- Are there 2+ top-level source directories or a packages/ dir? → architecture
- Are there HTTP route handlers, CLI command definitions, or exported public APIs? → api
- Is there an existing CHANGELOG.md with date entries? → changelog (update only)
```

Skip doc types that fail their relevance check. `--only` overrides discovery
and forces the named types regardless.

## 3. Preservation model

### The marker

A generated doc carries this HTML comment as its first line:

```html
<!-- moe:docs-update generated="2026-09-02" type="readme" -->
```

The marker is the entire preservation protocol. It carries the generation date
and the doc type. No other metadata.

### Behavior matrix

| Existing doc? | Has marker? | Default behavior | With `--force` |
|---|---|---|---|
| No | — | Generate, add marker | Generate, add marker |
| Yes | Yes | Regenerate, update marker date | Regenerate, update marker date |
| Yes | No | **Skip. Report drift.** | Overwrite, add marker |
| Yes | Partial (marked sections) | Update marked sections only | Overwrite entire file, add marker |

"Partial" means a doc with `<!-- moe:docs-update:section type="setup" -->` ...
`<!-- /moe:docs-update:section -->` pairs wrapping generated sections inside a
hand-written doc. This is the mixed-authorship case. The agent rewrites content
inside the markers and leaves everything outside them untouched.

### Drift reporting for unmarked docs

When an unmarked doc exists and `--force` is not set, the agent reads the doc
and the codebase, then reports:

- References to functions, files, or commands that no longer exist
- Setup steps that reference missing dependencies or wrong versions
- Code examples that would not compile or run

These appear in the final report, not as file edits. The user decides whether
to add markers and let Moe manage it, or fix the doc by hand.

## 4. Verify mode (`--verify-only`)

No files are written. Each subagent reads its doc type and the codebase, then
produces a finding list:

```yaml
findings:
  - id: DV-001
    type: stale_reference
    file: README.md
    anchor: "Run `npm start`"
    actual: "package.json defines `pnpm dev`, not `npm start`"
    severity: high

  - id: DV-002
    type: missing_coverage
    file: API.md
    anchor: (absent)
    actual: "POST /api/webhooks is exported but not documented"
    severity: medium

  - id: DV-003
    type: factual_error
    file: CONTRIBUTING.md
    anchor: "Requires Node 18+"
    actual: "package.json engines field requires >=20"
    severity: high
```

### Finding types

- **stale_reference** — a path, function name, command, or flag that no longer
  exists in the codebase
- **missing_coverage** — an exported API, major component, or config option not
  mentioned in the doc
- **factual_error** — a statement that contradicts what the code says (wrong
  types, wrong defaults, wrong behavior)

### Finding IDs

`DV-###`, zero-padded to three, assigned in severity order within each doc
type. Follows the same stable-ID principle as `reviewing-a-codebase`'s `CR-###`.

### Output

The coordinator merges per-agent findings into a single
`DOCS-VERIFY-REPORT.md` at the project root, shaped like a
`reviewing-a-codebase` report:

```markdown
---
report: docs-verify
generated: 2026-09-02
base_sha: abc1234
doc_types_checked: [readme, architecture, api, contributing]
findings: { critical: 0, high: 3, medium: 5, low: 2, total: 10 }
status: issues_found
---

# Documentation Verification — <project>

## Coverage
Checked 4 of 5 doc types. Skipped: changelog (no existing file).
...

## High
### DV-001: ...
```

`fixing-a-code-review` can consume this report — same frontmatter shape, same
severity ladder, same stable IDs. Doc-verify findings cap at `high`; `critical`
is always zero because stale documentation is never "exploitable now or destroys
data."

When `--verify-only` is passed and a doc type has no existing file, that type is
skipped and listed in the coverage section as "no doc to verify."

## 5. Flags

| Flag | Behavior |
|---|---|
| `--only <types>` | Comma-separated list of doc types to process. Overrides relevance discovery. |
| `--force` | Overwrite all existing docs regardless of markers. |
| `--verify-only` | Audit existing docs, write no files. Produces `DOCS-VERIFY-REPORT.md`. |
| `--force` + `--verify-only` | `--force` takes precedence: generate/overwrite, no verify report. Rationale: `--force` means "write now"; adding `--verify-only` to that is contradictory, and the destructive flag wins to avoid silent data loss from a flag the user may not have intended. |

No other flags. `--depth` is not needed — each doc type's template defines
its own scope.

## 6. Packaging

```
packages/core/skills/docs-update/
├── SKILL.md              # the skill contract, self-contained
├── doc-types/
│   ├── readme.md         # template: what to look for, how to structure
│   ├── architecture.md
│   ├── api.md
│   ├── contributing.md
│   └── changelog.md
└── scripts/
    └── docs-verify-report.mjs   # merge per-agent verify findings into report
```

Added to `skill-tiers.yaml` under `authored:`.

### Tool requirements

`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `Agent`. All available on
every harness Moe targets. No MCP servers, no browser, no tmux.

### SKILL.md frontmatter

```yaml
---
name: docs-update
description: >-
  Generate or update project documentation verified against the codebase —
  use when docs are missing, stale, or need an accuracy audit
argument-hint: "[--only readme,api,...] [--force] [--verify-only]"
---
```

## 7. What this skill is not

- Not a changelog generator. CHANGELOG update mode derives entries from git
  history; it does not write release notes or summarize PRs.
- Not a doc linter. It checks factual accuracy against code, not prose quality
  or formatting. `writing-clearly-and-concisely` handles prose within each
  agent.
- Not a static site generator. It writes markdown files. If the project uses
  a doc site (Docusaurus, MkDocs), the generated markdown goes in the right
  directory but the skill does not build or deploy.

## 8. Open questions (deferred to implementation)

- **Section-level markers for mixed docs.** The `<!-- moe:docs-update:section
  -->` pair is specified but the implementation complexity of partial rewrites
  may warrant deferring mixed-mode to a later iteration. V1 could support only
  whole-file generation and whole-file skip.
- **Template evolution.** Doc-type templates will need tuning based on output
  quality across different project shapes. The templates are the main tuning
  surface.
- **Verify report consumption.** `fixing-a-code-review` compatibility is
  specified but untested. The frontmatter shape match needs validation.
