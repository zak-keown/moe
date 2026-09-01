---
slug: installer-hq-dx
title: Cross-Platform Installer With HQ DX
idea: |
  - Installer with HQ DX
status: done
size: L
estimate: "1.5-2 days (12-15 h)"
depends_on: [DO-NOW-1, DO-NOW-3, DO-NOW-5]
blocks: []
conflicts_with: [moe-bare-binary-dispatcher, runtime-pruning, contributing-flow-docs, moe-tone-and-branding]
touches: [.gitignore, .gitattributes, ARCHITECTURE.md, .claude-plugin/marketplace.json, README.md, bin/, packages/memory/package.json, packages/glass/package.json, packages/mint/src/adapters/shared.ts, packages/mint/src/adapters/pi.ts, packages/mint/test/adapters/]
decision_needed: no
---

# Cross-Platform Installer With HQ DX

*(This document is about `~/Code/moe`, the Superpowers hard fork. Not `~/Code/tools/moe`
and not `~/.claude/moe-core`.)*

## Supersession note (2026-09-01)

The research below is preserved, but two parts of its original ask are no longer
requirements:

- **WSL2 is the supported Windows path.** macOS, Linux and WSL2 are supported;
  native Windows is explicitly deferred. Native-Windows findings below are useful
  diagnostics and future research, not release acceptance criteria.
- **There is no retired MCP-key migration.** `--migrate` and compatibility for
  `episodic-memory` or `chrome` are canceled, not missing implementation.

The historical branch did not fulfill the end-to-end ask. The downstream repair
now does: `@tc/moe` owns all three executable entries, `moe install`, `upgrade`
and `uninstall` operate on the committed TC package set, and the clean-home CLI
suite exercises their command plans. Packed-artifact acceptance also installs
the umbrella tarball into an empty prefix, resolves all three shims, runs the
bare dispatcher and removes it cleanly. WSL2 remains the supported Windows path;
native Windows and retired-key migration remain deliberately out of scope. A
real WSL2/ProGet install is still an acceptance event, not something the macOS
package and injected-platform suites can prove; it is recorded in
`.planning/backlog-acceptance-2026-09-01.md`.

## The idea

> Installer with HQ DX

"HQ DX" is high-quality developer experience for install. Concretely: one of ~20
TurnCommerce engineers — **on a Mac, on native Windows, or in WSL** — runs one
command, is told up front which prerequisites they are missing, which Moe
capabilities each gap disables, and how to fix each one, and ends up with Moe's
plugins registered in Claude Code and its two MCP servers connected. With a
matching upgrade path, an uninstall path, and a migration for the MCP server keys
this fork renamed. Not a curl-to-bash, not a public installer: Moe distributes
only from `gitlab.tcdevops.com`.

## Why it matters

Twenty people is where install friction stops being a personal problem and becomes
a support queue. Moe has five runtimes behind one name (Node/pnpm, a Rust cdylib,
Python/uv, tmux, Docker), two MCP servers whose keys were renamed in a breaking
cut, and **three supported platforms**. Without an installer, all twenty rediscover
the same footguns, and the Windows subset hits failures that are worse than
footguns because they are *silent* — see the bootstrap-hook finding below.

## Current state

**There is no install path at all today.** `.claude-plugin/marketplace.json` lists
six plugins sourced at `./plugins/moe-core`, `./plugins/moe-everything`,
`./plugins/moe-backstory`, `./plugins/moe-memory`, `./plugins/moe-glass`,
`./plugins/moe-crew` — and `/Users/ZKeown/Code/moe/plugins` does not exist. Root
`pnpm mint` is a deliberate `exit 1` (`package.json:15`). DO-NOW-3 creates those
paths.

`claude plugin validate .` exits **0** on the repo right now and prints "Validation
passed" with all six sources missing — validation checks manifest shape, not source
resolution. It is not the gate; a real install is.

