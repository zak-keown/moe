# Contributing to Moe

> Twenty internal people, GitLab origin, no public contributors. That deletes
> most of an open-source `CONTRIBUTING.md` and leaves the part that costs real
> time: getting a clean checkout to build and stay built.

Machine-readable rules for agents live in [AGENTS.md](./AGENTS.md); the
[CLAUDE.md](./CLAUDE.md) file imports it. This file is the narrative — the same
rules with their reasoning attached, plus the setup steps.

## 1. Setup

### Prerequisites

| Tool | Needed for | How to check |
|---|---|---|
| Node ≥ 24 | everything | `node --version` |
| pnpm 11.23.0 | everything (pinned in root `packageManager`; CI uses `corepack enable`) | `pnpm --version` |
| `uv` ≥ 0.12 | `pnpm proof:test` (Python) | `uv --version` |
| `cargo` ≥ 1.98 | `pnpm tab:build`, `pnpm tab:test` | `cargo --version` |
| tmux | crew integration suites (self-skip without) | `tmux -V` |
| Chrome | `glass test:chrome` | — |
| graphviz `dot` | 5 core shell assertions (self-skip without) | `dot -V` |
| `python3` ≥ 3.11 | 6 mint TOML tests; core `test:python` (self-skip below 3.11) | `python3 --version` |

`pnpm install && pnpm check` passes on a clean checkout when Node, pnpm, `uv`
and `cargo` are all present. tmux, Chrome, graphviz and `python3` ≥ 3.11 unlock
additional suites — none of them are gates for a normal MR.

### macOS: cargo may not be on PATH

`packages/tab` is a cargo crate, and its scripts call bare `cargo` on purpose —
a machine-specific path in `package.json` would not survive a second developer.

`ARCHITECTURE.md` §6 records the failure mode: rustup owns the toolchain,
brew's `rust` formula could not link over rustup's shims, and `brew cleanup`
pruned `/opt/homebrew/bin/{cargo,rustc}`. The working binary is inside the
rustup toolchain:

```sh
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
```

Make it permanent with either `brew unlink rustup && brew link --overwrite
rust`, or `rustup default stable` once rustup's shim dir is on PATH.

### Windows: WSL2, and that is the answer for now

Decided 2026-08-31 (`ARCHITECTURE.md` §6 "Windows: WSL2"). Native Windows
becomes first-class once this works solidly on macOS, not before. What that
buys and what it defers:

| | Under WSL2 | Native Windows, deferred |
|---|---|---|
| hooks | Linux shell scripts run directly; `run-hook.cmd`'s cmd half is never reached | needs a bash (Git for Windows); the wrapper now *says so* instead of exiting silently |
| `moe crew` | tmux works | no story at all — tmux does not exist |
| CI | none needed; `.gitlab-ci.yml` runs `node:24` | would need a Windows runner |
| line endings | native LF | `core.autocrlf=true` breaks the cmd/bash polyglot — see `.gitattributes` |

Two things are already done natively-correctly, because they were free: every
package bin carries a `#!/usr/bin/env node` shebang (cmd-shim reads it to pick
an interpreter), and `.gitattributes` pins LF. Both also matter under WSL2 the
moment someone clones on the Windows side and reaches the tree through
`/mnt/c`, which is a normal thing to do by accident. `.gitattributes` is a
guarded file — do not turn LF off.

### The install gotcha

pnpm 11 refuses to install until every transitive postinstall script is
approved by name in `pnpm-workspace.yaml` under `allowBuilds` — which
supersedes pnpm 10's `onlyBuiltDependencies`, so the older key is silently
ignored. Leave one unresolved and `pnpm install --frozen-lockfile` fails in
CI with `ERR_PNPM_IGNORED_BUILDS`. The commentary in `pnpm-workspace.yaml`
records which entries are load-bearing (`better-sqlite3`, `onnxruntime-node`,
`sharp`, `esbuild`, `koffi`) and which are safely disabled.

## 2. The inner loop

### The one command before push

```sh
pnpm install --frozen-lockfile
pnpm check          # lint + live scope + typecheck + every normal Node test
pnpm mint:check     # asserts /plugins/ is byte-identical from source
```

