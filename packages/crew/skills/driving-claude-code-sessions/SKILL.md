---
name: driving-claude-code-sessions
description: Use when acting as a project manager that delegates tasks to other coding-agent sessions (Claude Code, Codex, or Pi) - launch workers, assign them work, monitor progress, review their tool calls, and collect results
---

# Driving Coding-Agent Sessions

## Overview

You can launch coding-agent sessions — Claude Code, Codex, or Pi — as "workers" in tmux, send them prompts, wait for them to finish, read their output, and hand them off to a human. Workers run with permissions bypassed, so they execute tool calls without prompting. Each worker emits lifecycle events to a JSONL file so the controller can observe what it's doing — Claude and Codex through their hook systems, Pi through a native extension `moe-crew` loads into it.

All operations go through a single CLI: `moe-crew`. After launching a worker, the controller receives a **shim path** at `/tmp/moe-crew-workers/bin/<tmux-name>` that bakes in the worker handle. Every per-worker operation goes through that path — no positional state to thread between calls, no absolute skill path to prepend. A small set of environment variables tune behavior; see [Environment variables](#environment-variables) at the bottom.

The shim path is deterministic: if you pick a memorable tmux name at launch, you can reconstruct `/tmp/moe-crew-workers/bin/<tmux-name>` whenever you need it. For agents driving via tool calls, that's the right model — shell state doesn't persist between calls, so a `SHIM=...; $SHIM cmd` pattern just adds noise. The examples below use the bare path.

## Harnesses

Pick a harness with `--harness` at launch (default `claude`):

```bash
$SKILL/moe-crew launch --harness codex my-task /path/to/project
$SKILL/moe-crew launch --harness pi    my-task /path/to/project
```

The controller-facing command surface is **identical across all three harnesses** — `launch`, `send`, `converse`, `wait-for-turn`, `read-turn`, `read-events`, `status`, `stop`, and `handoff` behave the same regardless of harness. A few things differ:

- **Auth.** Each harness authenticates from its own home — Claude `~/.claude`, Codex `~/.codex`, Pi `~/.pi/agent`. `moe-crew` stages that login into the worker at launch, so to rotate credentials, relaunch.
- **`adopt` is Claude-only.** Claude takes a caller-assigned session id, so a session can be resumed by id (`claude --resume`). Codex and Pi mint their own ids on the first prompt and offer no resume-by-id — relaunch them instead.
- **Codex isn't queryable until its first prompt.** Codex mints its session id only when you send the first prompt, so between `launch` and the first `send`/`converse` a codex worker's `status`, `session-id`, and `wait-for-turn` return `no worker known` — it *is* running, it just hasn't registered yet. `converse` handles this internally, so the typical launch→converse path is fine; only the lower-level commands see the gap. (Claude takes its id at launch and Pi registers at launch, so both are queryable immediately.)

## Prerequisites

- **tmux**
- a harness CLI — at least the one you launch: **claude** (default), **codex**, or **pi**

(No `jq` and no bash hooks: `moe-crew` is a TypeScript/node tool and its hooks are node programs. `node` is required, but it's already present wherever Claude Code runs.)

## Setup

The CLI lives at `<skill>/scripts/moe-crew`. Top-level subcommands need the skill path:

- `moe-crew launch [--harness <claude|codex|pi>] <tmux-name> <cwd> [-- harness-args...]` — bootstrap a worker (harness defaults to `claude`)
- `moe-crew adopt <tmux-name> <cwd> <session-id> [-- claude-args...]` — re-adopt an existing Claude session as a worker (claude-only; see [Recovering workers](#recovering-workers-after-a-reboot))
- `moe-crew list [--all]` — enumerate workers
- `moe-crew grant-consent` — one-time consent for running workers with permissions bypassed

Once a worker is launched, run subsequent commands against `/tmp/moe-crew-workers/bin/<tmux-name>`:

```bash
SKILL=/abs/path/to/skill/scripts
$SKILL/moe-crew grant-consent                          # one-time per machine
$SKILL/moe-crew launch my-task /path/to/project        # stdout: /tmp/moe-crew-workers/bin/my-task
/tmp/moe-crew-workers/bin/my-task status               # use the shim directly
```

Pick a memorable tmux name at launch; the shim path is then deterministic. (You *can* capture it into a shell variable in an interactive shell, but for agent-driven workflows the bare path is simpler — there's no shell state to lose between calls.)

## Workflow

In examples below, `$SKILL` is the absolute path to `skills/driving-claude-code-sessions/scripts`. `WORKER` is the bare shim path (e.g. `/tmp/moe-crew-workers/bin/my-task`) — substitute the deterministic path for your worker.

### 1. Launch

```bash
$SKILL/moe-crew launch my-task /path/to/project
# stdout: /tmp/moe-crew-workers/bin/my-task
# stderr: Worker launched. tmux/session_id/cwd/events/reproduce
```

`moe-crew launch`:
- Writes a 3-line shim at `/tmp/moe-crew-workers/bin/my-task`
- Starts tmux and the harness in it
- Blocks until the worker is ready — Claude (which takes a caller-assigned session id) waits for its `session_start` event; Codex and Pi mint their own ids on the first prompt, so launch settles their TUI and the worker's meta self-registers when it fires its first event
- Prints the shim path on stdout (one line)
- Prints a "Worker launched" panel on stderr — the `reproduce:` line is the exact command to relaunch with the same args

Pass harness CLI args after a `--` separator, or pick a non-default harness with `--harness`:
```bash
$SKILL/moe-crew launch my-task /path/to/project -- --model sonnet
$SKILL/moe-crew launch --harness codex my-task /path/to/project
```

### 2. Converse (the typical case)

```bash
/tmp/moe-crew-workers/bin/my-task converse "Refactor the auth module" 300
```

`converse` sends the prompt, waits for the worker to finish, and prints the final assistant text on stdout. For tool-heavy turns where the bare text strips the interesting part, use `--with-turn` to get the full markdown:

```bash
/tmp/moe-crew-workers/bin/my-task converse --with-turn "Run the failing tests" 600
```

Multi-turn just works — the wait tracks turn boundaries automatically:

```bash
/tmp/moe-crew-workers/bin/my-task converse "Write tests for the auth module" 300
/tmp/moe-crew-workers/bin/my-task converse "Add edge cases for expired tokens" 300
```

### 3. Lower-level control

If you need to drive the worker more directly:

```bash
/tmp/moe-crew-workers/bin/my-task send "Refactor the auth module"     # send without waiting
/tmp/moe-crew-workers/bin/my-task wait-for-turn 300                   # block until stop or session_end
/tmp/moe-crew-workers/bin/my-task status                              # idle | working | terminated | gone | unknown
/tmp/moe-crew-workers/bin/my-task read-turn                           # last turn as markdown (tool results truncated to 5 lines)
/tmp/moe-crew-workers/bin/my-task read-turn --full                    # last turn with complete tool results
```

### 4. Watching what the worker does

Every tool call emits a `pre_tool_use` event with the tool name and input. Tail the event stream to watch in real time:

```bash
/tmp/moe-crew-workers/bin/my-task read-events --follow &
MONITOR_PID=$!
# ... do other work ...
kill $MONITOR_PID
```

Or pull events after the fact:

```bash
/tmp/moe-crew-workers/bin/my-task read-events                       # all events
/tmp/moe-crew-workers/bin/my-task read-events --last 5
/tmp/moe-crew-workers/bin/my-task read-events --type pre_tool_use
```

`--type` accepts one of: `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `stop`, `session_end`. Unknown event names fail fast. (Claude workers emit `pre_tool_use` but not `post_tool_use`; Codex and Pi emit both.)

If you see something you don't want, stop the worker:

```bash
/tmp/moe-crew-workers/bin/my-task stop
```

### 5. Stop and clean up

```bash
/tmp/moe-crew-workers/bin/my-task stop
```

Sends `/exit`, waits up to 10s for `session_end`, kills the tmux session if still running, and removes the meta, events, **and shim** files.

`stop` is destructive: the worker is gone and the shim path stops working. If you wanted the worker around for follow-up turns or a parallel workflow, don't call `stop` until you're done with it. To resume work under the same name, relaunch — `moe-crew launch my-task /path/to/project` again — and you'll get a fresh worker at the same shim path.

After `stop`, the shim no longer exists, so invoking it again surfaces a shell error along the lines of `no such file or directory: /tmp/moe-crew-workers/bin/my-task` (the exact wording depends on your shell). That's expected; the worker is gone.

### 6. Hand off to a human

```bash
/tmp/moe-crew-workers/bin/my-task handoff
```

Prints attach instructions for a human to take over the tmux session.

### Finding workers

```bash
$SKILL/moe-crew list                      # live workers (idle/working/terminated)
$SKILL/moe-crew list --all                # include 'gone' workers (tmux already exited)
$SKILL/moe-crew list api                  # substring filter on tmux name
$SKILL/moe-crew prune                     # remove dead workers + orphaned sidecars/shims
```

## Reference

```
moe-crew launch [--harness <claude|codex|pi>] <tmux-name> <cwd> [-- harness-args...]
moe-crew adopt <tmux-name> <cwd> <session-id> [-- claude-args...]   # claude-only
moe-crew list [--all] [<pattern>]
moe-crew prune                          # remove dead/orphaned worker state
moe-crew grant-consent

<shim> converse [--with-turn] <prompt> [timeout=120]
<shim> send <prompt>
<shim> wait-for-turn [timeout=60] [--after-line N]
<shim> status
<shim> read-events [--last N] [--type T] [--follow]   # --last caps the --follow backlog
<shim> read-turn [--full]
<shim> stop
<shim> handoff
<shim> session-id
<shim> events-file
```

`<shim>` is `/tmp/moe-crew-workers/bin/<tmux-name>`. Run `moe-crew help` for the same surface.

## Common Patterns

### Fan-Out: Multiple Workers in Parallel

Each worker gets its OWN linked git worktree — never a shared checkout. Two
workers writing into the same tree collide on the axis the parallel-
implementation worktree gate is built to prevent (see moe-core's
`dispatching-parallel-agents`, "Safe Parallel Implementation: The Worktree
Gate", and its two-rung fallback ladder). Create all worktrees first, branched
from one recorded base SHA. Before launching anything, validate every cwd has
one of the wave's pairwise-unique linked Git directories:

```bash
# One recorded base for the whole wave — every worker branches from it.
BASE=$(git -C ~/proj rev-parse HEAD)

git -C ~/proj worktree add ~/proj-worktrees/worker-api -b feat/api "$BASE"
git -C ~/proj worktree add ~/proj-worktrees/worker-ui  -b feat/ui  "$BASE"

# For each cwd, --git-dir and --git-common-dir must differ. The two --git-dir
# results must also differ from each other.
git -C ~/proj-worktrees/worker-api rev-parse --path-format=absolute --git-dir
git -C ~/proj-worktrees/worker-api rev-parse --path-format=absolute --git-common-dir
git -C ~/proj-worktrees/worker-ui rev-parse --path-format=absolute --git-dir
git -C ~/proj-worktrees/worker-ui rev-parse --path-format=absolute --git-common-dir

$SKILL/moe-crew launch worker-api ~/proj-worktrees/worker-api
$SKILL/moe-crew launch worker-ui  ~/proj-worktrees/worker-ui

/tmp/moe-crew-workers/bin/worker-api send "Add pagination to /users"
/tmp/moe-crew-workers/bin/worker-ui  send "Add a loading spinner to the user list"

/tmp/moe-crew-workers/bin/worker-api wait-for-turn 600
/tmp/moe-crew-workers/bin/worker-ui  wait-for-turn 600

/tmp/moe-crew-workers/bin/worker-api stop
/tmp/moe-crew-workers/bin/worker-ui  stop

# Integrate the wave: merge each branch into BASE, run the suite, THEN start
# the next wave from the merged head.
```

`moe-crew launch` accepts an arbitrary per-worker `cwd`; it does not create
the worktree for you and does not know about worktrees at all. That step is
git, done before dispatch. If two workers' declared work touches the same
file, a task is missing `Files:`, `Interfaces:`, `Consumes:`, or `Produces:`,
or any worktree creation/validation command fails, do not fan them out. Missing
task metadata fails validation. A file collision or worktree failure selects
the second and only fallback rung: run the whole wave sequentially from the
controller's validated tree. There is no unisolated-parallel rung and no
partial parallel launch.

### Pipeline: Worker A produces, Worker B consumes

```bash
$SKILL/moe-crew launch spec ~/proj
/tmp/moe-crew-workers/bin/spec converse "Write an OpenAPI spec for /users to /tmp/api.yaml" 300
/tmp/moe-crew-workers/bin/spec stop

$SKILL/moe-crew launch impl ~/proj
/tmp/moe-crew-workers/bin/impl converse "Implement the endpoint defined in /tmp/api.yaml" 600
/tmp/moe-crew-workers/bin/impl stop
```

Don't trust worker B's summary of what it did — check the produced file. A worker can report success while having written the wrong thing (see *Important Notes*).

## Edge Cases

### Worker crashes mid-turn

`wait-for-turn` matches `stop` OR `session_end`, so it returns when the worker dies. Call `status` afterward: if it's `gone`, the worker crashed.

### After a `converse` timeout, check `status` before `wait-for-turn`

A bare `wait-for-turn` baselines at the *current* end of the events file and waits for the **next** turn-end. If a `converse` timed out, the worker often finishes during the gap — the `stop` has already landed, so a follow-up `wait-for-turn` blocks the entire timeout waiting for a turn that will never start. After a timeout, call `status` first: `idle` means the turn already ended (`read-turn` to read it); `working` means it's still going.

### Recovering workers after a reboot

Worker runtime state (the `meta`/`events`/`shim` files under `/tmp/moe-crew-workers`) lives in `/tmp`, which macOS clears on reboot — and the tmux panes die with it. But the *conversations* survive: Claude Code persists each session transcript at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. `moe-crew adopt` brings one back as a live, driveable worker (this is **claude-only** — Codex and Pi mint their own session ids and offer no resume-by-id, so relaunch those instead):

```bash
$SKILL/moe-crew adopt my-task /path/to/project <session-id>
# stdout: /tmp/moe-crew-workers/bin/my-task   (same shim contract as launch)
```

**This is claude-only — codex/pi conversations do NOT survive `stop`.** Codex and Pi run under a staged per-worker home at `/tmp/moe-crew-workers/homes/<name>/` (config, auth, and the rollout/session transcript), *not* your real `~/.codex` / `~/.pi`. `stop` removes that home, so the transcript is gone and there is no recovery path — relaunch starts a fresh session. Only claude persists its transcript outside the worker dir (in `~/.claude/projects`), which is why only claude is adoptable.

`adopt` pre-writes the meta keyed by `<session-id>`, starts `claude --resume <session-id>` (which preserves the id, so the worker emits events normally), and writes the shim — so the resumed conversation is fully driveable (`converse`/`status`/`read-turn`/…), with all prior context intact. If a tmux session of that name already exists (e.g. restored by [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) / tmux-continuum), `adopt` respawns its pane *in place*, preserving the restored layout; otherwise it opens a new one.

Find a worker's `<session-id>` from its working directory: the newest `*.jsonl` in `~/.claude/projects/<cwd with every / . _ replaced by ->`. For bulk recovery (e.g. pairing with tmux-continuum's `@continuum-boot`), `examples/recover-workers.sh` reads a tmux-resurrect snapshot, derives each id, and calls `adopt` per worker — run it with `--dry-run` first. Note: workers are restored as resumed sessions, not their original tool/MCP state; re-pass any launch args (e.g. `-- --model …`) you depended on.

### Lost the shim path

If you know the tmux name, the path is `/tmp/moe-crew-workers/bin/<tmux-name>`. If you don't, `moe-crew list` enumerates everything; `moe-crew list <pattern>` filters by tmux-name substring.

### Long prompts

`send` uses bracketed-paste, which handles multi-line and special characters. For prompts in the tens-of-KB range, write to a file and tell the worker to read it:

```bash
echo "Long instructions..." > /tmp/instructions.txt
/tmp/moe-crew-workers/bin/my-task send "Read /tmp/instructions.txt and follow it"
```

## Important Notes

- **One controller per worker.** Two controllers driving the same tmux session will collide.
- **Workers don't share state with the controller** except via files on disk and the event stream.
- **Shim paths bake in absolute skill paths.** A plugin reinstall at a new location breaks live workers; relaunch them.
- **moe-crew is a transparent relay, not a validator.** `converse`/`read-turn` return whatever the worker says — verbatim, including when the worker is confidently wrong. For correctness-critical handoffs, verify the produced **artifact on disk**, not the worker's prose self-report.

## Environment variables

The `moe-crew` CLI honors a small set of env vars. All are optional.

| Variable | Purpose |
|---|---|
| `MOE_CREW_CLAUDE_BIN` / `MOE_CREW_CODEX_BIN` / `MOE_CREW_PI_BIN` | Path to each harness binary. Default to `claude` / `codex` / `pi` (resolved via `PATH`). Set when a binary is not on `PATH` or you want to pin a specific version. |
| `MOE_CREW_CODEX_MODEL` / `MOE_CREW_PI_MODEL` | Optional model override for codex / pi workers. Unset = the harness default (codex: `gpt-5.5`; pi: its configured default). |
| `MOE_CREW_CONVERSE_DIAG_FILE` | When set, `moe-crew converse` writes a post-mortem diagnostic on timeout — `ps` tree, `tmux capture-pane`, last 30 lines of the worker's session JSONL, last 20 lines of the moe-crew events JSONL — to this path, then emits a `moe-crew-diagnostic: <path>` pointer to stderr. The file is overwritten on each timeout. Unset = no diagnostic file. Useful when wrapping moe-crew in a harness that can ship the file off-box before the worker is reaped. |
| `MOE_CREW_WORKER_DIR` | Override the worker dir (default `/tmp/moe-crew-workers`). |
| `MOE_CREW_SUBMIT_TIMEOUT` / `MOE_CREW_SUBMIT_RETRY_INTERVAL` | `send`: seconds to wait for the worker to confirm a pasted prompt (default `10`) and seconds between retry-Enter resends (default `2`). Raise the timeout if a slow tmux session drops the paste. |
| `MOE_CREW_REGISTER_TIMEOUT` | Seconds the FIRST `send`/`converse` to a derive worker (codex/pi) waits for it to self-register its session id (default `15`). |
| `HOME` | Used to locate `~/.claude/projects/<encoded-cwd>/<sid>.jsonl` (claude) and the one-time consent file (`~/.claude/.moe-crew-consent`). |

`moe-crew help` shows the same surface.