**mint is not an installer and should not become one.** Its `bootstrap/` directory
injects a bootstrap skill into a session via a SessionStart hook; it installs
nothing. `moe-mint init` (`src/cli.ts:71-72`) scaffolds a *new* plugin. The only
install-shaped things mint owns are the per-harness install *doc* it emits
(`src/adapters/claude-code.ts:106-146`) and `moe-mint test`, whose real per-harness
install checks run inside a container image that **has not been built or pushed**
(`packages/mint/docs/CONFIG.md:36`).

Upstream precedent: install was a separate marketplace-only repo.
`../.moe-references/superpowers-marketplace/` is `.claude-plugin/marketplace.json`
+ LICENSE + README and nothing else, every entry a
`{"source": "url", "url": "https://github.com/obra/<repo>.git"}`.
`../.moe-references/superpowers/README.md:52-130` is a hand-written 13-harness
install table whose whole "Updating" section is one line. No install script existed
anywhere in that snapshot. `packages/core/moe-mint.yaml:61-65` states Moe's
intended surface: per-package descriptors stay `source: local` for dev, and "the
marketplace people actually install from is the hand-maintained root
`.claude-plugin/marketplace.json`."

### Windows support exists in the code and is documented nowhere

`grep -rn win32 packages py` returns hits in eight places, so this is a property to
preserve, not a feature to add:

| Location | What it handles |
|---|---|
| `packages/core/hooks/run-hook.cmd` (core worktree) | cmd/bash polyglot hook shim; comments record that Claude Code's Windows auto-detection prepends `bash` to any command containing `.sh`, which is why every hook script here is extensionless |
| `packages/mint/src/bootstrap/shell-hook.ts:16` | mint *generates* the same polyglot wrapper into every plugin |
| `packages/mint/src/manifest.ts:66` | `checkExecBit` defaults off on win32 — NTFS has no exec bit |
| `packages/tab/bindings/typescript/src/lib-path.ts:5-14` | `libmoe_tab_ffi.dylib` / `moe_tab_ffi.dll` / `libmoe_tab_ffi.so`, with `MOE_TAB_LIB` override |
| `packages/tab/bindings/python/moe_tab/_lib.py:8-13` | the same three-way split for ctypes |
| `packages/glass/skills/browsing/lib/chrome-process.js:145-149` | Chrome discovery at `C:\Program Files\Google\Chrome\Application\chrome.exe` (+ x86) |
| `packages/glass/src/index.ts:49-51` | display detection assumes a display on win32 |
| `packages/crew/src/hooks/emit-event.ts:15-16` | ported from bash/jq because "bash and jq are not on Claude Code's hook PATH on Windows" |

Against that: **`ARCHITECTURE.md`, `PARITY.md` and `README.md` contain zero
occurrences of "Windows", "WSL" or "win32".** §6 "Local prerequisites"
(ARCHITECTURE.md:215-244) is macOS-only prose — brew, rustup's darwin toolchain
path, `/opt/homebrew`. The code is cross-platform and the documentation is
single-platform. Closing that gap is in scope here.

**There is no `.gitattributes`, and upstream had one.**
`../.moe-references/superpowers/.gitattributes` is 18 lines whose second comment
reads "Ensure the polyglot wrapper keeps LF (it's parsed by both cmd and bash)",
pinning `*.sh`, `hooks/session-start` and `*.cmd` to `eol=lf`. Nothing in
`PARITY.md` or any package README mentions `.gitattributes`, so it was dropped
silently rather than deliberately. That matters *now*, because committing
`/plugins/` (decision below) commits a `hooks/moe-mint/session-start` bash script
and a `run-hook.cmd` polyglot into a tree that Windows engineers will clone with
whatever `core.autocrlf` they happen to have — `git config core.autocrlf` is unset
on this machine, and on Git for Windows it defaults to `true`. CRLF in the polyglot
breaks it in both interpreters.

### The one Windows failure that is silent

