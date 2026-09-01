# Installing Moe

One command with a real diagnostic. If it fails, you get a report that names
the gap, names the capability the gap disables, and gives one concrete fix.

> **Scope.** These instructions install Moe into Claude Code as an end-user.
> For a contributor checkout (clone, `pnpm install`, `pnpm build`), read
> `ARCHITECTURE.md §6` instead — that is a different workflow, and the two
> should not be conflated.

## TL;DR

```sh
# 1. Check prerequisites. Reports what's missing and how to fix each gap.
node bin/moe-doctor

# 2. See what install will do (dry-run — nothing changes).
node bin/moe-install

# 3. Actually install.
node bin/moe-install --apply
```

Both scripts are dependency-free Node — they work on a fresh checkout with
nothing installed but Node itself. The default is dry-run: `moe-install`
without `--apply` prints the plan and refuses to change anything.

## Supported platforms

| Platform | Status | Notes |
|---|---|---|
| macOS | supported | probed live on developer machines |
| Linux | supported | any distro with Node 24, pnpm 11, git |
| WSL 2 | **supported and recommended on Windows** | see below |
| Windows (native) | **not first-class yet** | see the three gaps below |

**WSL 2 is the supported Windows path for now.** Native Windows becomes
first-class once WSL 2 and macOS work solidly. Roughly half of Moe's
audience is on Windows, so WSL 2 is a first-class path, not a fallback.

**Three real gaps on native Windows** — the doctor names all three plainly:

1. `bash` is optional on native Windows. Without it, Moe's bootstrap
   `SessionStart` hook silently skips and its central value (skills firing
   without being asked for) is off with no error. Install Git for Windows,
   or set `CLAUDE_CODE_GIT_BASH_PATH` in your Claude Code `settings.json` to
   the path of a `bash.exe`.
2. `moe-crew` cannot run — it drives `tmux`, and `tmux` does not exist on
   native Windows. This is a platform gap, not a missing optional tool. Use
   WSL 2 if you need `moe-crew`.
3. Claude Code sandboxing is unsupported on native Windows. WSL 2 has it.

## Prerequisites, one table

| Prereq | Tier | Gates | Fix |
|---|---|---|---|
| `node` ≥ 24 | hard | everything | nodejs.org, nvm, or your distro |
| `pnpm` 11 | hard | everything | `corepack enable` |
| `git` | hard | clone, sparse marketplace add | git-scm.com; on Windows Git for Windows also gives you `bash` |
| `bash` (win32) | hard on win32 | bootstrap `SessionStart` hook | Git for Windows OR `CLAUDE_CODE_GIT_BASH_PATH` |
| `claude` CLI | hard | every install/uninstall/upgrade step | https://code.claude.com/docs/en/setup |
| `cargo` ≥ 1.98 | soft | `@tc/moe-tab` (contributor-only) | rustup |
| `tmux` | soft | `@tc/moe-crew` and `using-tmux-for-interactive-commands` | your package manager; WSL only on Windows |
| `uv` ≥ 0.12 | soft | `moe-proof` (small-model evals; Python) | astral.sh/uv or `brew install uv` |
| Chrome | soft | `@tc/moe-glass` (CDP browser access) | google.com/chrome |
| `docker` | soft | `moe-mint test` container tier (contributor-only) | Docker Desktop / engine |
| `python3` ≥ 3.11 | soft | mint TOML check and `moe-proof` | python.org or your distro |

**Hard** prereqs must pass — `bin/moe-doctor` exits 1 if any are missing.
**Soft** prereqs warn but never fail. `moe-doctor --json` emits machine-
readable output for automation.

## What `moe-install` does

`moe-install --apply` runs `moe-doctor` first (skip with `--skip-doctor` if
you know what you're doing), then:

1. `claude plugin marketplace add https://gitlab.tcdevops.com/Zak/moe.git`
2. `claude plugin install <name>@moe` for each of the six plugins:
   `moe-core`, `moe-everything`, `moe-backstory`, `moe-crew`, `moe-memory`,
   `moe-glass`.

Four plugins install from a sparse clone of `.claude-plugin/` + `plugins/`
(content only — no toolchain needed). `moe-memory` and `moe-glass` install
from the `@tc` npm scope via the internal ProGet registry: prebuilt
`better-sqlite3` on every platform including native Windows, no MSVC
build tools required.

## Upgrading

```sh
node bin/moe-install --upgrade --apply
```

Under the hood: `claude plugin marketplace update moe` then
`claude plugin update <name>@moe` for each plugin.

## Uninstalling

```sh
node bin/moe-install --uninstall --apply
```

Under the hood: `claude plugin uninstall <name>@moe` for each plugin, then
`claude plugin marketplace remove moe`.

> **Caveat.** Removing the marketplace from its last scope uninstalls every
> plugin from it. `moe-install --uninstall` does that intentionally — if you
> only want to uninstall one plugin, run the `claude plugin uninstall`
> command yourself.

## Scoping

Every `bin/moe-install` action forwards `--scope user|project|local` to
`claude plugin`:

```sh
node bin/moe-install --apply --scope user     # available in every session
node bin/moe-install --apply --scope project  # this project only
node bin/moe-install --apply --scope local    # this checkout, this user
```

## When install goes wrong

`bin/moe-doctor` is the diagnostic; run it first. If the doctor is happy
but `moe-install` fails, the failing line is a `claude plugin …` command —
run it by hand to see the underlying error. Both `bin/moe-doctor` and
`bin/moe-install` are dependency-free ESM Node scripts; feel free to read
them.
