# Moe — rules for agents

Harness-neutral. Every rule below is enforceable, verifiable, or load-bearing.
When something on disk contradicts a rule here, the tree wins and this file is
wrong — fix it. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the human narrative
and the reasoning; this file is the checklist.

## Where the truth lives

- `ARCHITECTURE.md` — target shape and the decisions that produced it. Read
  before writing anything: it holds the *why*, which the tree cannot tell you.
- `PARITY.md` — the compact imported-work ledger. Load-bearing for legal and
  license correctness.
- `NOTICE` — attribution. Apache-2.0 §4(b) requires it.
- `README.md` — the two rules and the map. Not a spec.

## Repo law

1. **A repository is not an installable plugin.** Source lives in `packages/`.
   Installable plugins are GENERATED into `/plugins/` by `@bubstack/moe-mint`.
   Never hand-edit anything under `/plugins/`. Edit
   `packages/<pkg>/mint/<plugin>.yaml` and run `pnpm mint`.
2. **The snapshots in `../.moe-references/` are the spec, not upstream HEAD.**
   Pinned SHAs live in `PARITY.md`. Do not consult upstream `main`. Parity
   against a moving target is unfalsifiable.
3. **Keep imported-work metadata centralized.** A new imported work or changed
   pinned revision belongs in `PARITY.md` and `NOTICE`, not package prose.
4. **Two tsconfigs, and they must agree.** `tsconfig.json` `references` mirrors
   runtime `dependencies` one for one. `tsconfig.tests.json` `references` holds
   test-only edges — including the ones that point *up*. Put a test-fixture
   inversion in `tsconfig.json` and you get `TS6202: Project references may not
   form a circular graph`.
5. **Keep legal metadata centralized.** `NOTICE` and `PARITY.md` are the
   canonical attribution surfaces; generated distributions carry applicable
   license terms. `pnpm provenance` checks their completeness.

## Guarded surfaces — a bad edit turns the suite red

Cite by test name / symbol / quoted sentence, never by line number.

- `packages/core/test/metadata.test.ts` — "accounts for every skill on disk in
  exactly one of the two maps", plus `LEAN_TIER_COUNT`.
- `packages/core/skill-tiers.yaml` — every skill directory needs an entry in
  exactly one map; lean membership is pinned.
- `.claude-plugin/marketplace.json` — `checkMarketplace()` asserts registry and
  marketplace agree in both directions.
- `packages/core/skills/_shared/` — every relative markdown link inside an
  owned file must resolve.
- `.gitattributes` — `git ls-files --eol` surfaces any CRLF that crept in.

## Unguarded prose — read carefully

`PARITY.md`, `ARCHITECTURE.md`, `packages/core/README.md`, `README.md`,
`.gitignore`, `.gitlab-ci.yml`. No test asserts anything about their contents.
Silent failure mode: a stale line-numbered citation surviving a merge and
reading as verified. Mitigation is the cite-by-name rule above, not
serialisation.

## Setup

- Node ≥ 24, pnpm 11.23.0 (`corepack enable`), `uv` ≥ 0.12, `cargo` ≥ 1.98.
- On macOS with rustup owning the toolchain, `cargo` may not be on PATH. The
  export lives in `ARCHITECTURE.md` §6 under "Local prerequisites":
  `export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"`.
  Repo scripts call bare `cargo` on purpose. Do not pin a machine-specific path
  in `package.json`.
- On Windows: use WSL2. Native Windows is deferred (see `ARCHITECTURE.md` §6
  "Windows: WSL2"). `tmux` exists under WSL2; on native Windows it does not, and
  the crew integration story does not work. `.gitattributes` pins LF; leave it
  alone.
- pnpm 11 refuses to install until every transitive postinstall script is
  approved by name under `allowBuilds` in `pnpm-workspace.yaml`. Miss one and
  `pnpm install --frozen-lockfile` fails with `ERR_PNPM_IGNORED_BUILDS`.
  `allowBuilds` supersedes pnpm 10's `onlyBuiltDependencies`; the old key is
  silently ignored.

## Inner loop

Root scripts (`package.json`), the only ones this doc names:

- `pnpm lint` — biome across the whole tree. Warnings do not fail the gate.
- `pnpm typecheck` — turbo, per package.
- `pnpm test` — turbo, per package. Includes each package's `build` as a
  dependency (`turbo.json`).
- `pnpm check` — `pnpm lint && turbo run typecheck test`. The Node gate.
- `pnpm build` — turbo. Runs as its own CI stage; also compiled transitively by
  `pnpm check`.
- `pnpm tab:build`, `pnpm tab:test`, `pnpm tab:test:bindings` — cargo and the
  Rust FFI. Outside `pnpm test` deliberately; bindings need the cdylib built
  first, and this is the only check that the C ABI rename landed identically in
  the Rust FFI, the committed header and all three bindings (`PARITY.md`
  "The C ABI rename is the load-bearing one").
- `pnpm proof:test` — Python; runs `pytest` under `uv` for `py/proof`.
- `pnpm mint` — regenerates `/plugins/` from `packages/*/mint/*.yaml`.
- `pnpm mint:check` — CI gate. `pnpm mint` then asserts `/plugins/` is
  byte-identical. Fails if anyone hand-edited a manifest.
- `pnpm provenance` — validates the attribution register and generated license
  payloads.

Scoping a package: `pnpm --filter @bubstack/moe-crew test` or
`turbo run typecheck test --filter=@bubstack/moe-crew`.

**Before opening an MR, run `pnpm check` and `pnpm mint:check`.** `pnpm check`
is the Node-only gate; the Rust and Python paths are CI-scoped and land after
push. If your change touches the FFI, the C ABI, or `packages/tab/**`, also run
`pnpm tab:test:bindings` locally — CI is path-scoped and will not catch a
consumer of the cdylib elsewhere.

## What CI runs, and what it does not

CI is one root `.gitlab-ci.yml`: `install`, `lint`, `typecheck`, `test`,
`build`, `plugins` (which is `pnpm mint:check`), and `provenance` on `node:24`.
Two path-scoped jobs: `tab` on `rust:latest` for `packages/tab/**`, and `proof`
on `python:3.12` for `py/proof/**`.

Not in CI: `pnpm tab:test:bindings` (needs the cdylib built first);
`glass test:chrome` (needs Chrome); `memory test:model` (needs a downloaded
model); core's `test:python`, `test:brainstorm`, `test:shell` and `latte:evals`
(each needs a runtime CI does not provide); crew's tmux integration suites
(`node:24` has no tmux, so 12 crew tests self-skip rather than fail).

Nothing runs on commit. No lefthook config, `core.hooksPath` unset. See
`ARCHITECTURE.md` §6 "one root-level mechanism"; the mechanism is still owed.

## Imported-work maintenance

No migration or re-import workflow is supported. If code from another work is
added deliberately, record its exact source, revision, license, destination,
and required notices in `PARITY.md` and `NOTICE`. Keep that metadata out of
package READMEs and other product-facing surfaces.

## Parallel work — the integration protocol

From the incident recorded in `.planning/backlog/WAVES.md` "Integration
protocol":

- A worker's findings are scoped to the tree it read. Its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a
  line number.
- A wave's workers branch from one recorded base.

Read `packages/core/**` from the package's tree. Read `PARITY.md` and
`ARCHITECTURE.md` from main, because that is where they live.

## Not this file's job

- Consumer-side install and HQ DX — see `installer-hq-dx`.
- Voice and tone — see `moe-tone-and-branding`.
- Building the `/plugins/` mint step — `DO-NOW-3` (merged); this file documents
  its use only.