`run-hook.cmd:30-39` searches Git for Windows' two standard bash paths, then `where
bash`, and if none is found does `exit /b 0` with the comment "No bash found - exit
silently rather than error (plugin still works, it just skips the hook)". Claude
Code's own docs confirm **Git for Windows is optional on native Windows** — without
it Claude Code uses the PowerShell tool instead of Bash, and
`CLAUDE_CODE_GIT_BASH_PATH` in settings.json is the override
(https://code.claude.com/docs/en/setup, "Set up on Windows").

For core's Stop hook that is a tolerable degradation. For the **bootstrap
SessionStart hook** it is not: `packages/core/moe-mint.yaml:34-42` calls the
bootstrap skill "what makes the rest fire without being asked for". On a native
Windows box with no Git for Windows, mint's generated wrapper skips silently, no
bootstrap content is injected, and Moe's central value proposition is off with no
error anywhere. **The doctor must detect this and say so in words.** It is the
highest-value single check in this item.

### Prerequisites, per platform

macOS column probed live on this machine today; the Windows and Linux/WSL columns
are what each prerequisite means there, not live probes.

| Prereq | Gates | macOS (probed) | Windows (native) | Linux / WSL |
|---|---|---|---|---|
| `node` ≥ 24 | everything | v24.19.0 | nodejs.org MSI or winget | distro / nvm |
| `pnpm` 11 | everything | 11.23.0 | `corepack enable` | `corepack enable` |
| `git` | clone, `--sparse` marketplace | 2.50.1 | Git for Windows | distro |
| **bash** | **bootstrap + Stop hooks** | built in | **Git for Windows — optional, and its absence is silent** | built in |
| `cargo` ≥ 1.98 | `pnpm tab:build`, `tab:test` | **missing on PATH** | `rustup-init.exe`, needs MSVC build tools | `rustup` |
| `tmux` | `moe-crew`, `using-tmux-for-interactive-commands` | **missing entirely** | **does not exist — WSL only** | distro |
| `uv` ≥ 0.12 | `pnpm proof:test` | 0.12.7 | winget / standalone installer | standalone installer |
| Chrome | `moe-glass` | detected via `chrome-process.js` | `C:\Program Files\Google\Chrome\…` per `chrome-process.js:145` | `/usr/bin/google-chrome` |
| `docker` | `moe-mint test` tier | 29.5.3 | Docker Desktop + WSL 2 backend | engine |
| `python3` ≥ 3.11 | mint's emitted-TOML check | 3.9.6 → 6 tests skip | 3.11+ from python.org | distro |

Per Zak's Q3 decision: Node, pnpm and git are hard; tmux, cargo, uv and docker are
soft with a named-capability warning. **bash on Windows is hard**, because its
absence disables the bootstrap hook without telling anyone.

macOS's cargo is installed but unreachable; the working binary is
`~/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo` (verified present).
ARCHITECTURE.md:230 gives the fix verbatim:

```sh
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
```

made permanent with `brew unlink rustup && brew link --overwrite rust` or
`rustup default stable`. Report and instruct; never patch a machine-specific path
into `package.json` (ARCHITECTURE.md:234-236 says why). The Windows equivalent is
`rustup-init.exe` plus the MSVC toolchain, and `pnpm tab:build` needs cargo there
too — `packages/tab/bindings/typescript/src/lib-path.ts:16-40` already resolves the
built artifact through `MOE_TAB_LIB` → bundled `native/<platform>-<arch>/` → in-tree
`target/{release,debug}`, so the installer's job is to check for cargo and point at
that resolution order, not to re-derive it.

**`moe-crew` is WSL-only on Windows, and that is a platform gap, not a missing
optional tool.** `packages/crew/src/core/tmux.ts` shells out to bare `tmux` for
`has-session`, `kill-session`, `capture-pane`, `send-keys` and `new-session` with no
platform branch and no fallback. crew's *hooks* are cross-platform — its
`docs/history/windows-hooks.md` records that they were rewritten from bash/jq into
node programs precisely to fix Windows — but the tmux substrate is not. The same
applies to core's `using-tmux-for-interactive-commands` skill.

**Of the two MCP servers, only memory is hard.** glass bundles
(`packages/glass/package.json:19`, `esbuild --bundle --external:fsevents`) — one
self-contained file. memory deliberately dropped its bundle and its postinstall
(`packages/memory/README.md:217-225`, memory worktree), so `node ./dist/cli.js
mcp-server` needs a built `dist/` *plus* resolvable `node_modules` *plus* a compiled
`better-sqlite3` (`pnpm-workspace.yaml:36` in that worktree). Its
`src/install-check.ts` exists to diagnose exactly that and refuses to install
anything. It also fetches an embedding model on first run into `<data dir>/models`
via a pinned `env.cacheDir` (`README.md:251-256`).

## Prerequisites

**DO-NOW-3** is the hard block: until mint generates `/plugins/`, there is nothing
to install and every marketplace entry is a dangling path. **DO-NOW-1** matters
because `memory` and `core` — both install targets — exist only in worktrees, and
memory contributes the `better-sqlite3` / `onnxruntime-node` `allowBuilds` entries.
**DO-NOW-5** matters because the install URL does not resolve until the remote
exists. The path itself is no longer a question: `Zak/moe` was confirmed on
2026-08-31 (ARCHITECTURE.md §8 — cited by section, because the line numbers this
doc originally gave have already moved once).

`moe-bare-binary-dispatcher` is not a blocker but should land first or in the same
wave — see the split below.

## Decisions already taken

Folded in rather than re-asked:

1. **`/plugins/` gets committed.** `.gitignore:17-18` loses `/plugins/` (and its
   comment's stale `@moe/mint` scope gets fixed to `@bubstack/moe-mint` while we are
   in there). DO-NOW-3's drift job becomes a real `git diff --exit-code`, and the
   git-URL marketplace install works. **New consequence, from the Windows pass:**
   this is what makes `.gitattributes` load-bearing, so it lands in the same change.
2. **`@bubstack/moe-memory` and `@bubstack/moe-glass` publish to the GitLab instance
   registry.** `private: true` comes off `packages/memory/package.json:4` and
   `packages/glass/package.json:5`, and the npm-source marketplace entry is live
   rather than a follow-on. This is what makes memory installable at all without a
   workspace checkout.
3. **Hard vs. soft prerequisites** as tabled above.
4. **Superseded 2026-09-01:** the earlier MCP-key `--migrate` requirement is
   canceled. Do not implement migration or ongoing compatibility for
   `episodic-memory` or `chrome`.

## Proposed approach

**Option A — Workspace clone + local-path marketplace.** `git clone`,
`pnpm install`, `pnpm build`, `pnpm mint`, then
`claude plugin marketplace add <checkout> --scope user`. *Trade-off:* works for
every component, but pushes the whole toolchain onto all twenty people — and on
Windows that means MSVC build tools for `better-sqlite3`.

**Option B — Sparse marketplace clone from GitLab.** One command:
`claude plugin marketplace add https://gitlab.tcdevops.com/Zak/moe.git --sparse .claude-plugin plugins`.
*Trade-off:* one command and zero toolchain for content plugins and for glass;
`moe-memory` is dead in a sparse clone.

