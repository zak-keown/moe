# @bubstack/moe-crew

Launch, control and monitor worker coding-agent sessions over tmux. One CLI
(`moe-crew`) drives three harnesses — Claude Code, Codex and Pi — behind an
identical per-worker command surface. A controller session launches workers in
tmux panes, assigns each a task, watches the lifecycle events they emit, and
collects the results.

Ships as the **`moe-crew`** plugin, generated into `/plugins/moe-crew` by
`@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** imported. 397 tests passing across 38 suites; 12 more in 3 suites
skip themselves without a local `tmux` (see [Verification](#verification)).

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `claude-session-driver` | `d97d1eb` | MIT |

The upstream `LICENSE` (Copyright © 2025 Jesse Vincent) is retained verbatim.
The scaffold's `package.json` said `Apache-2.0`; the inbound license governs, so
it is `MIT` — the same correction `packages/glass` made.

Snapshots are in `../../../.moe-references/` (gitignored). They are the spec —
not upstream `main`. See [PARITY.md](../../PARITY.md).

## Layout

```
src/cli.ts             The dispatcher: usage text, arg parsing, subcommand routing.
src/commands/          One file per subcommand (launch, adopt, converse, send, …).
src/core/              tmux, event log, transcript parsing, worker store, paths, shell quoting.
src/harness/           Three drivers (claude, codex, pi) behind one HarnessDriver interface.
src/hooks/emit-event.ts  The node hook Claude and Codex invoke; bundles to dist/emit-event.cjs.
src/pi-extension/      Pi has no hook system, so its events come from a native extension.
skills/driving-claude-code-sessions/
                       The skill: SKILL.md plus a 2-line `moe-crew` shim that execs the bundle.
hooks/hooks.json       Five Claude Code lifecycle hooks, all pointing at emit-event.cjs.
examples/recover-workers.sh
                       Bulk `adopt` from a tmux-resurrect snapshot after a reboot.
test/                  38 vitest suites (397 tests).
  fixtures/            fake-claude / fake-codex / fake-pi — test doubles for the three harnesses.
  integration/         Three end-to-end suites: bundled CLI + bundled hook + REAL tmux.
docs/reference/        How Claude Code resolves provider and auth from the environment,
                       carved out of the shipped binary. Explains what `launch` pins and why.
docs/history/          Upstream plans, specs and the issue-15 resolution note. Inherited
                       record, left verbatim — see below.
