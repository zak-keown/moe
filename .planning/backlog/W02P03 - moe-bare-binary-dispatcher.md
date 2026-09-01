---
slug: moe-bare-binary-dispatcher
title: Claim The Bare `moe` Binary
idea: |
  Not from IDEA-LOG.md. Two decisions Zak made 2026-08-31:
  (1) The `moe` name belongs to this repo. `~/Code/tools/moe` (askmoe) is abandoned;
      `~/.claude/moe-core` is an abandoned rebranded GSD-core install; `~/Code/tools/moedex`
      was a rename he regrets, so its main binary goes back to `moedex`.
  (2) This repo claims the bare `moe` binary as a dispatcher — `moe flight`, `moe tab`,
      `moe mint` — with the existing `moe-<thing>` bins kept as aliases.
  Amended same day: Moe has Windows users; the dispatcher must be portable.
status: done
size: S
estimate: "4-5 h here; +1-1.5 h in ~/Code/tools/moedex, which is not this slug's work"
depends_on: [DO-NOW-1, installer-hq-dx]
blocks: []
conflicts_with: [installer-hq-dx, runtime-pruning, moe-tone-and-branding]
touches: [bin/, ARCHITECTURE.md, README.md, .gitlab-ci.yml, package.json]
decision_needed: yes
---

# Claim The Bare `moe` Binary

*(About `~/Code/moe`, the Superpowers hard fork. It also specifies changes required in
`~/Code/tools/moedex` — a different, unrelated Go repo — and mentions `~/.claude/moe-core`
and `~/Code/tools/moe`. Four projects carry Moe branding; every reference names which one.)*

## The idea

> This repo claims the bare `moe` binary as a dispatcher — `moe flight`, `moe tab`,
> `moe mint`, etc. — with the existing `moe-<thing>` bins kept as aliases.

One command on PATH, `moe`, taking a namespace as its first argument and handing the rest to
the package that owns it. `moe-<ns>` stays as the direct name, because MCP hosts, generated
plugin manifests and scripts reference those. Not a new CLI — a resolver in front of seven
existing entry points, five Node, one Rust, one Python, on macOS, Linux **and Windows**.

## Why it matters

Twenty engineers do not memorise seven binary names, and right now they cannot, because
**none of the seven is installed anywhere.** All eight TS packages are `private: true` and
the root declares no dependency on any of them, so pnpm links no `moe-*` bin: root
`node_modules/.bin/` holds exactly `biome jiti tsc tsserver turbo vite vitest yaml`. The
seven names at `ARCHITECTURE.md:280-281` are a naming *policy*, not an installed surface.
With `installer-hq-dx` this is what first puts any of them on PATH, and `moe` with no
arguments is the only place a new person — on any of three platforms — sees what they have.

## Current state

**The binary policy.** `ARCHITECTURE.md:280-281`, verbatim:

> Binaries: `moe-flight`, `moe-tab`, `moe-mint`, `moe-crew`, `moe-glass`,
> `moe-memory`, `moe-proof`. MCP server keys: `moe-memory`, `moe-glass`.

Note what §7 does *not* say: it lists seven `moe-<thing>` names and no bare `moe` but gives
no rationale for the absence. There is no sentence to overturn. (Line numbers for this file
drift: `runtime-pruning` and `moe-tone-and-branding` also edit it, which is why all three are
in `conflicts_with`. §7 is the stable anchor; the numbers here are as of 2026-08-31.) The
replacement, precisely:

> Binaries: one dispatcher, `moe`, in front of seven namespace bins — `moe-flight`,
> `moe-tab`, `moe-mint`, `moe-crew`, `moe-glass`, `moe-memory`, `moe-proof`. `moe <ns> …`
> is the human entry point; the `moe-<ns>` names are permanent, and are what MCP hosts,
> generated plugin manifests and scripts reference directly. MCP server keys:
> `moe-memory`, `moe-glass`.
>
> The bare name is contested on a developer machine — three projects have claimed it.
> See §7.1.

Plus a new §7.1 for the three claimants and the `bin/` line §3's target tree
(`ARCHITECTURE.md:62-93`) lacks. §4's count of 9 and §5's layers are untouched: the
recommendation adds no package and no dependency edge.

**Bin census.** Seven names, four runtimes, three build systems:

