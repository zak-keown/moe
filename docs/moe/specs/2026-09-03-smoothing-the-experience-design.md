# Smoothing the experience — design spec

> Turn repeated local tool use into narrow, reviewable permission suggestions.

**Status:** Design approved. Implementation has not started.

**Distribution:** This is the authored `smoothing-the-experience` skill inside
the generated `moe` plugin. It is not a standalone plugin, package, or eighth
`moe` command namespace.

## 1. Purpose

Coding-agent permission prompts protect the developer, but repeated prompts for
the same low-risk operation add friction without adding judgment. Moe should
inspect recent native session logs, identify repeated successful operations,
and suggest narrow permanent permissions that the developer may review and
apply.

The first release supports Claude Code and Codex because this machine has
operational logs for both. It scans four evidence classes in one pass:

- shell commands;
- filesystem reads and writes;
- network domains; and
- MCP tools.

The skill suggests at most ten permissions per harness. It never grants a
permission automatically, never uses a model to classify evidence, and never
sends transcript data over the network.

In this design, **non-destructive** means read-only or a low-risk local mutation
whose normal effect is reversible inside the project. `git add` qualifies even
though it changes the index. Deletion, unbounded overwrite, credential access,
remote mutation, publication, deployment, and other external side effects do
not qualify. Granting a permission is still a security decision; the term does
not make an eligible operation harmless.

## 2. Product boundary

The skill is an on-demand audit, not an installer phase or background service.
Installing the `moe` plugin makes the skill available; installation does not
scan sessions or change permission files. A developer reruns the skill as work
patterns change.

The first release does not add `moe smooth` or another permanent namespace to
`bin/moe.js`. The skill invokes a dependency-free Node helper from its own
generated plugin directory, following the existing skill-owned script pattern.
A later release may add a convenience command if observed use justifies another
public CLI interface.

Unsupported installed harnesses do not fail the audit. The report marks each as
`not evaluated` and explains that Moe lacks a locally validated adapter. Future
adapters must meet the same evidence, privacy, safety, and mutation contracts;
they do not weaken the first release to claim nominal coverage.

## 3. Architecture

```text
native sessions + effective permission config
                    |
             harness readers
             Claude / Codex
                    |
              typed evidence
      shell / filesystem / network / MCP
                    |
       normalizers + safety policies
                    |
          eligibility + ranking
                    |
       harness permission renderers
                    |
       report -> exact diff -> apply
```

The helper contains five independent layers:

1. **Discovery** finds installed supported harnesses, native session roots,
   effective project roots, and permission files.
2. **Readers** convert harness records into one evidence model without copying
   conversation prose.
3. **Evidence-class policies** normalize operations and decide whether they may
   become candidates.
4. **Renderers** convert safe candidates into the narrowest stable permission
   form a harness supports.
5. **Mutation** binds an approved diff to the config state that produced it,
   validates the result, and replaces one config atomically.

Each layer has a small interface and no knowledge of the skill conversation.
`SKILL.md` owns orchestration and user approval; the helper owns deterministic
inspection and mutation.

## 4. Native evidence sources

### Claude Code

