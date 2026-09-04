# Graph-Grounded Plan Validation

Validate plans against the actual code graph. Today a plan's `Files:` blocks,
`depends_on` edges, and wave groupings are LLM intuition with no falsifiable
check. This spec adds two jig commands — `validate` and `seed` — that consult
moedex's code graph to ground plans in real dependency structure.

**Status:** Design. No implementation yet. Moedex provides the graph; jig
provides the plan parser; the missing piece is wiring them together. Moe's own
repo is not yet indexed by moedex — that is a prerequisite.

**Distribution:** Published to npm as `@bubstack/moe-jig-graph`. Discovered at
runtime by jig's extension mechanism and surfaced under the `moe jig plan`
namespace. Not a plugin — a jig extension.

## Problem

Plans are prose-in, prose-out. The planning pipeline — `writing-plans`,
`task-set`, `plan-set`, wave workflows — operates on markdown parsed into DAGs.
The DAGs are rebuilt from scratch every invocation. No step consults the code
graph that moedex indexes.

This means:

- A `Files:` block may omit half the blast radius because the LLM stopped
  reading.
- A `depends_on` edge may be missing because the LLM did not trace a call chain
  three files deep.
- Two tasks may land in the same wave despite tight coupling in the call graph,
  because task-set only checks path overlap, not symbol-level coupling.

The failure is silent. No test breaks. The plan looks plausible. The wave
executes, and a downstream task edits a file that an upstream task's change
invalidated.

## Decision

Two new commands under `moe jig plan`, implemented in a separate extension
package (`@bubstack/moe-jig-graph`) that jig discovers at runtime. The commands
consult moedex and report discrepancies. They do not modify plans — they are
read-only validation and scaffolding.

### Why an extension, not built into jig

Jig is L0: Node stdlib only, no cross-package imports, no network calls. Moedex
is a localhost MCP server. Adding a network dependency to jig would break its
position in the dependency graph and violate a load-bearing constraint (every
L0 package must build and run with zero external dependencies).

The extension pattern keeps jig pure while letting graph-aware commands share
its namespace. A user types `moe jig plan validate` — the routing is seamless;
the separation is in code, not in the command surface.

### Why not task-set or plan-set

Task-set runs in all 8 harnesses. Adding moedex calls there creates a runtime
dependency that varies by harness. Validation as a separate command keeps the
hot path (parse markdown, compute waves, return ready set) deterministic and
portable. Validation is opt-in, run when the graph is available.

## Architecture

### Jig extension discovery

Jig's CLI startup gains a discovery step:

1. Probe for `@bubstack/moe-jig-graph/jig-extension` via `require.resolve`.
2. If found, import its `commands` export — an array of command descriptors.
3. Merge into jig's command table under the declared namespace. Collisions
   (extension tries to shadow a built-in) are a startup error.
4. If not found, continue with built-in commands only. No warning — the
   extension is optional.

Each command descriptor:

```ts
interface JigExtensionCommand {
  namespace: string;    // "plan"
  name: string;         // "validate"
  description: string;
  run(args: string[], ctx: JigContext): Promise<number>;
}
```

`JigContext` exposes jig's existing parsers (plan parser, task parser, git
helpers) so the extension reuses them rather than reimplementing.

### Package shape

```text
packages/jig-graph/
├── package.json           @bubstack/moe-jig-graph
├── tsconfig.json
├── tsconfig.tests.json
├── src/
│   ├── jig-extension.ts   exports commands array
│   ├── validate.ts        plan validate implementation
│   ├── seed.ts            plan seed implementation
│   ├── moedex.ts          MCP client for moedex connection + queries
│   └── report.ts          structured output (human-readable + JSON)
├── test/
│   ├── validate.test.ts
│   └── seed.test.ts
└── mint/                  empty — not a plugin
```

### Dependency position

```text
L0   tab    glass    mint    jig
L1   core   crew     jig-graph
```

`jig-graph` depends on `jig` (for parser types and `JigContext`) and connects to
moedex at runtime. It does not depend on `core` — it uses jig's parsers, not
core's skills.

## Command surface

### `moe jig plan validate <path>`

Reads a plan markdown file, queries moedex, reports discrepancies.

**Input:** Path to a plan file, or `--manifest <path>` to validate every plan
listed in a plan-set MANIFEST.md.

**Steps:**

1. Parse the plan using jig's plan parser. Extract tasks, `Files:` blocks,
   `depends_on` edges.
2. Connect to moedex. If unavailable, print "moedex unavailable — skipping
   graph validation" and exit 0.
