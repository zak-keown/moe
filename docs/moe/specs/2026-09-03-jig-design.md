# Jig — Deterministic Enforcement Tooling

Replace prose-only conventions with CLI commands that produce correct output
regardless of which model or harness runs them. A jig in machining holds the
workpiece and guides the tool so the cut lands right every time; `moe jig` does
the same for operations that models currently drift on.

**Status:** Design. No implementation yet. 25 drift-prone conventions identified
across 15 skills; 7 existing scripts already follow the pattern but live in
scattered skill directories. The worktree problem is actively broken: 28
worktrees in `.claude/worktrees/`, 4 in `.worktrees/`, 0 in the preferred
`.moe/worktrees/`.

**Distribution:** Published to npm as `@bubstack/moe-jig`. Ships as a standalone
binary (`moe-jig`) reachable through the dispatcher (`moe jig`). Not a plugin
itself — the hooks that redirect models to jig commands ship with the `moe` core
plugin's `hooks.json`.

## Problem

Skills tell models what to do. Models do not always listen. Every convention
enforced only by prose is one hallucination away from being ignored, and the
failure is silent — no test breaks, no hook fires, the wrong thing just lands in
the wrong place.

The worktree case is the clearest example. The `using-git-worktrees` skill says
worktrees go in `.moe/worktrees/`. Claude Code's native `EnterWorktree` puts
them in `.claude/worktrees/`. Bare `git worktree add` goes wherever the model
feels like. Three directories, three conventions, zero compliance with the
preferred one.

The pattern generalizes. Plans should go to `docs/moe/plans/YYYY-MM-DD-<name>.md`
— models write them anywhere. Review stamps should be separate commits — models
fold them into fixes. SDD workspaces should scope to one plan — models reuse
stale ones.

The audit found 25 such conventions. Seven already have deterministic scripts
(sdd-workspace, review-package, task-brief, plan-set, docs-verify-report,
check_citations, moe-completion-evidence). The rest are prose and prayer.

## Decision

A new `packages/jig` package producing a `moe-jig` CLI, published to npm as
`@bubstack/moe-jig`. Node stdlib only — no cross-package imports, L0 in the
dependency graph. Skills stop saying "put the file here" and start saying "call
`moe jig worktree create`."

Enforcement hooks ship with the core plugin's `hooks.json` as `PreToolUse`
matchers on the Bash tool. They block raw commands and print the jig alternative.
The hook says what to do instead; the model does it.

### Why a binary, not just hooks

Hooks can block. They cannot create. A hook that blocks `git worktree add` needs
something to redirect to — a command that creates the worktree in the right
place, checks gitignore, verifies BASE_SHA, and runs the gate. That command is
`moe jig worktree create`.

### Why a separate package, not scripts in skills

The seven existing scripts work, but they are scattered across skill directories,
undiscoverable without reading the skill, and unreachable without
`$CLAUDE_PLUGIN_ROOT`. A binary on PATH is reachable from any harness, any
script, any hook. One namespace, one install, one `--help`.

### Why publish to npm

The hooks ship with the core plugin and redirect to `moe jig`. If `moe-jig` is
workspace-only, every consumer outside a git clone of this repo hits a dead
redirect. Publishing to npm means `moe-install` can put it on PATH, and the
hooks always have something to point at.

## Architecture

### Package shape

```text
packages/jig/
├── package.json          @bubstack/moe-jig
├── tsconfig.json
├── tsconfig.tests.json
├── src/
│   ├── cli.ts            entry point, subcommand dispatch
│   ├── worktree.ts       worktree create/remove/validate
│   ├── plan.ts           plan init, spec init
│   ├── review.ts         review stamp, commit review-fix
│   ├── scaffold.ts       iterations init, context init, adr create
│   └── util.ts           git helpers, date formatting, path resolution
├── test/
│   ├── worktree.test.ts
│   ├── plan.test.ts
│   ├── review.test.ts
│   └── scaffold.test.ts
└── mint/                 empty — jig is not a plugin; reserved for if it
                              ever needs one
```

### Dependency position

```text
L0   tab    glass    mint    jig
```