| ns | bin | declared at | runtime | built today |
|---|---|---|---|---|
| `crew` | `moe-crew` | `packages/crew/package.json` → `./dist/moe-crew.cjs` | Node, **CJS** tsup bundle | yes |
| `glass` | `moe-glass` | `packages/glass/package.json` → `./dist/index.js` | Node ESM, esbuild bundle | yes |
| `mint` | `moe-mint` | `packages/mint/package.json` → `./dist/cli.js` | Node ESM | yes |
| `memory` | `moe-memory` | worktree `-14`, `packages/memory/package.json` → `./dist/cli.js` | Node ESM | no (main is a stub) |
| `flight` | `moe-flight` | `packages/flight/package.json` → `./dist/cli.js` — declared on main though the package is a stub | Node ESM | no |
| `tab` | `moe-tab` | `packages/tab/crates/moe-tab-cli/Cargo.toml:13-15`, `[[bin]] name = "moe-tab"` | Rust, cargo (`moe-tab.exe` on Windows) | **no** — `packages/tab/target/` has `debug/`, `tmp/`, no `release/` |
| `proof` | `moe-proof` | `py/proof/pyproject.toml`, `[project.scripts] moe-proof = "moe_proof.cli:cli"` | Python, uv | only at `py/proof/.venv/bin/moe-proof`; not on PATH |

`core` and `backstory` declare no `bin` (content packages).
`packages/tab/bindings/typescript/package.json` declares none either — library only; and
`packages/tab` has no `package.json` at all, driven by root scripts
(`pnpm-workspace.yaml:1-3`). Two namespaces are not Node.

**Cross-platform is an existing property, not a new feature.** `win32` branches already
exist at `packages/mint/src/manifest.ts:66` (exec-bit drift skipped on Windows),
`packages/tab/bindings/typescript/src/lib-path.ts:5-14` and
`bindings/python/moe_tab/_lib.py:7-13` (`libmoe_tab_ffi.dylib` / `moe_tab_ffi.dll` /
`libmoe_tab_ffi.so`), `packages/glass/src/index.ts:49` (Chrome discovery), and
`packages/core/skills/brainstorming/scripts/server.cjs:280` — the WSL-detection idiom to
reuse: `platform === 'linux' && /microsoft/i.test(os.release())`.

Two constraints come from the hook layer. `packages/core/hooks/run-hook.cmd` (core worktree)
is a cmd/bash polyglot — `: << 'CMDBLOCK'` makes it a no-op-prefixed bash script on Unix and
a batch file on Windows, whose batch half hunts Git-for-Windows bash in two Program Files
locations then `where bash`, **exiting 0 silently when it finds none** (`:37-39`).
`packages/mint/src/bootstrap/shell-hook.ts:16` emits that same polyglot as a generated
template, so mint already owns cross-platform shim emission. And `run-hook.cmd:7-9` records
the harness quirk: **Claude Code's Windows auto-detection prepends `bash` to any command
containing `.sh`**, which is why every hook script here is extensionless. So: not `moe.sh`.

**Found defect, adjacent.** `packages/crew` is the only bin with no shebang —
`packages/crew/src/cli.ts:1` starts with `import` and `packages/crew/tsup.config.ts:14-27`
sets no `banner`, so `dist/moe-crew.cjs` begins `"use strict";`. The other four all carry
`#!/usr/bin/env node`. The Windows shim generator reads the shebang to pick an interpreter,
so `moe-crew`'s Windows shim is broken today, independently of this item.

**flight already solved this once.** `packages/flight/src/cli.ts` (worktree `-15`, 105 lines)
is a one-package dispatcher: `switch` on `process.argv[2]` (`:53-54`), one `await import()`
per namespace so `--help` loads nothing, a `USAGE` block listing every namespace, and — the
part worth copying — namespaces *declared and refused* rather than silently absent (factory
at `:44-51`, used at `:87`, `:90`), each error naming its upstream and the README section
explaining it. Its header records why it namespaces instead of flattening: `gauntlet run`
and `quorum run` collide, and quorum spawns the gauntlet bin as a subprocess, so a flat
`moe-flight run` would have had the binary shelling out to itself unable to say which half
it meant. Reuse this grammar.