**Option C — B, plus npm-source entries for the two MCP servers.** Marketplace
entries become `{"source": "npm", "package": "@bubstack/moe-memory"}`, resolved
through the `@bubstack` scope already pointed at the instance registry in `.npmrc`.
*Trade-off:* every component installs with no build step on every platform,
including `better-sqlite3` prebuilds; costs a publish job.

**Recommendation: C, which is now unblocked by decision 2.** Content plugins over
the sparse clone, memory and glass over the registry. This is the only shape that
gives a native-Windows engineer a working install without MSVC build tools, and it
is the reason decision 2 matters more than it looked: the npm path is not a
convenience, it is what makes Windows viable. Option A stays documented as the
contributor checkout, which is `contributing-flow-docs`' territory.

Concretely:

1. **`bin/moe-doctor` and `bin/moe-install` are Node programs, not bash+cmd
   polyglots.** This is a deliberate departure from `run-hook.cmd`'s pattern, on the
   fork's own evidence: crew's `docs/history/windows-hooks.md` records that its
   hooks were bash+`run-hook.cmd` polyglot, that this failed on Windows, and that
   the fix was to rewrite them as node programs — "node is inherently
   cross-platform and is already present wherever Claude Code runs, so there is no
   `bash`/`jq`-on-PATH requirement to satisfy," and the polyglot wrapper "is no
   longer needed and has been removed." An installer whose own prerequisite is the
   thing it exists to check for is the wrong shape. The polyglot stays correct where
   a hook must wrap an existing bash script (core's Stop hook, mint's generated
   `session-start`); it is wrong for new executables. Filenames stay extensionless
   regardless, per `run-hook.cmd:7-9`.