3. Run three checks:

**Check 1 — Uncovered files.** For each task's `Files:` entries, run
`impact_analysis` to compute the actual blast radius. Report files in the
blast radius that no task in the plan owns.

**Check 2 — Missing edges.** For each pair of tasks, run `trace_consumers`
between their file sets. Report task pairs with call-graph coupling but no
`depends_on` edge between them.

**Check 3 — Wave conflicts.** Compute waves using task-set's algorithm, then
check same-wave task pairs for call-graph coupling (beyond the path overlap
that task-set already catches). Report pairs that the call graph says should
be sequenced.

4. Additionally, without moedex: **Phantom files.** Check that every file in a
   `Files:` block exists on disk. This check runs even when moedex is
   unavailable.

**Output:** Human-readable by default. `--json` flag for CI integration.
Structured as an array of findings, each with `check` (uncovered / missing-edge
/ wave-conflict / phantom), `severity` (warning), `task` numbers, `files`, and
a one-line `message`.

**Exit code:** Always 0. Findings are warnings, not failures. Plans work without
the graph — the graph makes them better.

### `moe jig plan seed <topic> [--entry <file-or-symbol>]`

Queries moedex to generate a plan skeleton grounded in the code graph.

**Input:** Natural-language description of the intended change, plus an optional
entry-point file or symbol to anchor the graph query.

**Steps:**

1. Connect to moedex. If unavailable, exit 1 with "moedex required for seed —
   cannot generate a graph-grounded skeleton without it."
2. Run `impact_analysis` on the entry point (or `search_context` on the topic
   if no entry point given) to identify the blast radius.
3. Run `trace_consumers` for each high-scoring file to map coupling strength.
   (`trace_calls` was originally specified here but `trace_consumers` better
   captures the import-level coupling that determines task grouping.)
4. Cluster results into candidate task groups by file proximity and coupling
   strength. Files that are tightly coupled in the call graph land in the same
   task; files with no coupling become separate tasks.
5. Compute `depends_on` edges from the coupling map.
6. Emit a plan skeleton to stdout: `### Task N:` blocks with pre-populated
   `Files:` and `depends_on`. Steps, descriptions, and `Consumes:`/`Produces:`
   are left as placeholders for the human or LLM to fill in.

**Output:** Markdown plan fragment, ready to paste into a plan file or pipe to
`moe jig plan init`.

## Skill-level enhancement

Alongside the tooling, the `writing-plans` skill gains one instruction in its
task-decomposition step:

> If moedex is available (via the `retrieving-context` skill or the
> `moe:search-moedex` agent), query `impact_analysis` on the change target
> before decomposing tasks. Use the blast radius to populate `Files:` blocks
> rather than guessing from your reading. If moedex is unavailable, proceed
> from your own analysis as before.

This is prose-enforced and will drift — validate catches the drift. The skill
writes the plan informed by the graph; validate checks the plan against the
graph. Belt and suspenders.

## Prerequisite: index moe

Moe's own repo is not indexed by moedex. Queries about moe symbols return
noise (scores ~0.03, verified 2026-09-01). Adding moe to moedex's corpus is
configuration on the moedex side — add the repo to its index list and let it
build.

This must happen before validate and seed can be tested against moe's own
plans. It is independent work that can proceed in parallel with implementation.

## Degradation model

| Condition | validate | seed |
|-----------|----------|------|
| moedex running, repo indexed | Full checks | Full skeleton |
| moedex running, repo not indexed | Phantom-files only + warning | Exit 1 |
| moedex not running | Phantom-files only + warning | Exit 1 |

Plans always work without the graph. The graph makes them more accurate, never
gates them.

## Testing

Tests mock the moedex MCP interface — no live daemon required in CI.

- `validate.test.ts`: fixture plans with known gaps (missing files, missing
  edges, wave conflicts, phantom files). Assert the correct findings appear.
  Assert graceful degradation when moedex mock is absent.
- `seed.test.ts`: fixture graph responses. Assert the skeleton contains the
  expected tasks, files, and edges. Assert exit 1 when moedex is absent.
- Extension discovery: jig's own test suite gains a case asserting that
  `require.resolve('@bubstack/moe-jig-graph/jig-extension')` loads and
  merges commands without collision.

## What this spec does not cover

- Modifying task-set or plan-set to call moedex (approach C — deferred).
- Automatic re-validation during execution (would require a hook on task
  completion).
- Governance integration (tc-governance checking graph findings before
  green-lighting a wave).
- Indexing strategy for moedex (which repos, update frequency, CI integration).