**Only one entry point is import-safe.** `packages/crew/dist/moe-crew.cjs` exports `run` and
self-executes only under `require.main === module` (`packages/crew/src/cli.ts:617-626`).
Every other runs at module scope: `glass/src/index.ts:1333` calls `main()` unconditionally,
booting a stdio MCP server; `mint/src/cli.ts` ends in a bare `program.parseAsync()` reading
the *dispatcher's* argv; `memory/src/cli.ts:111,121` and `flight/src/cli.ts:53-54,97` have a
clean `main(argv)` but call it unguarded. `memory/src/cli.ts:11-22` is worth reading before
proposing anything spawn-shaped — it documents the shim layer it deleted, four extensionless
files spawning four dispatchers spawning `dist/*-cli.js`, half breaking under a symlinked
bin. The house contract for a missing external command is
`packages/crew/src/core/proc.ts:6-15`: never reject; on spawn failure resolve with a code and
the error in stderr, "just like checking `$?` in bash".

**The blocker: `moe` is taken, by a live process.** `~/.local/bin/moe` is a 113 MB arm64
Mach-O binary owned by moedex, with `moedex moedex-index moedex-serve moedex-mcp
moedex-corpus moedex-nav moedex-parity scale` symlinked to it and
`~/.local/bin/.moe-install-receipt` reading `schema=1 / binary=moe`. Not idle: `launchctl
list` shows `com.moedex.serve` at PID 32478 running
`~/.local/bin/moe serve … --mcp-http 127.0.0.1:8081 --embed onnx …`, up 28 minutes. (Nothing
listening on 8081, matching this session's moedex MCP `ConnectionRefused`: up but not
serving. Pre-existing — so no post-rename outage gets blamed on the rename.)

