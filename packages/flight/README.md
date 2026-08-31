# @bubstack/moe-flight

Drive a target — web, CLI or TUI — through a story card's acceptance criteria and
grade it. One bin, `moe-flight`, with the QA engine under `moe-flight qa`.

Not a plugin, and deliberately not publishable: see
[License, and why this package is `private`](#license-and-why-this-package-is-private).

**Status:** half imported. `gauntlet` is in and green — **1432 tests passing
across 158 suites**, 20 skipped for a missing `tmux`. `superpowers-evals`
(quorum) is **not** imported except for one deliberate bridgehead; see
[What is not imported yet](#what-is-not-imported-yet).

## Forked from

| Upstream repo | Pinned | License | State |
|---|---|---|---|
| `gauntlet` | `91b6f7e` | Apache-2.0 | imported |
| `superpowers-evals` | `114f725` | **none — all rights reserved** | 5 files, deliberately (see below) |

Snapshots are in `../../../.moe-references/` (gitignored). They are the spec — not
upstream `main`. See [PARITY.md](../../PARITY.md).

## Layout

```
src/cli.ts             The single bin. Dispatches namespaces; owns error rendering.
src/package-root.ts    Resolves the package root by walking to package.json, not by
                       counting `..`. Two upstream paths counted, at two depths.
src/qa/                The QA engine — upstream gauntlet's src/.
  adapters/            The cleanest seam in the package: one 8-member interface,
                       three implementations (web / cli / tui).
  adapters/web/lib/    VENDORED. A CommonJS fork of obra/superpowers-chrome's CDP
                       library, 4,613 lines. Carries its own `type: commonjs`
                       marker. See The vendored CDP library below.
  agent/               The tester-agent loop, its tools, and the seven prompt files.
  api/                 Hono app: 9 routers, a WS channel, an SPA catch-all.
  models/              Two providers (Anthropic, OpenAI) behind one interface.
src/lab/               BRIDGEHEAD ONLY — 3 files from quorum, for the moe-tab edge.
                       `moe-flight lab` still refuses to run.
test/qa/               129 vitest suites for src/qa (plus 15 Chrome/tmux-gated).
test/lab/              The moe-tab boundary, including its FFI half.
ui/                    React + Vite SPA. Two builds: dist/ (served) and
                       dist-static/ (the single-file run report). 4 suites.
dashboard/             Quorum's server-rendered results grid. htmx + SSE, zod only,
                       no browser build. 8 suites.
examples/              Demo targets: a TODO fixture (CLI, web, ink TUI) and the
                       tutorial's social app. Run with `node --import tsx`.
docker/                Two images. Dockerfile builds and serves; Dockerfile.chrome
                       is a standalone headless browser on :9222.
skills/writing-flight-stories/
                       The one skill gauntlet shipped: a 200-line calibration doc
                       on what a story card is and is not.
docs/                  Technical reference that describes current behaviour.
docs/upstream-sync.md  The hand-port protocol for the vendored CDP library. Live,
                       not history: we intend to execute it. See below.
docs/history/          Upstream plans, specs and research notes. Inherited record,
                       byte-identical to the snapshot — see below.
```

## The CLI: three bins collapsed into one

| upstream bin | here |
|---|---|
| `gauntlet` | `moe-flight qa <run\|batch\|validate\|fanout\|serve\|config\|ask\|render>` |
| — | `moe-flight dashboard` |
| `quorum` | `moe-flight lab …` — declared, refused, not imported |
| `evals-appliance` | `moe-flight appliance …` — declared, refused, not imported |

**Namespaced, not flattened.** `gauntlet run` and `quorum run` are different
commands with the same name, as are `show`, `config` and `render`. Flattening
would have made that collision silent. It also matters for a live contract:
quorum spawns the `gauntlet` bin as a real subprocess and probes it for a
version, so a flattened `moe-flight run` would have had `moe-flight` shelling out
to itself with no way to say which half it meant.

`lab` and `appliance` exist and fail with a pointer to this file, rather than
reading as an unknown command.

## What is not imported yet

`superpowers-evals` is 1127 files and 131k lines, arriving with no abstraction
over `Bun.*` at all (246 occurrences, 55 in `src/`), 213 `bun:test` suites, 1201
`.ts` import specifiers that `tsc -b` cannot emit, and three runtime path
resolutions that have to be redesigned rather than edited — including
`src/checks/prelude.sh`, which builds the entire scenario-check DSL by shelling
`bun run <file>.ts` and which all 170 scenario scripts depend on.

Its own survey's recommendation was to split flight and land gauntlet first.
That is what happened. Nothing of quorum is here except the bridgehead below.

**The one exception: 5 quorum-derived files.** Three under `src/lab/`
(`tab/index.ts`, `contracts/economics.ts`, `atif/types.ts`) and one test, split
into `test/lab/tab.test.ts` and `test/lab/tab-ffi.test.ts`. `flight → tab` is ARCHITECTURE.md
§5's only confirmed edge and the stated reason this monorepo exists — upstream it
was `@primeradianthq/obol@^0.9.0` off npm, so changing a cost model meant
publish-then-test. Converting it needs `src/obol/index.ts` and its two type
imports, nothing else, so it is here and wired as `workspace:*`. See
[The moe-tab edge](#the-moe-tab-edge). It is a bridgehead, not a partial quorum:
`moe-flight lab` still refuses to run.

## What changed on import

### bun → pnpm + vitest + tsc

Nothing turned out to be genuinely stuck on bun. The two obvious candidates both
dissolved: `bun:ffi` and `bun:sqlite` appear nowhere in either source, and
`bun build --compile` is not a deliverable — gauntlet's only use of it was inside
a test.

**The two runtime shims kept their seam and lost their Bun branch.**
`src/qa/runtime/serve.ts` and `spawn.ts` were already dual-runtime with complete
Node implementations, which is the single most valuable thing gauntlet brought:
the whole package moved to Node without one caller changing. The Bun halves are
deleted — they could never be exercised again, and they were the only reason
`@types/bun` was needed. The seam remains if Bun ever matters again.

`idleTimeout` and `wsIdleTimeoutSec` survive in `ServeOptions` as documented
no-ops rather than silently-dropped fields.

**`Bun.Glob` → `fs.globSync`** in `agent/watch-manager.ts`, the one un-shimmed
production Bun API. `withFileTypes` supplies both halves upstream needed
(`isFile()` for `onlyFiles`, `parentPath` for `absolute`). The load-bearing
detail is the error path: Bun's Glob *threw* when the root did not exist — the
motivating case is Codex's `$CODEX_HOME/sessions/` before launch — and the caller
caught and continued. `fs.globSync` returns `[]` instead, which reaches the same
place.

**Seven markdown text-imports → codegen.** `agent/prompts/loader.ts` used
`import x from "./persona.md" with { type: "text" }`, a Bun loader feature with
no `tsc`, Node or vite equivalent. `scripts/gen-prompts.mjs` emits
`agent/prompts/generated.ts` with the bodies as string literals, which preserves
the property the text-imports were chosen for: **no runtime fs access.** Reverting
to `readFileSync` would have thrown that away. Two things guard it:
`test/qa/agent/prompts-drift.test.ts` fails if the codegen goes stale, and
`test/qa/e2e/built-cli-smoke.test.ts` runs the built CLI from a temp directory
where no `.md` is reachable by any relative path.

**The bare `require()` → `createRequire`.** `adapters/web/adapter.ts` and 19 test
files reached the vendored CJS library with a bare `require()` in an ESM package.
Bun tolerated it; Node and vitest throw `require is not defined`. Same fix
`packages/glass` uses for its copy.

**Two counted `../ui` paths → `src/package-root.ts`.** `render/render-run.ts` did
`join(here, "..", "..", "ui", "dist-static")` and `index.ts` did
`join(here, "..", "ui", "dist")` — two depths, both correct only while running
straight from `src/`. One of them was worse than wrong: `api/server.ts` guards
the UI dir with `existsSync`, so a bad path just stops serving the SPA.

**358 → 158 suites is not a loss.** 145 gauntlet suites converted (import source,
`import.meta.dir` → `import.meta.dirname` in 108 places, `jest.*` → `vi.*` in one
file, `Bun.serve`/`spawnSync`/`sleep` out of 13 files); 8 dashboard suites
converted; 4 SPA suites moved from `gauntlet/test/ui/` into `ui/test/` where they
belong. The 213 quorum suites are not here.

**Two test-only helpers replaced `Bun.serve`.** `test/qa/helpers/mock-http.ts`
stands up fetch-style and WebSocket servers on `node:http` + `ws` — the same
libraries the production shim picks — and picks a port first, because `Bun.serve`
reported its own bound port for `port: 0` and neither replacement does. That is
not cosmetic: the WS client connects immediately and swallows connect errors, so
a not-yet-listening server turns into a hung test rather than a failure.

**The `--compile` smoke test became a built-CLI smoke test.** Its stated purpose
was to catch asset-bundling regressions "that `bun run` alone cannot". The
subject is now `dist/cli.js` run by `node` from a temp cwd. Same invariant.

### Four vitest projects

| project | suites | result | needs |
|---|---|---|---|
| `unit` | 129 | 1162 passed, 2 skipped | nothing |
| `chrome` | 12 | 77 passed | a real Chrome |
| `tmux` | 3 | 8 passed, 18 skipped | a `tmux` binary |
| `ffi` | 2 | 8 passed | `pnpm tab:build` |

Upstream ran all 145 in one `bun test` pass. The tmux suites probe and skip
themselves, so a machine without tmux reported a **fully green run with the
entire TUI adapter unexercised**. The Chrome suites do not even do that — eight
of them call `session.startChrome()` in a `beforeAll` and fail outright without a
browser, and they were in upstream's default pass. Splitting makes the gap
countable: CI can assert the gated projects actually ran, which a silent skip
inside a green suite cannot.

### Two real bugs, both found by running

**1. The `permessage-deflate` opt-out had silently stopped working.**
`adapters/web/lib/websocket-client.js` did
`new WebSocket(url, { perMessageDeflate: false })`. That options-object second
argument is a Bun extension (Bun PR #29685); the standard constructor's second
argument is `protocols`, a string or string array, and Node's global WebSocket
ignores a non-string outright. So the PRI-1690 fix was dead: the CDP browser-WS
renegotiated compression, and Chrome's intermittently malformed deflate frames
close the socket with `code=1002 "Invalid compressed data"` mid-run — the exact
bug the flag was added to prevent. Caught on the first Node run by the test
upstream wrote for it. The backend is now the `ws` package, already a declared
dependency, which honours the option for real.

**2. The usage sidecar would have priced every run at zero.** See below.

### The moe-tab edge

`@primeradianthq/obol@^0.9.0` → `@bubstack/moe-tab` at `workspace:*`. Four
things moved, and only the first is cosmetic:

- `ObolError` → `TabError`.
- **`estimatePath(path, 'obol')` → `'tab'`.** `crates/moe-tab-ffi/src/lib.rs`'s
  `parse_dialect` accepts only `"atif"` and `"tab"`, so the old literal is a
  `TabError::UnknownDialect` — which `estimateUsageSidecar` then catches and
  reports as "no usage".
- **`CostEstimate` gained a required `pricing_source: "bundled" | "local"`.** The
  Rust core always serialized it; upstream's TS interface just never declared it,
  so a consumer could not tell a bundled (possibly stale) price sheet from a
  refreshed one. It is the one wire-shape change across the boundary, and it is
  what quorum's fully-typed fixtures exist to catch. PARITY.md's identifier table
  does not list it.
- **The `usage.jsonl` row type: `"obol.usage"` → `"moe.tab.usage"`.** The rebrand
  first chose `"moe-tab.usage"`, matching the package name. That is wrong, and
  wrong silently. moe-tab declares
  `ROW_TYPES = ["moe.tab.usage", "obol.usage"]` and `tab::parse` **skips** rows
  whose type it does not claim rather than erroring, so every sidecar would have
  read as "no usage" and the QA-driver's cost would have reported zero. Measured:

  ```
  type=moe.tab.usage  -> priced est_cost_usd=0.000285
  type=moe-tab.usage  -> null (SILENTLY UNPRICED)
  type=obol.usage     -> priced est_cost_usd=0.000285
  ```

  moe-tab still accepts `obol.usage` read-only, explicitly because the fork
  renamed it. `test/lab/usage-row-contract.test.ts` now writes a sidecar through
  `EvidenceLogger` and prices that exact file over the C ABI — an assertion
  neither upstream had, because gauntlet emitted the row and never read it back
  while quorum read a sidecar it never produced.

### The two candidate edges, settled

ARCHITECTURE.md §5 listed both as inferred from names. Both are now settled from
the imported code.

**`flight → glass`: real lineage, NOT an edge. Deferred, deliberately.**

`src/qa/adapters/web/lib/` is a hand-maintained fork of what is now
`packages/glass/skills/browsing/lib/`. `docs/upstream-sync.md` is a
sync protocol naming the repo, the per-file mapping, the fork point
(`70b2c6c`, v1.8.0) and the last sync (`60b44e2`). Measured after the rebrand:

- 3 of 28 lib files are still **byte-identical** to glass: `cdp-utils.js`,
  `html-diff.js`, `key-definitions.js`.
- 22 share a name and have diverged.
- glass has 4 files flight has never seen (`dialogs.js`, `dialogs-router.js`,
  `dialogs-render.js`, `profile-lock.js`).
- Both export `createSession` as the primary export of `chrome-ws-lib.js`; glass
  adds `PAGE_TARGET_SESSION_METHODS` and `DialogRefusedError`.
- Flight's fork carries six functions glass does not have at all — `setCookies`,
  `clearBrowserData`, `webAuthnOpenSession`, `openObserverSession`, `onCdpEvent`,
  `offCdpEvent` — which the passkey tool, the evidence logger and the screencast
  all depend on.

There is **no import, require or resolved path from flight to glass**. Flight
requires its own copy at `./lib/chrome-ws-lib.js`. Wiring the workspace
dependency would be a refactor, not an import, and it is blocked on three real
things: glass exposes the lib as a skill directory of CJS files with no export
map, glass is three months ahead, and the divergences flow both ways. Recorded as
its own piece of work in [Follow-ups](#follow-ups); `docs/upstream-sync.md`
is the spec for either direction.

**`flight → crew`: REFUTED.** Zero cross-references either way — no `moe-crew`,
`claude-session-driver`, `MOE_CREW_*` or `csd` anywhere in flight; no `flight`,
`gauntlet` or `quorum` anywhere in crew. They are independent implementations of
the same CLI, and they disagree on every load-bearing detail:

| | flight `adapters/tui/adapter.ts` | crew `core/tmux.ts` |
|---|---|---|
| lines | 431 | 78 |
| server | private, `-L <socket>` | default, shared |
| teardown | `kill-server` + descendant reaping | `kill-session` |
| runner | synchronous `spawnSync`, 8 sites | async `execFile` factory |
| geometry | pinned `-x 120 -y 40` | none |
| `has-session` / `respawn-pane` | neither | both |

Both independently discovered that a tmux session inherits the *server's*
environment and fixed it differently — flight with a private server, crew with
`-e KEY=VALUE`. That is the signature of independent discovery, not shared
lineage. Do not extract a shared tmux package: crew's `capture-pane -p` strips
the ANSI that is the thing flight is testing.

### Rebrand

**1313 substitutions across 192 files** (1298 in one anchored sweep, 15 in a hand-classified second pass), applied longest-token-first so compound
identifiers were consumed before bare tokens, with ALL-CAPS forms swept as their
own substitutions rather than left to a lowercase pass:

| Kind | Upstream | Moe | Count |
|---|---|---|---|
| state dir (on disk, per project) | `.gauntlet/` | `.moe-flight/` | 274 |
| bin, log prefix, temp-dir prefixes | `gauntlet` | `moe-flight` | 257 |
| env var prefix (26 vars) | `GAUNTLET_*` | `MOE_FLIGHT_*` | 247 |
| type | `VetResult` | `VerdictResult` | 113 |
| prose / actor name | `Gauntlet` | `Flight` | 96 |
| exported path helper | `gauntletPath` | `flightPath` | 94 |
| CLI usage text | `gauntlet <cmd>` | `moe-flight qa <cmd>` | 53 |
| config `--json` object key | `.gauntlet` | `.flight` | 47 |
| static-report hydration id | `__GAUNTLET_RUN__` | `__MOE_FLIGHT_RUN__` | 24 |
| sync-protocol marker | `GAUNTLET DIVERGENCE` | `MOE-FLIGHT DIVERGENCE` | 20 |
| type | `VetStatus` | `VerdictStatus` | 16 |
| doc cross-references | `docs/superpowers/{plans,specs}/` | `docs/history/{plans,specs}/` | 10 |
| dashboard header + title | `quorum` | `moe-flight` | 9 |
| XDG cache namespace | `~/.cache/superpowers/` | `~/.cache/moe/` | 7 |
| vendored lib log prefix | `[superpowers-chrome]` | `[moe-flight]` | 3 |
| types | `VetResultBase`, `VET_STATUSES` | `VerdictResultBase`, `VERDICT_STATUSES` | 6 |
| skill name | `writing-gauntlet-stories` | `writing-flight-stories` | 1 |
| Chrome profile | `gauntlet` | `moe-flight` | 1 |
| wire row type | `obol.usage` | `moe.tab.usage` | 2 |

`vet` was not in PARITY.md's brand-token list and needs a row: `VerdictResult` and
friends are 131 live occurrences, and `vet` is a pre-`gauntlet` name for the
project — `bun.lock` still recorded the workspace as `"vet"`. It is renamed to
`Verdict*`, which is descriptive and is the vocabulary both halves share. The
on-disk `result.json` never carried the token (`status`, `scenario`, `runId`), so
this is a pure type rename with no format break.

**Three substitutions the audit stopped before they landed.**

1. `output.gauntlet.*` is the object key of `moe-flight qa config --json`, i.e. a
   wire surface — and `.moe-flight` is not a legal property access. A blanket
   `.gauntlet → .moe-flight` was a syntax error in `cli/config-command.ts` and
   two test files. The key is `flight`.
2. `docs/history/2026-04-15-gauntlet-v1.5-architecture-review.md` is cited from
   `docs/credentials.md`. Zone B keeps its filenames, so Zone B *paths* appearing
   inside Zone A text are masked for the duration of the sweep — the directory
   rename lands, the filename does not.
3. The sweep rewrote `gauntlet` in prose that names the *upstream repo*,
   including comments written during this import. Restored: provenance is
   preserved, self-reference is rewritten. Same rule as the GitHub/GitLab split.

### What was deliberately left alone

**`chrome-ws` and `CHROME_WS_*` keep their names.** `packages/glass` already
ruled this: the name describes what the thing is, a Chrome WebSocket client. A
naive sweep here would also have broken alignment with glass, which is the whole
point of the vendored fork.

**`obra/superpowers-chrome` and `superpowers-evals` stay.** Provenance URLs and
upstream repo names. The fork-attribution headers in `chrome-ws-lib.js` and
`host-override.js` are the only in-tree record of the inbound MIT grant for 4,613
lines of vendored code; only their "adapted for Gauntlet" clause moved.

**`PRI-####` stays verbatim** — 234 references outside `docs/history/` (607
including it) to a Prime Radiant tracker this fork cannot reach. A dangling id is more honest than a deleted rationale, and
they are the only pointer to *why* a great deal of this code is shaped as it is.
Said once here so no reader has to guess.

**`quorum_max_time: 90m` stays** in
`test/qa/fixtures/story-multiline-criteria.md`. It is the in-repo proof that
quorum extends gauntlet's story-card frontmatter *and* that the hand-rolled
parser silently drops what it does not recognise. Renaming it would pre-empt a
decision the lab import has to make deliberately.

**`docs/history/`, `LICENSE`, `dashboard/src/static/` and
`ui/src/lib/__fixtures__/` are untouched — verified byte-identical to the pinned
snapshot with `diff -r` and `shasum -c`.** 130 files. They describe a project
that *was* called gauntlet, plus vendored third-party assets (htmx 2.0.4, Inter
and its OFL notice) and a recorded 104-event transcript from a real upstream run.
Editing a recorded artifact is editing evidence.

### The vendored CDP library

`src/qa/adapters/web/lib/` is 4,613 lines of CommonJS JavaScript inside a
`"type": "module"` package. Three things make that work:

1. `src/qa/adapters/web/lib/package.json` — a `{"type": "commonjs"}` marker
   scoping the subtree back to CJS. Same mechanism glass uses at
   `skills/browsing/package.json`. pnpm's workspace globs do not reach this deep,
   so it is not an accidental workspace member.
2. `createRequire`, because `tsc` will not rewrite `require` and Node will not
   accept it in an ESM file.
3. `scripts/copy-vendor.mjs`, run by `build`. `tsc -b` compiles `.ts` and copies
   nothing, so without it `dist/qa/adapters/web/lib/` does not exist and the web
   adapter fails to load **from the shipped bin only** — while every test, which
   reaches the copy under `src/`, still passes. That asymmetry is why it is a
   build step with a `--check` mode rather than a comment.

The subtree also has no edge out of itself any more. `chrome-process.js` did
`require('../../../util/pick-free-port')` — from vendored CJS into the package's
TypeScript, which Bun resolved and Node does not, and which is never emitted
under vitest. 20 lines of `node:net` are duplicated into the lib instead;
changing a vendored fork's function signature is what
`docs/upstream-sync.md` exists to avoid.

**Chrome profile and cache.** The cache root is `~/.cache/moe/`, matching glass.
The profile name is **`moe-flight`, never `moe-glass`** — sharing a
`--user-data-dir` is what upstream's own comment warns against. Note that glass
has a `profile-lock.js` writing a `<profile>.mcp.lock` that this fork knows
nothing about, so a concurrent glass MCP session and a flight run could still
fight over one profile if the names were ever unified.

## License, and why this package is `private`

`LICENSE` is gauntlet's Apache-2.0, retained verbatim, `Copyright 2026 Prime
Radiant, Inc.` It covers everything under `src/qa/`, `test/qa/`, `ui/`,
`examples/`, `docker/`, `skills/` and `docs/`. Apache-2.0 §4(b) requires stating
that files were changed; the rebrand changes them, and the root `NOTICE` records
gauntlet at `91b6f7e`.

**It does not cover all of this package.** The vendored CDP library under
`src/qa/adapters/web/lib/` is MIT-inbound from `obra/superpowers-chrome`,
vendored inside an Apache-2.0 repo — the inbound licence governs, which is the
same call `packages/glass` made. `dashboard/src/static/fonts/OFL.txt` covers
Inter and is the only licence file anywhere in `superpowers-evals`.

**And `superpowers-evals` grants nothing at all.** No `LICENSE`, no
`package.json` license field, no located grant, so the default is all rights
reserved. It is imported on internal-use grounds — a decision recorded in
PARITY.md, taken 2026-08-31, whose boundary is **distribution, not use**. Read
PARITY.md's condition table before touching any of:

- `"private": true` on this package, `ui` and `dashboard`. All three carry it.
- flight's absence from `.claude-plugin/marketplace.json`. It is absent.
- any publish job pointed at `@bubstack/moe-flight`. There is none.

Publishing this package anywhere — npm, the GitLab Package Registry, anywhere —
voids that decision. The `src/lab/` bridgehead is quorum-derived, so it is inside
the same boundary.

## Verification

Every number below was produced by running the command, on this machine, at
import time.

```
pnpm --filter @bubstack/moe-flight-dashboard build   # tsc -b + 8 static assets copied
pnpm --filter @bubstack/moe-flight-ui build          # dist/ 357 kB, dist-static/ 299 kB
pnpm --filter @bubstack/moe-flight build             # 7 prompts generated, 31 vendored files copied

pnpm --filter @bubstack/moe-flight typecheck         # exit 0 (src, then src+examples+test/lab)
pnpm --filter @bubstack/moe-flight-ui typecheck      # exit 0
pnpm --filter @bubstack/moe-flight-dashboard typecheck  # exit 0

pnpm --filter @bubstack/moe-flight test              # 1162 passed | 2 skipped (129 files)
pnpm --filter @bubstack/moe-flight test:chrome       #   77 passed (12 files)
pnpm --filter @bubstack/moe-flight test:tmux         #    8 passed | 18 skipped (3 files)
pnpm --filter @bubstack/moe-flight test:ffi          #    8 passed (2 files)
pnpm --filter @bubstack/moe-flight-ui test           #   33 passed (4 files)
pnpm --filter @bubstack/moe-flight-dashboard test    #  144 passed (8 files)

turbo run typecheck test --filter=@bubstack/moe-flight...   # 10 tasks successful

docker build -f packages/flight/docker/Dockerfile -t moe-flight:local .   # built
docker run --rm moe-flight:local config --json                            # emitted config
```

Also checked by hand:

- `node dist/cli.js qa config --json` emits `"flight"` and `".moe-flight"`.
- `renderRun()` against the **real** `ui/dist-static/static.html` splices a
  payload and writes `index.html`. This is now
  `test/qa/render/render-run-real-template.test.ts` — the check an upstream plan
  specified as `grep -c '__GAUNTLET_RUN__' …` and never turned into a test.
  Neither built output was asserted by anything upstream.
- `node --import tsx examples/todo/cli.ts add "buy milk"` prints a row;
  `examples/todo/tui.tsx` boots and Ink reports only the expected non-TTY
  raw-mode notice.
- `diff -r docs/history/{plans,specs,notes}` and `LICENSE` against the pinned
  snapshot: identical. `shasum -c` over 130 Zone B files: all OK.

**20 tests are unverified on this machine.** 18 need a `tmux` that is not
installed here (the whole TUI adapter suite plus the two colour/nano integration
tests); 2 are `describe.skipIf` on `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. The
root `.gitlab-ci.yml` runs on `node:24`, which has neither tmux nor a Chrome, so
CI will skip the `tmux` project and cannot run `chrome` or `ffi` at all yet.

## Follow-ups

- **`test/qa/**` is not typechecked.** Upstream excluded `test/` from `tsc`
  entirely, and under the workspace strict base its 129 suites produce **592
  errors** — 398 of them even with `noUncheckedIndexedAccess` off. The bulk is
  `expect(grid[0][1].fg)`-shaped index noise in assertions, but the triage found
  real things, and those are fixed: 18 call sites passed a 5th argument to a
  4-parameter `buildSystemPrompt`; `process-tree.test.ts` passed a signal to a
  `kill()` that takes none; a `@ts-expect-error` suppressed nothing; and the
  OpenAI SDK now requires `cache_write_tokens` in `InputTokensDetails`. `src`,
  `examples` and `test/lab` **are** typechecked and clean.
- **The `flight ↔ glass` reconciliation.** Two honest options, both real work:
  port glass's three months of lib changes into this fork, or port this fork's
  ten divergences into glass and have flight consume it. The second needs glass
  to expose the lib as a package export first. `docs/upstream-sync.md` is
  the spec either way; its per-file mapping and fork SHAs are still accurate.
- **The FFI suites are not hermetic against the price sheet.** They assert
  `est_cost_usd > 0` for `claude-opus-4-8` against whatever snapshot moe-tab
  bundles. `MOE_TAB_PRICING_DIR` plus a committed reduced snapshot is what the
  upstream design docs describe and nobody implemented.
- **CI needs tmux, a Chrome, and cargo** before `test:tmux`, `test:chrome` and
  `test:ffi` are more than opt-in. Until then 20 tests are permanently skipped
  rather than passing, and 85 are unreachable in CI.
- **`.dockerignore` is inert as placed.** Docker reads it from the build-context
  root, and `docker/Dockerfile`'s context is the monorepo root now. Kept as the
  record of what upstream excluded, with a header saying so; a root-level
  equivalent is the actual fix.
- **`.env.example` is untracked.** The root `.gitignore`'s `.env.*` swallows it,
  so a template upstream tracked vanishes on clone. Needs a `!` negation — see
  the root-changes note in the import report.
- **`docker/Dockerfile.chrome` is amd64-only and now says so.** Google publishes
  `google-chrome-stable` for amd64 only; upstream's apt line said `arch=amd64`
  and the build simply failed several layers in on arm64, which is every
  developer here. It declares `--platform=linux/amd64` and points at
  `docker/Dockerfile`'s multi-arch chromium as the alternative.
- **`scripts/install-hooks.sh` was not ported.** It ran on every install and
  overwrote the repo's `pre-commit` hook with one calling `bun run typecheck` —
  a per-package script rewriting a shared hook. What it protected is real (its
  own comment: "the typecheck broke silently on main once"); the root hook
  mechanism should cover flight.
- **`catalog-info.yaml` was not ported**, matching every other package. Its
  identifiers, for the record: `metadata.name: gauntlet`, `spec.system:
  eval-labs`, `spec.owner: user:mhat`, `dependsOn: [component:obol]`, annotation
  `prime-radiant.com/repo-map-rev`.
- **`.gauntlet/stories/networkeffect-public-feed.md` was deleted, not
  rebranded.** It targets an internal Prime Radiant app this fork has no access
  to. Renaming it to something Moe-sounding that also does not exist would be
  worse.
- **`ABOUT.md` went to `docs/history/`.** Its own footer says it is generated and
  must not be hand-edited, and its generator — the
  `maintaining-project-map` skill — is not among the imported repos. It cannot be
  maintained and it cannot simply be dropped: it is where the `obol` data
  contract and the `eval-labs`/`mhat` ownership are recorded. Both are restated
  here instead.
- **A one-off flake, fixed but worth knowing about.** `test/qa/api/caps.test.ts`
  POSTed a run whose *background* execution built an LLM client, so with no
  `ANTHROPIC_API_KEY` on the box the rejection escaped after the test resolved
  and vitest occasionally reported it as an unhandled error against an unrelated
  test (seen once in ~15 runs). `runRoutes`' 7th parameter exists for exactly
  this; the test now passes a stub client factory, and the stderr is gone. Under
  `bun test` this was invisible — a comment in `test/qa/runtime/serve-errors.test.ts`
  notes that Bun's unhandled-error capture behaves differently.
