# Installing Moe

## First install

With the TC ProGet `@tc` scope and authentication already configured, run:

```sh
npx @tc/moe install
```

That is the supported end-user bootstrap. It does not require a repository
checkout or pnpm. `npx` runs the published package's `moe` dispatcher, and
`moe install` supplies `--apply` to the underlying installer. The command
therefore performs the install; no extra `-- --apply` is needed.

The installer checks prerequisites first. If it fails, the report names the
gap, the capability it disables, and one concrete fix. To run only that
diagnostic before installing:

```sh
npx @tc/moe doctor
```

> **Contributor checkout.** Clone, build, and source-tree installer commands
> are a separate workflow. See [Contributor checkout](#contributor-checkout)
> below and `ARCHITECTURE.md §6`.

## Supported platforms

| Platform | Status | Notes |
|---|---|---|
| macOS | supported | probed live on developer machines |
| Linux | supported | any distro with Node 24, npm, and git |
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
| `npm` / `npx` | hard | first install and CLI persistence | installed with Node 24 |
| `pnpm` 11 | soft | contributor builds, tests, and plugin minting | `corepack enable` |
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

## What the install command does

`npx @tc/moe install` dispatches to `moe-install --apply`. It runs the doctor
first, then:

1. Persists the exact running release of `@tc/moe` and the four distributed
   namespace CLI packages with `npm install --global`.
2. Runs `claude plugin marketplace add
   https://gitlab.tcdevops.com/Zak/moe.git --sparse .claude-plugin plugins`.
3. Runs `claude plugin install <name>@moe` for each of the six plugins:
   `moe-core`, `moe-everything`, `moe-backstory`, `moe-crew`, `moe-memory`,
   `moe-glass`.

The direct `moe-install` binary remains dry-run by default: without `--apply`
it prints the plan and changes nothing. The normal `moe install` lifecycle
command deliberately supplies that flag.

Four plugins install from a sparse clone of `.claude-plugin/` + `plugins/`
(content only — no toolchain needed). `moe-memory` and `moe-glass` install
from the `@tc` npm scope via the internal ProGet registry: prebuilt
`better-sqlite3` on every platform including native Windows, no MSVC
build tools required.

## Upgrading

```sh
moe upgrade
```

Under the hood: `claude plugin marketplace update moe`, then `claude plugin
update <name>@moe` for each plugin, then the TC CLI packages are upgraded to
`latest` together.

## Uninstalling

```sh
moe uninstall
```

Under the hood: `claude plugin uninstall <name>@moe` for each plugin, then
`claude plugin marketplace remove moe`, then the global TC CLI packages are
removed with the umbrella package last.

> **Caveat.** Removing the marketplace from its last scope uninstalls every
> plugin from it. `moe-install --uninstall` does that intentionally — if you
> only want to uninstall one plugin, run the `claude plugin uninstall`
> command yourself.

## Scoping

Lifecycle commands forward `--scope user|project|local` to the Claude plugin
operations that accept it. Marketplace update is the exception because the
Claude CLI does not accept a scope for that operation.

```sh
moe install --scope user     # available in every session
moe install --scope project  # this project only
moe install --scope local    # this checkout, this user
```

## When install goes wrong

Run `moe doctor` after installation, or `npx @tc/moe doctor` before it. If the
doctor is happy but installation fails, the failing line is an `npm install
--global …` or `claude plugin …` command; run that line by hand to see the
underlying error.

## Contributor checkout

These commands are for developing Moe from a clone, not for the end-user
install above:

```sh
pnpm install --frozen-lockfile
pnpm build
node bin/moe-doctor
node bin/moe-install          # inspect the source-tree install plan (dry-run)
```

`node bin/moe-install --apply` executes that checkout's package version and is
only for deliberate installer development or testing. See `ARCHITECTURE.md §6`
and [CONTRIBUTING.md](./CONTRIBUTING.md) for the complete contributor workflow.