`pnpm check` runs `pnpm lint`, the live downstream `pnpm scope:check`,
`pnpm typecheck`, and the complete root `pnpm test`. That test command runs the
package suites through Turbo exactly once, then the root bin and TC release
policy suites. `turbo.json` makes each package test depend on its own `build`
and typecheck on dependencies' `build`, so the workspace compiles on its way
through.

### The four commands outside `pnpm check`, and why

| Command | Why it is outside | When to run it |
|---|---|---|
| `pnpm tab:test` | cargo; not in CI's node:24 image | any change under `packages/tab/**` |
| `pnpm tab:test:bindings` | needs the cdylib built first, and it is the only check that the C ABI rename landed identically in the Rust FFI, the committed header and all three bindings (`PARITY.md` "The C ABI rename is the load-bearing one") | any change to the FFI or a binding |
| `pnpm proof:test` | Python; needs `uv` | any change under `py/proof/**` |
| `pnpm mint:check` | it regenerates and diffs `/plugins/`; not a test | any change that could alter generated plugin output — mint config, skill frontmatter, `skill-tiers.yaml`, the marketplace, `@tc/moe-mint`'s own source, or the generator script |

Warnings do not fail `pnpm lint`. `biome check .` exits 0 on warnings, so they
are noise, not a gate. Real failures fail.

### Scoping

```sh
pnpm --filter @tc/moe-crew test
turbo run typecheck test --filter=@tc/moe-crew
```

Both work. Prefer `pnpm --filter` for a single package; prefer
`turbo run --filter=` when you want the DAG (dependencies rebuild).

### What CI verifies, and what it does not

One `.gitlab-ci.yml` at the root drives everything. Jobs: `install`, `lint`,
`typecheck`, `test`, `build`, `plugins` (which is `pnpm mint:check`), and
`provenance` on `node:24`. Two path-scoped jobs: `tab` on `rust:latest` for
`packages/tab/**`, and `proof` on `python:3.12` for `py/proof/**`.

Not in CI:

- `pnpm tab:test:bindings` — needs the cdylib built first.
- `glass test:chrome`, `memory test:model` — need Chrome and a downloaded
  model.
- core's `test:python`, `test:brainstorm`, `test:shell`, `latte:evals` — each
  needs a runtime CI does not provide.
- crew's tmux integration suites — `node:24` has no tmux, so 12 crew tests
  self-skip rather than fail (`packages/crew/README.md`).

**Nothing runs on commit.** No lefthook config, `core.hooksPath` unset.
`ARCHITECTURE.md` §6 promises "one root-level mechanism" and that mechanism is
still owed — recorded here so nobody mistakes silence for an absence of the
requirement.

## 3. Repo law

Three files carry it:

- `ARCHITECTURE.md` — target shape and the decisions that produced it. Read
  before writing anything; it holds the *why*, which the tree cannot tell you.
- `PARITY.md` — the compact imported-work ledger. Load-bearing for licence
  compliance.
- `NOTICE` — attribution. Apache-2.0 §4(b) requires it.

**The rule that follows:** new imported works and changed pinned revisions must
be recorded in both `PARITY.md` and `NOTICE`.

### Four conventions that are invisible from the code

1. **`/plugins/` is generated, never hand-edited.** `.claude-plugin/marketplace.json`
   sources each plugin as `./plugins/<name>`, so `/plugins/` is TRACKED
   deliberately — a consumer cloning this repo has to find it there. The
   `.gitignore` comment above the previous `/plugins/` entry explains this at
   length. Edit `packages/<pkg>/mint/<plugin>.yaml` and run `pnpm mint`.
   `pnpm mint:check` in CI is what stops a hand-edited manifest from silently
   drifting.
2. **Two tsconfigs per package, and they must agree** (`ARCHITECTURE.md` §6
   "Two configs per package"). `tsconfig.json` `references` mirrors runtime
   `dependencies`; `tsconfig.tests.json` `references` holds test-only edges,
   including the ones that point up. A test-fixture inversion in
   `tsconfig.json` fails with `TS6202: Project references may not form a
   circular graph`.