**But the rename Zak regrets has not shipped.** moedex `HEAD` (`7eae873`) still carries the
committed eight-binary layout, and `git show HEAD:Makefile` has
`INSTALL_CMDS := moedex moedex-index moedex-corpus moedex-mcp` — **HEAD installs `moedex`,
not `moe`.** The collapse to one `moe` is 181 uncommitted paths, including untracked
`cmd/moe/`, untracked `internal/cli/`, and two untracked design records:
`docs/adr/0023-unified-moe-shell.md` (*Status: Accepted, 2026-08-26* — "Ship one `moe`
executable… Install the former binary names as symlinks to `moe` for two releases") and
`docs/plans/moe-shell-rearchitecture.md`. The binary on PATH was built from that dirty tree.
Freeing the name is therefore a rename inside work that has not landed and nobody else has
installed.

**Third claimant, nominal only.** `~/.claude/moe-core/bin/lib/package-identity.cjs:6-11`
declares `packageName = "@bubstack/moe"`, `binName = "moe"`, `repoSlug = "moe-ai/moe-cc"`,
`repoUrl = "https://gitlab.com/moe-ai/moe-cc"`, `cacheSlug = "bubstack-moe"` — **gitlab.com,
a different instance from this fork's `gitlab.tcdevops.com`**, so no registry collision with
`@bubstack/moe-*`. (moedex carries a second remote `moe-ai git@gitlab.com:moe-ai/moedex.git`,
so the two share that lineage.) It holds no PATH entry: `~/.claude/moe-core/bin/` has
`moe-tools.cjs`, `moe_run`, `ensure-runtime-build.cjs`, `vetoes-tool.cjs` and no `moe`.
Abandoned; no work here beyond eventual removal, which is Zak's. `~/Code/tools/moe` is
`askmoe` (`"name": "askmoe"`, no `bin`) — not a claimant at all.

## Prerequisites

- **DO-NOW-1** (integrate Wave B/C), so the namespace table names real packages for
  `moe-memory` and `moe-flight` rather than stubs.
- **`installer-hq-dx`**, first or alongside. It creates `bin/` and owns `bin/moe-doctor` /
  `bin/moe-install`. **Split:** it owns *installing* `moe` — the link, the Windows
  `.cmd`/`.ps1` shims, `--upgrade`, uninstall, the doctor probe. This slug owns the
  *dispatcher* — `bin/moe.js`, its table, resolution order, absent-namespace messages, and
  the ARCHITECTURE amendment. Neither ships alone.
- **A shebang on crew's bundle** — `banner: { js: "#!/usr/bin/env node" }` on the CJS config
  at `packages/crew/tsup.config.ts:14-27`. Two lines in a file this slug does not own, but
  the Windows verification cannot pass without it. Needs an owner.
- **External, not this slug's work: free the name in `~/Code/tools/moedex`**
  (`origin git@gitlab.tcdevops.com:Zak/moedex.git`). Every line number below is in the
  **uncommitted** working tree, not HEAD; the cheapest shape is to rename the unified binary
  to `moedex` before that rearchitecture is committed, amending ADR 0023's Decision.
  1. `Makefile:34-36` — `INSTALL_COMPAT` becomes legacy names symlinked to `moedex`;
     `install-bins:170-176` and `install-dense:135-142` build `./cmd/moe` to `$(BINDIR)/moe`
     and must target `$(BINDIR)/moedex`; `install-finish:178-202` does `ln -s moe` and must
     point at `moedex`. `moe` must then be **deleted** from BINDIR, not symlinked.
  2. The receipt: `Makefile:33` and `:194` write `binary=moe`, `install-preflight:150` gates
     ownership on `grep -qx 'binary=moe'`. Both flip, and the on-disk receipt needs a
     one-time accept-and-upgrade or the first `moedex` install refuses as unowned.
  3. `internal/cli/cli.go` — `:46` argv fallback, `:49` the argv[0] guard
     `name != "moe" && name != "moe.exe"`, `:52` the "use moe" deprecation text, `:67` and
     `:163` the version label, `:92` `Use: "moe"`.
  4. **`internal/corpus/reindex.go:25,56,109`** — `bin = "moe"` and
     `filepath.Base(bin) == "moe"`. A real self-spawn, not a string: corpus reindex shells
     out by binary name, so missing it breaks reindex silently. `internal/tui/tui.go:213`
     is cosmetic.
  5. `cmd/moe/` → `cmd/moedex/`, plus six `./cmd/moe` Makefile references
     (`:109,140,175,210,248,264`). The eight `cmd/*` dirs look empty only because their
     `.go` files are uncommitted worktree deletions — `cmd/moedex/main.go` still exists at
     HEAD, so this is a rename inside uncommitted work, not a resurrection.
  6. **The ops layer, same change — and it is macOS and Linux only.**
     `deploy/com.moedex.serve.plist:37` execs `"$HOME/.local/bin/moe" serve`;
     `scripts/install-macos.sh:51` sets `MOE_BIN="$BINDIR/moe"` and `:210` re-renders and
     bootstraps it into `~/Library/LaunchAgents/`. Order matters — unload, re-render,
     reinstall, bootstrap — or `KeepAlive` respawns against a missing path. Also
     `deploy/moedex-{serve,refresh,sync}.service` (9 `/usr/local/bin/moe` hits),
     `deploy/README.md`, `scripts/refresh-corpus.sh`, `Dockerfile`, `Dockerfile.dense`.
     **Nothing Windows to rename:** `deploy/` holds only launchd plists and systemd units,
     and `docs/WINDOWS-SUPPORT.md` is *Status: analysis / not started* (2026-06-26), naming
     WSL2 as Phase 0 and a native Windows service as unbuilt Phase 1. A Windows moedex user
     is inside WSL2 on the Linux path; native has no service entry to update because none
     exists. Gap named, not covered.
  7. No MCP client change: `~/.claude.json` `mcpServers.moedex` is
     `{"type":"http","url":"http://127.0.0.1:8081/mcp"}` — a URL, not a binary path.

## Proposed approach

Windows settles this, and it settles it against my first instinct.

**A — a shell shim (`bin/moe` as POSIX `sh`, `exec`ing the target).** On Unix `exec` is
process *replacement*, so stdio and signals are exactly what the target would have got. **On
Windows it does not work at all:** a `bin` target is invoked through a generated `.cmd`/`.ps1`
shim that picks its interpreter from the shebang, and a shell script offers none Windows can
honour. The repo's own bash-on-Windows escape hatch needs Git-for-Windows and exits 0
silently when absent (`run-hook.cmd:37-39`) — right for a skippable hook, wrong for a
dispatcher that must report what it could not run. Windows also has no `execve`, so `sh`'s
one advantage does not exist there. Reject.

**B — a 10th package, `@bubstack/moe-cli`.** To `import` the namespaces it must depend on all
eight, making `moe` a full install of everything — against the graceful-fallback rule and the
independent-installability property §4 rests on. Adds an L3 to `ARCHITECTURE.md:130-141`
whose entire content is eight edges, with no justification against §4's count of 9. Reject.

**C — `bin/moe.js`, a dependency-free Node script with `#!/usr/bin/env node`,** declared as
`bin: { moe: "./bin/moe.js" }` in root `package.json` and linked by `bin/moe-install`. It
resolves `moe-<ns>` in order — dispatcher sibling first (an installed tree stays
self-consistent), then `PATH`, then a workspace fallback for the two non-Node namespaces —
then spawns with `stdio: "inherit"`, forwarding exit code and signals.

**Recommendation: C.** A shebanged Node file is the only portable bin mechanism: npm and
pnpm generate three files per bin on Windows — a `.cmd` for `cmd.exe`, an extensionless bash
script for Cygwin/MSYS2, and a `.ps1` for PowerShell — via `cmd-shim`, reading the shebang
to choose the interpreter ([npm `bin` docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/),
[cross-platform Node guide](https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/4_terminal/package_binaries.md)).
Node is already a hard prerequisite (`package.json:7-9`, `engines.node >= 24`), so a Node
dispatcher has no bootstrap problem where bash on Windows is an extra dependency. The `bin`
field is declarative — root is `private: true` and pnpm never self-links a workspace root's
own bin, evidenced by five declared bins appearing in no `.bin/` anywhere — so
`bin/moe-install` does the linking and writes the Windows shims, which is why this slug
depends on `installer-hq-dx` instead of duplicating it. `moe.js`, never `moe.sh`.

Spawning costs a live parent that must forward signals, which is exactly why **MCP stdio
servers do not go through the dispatcher**: hosts and generated plugin manifests keep
pointing at `moe-glass` / `moe-memory` directly
(`packages/mint/src/adapters/claude-code.ts:62` emits the `mcpServers` path; nothing changes),
and `moe glass` is a human convenience only. In-process `await import()` is the natural v2 —
it removes the extra process, and for `glass` importing *is* booting the server, which is
correct — but it needs a `main()` guard in `mint`, `memory`, `flight` and `glass` first. Four
packages for ~40 ms is not this slug.

Grammar copied from `packages/flight/src/cli.ts`: no args / `-h` / `--help` / `help` →
`USAGE` listing all seven namespaces marked present or absent; unknown namespace → error plus
`USAGE`; **declared and refused** for anything in the table but missing, naming the fix.
Never reject on spawn failure — resolve with a code, per `proc.ts:6-15`. Degradation:

- `moe flight`, flight absent → `moe flight: not installed. It ships in
  @bubstack/moe-flight — run bin/moe-install, or from a checkout: pnpm --filter
  @bubstack/moe-flight build`. Exit 127, no stack trace: the target is never loaded.
- `moe crew` on Windows → tmux does not exist outside WSL. Detect with the `server.cjs:280`
  idiom and say it: crew needs tmux, WSL2 is the route, the rest of Moe is unaffected.
- `moe tab` → the CLI is `moe-tab.exe` on Windows. Per-platform *library* naming belongs to
  the bindings and is already solved (`lib-path.ts:5-14`, `_lib.py:7-13`); the dispatcher
  resolves the CLI only, falling back to `packages/tab/target/release/moe-tab[.exe]` in a
  checkout, else naming `pnpm tab:build` (`package.json:18`).
- `moe proof` → falls back to `uv run --project py/proof moe-proof`, the form
  `package.json:17` already uses. The venv script is `.venv/bin/` on Unix and
  `.venv/Scripts/` on Windows, so resolve through `uv run`, never a hardcoded venv path.
- `moe` bare → a one-screen inventory of this machine. `moe-doctor` probes prerequisites,
  `moe` reports namespaces; `installer-hq-dx` owns the first.

## Scope boundary

**In:** `bin/moe.js` (namespace table, resolution order, absent-namespace and Windows/WSL
messages, `USAGE`), its test, one path-scoped CI job, the `ARCHITECTURE.md:280-281`
replacement plus §7.1 and the `bin/` line in §3's tree, one README paragraph.

**Out:** the moedex rename — another repo, Zak's, specified above so the work is scoped, not
started. The crew shebang — flagged as a prerequisite, no owner yet. Linking `moe` onto PATH
and writing the Windows shims, the doctor probe, upgrade and uninstall: `installer-hq-dx`.
**`ARCHITECTURE.md` §6 "Local prerequisites" (`:243-273`) is written entirely for macOS** —
brew, `~/.rustup/toolchains/stable-aarch64-apple-darwin`, `/opt/homebrew` — and needs Windows
and Linux equivalents: a doc gap owned by `installer-hq-dx`, not here. Removing
`~/.claude/moe-core`: Zak's. Renaming moedex's *repo* or GitLab project — only its binary is
in question. Rewriting the seven `moe-<ns>` invocations across READMEs and skill prose into
`moe <ns>` — question 2, and if yes it belongs to `moe-tone-and-branding` and
`contributing-flow-docs`. Any new behaviour inside a namespace. Native Windows support for
tmux-dependent `crew`, and a Windows CI runner — question 4 decides whether either is ever
in scope.

## Open questions for Zak

1. **Sequencing against moedex.** Freeing `~/.local/bin/moe` is ~1-1.5 h in a repo this slug
   does not touch, and until then `bin/moe-install` cannot link `moe`. Does the moedex change
   land *before* this ships, or does this ship with the dispatcher present and unlinked?
2. **Documented entry point, or additive convenience?** Documented means rewriting every
   `moe-<ns>` invocation in READMEs, skills and install prose: +2-3 h, sequenced after
   `moe-tone-and-branding` so the rewrite happens once. Additive keeps this at S.
3. **moedex's own compatibility window.** Its Makefile keeps legacy names as symlinks "for
   two releases" (`Makefile:34-36`) and `internal/cli/cli.go:49-54` prints a deprecation
   notice. Applying that to `moe` keeps a `moe → moedex` symlink alive, leaving the name
   occupied. Free it immediately, or let this slug's PATH claim wait out the window?
4. **Is Windows first-class, or is WSL2 the answer?** This sets the dispatcher's Windows
   messages and far more of `installer-hq-dx`. Native means `moe crew` has no story at all
   (tmux) and CI needs a Windows runner `.gitlab-ci.yml` does not have. WSL2 means Windows
   users take the Linux path and the dispatcher's job is to say so clearly — the route
   moedex's own `docs/WINDOWS-SUPPORT.md` picked as Phase 0. I would take WSL2 and keep
   native correctness only where it is already free (`mint`, `tab` bindings, `glass`), but
   the call reaches well beyond this slug.

## Effort

| Step | Time |
|---|---|
| `bin/moe.js`: namespace table, three-step resolution, `USAGE` with present/absent markers, absent-namespace and WSL messages, signal and exit-code forwarding | 2 h |
| Test: present ns, absent ns exit 127, unknown ns, bare/`--help`, exit-code and arg passthrough (including `--`), sibling-before-PATH precedence, plus platform-injected cases asserting the Windows and WSL branches without a Windows runner | 1.5 h |
| CI job path-scoped to `bin/**`, shaped like the existing `tab:` job (`.gitlab-ci.yml:52-58`), plus a root `bin:test` script | 20 min |
| `ARCHITECTURE.md` §7 replacement, §7.1, §3 `bin/` line | 45 min |
| README paragraph | 15 min |

~4-5 h. Slower if question 2 answers "documented entry point" (+2-3 h and a sequencing
constraint); if question 4 answers "native Windows", pulling in a Windows CI runner and a
real answer for `crew`; or if `moe tab` and `moe proof` must be tested by real invocation
rather than resolution — neither is built here, so `pnpm tab:build` and a uv sync become
prerequisites for those two paths.

## Verification

- The `bin/` test passes (bash or vitest, matching whatever `installer-hq-dx` establishes),
  and the same job passes in CI on a change under `bin/**`.
- `bin/moe` with no arguments lists all seven namespaces marked present or absent; on a tree
  where `pnpm build` has run and `pnpm tab:build` has not, `tab` reads absent while `crew`,
  `glass` and `mint` read present.
- `node bin/moe.js crew list` gives byte-identical stdout and the same exit code as
  `node packages/crew/dist/moe-crew.cjs list`; `node bin/moe.js crew --nope; echo $?`
  returns crew's exit code, not the dispatcher's.
- `node bin/moe.js flight --help` on main (where `packages/flight` is a stub) prints the
  not-installed message naming `@bubstack/moe-flight` and exits 127 — no stack trace, no Node
  error. `node bin/moe.js nonesuch` exits non-zero and prints `USAGE`.
- **Windows, without a Windows runner:** platform inputs are injected, and tests assert that
  `win32` resolves `moe-tab.exe`, that a simulated WSL environment (`linux` plus
  `/microsoft/i` in `os.release()`) still resolves tmux-dependent `crew`, and that bare
  `win32` refuses `crew` with the WSL message. First line of `bin/moe.js` is
  `#!/usr/bin/env node`, and `head -1 packages/crew/dist/moe-crew.cjs` is too.
- `ARCHITECTURE.md` §7 carries the replacement text above and §7.1 records the three
  claimants.
- Stated as not verifiable here: `moe` on PATH resolving to this dispatcher stays blocked
  until `~/.local/bin/moe` is freed. Until then the acceptance test invokes `bin/moe.js` by
  path, never bare `moe`.