2. **`moe-doctor`** probes the table above, one line per check with a fix hint, and
   names the capability each soft miss disables ("no tmux → `moe-crew` and
   `using-tmux-for-interactive-commands` unavailable; on Windows these need WSL").
   On win32 it additionally resolves bash the way `run-hook.cmd:20-35` does, and if
   it finds none reports that the bootstrap hook will silently skip, with the
   `CLAUDE_CODE_GIT_BASH_PATH` settings fix. `claude doctor` is the naming model.
3. **`moe-install`** runs the doctor, then `marketplace add`, then `plugin install
   <name>@moe` per plugin. `--upgrade` wraps `marketplace update moe` +
   `plugin update <name>`. Uninstall is `plugin uninstall <name>@moe` then
   `marketplace remove moe`, and the docs must state that removing the marketplace
   from its last scope uninstalls every plugin from it. Every step is a real CLI
   subcommand taking `--scope user|project|local`, so nothing needs a slash command
   typed inside a session.
4. **No migration surface.** Do not inspect, remove or preserve the retired
   `episodic-memory` and `chrome` MCP keys. The earlier `--migrate` design is
   superseded by the 2026-09-01 decision above.
5. **`.gitattributes`**, ported from upstream's and extended to
   `hooks/moe-mint/session-start` and `plugins/**`: `eol=lf` for `*.cmd`, `*.sh` and
   the extensionless hook scripts. Without it, decision 1 ships a broken polyglot to
   Windows clones.
6. **ARCHITECTURE.md §6** gets the per-platform prerequisite table, replacing the
   brew/rustup-darwin prose, plus one sentence recording that Windows is a supported
   platform and that crew is WSL-only there.
7. **Fix the install docs mint emits.** `githubOwnerRepo()`
   (`packages/mint/src/adapters/shared.ts:60-64`) returns a slug only for
   `github.com`, so with `repository: https://gitlab.tcdevops.com/Zak/moe` —
   what `packages/core/moe-mint.yaml:22` sets — the claude-code, devin, hermes and
   pi install docs emit a `<your-repo>` placeholder instead of a working command,
   and pi's template hardcodes `pi install git:github.com/${repo}`. Generalize the
   host; do not loosen the never-fabricate rule
   (`packages/mint/README.md:249-254`).

### Split with `moe-bare-binary-dispatcher`

That slug owns `bin/moe` itself — the dispatcher, its subcommand table, and the
`moedex` binary revert. This slug owns the **install/doctor half**: the probe logic,
the marketplace and plugin calls, and their tests. If the dispatcher
lands first, these register as `moe doctor` and `moe install` and `bin/moe-doctor` /
`bin/moe-install` are their implementations; if it lands after, they stand alone and
the dispatcher adopts them. Both slugs write `bin/`, so they cannot share a wave.

## Scope boundary

**In:** `bin/moe-doctor` and `bin/moe-install` (install / upgrade / uninstall),
Node and cross-platform; the `/plugins/` un-ignore and the
`.gitattributes` that makes it safe on Windows; dropping `private: true` on memory
and glass and the npm-source marketplace entries; ARCHITECTURE.md §6's per-platform
table; one `INSTALL.md` or README section covering all three platforms; the
`githubOwnerRepo` GitLab generalization and its adapter tests; a clean-`HOME`
install smoke test.

**Out:** generating `/plugins/` (**DO-NOW-3**); the GitLab publish *pipeline* for the
two packages — this item flips `private` and writes the marketplace entries, the CI
job is DO-NOW-3-adjacent release work; the contributor checkout flow, owned by
`contributing-flow-docs`; `bin/moe` itself, owned by `moe-bare-binary-dispatcher`;
building and pushing the `moe-container` image and anything under `moe-mint test`
(`packages/mint/docs/CONFIG.md:36`); making `moe-crew` work on native Windows —
that is a tmux-substrate rewrite, not an install task, and belongs in its own item
if anyone wants it; retired MCP-key migration or compatibility; harnesses beyond
Claude Code, since `runtime-pruning` is
actively removing Grok and swapping Gemini for Antigravity; install prose tone,
owned by `moe-tone-and-branding`. And per settled decision: no curl-to-bash, no
public URL, no publish outside the GitLab instance registry.

## Decisions

**Q1 — answered by Zak on 2026-08-31: WSL 2 is the supported Windows path for now.**
His words: *"WSL2 is the answer for now. Windows can become first class once this
works solidly on macOS."* That is the doc's own recommendation with the emphasis
sharpened — not "support both, WSL recommended", but **WSL 2 supported and native
Windows explicitly not yet**, with first-class native support deferred until macOS
is solid.

So the doctor's Windows branch collapses to one honest warning rather than four
separate gaps: on native Windows, `moe-crew` cannot run, Claude Code sandboxing is
unsupported, `better-sqlite3` needs MSVC build tools unless the npm prebuild covers
win32, and the bootstrap hook needs Git for Windows or it silently skips. State all
four; do not paper over them. `run-hook.cmd` already prints the WSL 2 recommendation
when it finds no bash, so the doctor and the hook say the same thing.

**Q2 — answered 2026-08-31: about two thirds are on Windows today, in flux as
laptops are refreshed. Plan for 50/50.**

**This reframes the item rather than adding a footnote to it.** At 50/50, WSL 2 is
not an accommodation for a minority — it is the primary install path for roughly ten
of the twenty people this fork exists for. Consequences:

- **The doctor's Windows branch is a first-class path, not a fallback.** Half the
  audience meets it on first run. Its wording gets the same care as the macOS path.
- **`run-hook.cmd`'s diagnostic is on the hot path.** It used to `exit /b 0`
  silently when it found no bash; it now names the hook that did not run and
  recommends WSL 2. At 50/50 that change protects ten people rather than a corner
  case.
- **`.gitattributes` is protecting ten people, not one.** A clone made on the
  Windows side and reached through `/mnt/c` under `core.autocrlf=true` breaks the
  cmd/bash polyglot in *both* interpreters, with no half-working state to notice.
  That file is the only thing preventing it.
- **The clean-`HOME` smoke test needs a real WSL2 environment as a release gate**,
  not a nice-to-have. Native Windows remains diagnostic-only until first-class
  support is separately approved.

**One stated blocker is FALSE and should be struck: `better-sqlite3` does NOT need
MSVC on native Windows.** Verified against the upstream release rather than
assumed: `better-sqlite3@12.11.1` publishes 50 win32 prebuilds, 8 of them for plain
Node ABIs, including `better-sqlite3-v12.11.1-node-v137-win32-x64.tar.gz` and the
matching `arm64`. Node 24 is ABI 137 and this repo pins Node >= 24, so
`prebuild-install` finds a binary and `node-gyp` never runs. Do not tell users to
install build tools they do not need.

Also not a gap: **pnpm build approval is correctly configured.**
`pnpm-workspace.yaml`'s `allowBuilds` already carries `better-sqlite3`,
`onnxruntime-node` and `sharp` as `true` with the reason for each. A fresh
`pnpm install` runs all three install scripts. (`sharp` and `onnxruntime-node`
publish win32 binaries too, but that is unverified here — check it on the box, do
not assert it.)

**So the native-Windows gap list is three, not four:** bash is optional so the
bootstrap hook can skip (now loud, not silent), `moe-crew` cannot run because it
drives tmux, and Claude Code sandboxing is unsupported. State all three plainly.

**A tension worth naming once, not litigating:** the stated order is macOS-first,
with native Windows becoming first class after. With half the audience on Windows
that looks inverted — but it is not, because WSL 2 *is* the Windows answer and it is
a Linux target, so those users are served by the path that already works. What is
deferred is native Windows specifically, which is a real choice and a defensible
one.

*The original questions, kept as written:*

1. **Is native Windows supported, or is WSL the supported Windows path?** This is
   the one real fork left. Native Windows costs: bash is optional so the bootstrap
   hook can silently skip, `moe-crew` cannot run at all, `better-sqlite3` needs MSVC
   build tools unless the npm prebuild covers win32, and Claude Code's sandboxing is
   unsupported there. Declaring **WSL 2 the supported Windows path** collapses all
   four and makes the doctor's Windows branch a single "you are on native Windows;
   crew and sandboxing are unavailable and the bootstrap hook needs Git for
   Windows" warning. Declaring native Windows fully supported means owning the
   bootstrap-hook gap as a real defect. My recommendation: **support both, but name
   WSL 2 as recommended**, and have the doctor state the native-Windows limitations
   explicitly rather than letting people find them.
2. **How many of the twenty are on Windows, and native or WSL?** Historical
   test-matrix research only. The supported release matrix now requires WSL2,
   not native Windows.

## Effort

| Step | Time |
|---|---|
| `/plugins/` un-ignore + `.gitattributes` + commit the generated tree | 1 h |
| `bin/moe-doctor` — 10 probes, three platforms, capability-named warnings | 3 h |
| The win32 bash probe + bootstrap-hook-skip detection | 1 h |
| `bin/moe-install` — install / upgrade / uninstall over the `claude plugin` CLI | 1.5 h |
| Drop `private: true` ×2, npm-source marketplace entries | 0.5 h |
| `githubOwnerRepo` → host-general, pi template, 4 adapter test updates | 1.5 h |
| ARCHITECTURE.md §6 per-platform table + `INSTALL.md` | 1.5 h |
| Clean-`HOME` smoke test (macOS) | 1.5 h |
| Same smoke test under WSL2 | 1 h |

**~13.5 h; call it 1.5-2 days**, up from the single-platform estimate. What makes it
slower: the WSL2 smoke test needs an appropriate environment, and the
clean-`HOME` test may need Claude Code credentials to get past `claude plugin list`,
which would push it toward asserting on `settings.json` contents instead of CLI
output.

## Verification

- `plugins/moe-core/.claude-plugin/plugin.json` is committed, and `.gitattributes`
  pins `*.cmd`, `*.sh` and `plugins/**/hooks/**/session-start` to `eol=lf`.
- `git config core.autocrlf true && git checkout -- . && file plugins/moe-crew/hooks/*`
  shows LF, not CRLF — the assertion that decision 1 did not break Windows.
- `bin/moe-doctor` exits 0 with Node, pnpm and git present; exits non-zero naming
  `cargo` when `PATH` lacks the rustup toolchain; warns rather than fails on this
  machine, where `tmux` is absent, and names `moe-crew` in that warning.
- On Windows with Git for Windows removed from PATH, `moe-doctor` reports that the
  bootstrap hook will silently skip and prints the `CLAUDE_CODE_GIT_BASH_PATH` fix.
  This is the check that justifies the item.
- On macOS, Linux and WSL2:
  `claude plugin marketplace add <repo> --sparse .claude-plugin plugins` then
  `claude plugin install moe-core@moe` succeeds and `claude plugin list` shows
  `moe-core`. `claude plugin validate .` already exits 0 today with every source
  path missing, so it proves nothing on its own.
- `claude mcp get moe-glass` reports a connected server after installing
  `moe-glass@moe`; the same for `moe-memory` through its npm-source entry, on a box
  with no cargo and no MSVC toolchain.
- `moe-install --help` exposes no MCP migration or retired-key compatibility
  surface.
- A new case in `packages/mint/test/adapters/claude-code.test.ts` asserts that
  `repository: https://gitlab.tcdevops.com/Zak/moe` yields
  `claude /plugin marketplace add Zak/moe`, not `<your-repo>`.
  `pnpm --filter @bubstack/moe-mint test` stays green.
- `grep -c -i windows ARCHITECTURE.md` is greater than zero.