3. **The snapshots in `../.moe-references/` are fixed audit references, not a
   supported sync target.** Pinned revisions live in `PARITY.md`.
4. **Legal metadata stays centralized.** `NOTICE` and `PARITY.md` are the
   canonical attribution surfaces; generated distributions carry applicable
   license terms. `pnpm provenance` checks their completeness.

### Citation discipline

Cite by test name, symbol, or quoted sentence — never by line number. The
schedule in `.planning/backlog/WAVES.md` documents why: line numbers rot the
moment prose is edited, and a stale `:230` citation lands on real prose and
reads as verified. Guarded files (see `AGENTS.md`) are self-checking; unguarded
prose (`README.md`, `ARCHITECTURE.md`, `PARITY.md`, `packages/core/README.md`,
`.gitignore`, `.gitlab-ci.yml`) is not.

## 4. Imported-work maintenance

Moe does not support migration from old names or synchronization with source
repositories. If code from another work is deliberately added, record its
exact source, revision, license, destination, and required notices in
`PARITY.md` and `NOTICE`. Keep that metadata out of package READMEs and other
product-facing surfaces.

## 5. Parallel work — the integration protocol

From an incident on 2026-08-31 (`.planning/backlog/WAVES.md` "Integration
protocol") in which three agents disputed one citation and reached three
different answers, each running a correct command against a different tree:

- A worker's findings are scoped to the tree it read. Its report names the
  SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never
  a line number.
- **A wave's workers branch from one recorded base.** That clause alone would
  have prevented the incident.

Read `packages/core/**` from the package's tree. Read `PARITY.md` and
`ARCHITECTURE.md` from main, because that is where they live.

## 6. Scope of this document

**In:** how to set up a machine, how to run the inner loop, and the
load-bearing repository conventions.

**Out:**

- MR templates and `sc-{card}/{slug}` branch naming — owned by
  `tc-standards-conformance`.
- Consumer-side install and HQ DX — owned by `installer-hq-dx`; this document
  is contributor setup only.
- Voice and tone across the prose — owned by `moe-tone-and-branding`.
- Building the `/plugins/` mint step — owned by `DO-NOW-3` (merged). This
  document only records how to use it.
- `CODEOWNERS`, GitLab issue templates, and a git-hooks mechanism.
  `ARCHITECTURE.md` §6 records that the second is owed and the third exists
  only as intent. No backlog slug owns either yet. Recorded here rather than
  papered over.
- CLA, code of conduct, issue-triage policy, "good first issue". Twenty
  internal people on a self-hosted GitLab with no public contributors; none of
  it applies.

## 7. Gates that the docs themselves run

`AGENTS.md` is capped at 200 lines — the adherence threshold Claude Code's own
memory-file guidance gives:

```sh
test $(wc -l < AGENTS.md) -lt 200
```

Every `pnpm <script>` token cited in this file must name a live script in
root `package.json`. This catches a rename that would otherwise rot the doc:

```sh
node -e '
  const s = new Set(Object.keys(require("./package.json").scripts));
  const md = require("fs").readFileSync("CONTRIBUTING.md","utf8");
  const cliVerbs = new Set(["run","install","add","remove","exec","dlx","create","why","init","publish","update","link","unlink","list","ls","outdated","audit","import","rebuild","prune","start","dedupe","--filter"]);
  const missing = [...md.matchAll(/pnpm ([a-z:@-][a-z0-9:@_-]*)/g)]
    .map(m => m[1])
    .filter(x => !s.has(x) && !cliVerbs.has(x) && !x.startsWith("--") && !x.startsWith("@"));
  if (missing.length) { console.error("stale pnpm-script names in CONTRIBUTING.md:", missing); process.exit(1) }
'
```

`CLAUDE.md` must import `AGENTS.md`, not duplicate it:

```sh
grep -q '@AGENTS.md' CLAUDE.md
```

And in a Claude Code session at the repo root, `/context` must list
`CLAUDE.md` under **Memory files** — the check the Claude Code memory docs
themselves prescribe.