```

## Three build artifacts, which is why tsup stays

`tsc -b` provides the composite type build the root solution `tsconfig.json`
references. The shipped artifacts are bundles, and each one needs to be:

- **`dist/moe-crew.cjs`** — the CLI, and the package's single `bin`. CJS, not
  ESM: `src/cli.ts` locates its own bundle through `__dirname` to bake an
  absolute entry path into each worker's shim.
- **`dist/emit-event.cjs`** — the lifecycle hook. `hooks/hooks.json` invokes it
  as `node "${CLAUDE_PLUGIN_ROOT}/dist/emit-event.cjs"`, a bare file path with no
  `node_modules` alongside it, so it must be self-contained.
- **`dist/pi-extension.mjs`** — loaded by Pi's own jiti/ESM loader
  (`pi -e dist/pi-extension.mjs`). Must be ESM, and must not `require` a sibling
  bundle. Verified: the built file contains zero `require(` calls.

ARCHITECTURE.md §6 says bundlers stay "only where a bundle is genuinely needed".
Three entry points, two module formats, and two of them invoked as loose file
paths is that case.

## What changed on import

**Toolchain was already close.** Upstream was the only forked repo already on
pnpm + vitest + biome + tsup, so nothing was converted. What moved was version
pins and config ownership: `typescript ^5.7.0 → ^5.9.0`, `@types/node ^22 → ^24`,
`engines.node >=22.12.0 → >=24`, `tsup ^8.3.5 → ^8.5.0`, and tsup's `target`
`node22 → node24`.

**Adopted `tsconfig.base.json`.** Upstream ran `moduleResolution: "bundler"` with
`noEmit`. The base is NodeNext, composite, `verbatimModuleSyntax`,
`exactOptionalPropertyTypes`. Every relative import already carried an explicit
`.js` extension and every type-only import was already `import type`, so those two
cost nothing. `exactOptionalPropertyTypes` produced **14 errors, and no real
bugs** — see below.

**Two tsconfigs.** `tsconfig.json` is the composite src build the root solution
references. `tsconfig.tests.json` restores upstream's whole-tree
`tsc --noEmit` (src + test + the two config files); it is non-composite and
`noEmit`, so it cannot be a solution member and `pnpm typecheck` runs it
directly. There are no cross-package edges to declare in either — `crew` has no
workspace dependencies.

**`tests/` → `test/`,** matching `packages/glass` and the root biome override
glob `**/packages/*/test/manual/**`. Three integration suites hardcoded a
`'tests'` path segment to reach `test/fixtures/`; those were fixed.

**Dropped tsup's `clean: true`.** Upstream committed `dist/` and gated pushes on
`git diff --exit-code dist/`, so a byte-reproducible build mattered. Here `dist/`
is gitignored, and `tsc -b` emits declarations into the same directory — a clean
would race away the type build.

**Dropped the `prepare` and `dist:check` scripts.** Git hooks are root-level in
this repo (upstream ran `lefthook install || true`), and `dist:check`'s premise
is gone with the committed `dist/`.

**Dropped the `/tmp/claude-workers` back-compat symlink.** `launch` and `adopt`
created it, pointing at the default worker dir. Its entire premise was an
*upstream* rename (`/tmp/claude-workers` → `/tmp/csd-workers`) that never
happened here, and it squats a path an upstream `csd` install also claims — so on
a machine with both, whichever ran first wins. Removing it deleted one test,
`ensureBackCompatSymlink` "is a no-op for a non-default dir (never throws)",
which asserted only that the function did not throw. The invariant that survives
is in `test/cli.test.ts`: usage text must not advertise a legacy path.

**Reformatted to the root biome options.** Upstream ran biome's formatter too,
just configured differently — single quotes, width 80. The root config is double
quotes, width 100. 84 files reformatted. This is a like-for-like re-application,
not the `formatter: false` freeze `packages/glass` needed (glass's upstream ran
no formatter at all), so **`crew` needs no biome formatter override**.

**One vitest project, deliberately.** The three `test/integration/*-flow.test.ts`
suites drive a live tmux server, but each probes `tmux -V` and skips itself with
a printed reason when tmux is absent — already CI-safe. Splitting them into an
opt-in project (glass's shape for Chrome) would only stop them running on a
developer box that *does* have tmux.

### The strict base found no bugs here

All 14 errors were the same shape: an options-bag property declared `x?: T`
being handed `T | undefined` by a parser that uses `undefined` to mean "caller
gave nothing, use the default". Every consumer already read it as
`opts.x ?? DEFAULT`. The fix was to widen the *declarations* to
`x?: T | undefined`, which is what those interfaces actually mean — no casts, no
loosened base, no per-package escape hatch. Touched: `ListOpts`,
`ReadEventsOpts`, `FollowEventsOpts`, `WaitForTurnOpts`, `CodexTrustGateOpts`,
`CodexComposerOpts`, `PiReadyOpts`, `ConverseDiagOpts.run`, `HookOptions.baked`,
and five inline return types in `src/cli.ts`.

Worth recording plainly: unlike glass, which surfaced one real latent bug, the
strict base found nothing wrong with this code.

### `@earendil-works/pi-coding-agent` is still used

Upstream pinned it at exactly `0.74.0` in `devDependencies`. It **is** still
used, and only for types — eight event/context interfaces imported as
`import type` in `src/pi-extension/index.ts` and `test/pi-extension.test.ts`.
Nothing imports a value from it, and it is not a runtime dependency: tsup
bundles the extension against Pi's own loader.

Kept, because the types being *real* is the point — if Pi changes `ToolCallEvent`,
`pnpm typecheck` says so, where a hand-written shim would drift silently. It is
not free: it drags in `koffi` (native FFI), `@google/genai` and `protobufjs`,
all three of which run postinstall scripts and therefore need naming in the root
`pnpm-workspace.yaml` `allowBuilds`. See the root-changes note below.

`smol-toml` is also still used — `test/codex-driver.test.ts` parses the
`config.toml` the codex driver writes, to prove it is valid TOML.

## Rebrand, and what was deliberately left alone

**617 substitutions across 61 of the 89 imported files.** Applied
longest-token-first so compound identifiers were consumed before the bare token:

| Kind | Upstream | Moe | Count |
|---|---|---|---|
| package + plugin name | `claude-session-driver` | `moe-crew` | 9 |
| bin / CLI name, worker dir, shim script | `csd` | `moe-crew` | 313 |
| env var prefix | `CSD_*` (19 vars) | `MOE_CREW_*` | 229 |
| identifiers | `csdEntry`, `csdPath`, `csdPiExtension`, `runnableCsd`, `FAKE_CSD` | `moeCrewEntry`, `moeCrewPath`, `moeCrewPiExtension`, `runnableMoeCrew`, `FAKE_MOE_CREW` | 59 |
| bash variable | `CSD` | `MOE_CREW` | 3 |
| test fixture plugin dir | `/plugins/superpowers` | `/plugins/moe-crew` | 4 |

Breaking interface changes inside that, each deliberate:

- **bin `csd` → `moe-crew`.** One binary, as before. Upstream declared no `bin`
  field at all and reached the CLI only through the skill's shell shim; here it
  is a real `bin`, `./dist/moe-crew.cjs`, and the shim still works.
- **worker state dir `/tmp/csd-workers` → `/tmp/moe-crew-workers`.** Every shim
  path a controller holds changes with it. Live workers do not survive the cut.
- **consent file `~/.claude/.claude-session-driver-consent` →
  `~/.claude/.moe-crew-consent`.** Everyone re-runs `moe-crew grant-consent` once.
- **19 `CSD_*` env vars → `MOE_CREW_*`.** `CSD` is nothing but an initialism of
  the upstream project name, so it is pure brand and had to go. Contrast
  `packages/glass`, which kept `CHROME_WS_*` because those describe a Chrome
  WebSocket client rather than a project.

**The `driving-claude-code-sessions` skill keeps its name.** It is descriptive,
not an upstream brand token, and it is referenced throughout `SKILL.md`. The name
*is* now slightly narrow — the tool drives Codex and Pi too — but renaming buys
no identity and costs churn in the generated plugin manifest. Same reasoning
glass applied to `chrome-ws` and `browsing`.

**Nine comment lines had `csd` restored.** The blanket pass rewrote provenance
pointers into nonsense: `(bash moe-crew:950-963)` claims a line number in a
TypeScript file. These cite line numbers, a PR and a file path in the *upstream
bash `csd`*, which upstream deleted before this snapshot, so they now read
`(upstream bash \`csd\`:950-963)`. Provenance is preserved; self-reference is
rewritten. This is the same rule the GitHub/GitLab URL split follows.

**`~/.pi/agent/sessions/--Users-jesse--/` stays.** A `VERIFIED on disk` evidence
line in `src/pi-extension/index.ts` carrying the upstream author's home path.
`jesse` is not in the fork's brand-token list, and editing a line marked as
observed evidence would be worse than the noise it leaves.

**`CHANGELOG.md`, `LICENSE` and `docs/history/` are untouched — byte-identical to
upstream, verified with `diff`.** They describe a project that *was* called
claude-session-driver. Rewriting them would falsify the record and, for
`LICENSE`, break the MIT notice.

### Where the upstream files went

| Upstream path | Here | Why |
|---|---|---|
| `docs/superpowers/plans/` (2 files) | `docs/history/plans/` | Upstream planning artifacts. No reachable author to ask; they explain the code's shape. |
| `docs/superpowers/specs/` (2 files) | `docs/history/specs/` | Same. |
| `docs/windows-hooks.md` | `docs/history/windows-hooks.md` | Titled "issue #15 is resolved" — a record of a past upstream change, not current reference. |
| `docs/reference/claude-code-provider-auth-env.md` | unchanged path | Genuine technical reference for current behaviour, so Zone A: rebranded. Its closing pointer to a bash `tests/test-csd-provider-env.sh` was stale — that file is not in the snapshot — and now points at `test/claude-driver.test.ts`, which actually covers it. |
| `tests/` | `test/` | Workspace convention. |
| `skills/…/scripts/csd` | `skills/…/scripts/moe-crew` | Renamed with the bin. |

### Not imported

| Path | Why |
|---|---|
| `.private-journal/` | One of the upstream author's private journal entries — a `.md` and its `.embedding`, dated 2026-02-25 — committed upstream. Not ours to redistribute. |
| `pnpm-lock.yaml` | Nested lockfile; the root one governs. |
| `biome.json`, `tsconfig.json` | Nested tool configs; the root ones govern. Read first: upstream's biome added `noNonNullAssertion: warn` and turned it off under `tests/**`, which is exactly the override this package still wants (see below). |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | `@bubstack/moe-mint` generates manifests. Read for identifiers: name `claude-session-driver` → `moe-crew`, author Jesse Vincent, homepage/repository `github.com/obra/claude-session-driver`, keywords `session-driver, worker-sessions, tmux, orchestration, multi-agent`. |
| `.github/workflows/ci.yml` | The repo's single workflow: setup-node 22 + corepack pnpm 10.32.1, then `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `dist:check`, `test`. Replaced by the root `.gitlab-ci.yml`. Not ported. |
| `lefthook.yml` | Git hooks are root-level here. |
| `.editorconfig`, `.gitignore`, `.nvmrc` | Root files govern; biome owns formatting. |
| `dist/` | Committed upstream; gitignored here. |

## Verification

```
pnpm --filter @bubstack/moe-crew run build       # tsc -b && tsup: 3 bundles, success
pnpm --filter @bubstack/moe-crew run typecheck   # exit 0 (src + tests)
pnpm --filter @bubstack/moe-crew run test        # 397 passed | 12 skipped (409)
biome check packages/crew                        # exit 0; 34 warnings, all in test/
turbo run typecheck test --filter=@bubstack/moe-crew   # 3 tasks successful
```

**12 tests are unverified on this machine.** The three integration suites need a
real `tmux` on `PATH` and there is none here, so they skip. They are the suites
that exercise the renamed `dist/moe-crew.cjs` and the `MOE_CREW_*` env pins
through a live tmux server, i.e. exactly the surface the rebrand touched. Two
things were checked by hand to cover the gap:

1. `node dist/moe-crew.cjs help` runs and prints the rebranded usage.
2. The bundled hook was driven the way `fake-claude` drives it — a `SessionStart`
   and a `PreToolUse` payload piped to `node dist/emit-event.cjs` with
   `MOE_CREW_WORKER_DIR` set — and appended the expected
   `{"event":"session_start",…}` / `{"event":"pre_tool_use",…}` lines.

Additionally, the set of `MOE_CREW_*` names referenced in `src/` was diffed
against the set in `test/`: the only asymmetries are the three fixture-only
`MOE_CREW_FAKE_*` vars and two src-only vars no test overrides. No rename typo.

The root `.gitlab-ci.yml` runs on `node:24`, which has no tmux, so CI will skip
these 12 too.

## Follow-ups

- **CI needs tmux for the integration suites.** Either add it to the `test` job's
  image or give the three suites a job of their own. Until then 12 tests are
  permanently skipped rather than passing.
- **The root biome config wants one override for this package.** 34
  `lint/style/noNonNullAssertion` warnings, all in `test/`, matching upstream's
  own `tests/**` relaxation. They are warnings, so `biome check` exits 0 — this is
  noise reduction, not a gate. Biome's offered autofix is *unsafe* and would
  weaken the assertions (`expect(meta!.cwd)` → `expect(meta?.cwd)` passes on
  null), so the override is the right answer, not the fix.
- **`@earendil-works/pi-coding-agent` needs three `allowBuilds` entries** in the
  root `pnpm-workspace.yaml` before `pnpm install --frozen-lockfile` succeeds.
  See root-changes below.
- **The pi extension's ESM bundle carries dead imports.** tsup warns that
  `readFileSync`, `chmodSync`, `readdirSync`, `rmSync`, `dirname` and `join` are
  imported from `fs`/`path` into `dist/pi-extension.mjs` but never used —
  treeshaking keeps the import statements. Harmless (both are builtins) but it
  means the extension pulls a slightly wider surface than it needs.
- **`test/fixtures/fake-claude` encodes the cwd with `/[/._]/`, while
  `src/core/paths.ts` uses `/[/._:]/`.** Pre-existing upstream drift, invisible
  because `mkdtemp` paths contain no colon. A cwd with a colon would make the
  fixture write its transcript where `read-turn` will not look.