The reader discovers JSONL sessions below the configured Claude directory,
normally `~/.claude/projects/`. It respects `CLAUDE_CONFIG_DIR` and ignores
records older than the requested window. Claude's session format is an internal
format that may change, so the reader recognizes supported record shapes and
skips unknown shapes instead of guessing. See Anthropic's
[session documentation](https://code.claude.com/docs/en/sessions).

Local records contain structured `tool_use` blocks with tool names and inputs,
plus matching tool results. The reader groups a parent conversation and its
subagents under one root-session identity. Subagent fan-out therefore cannot
turn one human session into many qualifying observations.

The reader also loads Claude's effective permission lists from documented user,
shared-project, and project-local settings. It never edits `~/.claude.json`.
Permission syntax and evaluation order follow Anthropic's
[permissions](https://code.claude.com/docs/en/permissions) and
[settings](https://code.claude.com/docs/en/settings) contracts.

### Codex

The reader discovers rollout JSONL below `CODEX_HOME`, normally
`~/.codex/sessions/`, and recognizes structured command, tool, outcome,
working-directory, and permission-state records. It treats the raw rollout
layout as version-gated input rather than a stable public API. Supported Codex
interfaces remain the source of truth when they can supply equivalent data;
see the official [App Server](https://developers.openai.com/codex/app-server/)
documentation.

Local rollouts contain structured command executions and snapshots of approved
command prefixes. These records prove use and outcome; some also preserve
approval-related context. The reader records the strongest provenance present
without claiming that every successful operation required a fresh human click.

Codex shell permissions render through the documented, experimental Starlark
`prefix_rule` interface and are validated through `codex execpolicy check`.
The adapter version-gates both rule rendering and validator output and fails
closed on drift. See the official
[rules documentation](https://developers.openai.com/codex/agent-configuration/rules/).
The adapter uses App Server `config/read` with layer details to prove which user
and trusted-project rule directories are active. If it cannot establish the
effective project layer, it may continue the evidence scan but cannot render or
apply a project-scoped rule.
Other evidence classes remain report-only until Codex exposes a stable,
narrowly scoped permission form that the helper can validate.

## 5. Evidence model

Readers emit ephemeral records with these fields:

```text
harness              claude | codex
root_session_id       opaque identity used only during the scan
project_root          canonical project or repository root
observed_at           source timestamp
class                 shell | filesystem | network | mcp
operation             typed, normalized operation
outcome               success | denied | failed | unknown
approval_provenance   explicit | existing-rule | automatic | unknown
source_schema         reader and record-shape version
```

The helper keeps no history database. It does not retain prompts, assistant
prose, tool output, secret values, URL paths, query strings, or arbitrary
command arguments. It keeps only the information required to establish
repetition, scope, safety, and the literal permission rule shown to the user.

Successful repeated use may produce a candidate even when approval provenance
is unknown. Explicit approval raises confidence. An existing rule removes the
candidate because the permission is already present. A denial suppresses the
candidate rather than becoming a vote for future permission.

## 6. Evidence-class policies

Every class has its own normalizer and audited safety policy. A shared policy
may rank candidates, but it cannot decide that an operation is safe.

### Shell

The Claude reader accepts only a conservative shell grammar. It rejects chains,
pipes, redirections, substitutions, shell wrappers, environment assignments,
unresolved variables, globs, and ambiguous quoting. The Codex reader prefers
structured command tokens when the record supplies them.

An audited catalog names eligible commands, subcommands, and argument shapes.
Unknown commands remain visible in aggregate evidence counts but cannot become
suggestions. A command's historical success does not establish its safety.

Bare `cp` is ineligible because it can overwrite a destination. A no-clobber
form such as `cp -n` may qualify only when the target harness can preserve that
exact constraint and keep both paths inside the project. Destructive commands
and flags never qualify.

### Filesystem

Filesystem candidates must resolve inside the canonical project root. The
policy rejects path traversal, symlink escape, credentials, secret-bearing
files, permission-policy files, and broad home-directory access. It normalizes
paths only when the rendered rule grants no more access than the observed
operations.

Read and modify are separate operations. Claude Edit and Write tool evidence
both normalize to `modify` because Claude's permission engine governs both with
`Edit(path)`; `Write(path)` rules are ignored. Repeated reads do not justify a
modify rule, and the renderer never emits `Write(path)`.

Modify candidates are always project-scoped and initially name exact
project-relative paths. They never produce directory-wide, extension-wide, or
user-global rules. This restriction prevents sparse observations from becoming
an unbounded overwrite permission. When the adapter cannot prove that Claude's
path anchor is the canonical project root, it declines the candidate instead
of rendering an absolute path or promoting scope.

### Network

Network candidates come only from native read-oriented web tools. The policy
does not infer them from `curl`, `wget`, arbitrary shell traffic, browser state,
or conversation text. It retains an exact normalized hostname and discards URL
paths, queries, fragments, and credentials.

Wildcards, IP literals, localhost, link-local targets, and private-network
targets do not qualify. A renderer must express the exact hostname without
broadening it to a parent domain.

### MCP

MCP candidates identify one server and one tool. A tool qualifies only when Moe
has a trusted, exact read-only classification. A remote server's name,
description, or self-asserted `readOnlyHint` is not sufficient security
evidence. The first release uses a small Moe-owned classification catalog;
unknown MCP tools appear in aggregate counts but never in suggestions.

## 7. Eligibility, scope, and ranking

A project-scoped candidate requires successful qualifying use in at least two
distinct root sessions during the scan window. The default window is 30 days.

A user-global candidate requires all of the following:

- qualifying use in at least two distinct projects;
- qualifying use in at least two root sessions;
- membership in a smaller global-safe catalog; and
- a harness rule that preserves the audited operation shape.

The narrowest supported scope wins. A renderer that cannot express that scope
must decline the candidate; it may not silently promote a project permission to
user-global scope.

The ranker orders eligible candidates by:

1. approval confidence;
2. distinct root-session count;
3. most recent observation;
4. total successful observations; and
5. the rendered rule's lexical order as a deterministic tie-breaker.

The report contains at most ten suggestions per harness and at most five from
one evidence class. It never fills a quota with weak candidates. `--all` may
show additional qualifying candidates, but it does not relax eligibility or
safety policy.

A stable candidate ID derives from the harness, evidence class, scope, project,
and rendered rule. The ID contains no raw session identity.

## 8. Harness rendering

Claude may render all four classes when its documented permission syntax can
express the candidate without widening it:

- `Bash(...)` for audited command shapes;
- `Read(...)` for exact reads and `Edit(...)` for exact modify operations;
- exact `WebFetch(domain:...)` rules; and
- exact MCP server/tool identifiers.

The renderer evaluates effective deny, ask, and allow lists before suggesting a
new rule. It preserves unrelated settings and deduplicates semantically
equivalent entries.

Codex initially renders shell candidates only. It writes a uniquely identified
`prefix_rule` to the documented project or user rules layer and delegates
matching semantics to `codex execpolicy`. Filesystem, network, and MCP evidence
still participates in the same scan and report, but receives the disposition
`no narrow renderer` rather than a suggestion.

Adding a renderer for another Codex evidence class requires current primary
documentation, a stable validation path, and tests proving that the rendered
permission is no broader than the candidate.

## 9. User interaction

The skill runs the helper in read-only mode first. The report groups results by
harness and gives every suggestion:

- its stable ID;
- proposed scope and destination;
- exact permission rule;
- evidence class;
- distinct session and project counts;
- last-seen date;
- confidence and approval provenance; and
- the reason it passed the class safety policy.

The user selects individual IDs. The skill offers no select-all operation. A
selection creates a mode-`0600` ephemeral plan containing only selected rules,
destination paths, config hashes, and the rendered replacement. The plan does
not contain transcripts or evidence history.

The skill displays an exact diff for one harness at a time. Only an explicit
confirmation authorizes that harness's write. The helper then:

1. rechecks the source config hash;
2. refuses a stale plan;
3. validates the complete replacement;
4. acquires a lock scoped to that config;
5. writes a restrictive same-directory temporary file;
6. flushes and atomically renames the file; and
7. reads the result back and verifies its hash and semantics.

One harness's failure does not block another harness's scan or approved write.
The report states whether a change takes effect immediately or requires a new
session. Codex rules are treated as next-session changes.

## 10. Failure and privacy behavior

The feature fails closed:

- An unknown session shape skips that session and reports the reader version.
- A malformed or unsupported permission file blocks writes for that harness.
- A config changed after planning produces a stale-plan error and no write.
- An unrenderable candidate stays in the evidence summary and cannot be
  selected.
- A validation failure leaves the original config byte-identical.
- No scan, plan, or failure path writes to Moe Memory.

The default human report avoids raw commands and paths except when they form the
literal proposed permission rule. Machine-readable output follows the same
redaction policy. Debug mode may expose structural record types and counts, but
never conversation prose or tool output.

## 11. Skill and helper surface

The source layout is:

```text
packages/core/skills/smoothing-the-experience/
├── SKILL.md
└── scripts/
    ├── smooth.mjs
    └── lib/
        ├── discovery.mjs
        ├── evidence.mjs
        ├── rank.mjs
        ├── safety/
        │   ├── shell.mjs
        │   ├── filesystem.mjs
        │   ├── network.mjs
        │   └── mcp.mjs
        ├── harnesses/
        │   ├── claude.mjs
        │   └── codex.mjs
        └── mutation.mjs
```

The helper exposes three internal verbs:

```text
smooth.mjs scan  [--days 30] [--harness claude,codex] [--all] [--json]
smooth.mjs plan  --select <id,...> [--json]
smooth.mjs apply --plan <path>
```

`scan` never writes. `plan` writes only the ephemeral plan after the user has
selected candidates. `apply` accepts only that bound plan and still enforces
staleness, validation, and locking. These are skill implementation details, not
new public `moe` namespace commands.

`SKILL.md` orchestrates the three verbs and requires the report, selection,
exact-diff, and explicit-confirmation sequence. Its description fires when a
developer asks to reduce repeated agent permission prompts, audit permanent
tool permissions, or inspect recent sessions for safe allow rules.

## 12. Verification

Tests use sanitized synthetic fixtures for supported Claude and Codex record
shapes. Automated tests never inspect a developer's real home directory.

The suite covers:

- session discovery, config-root overrides, schema drift, and root/subagent
  collapsing;
- typed extraction and outcome handling for all four evidence classes;
- adversarial shell grammar, secret paths, unsafe network targets, and unknown
  MCP tools;
- the invariant that normalization never grants authority outside the audited
  candidate shape derived from the qualifying observations;
- project and global eligibility thresholds;
- deterministic ranking, ten-result limit, and five-per-class cap;
- suppression by existing permissions and observed denials;
- Claude JSON and Codex rule rendering without unrelated config changes;
- idempotent application;
- stale hashes, lock contention, validation failures, restrictive temporary
  modes, interrupted writes, and atomic replacement; and
- an end-to-end isolated-home journey: scan, select, plan, diff, apply, rescan,
  and suppress the newly present permissions.

A manual read-only smoke test may scan this machine's actual logs and report
counts. It must not snapshot, commit, or print private transcript content.

Repository integration adds the skill to `packages/core/skill-tiers.yaml` under
`authored:` and regenerates `/plugins/` with `pnpm mint`. The implementation
must pass the core metadata test named "accounts for every skill on disk in
exactly one of the two maps", `pnpm check`, `pnpm mint:check`, and
`pnpm provenance`. It does not change the frozen imported skill set, `NOTICE`,
or imported-work metadata.

## 13. Acceptance criteria

The feature is complete when all of these statements hold:

1. One invocation scans both installed supported harnesses and all four
   evidence classes without model or network access.
2. Repeated safe operations from two root sessions produce deterministic,
   scoped candidates; one session and unsafe operations do not.
3. Claude can suggest supported shell, exact Read/Edit filesystem, network,
   and curated read-only MCP permissions without emitting ignored Write rules
   or guessing path anchors.
4. Codex can suggest validated shell prefix rules and reports other evidence
   classes without inventing unsupported permissions.
5. A harness returns no more than ten suggestions and no more than five from
   one class.
6. Existing permissions and denied operations do not reappear as candidates.
7. The user can select individual suggestions, inspect the exact diff, and
   confirm one harness write at a time.
8. A stale, malformed, invalid, or contested config remains byte-identical.
9. Rerunning the audit after application suppresses the permissions just added.
10. Tests and generated plugins contain no real transcript content, command
    arguments, paths, session identifiers, or secrets from this machine.

## 14. Deferred work

The following work is outside the first release:

- adapters for Cursor, Copilot CLI, Gemini CLI, Kimi Code, OpenCode, or Pi;
- prospective approval-event collectors or background instrumentation;
- an eighth `moe` dispatcher namespace or standalone package;
- LLM-based classification, transcript summarization, or remote analysis;
- permission revocation and general policy auditing; and
- Codex filesystem, network, or MCP renderers without a stable narrow native
  permission and validator.

These are explicit extensions, not incomplete parts of the Claude-and-Codex
release.