No cross-package imports. Node stdlib + child_process for git. Same tier as tab,
glass, and mint.

### Dispatcher integration

One new entry in `bin/moe.js`'s `NAMESPACES`:

```js
jig: { bin: "moe-jig", workspace: "packages/jig/dist/cli.js" },
```

Updates ARCHITECTURE.md §7's namespace table and §2's repo shape.

## Command surface

### Tier 1 — Ship first

**`moe jig worktree create <branch> [--base <ref>]`**

Creates a linked worktree in `.moe/worktrees/<branch>`. Internally:
1. Resolves primary checkout via `git rev-parse --git-common-dir`.
2. Ensures `.moe/worktrees/` exists and is gitignored (adds entry if missing).
3. Resolves `--base` to a SHA (defaults to the repo's default branch).
4. Runs `git worktree add .moe/worktrees/<branch> -b <branch> <base-sha>`.
5. Verifies lineage: the new branch's merge-base against `--base` equals the
   resolved base SHA.
6. Prints the absolute path to stdout.

**`moe jig worktree remove <path-or-branch>`**

Removes a jig-created worktree. Refuses to touch worktrees outside
`.moe/worktrees/` — never removes `.claude/worktrees/` entries (those belong
to the harness).

**`moe jig worktree validate <path...>`**

Runs the parallel-dispatch gate from `dispatching-parallel-agents`:
1. Each path is a linked worktree (not the main checkout, not a submodule).
2. Paths are pairwise unique.
3. Git directories are pairwise unique.
4. No path is a prefix of another.

Exits 0 if all pass, non-zero with a diagnostic if any fail.

**`moe jig plan init <name>`**

Creates `docs/moe/plans/YYYY-MM-DD-<name>.md` with today's date and the plan
skeleton from `writing-plans`. Prints the path. Refuses to overwrite an existing
file.

**`moe jig spec init <name>`**

Creates `docs/moe/specs/YYYY-MM-DD-<name>-design.md` with today's date and a
minimal spec skeleton. Prints the path.

### Tier 2 — Ship second

**`moe jig review stamp <CR-ID> <fixing-sha>`**

Creates a stamp commit recording that `<CR-ID>` was addressed by `<fixing-sha>`.
The commit message follows the `fix(review):` contract. The stamp is a
separate commit — never folded into the fix.

**`moe jig commit review-fix <CR-ID> <title>`**

Stages and commits with the message `fix(review): <CR-ID> — <title>`. Validates
the CR-ID format (`CR-###`). Refuses to commit if nothing is staged.

**`moe jig iterations init`**

Scaffolds `docs/moe/iterations/` with the directory structure from
`iterative-development`: `requirements/`, `behavior-scenarios.md`,
`behavior-corpus.md`, `roadmap.md`, `progress.md`.

### Tier 3 — Ship when needed

**`moe jig context init`** — Creates `CONTEXT.md` with the domain-modeling skeleton.

**`moe jig adr create <title>`** — Creates the next-numbered ADR in `docs/adr/`.

**`moe jig progress update --phase <p> --task <t>`** — Overwrites the progress
file with correct format (overwrite, not append).

## Hook enforcement

Hooks ship with the core plugin (`packages/core/hooks/hooks.json`) as
`PreToolUse` entries matching the Bash tool. They run before the model's command
executes and can block it.

### Hook 1: Block raw worktree creation

**Matcher:** `Bash` tool, command matches `git worktree add`.

**Behavior:** Exit non-zero with message:

```
BLOCKED: raw `git worktree add` is not allowed.
Use `moe jig worktree create <branch> [--base <ref>]` instead.
This ensures worktrees land in .moe/worktrees/, are gitignored,
and have verified lineage.
```

**Escape hatch:** Environment variable `MOE_JIG_RAW_WORKTREE=1` disables this
hook for cases where the model genuinely needs raw git access (e.g., debugging
worktree state).

### Hook 2: Validate review-fix commit format

**Matcher:** `Bash` tool, command matches `git commit` with a message containing
`fix(review)`.

**Behavior:** Validate the message matches `fix(review): CR-\d{3} — .+`. If
malformed, exit non-zero with the correct format and a suggestion to use
`moe jig commit review-fix`.

### Hook applicability

These hooks are Claude Code `PreToolUse` hooks — they fire in Claude Code
sessions. Other harnesses (Codex, Cursor, etc.) that shell out to bash do not
have this hook surface. For those harnesses, the skill prose is the enforcement
layer (unchanged), and the jig CLI is still the recommended tool. The hooks are a
bonus layer for harnesses that support them, not the only enforcement.

The multi-harness story: skills say "call `moe jig`"; Claude Code hooks enforce
it; other harnesses get the benefit of the deterministic CLI without the hook
enforcement. As other harnesses add hook surfaces, enforcement expands.

## Existing script migration

Seven scripts already follow the jig pattern. Migration is not required for
launch but is the natural consolidation:

| Script | Current location | Jig command | Migration |
|---|---|---|---|
| `sdd-workspace` | `core/skills/sdd/scripts/` | `moe jig sdd workspace` | Tier 3 |
| `review-package` | `core/skills/sdd/scripts/` | `moe jig sdd review-package` | Tier 3 |
| `task-brief` | `core/skills/sdd/scripts/` | `moe jig sdd task-brief` | Tier 3 |
| `plan-set` | `core/hooks/` | stays as-is | Not migrated — it is a hook CLI, not a jig command |
| `task-set` | `core/hooks/` | stays as-is | Same |
| `docs-verify-report` | `core/skills/docs-update/` | `moe jig docs verify` | Tier 3 |
| `check_citations` | `core/skills/iteration/` | `moe jig iterations check` | Tier 3 |

`plan-set` and `task-set` stay where they are. They are hook CLIs with their own
lifecycle (SessionStart notice, Stop evidence), not general-purpose operations.
Jig commands are things you call mid-session to do an operation correctly; hook
CLIs are things the harness calls at lifecycle boundaries.

## Skill updates

Each skill that currently gives prose instructions for a jig-covered operation
gets a one-line update: "Call `moe jig <command>` to <do the thing>." The prose
fallback instructions stay for harnesses where jig is not installed — the skill
degrades to guidance, not silence.

The `using-git-worktrees` skill's Step 1 becomes:

1. **1a.** Branch name (unchanged).
2. **1b.** Native worktree tools — check for `EnterWorktree` etc. (unchanged).
3. **1b½.** `moe jig worktree create` — if no native tool, check for `moe-jig`
   on PATH. If available, use it. It handles placement, gitignore, and lineage
   verification.
4. **1c.** Git worktree fallback — only if neither native tool nor jig is
   available. (Unchanged prose.)

## Testing

- **Unit tests** for each command: mock git operations, verify correct paths,
  correct commit messages, correct validation logic.
- **Integration tests** in a temp git repo: create worktrees, verify placement
  and gitignore, verify merge-base check, verify removal refuses non-owned trees.
- **Hook tests**: verify the PreToolUse hook blocks `git worktree add` and
  passes other git commands through.
- **Dispatcher test**: verify `moe jig --help` resolves through `bin/moe.js`.
- **Guarded surface**: `packages/core/test/metadata.test.ts` does not need
  updating — jig is a separate package, not a skill. The dispatcher test in
  `bin/test/` gains a jig entry.

## What this does not do

- **Replace harness-native tools.** `EnterWorktree` stays. Jig is the
  harness-agnostic fallback when no native tool exists, and the enforcement
  layer that ensures correct behavior regardless of which tool is used.
- **Migrate existing worktrees.** The 28 entries in `.claude/worktrees/` stay.
  They are managed by Claude Code's `EnterWorktree` and cleaning them up is a
  separate, manual operation.
- **Add hooks for every convention.** Only the two highest-value hooks ship in
  tier 1 (worktree creation, review-fix format). Additional hooks are added when
  a convention's drift is measured and found costly.
- **Gate non-Claude-Code harnesses.** Hooks are a Claude Code feature. Other
  harnesses get the CLI but not the enforcement. This is acceptable because the
  CLI alone eliminates most drift — models that are told "call this command"
  usually do, and the command produces correct output.
