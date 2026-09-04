# Crew + flight honesty/discoverability

Backlog: BL-ab3955cad8, BL-248f2bf469, BL-221ed7d54c, BL-2997be20cc — size **S**

Four low-severity truth/discoverability fixes across two packages. Three are
pure doc/comment edits; one adds a shipped env knob to the two surfaces that
already document its sibling. One crew skill changes, so `pnpm mint` must
re-run and `/plugins/` is regenerated. Flight is **not** minted (no
`packages/flight/mint/`, no `plugins/moe-flight`), so the flight edits have
zero `/plugins/` impact.

All four verified against main @ `64304930` on the working tree.

---

## Problem

### BL-ab3955cad8 — crew pi-extension carries a done "tsup TODO" and claude-centric stop docs

**Part 1 — stale tsup TODO.** `packages/crew/src/pi-extension/index.ts` still
records the ESM format flip as future work, in two comment blocks:

- The "BUNDLE-TARGET DECISION" block:
  > `tsup TODO (RECORDED, not yet applied — see note at end of this block): change the pi-extension entry's output to ESM dist/pi-extension.mjs.`
- The trailing NOTE block:
  > `tsup.config.ts NOTE: left AS-IS in C1 (still CJS .cjs for all 3 entries). The pi-extension entry MUST become ESM dist/pi-extension.mjs for pi's jiti/ESM loader … C2 implements the extension and performs the format flip + dist rebuild as one coherent change. Decision RECORDED here; not half-applied`

But the flip is **done**. `packages/crew/tsup.config.ts` ships two configs; the
second builds the pi-extension entry as ESM:

```ts
entry: { "pi-extension": "packages/crew/src/pi-extension/index.ts" },
format: ["esm"],
outExtension: () => ({ js: ".mjs" }),
treeshake: true,
```

and `plugins/moe-crew/dist/pi-extension.mjs` exists. tsup.config.ts's own
header comment already describes the ESM split truthfully; only the two
index.ts blocks are stale. The claim "still CJS `.cjs` for all 3 entries" is
false — there are two entries in the CJS config and one in the ESM config.

**Part 2 — claude-centric stop docs.**
`packages/crew/skills/driving-claude-code-sessions/SKILL.md` §5 "Stop and clean
up" states the stop verb as a uniform `/exit`:

> Sends `/exit`, waits up to 10s for `session_end`, kills the tmux session if still running, and removes the meta, events, **and shim** files.

The quit key is per-harness, not uniform. Confirmed in the drivers:
`claude.ts` `quitKeys: "/exit"`, `codex.ts` `quitKeys: "/quit"`, `pi.ts`
`quitKeys: "/quit"`. `cmdStop` in `packages/crew/src/commands/stop.ts` sends
`ctx.driver.quitKeys` (`await ctx.tmux.sendText(tmuxName, ctx.driver.quitKeys)`),
so a Pi or Codex worker is sent `/quit`, never `/exit`. The same command also
short-circuits for harnesses that drop the pane without a `session_end` event
(comment: "Some harnesses (e.g. codex) exit the pane outright on quit without
emitting session_end") via `if (!(await ctx.tmux.hasSession(tmuxName))) break;`
— so even the "waits up to 10s for `session_end`" half is Claude-shaped. The
SKILL drives all three harnesses (its `description` reads "Claude Code, Codex,
or Pi"), so the flat `/exit` is wrong for two of the three.

### BL-248f2bf469 — crew reads MOE_CREW_PI_PROVIDER but never documents it

`packages/crew/src/harness/pi.ts` `launchArgv` reads the env var and passes it
through as `--provider`:

```ts
const provider = process.env.MOE_CREW_PI_PROVIDER;
if (provider) argv.push("--provider", provider);
```

(only when `MOE_CREW_PI_MODEL` is also set — `--provider` is pushed inside the
`if (model)` block). Its sibling `MOE_CREW_PI_MODEL` is documented in **two**
surfaces; `MOE_CREW_PI_PROVIDER` is in **neither**:

- `packages/crew/src/cli.ts` USAGE — the `MOE_CREW_CODEX_MODEL / MOE_CREW_PI_MODEL`
  row exists; no `MOE_CREW_PI_PROVIDER`.
- `packages/crew/skills/driving-claude-code-sessions/SKILL.md` env-var table —
  same: `MOE_CREW_CODEX_MODEL / MOE_CREW_PI_MODEL` row present, provider absent.

The knob's behavior is already guarded by
`packages/crew/test/pi-driver.test.ts` ("includes --provider only alongside
--model when MOE_CREW_PI_PROVIDER is set"), so this is a documentation gap only:
a shipped, tested knob users cannot discover.

**Finding correction:** the backlog also lists "the README" as a place the var
is absent. `packages/crew/README.md` documents **no** env vars at all
(`MOE_CREW_PI_MODEL` is not there either), so there is no sibling row to sit
beside — adding an env table to the README would be new scope, not parity.
Document the provider only where its sibling actually lives (USAGE + SKILL
table). Still valid; the README premise is the one inaccuracy.

### BL-221ed7d54c — flight `dashboard serve` documented but the positional is ignored

`packages/flight/README.md` shows:

```sh
moe-flight dashboard serve
```

`packages/flight/src/cli.ts` `case "dashboard"` forwards everything after the
namespace to the dashboard package: `await runDashboardCli(rest)`.
`packages/flight/dashboard/src/index.ts` `parseArgs` only recognizes
`--results`, `--port`, `--root`, `--manifest`; its own header comment says
"Unknown flags are ignored." A bare positional `serve` matches no branch and is
dropped — `runDashboardCli` serves unconditionally either way. So
`moe-flight dashboard` and `moe-flight dashboard serve` behave identically:
"serve" works by accident. The top-level cli.ts USAGE already treats
`dashboard` as a subcommand-less namespace ("`dashboard  Serve the scenario x
agent x credential x OS results grid.`" — no command listed); the README is the
lone outlier that invents a `serve` subcommand.

### BL-2997be20cc — flight cli claims cancellation is an open gap that drainShutdown already handles

The finding cites `packages/flight/src/cli.ts`; the stale comment is actually
in `packages/flight/src/qa/index.ts` (the QA `serve` daemon setup — the
top-level `src/cli.ts` has no cancellation text). The "PRI-1477: graceful
shutdown" comment block ends:

> Runs that exceed the grace window are abandoned — PRI-1507 closes that gap once the orchestrator can be cancelled.

This is false. The very next statements wire `cancelTokens` into
`drainShutdown`, and `packages/flight/src/qa/api/shutdown.ts` `drainShutdown`
already cancels after the grace window: `const cancelled = cancelTokens?.cancelAll()`
then `const aborted = registry.abortAll("shutdown")`, then writes stub
`result.json` files for anything still listed. `drainShutdown`'s own docstring
header reads "PRI-1477A + PRI-1507", confirming PRI-1507 landed. Runs that
exceed grace are cancelled and stubbed, not abandoned; the comment describes
shipped behavior as future work.

---

## Change

### 1. `packages/crew/src/pi-extension/index.ts` (source) — de-stale two comment blocks

In the **BUNDLE-TARGET DECISION** block, replace the `tsup TODO (RECORDED, not
yet applied …)` paragraph with a statement of the shipped fact, e.g.:

> tsup output: the `pi-extension` entry is built as ESM `dist/pi-extension.mjs`
> (`tsup.config.ts`, the second config: `format: ["esm"]`,
> `outExtension: () => ({ js: ".mjs" })`), self-contained (no runtime require of
> the CJS `moe-crew` bundle), which is the format pi's jiti/ESM loader expects.

Replace the trailing **NOTE block** (`tsup.config.ts NOTE: left AS-IS in C1 …`)
with a one-line pointer, e.g.:

> tsup.config.ts ships the `pi-extension` entry as ESM `dist/pi-extension.mjs`
> (its own header comment explains the CJS/ESM split); the CJS config carries
> the `moe-crew` + `emit-event` entries.

Comment-only. tsup/esbuild strips comments, so `dist/pi-extension.mjs` bytes do
not change and `/plugins/` is unaffected.

### 2. `packages/crew/skills/driving-claude-code-sessions/SKILL.md` (source, **minted**) — two edits

**§5 "Stop and clean up"** — replace the `/exit` sentence with the per-harness
truth (matches `cmdStop` + the three drivers' `quitKeys`):

> Sends the harness's quit command (`/exit` for Claude, `/quit` for Codex and
> Pi), waits up to 10s for `session_end`, kills the tmux session if still
> running, and removes the meta, events, **and shim** files. (Codex and Pi can
> drop the pane on quit without emitting `session_end`; `stop` returns as soon
> as the pane is gone rather than waiting out the full grace.)

**Environment-variables table** — add a row after the
`MOE_CREW_CODEX_MODEL` / `MOE_CREW_PI_MODEL` row:

> `| MOE_CREW_PI_PROVIDER | Provider override for pi workers, passed as --provider — only when MOE_CREW_PI_MODEL is also set (pi's --provider rides with --model). Unset = pi's configured default provider. |`

### 3. `packages/crew/src/cli.ts` (source, bundled into the minted `dist`) — document the provider in USAGE

In the `Environment variables:` section of `USAGE`, add after the
`MOE_CREW_CODEX_MODEL / MOE_CREW_PI_MODEL` entry:

```
  MOE_CREW_PI_PROVIDER Provider override for pi workers, passed as --provider
                       (only alongside MOE_CREW_PI_MODEL; pi's --provider rides
                       with --model). Unset = pi's default provider.
```

USAGE is compiled into `dist/moe-crew.cjs`, which mint stages to
`plugins/moe-crew/dist/moe-crew.cjs` — so this needs `pnpm build` then
`pnpm mint`.

### 4. `packages/flight/README.md` (source, **not minted**) — drop the invented subcommand

Change the CLI example line from `moe-flight dashboard serve` to
`moe-flight dashboard`.

**Recommendation: drop from docs, do not add a real subcommand.** cli.ts USAGE
already treats `dashboard` as subcommand-less, the dashboard is single-purpose
(serve the grid), and it imports nothing from the harness. Making `serve` real
would mean teaching the shared, unit-tested `parseArgs` to distinguish a bare
`dashboard` from `dashboard serve` and to reject unknown positionals — a
behavior decision and test churn out of proportion to a low-severity doc fix in
a patch release. Dropping the word aligns the README with cli.ts USAGE and with
what actually runs. (Residual: a stray positional like `dashboard bogus` is
still silently ignored; that pre-existing tolerance is out of scope here.)

### 5. `packages/flight/src/qa/index.ts` (source, **not minted**) — de-stale the shutdown comment

In the "PRI-1477: graceful shutdown" block, replace the final sentence
("Runs that exceed the grace window are abandoned — PRI-1507 closes that gap
once the orchestrator can be cancelled.") with the shipped behavior, e.g.:

> Runs still in flight after the grace window are cancelled: `drainShutdown`
> cancels the run-set tokens (`cancelTokens.cancelAll`) and fires the per-run
> AbortControllers (`registry.abortAll`), then writes a stub `result.json` for
> any run that still didn't exit (PRI-1507).

Comment-only.

---

## Files touched

- `packages/crew/src/pi-extension/index.ts` (source) — comment-only; bundle
  strips comments, `/plugins/` unchanged.
- `packages/crew/skills/driving-claude-code-sessions/SKILL.md` (source,
  **minted**) — stop verb + env-table row. **`pnpm mint` must re-run**; it
  regenerates the seven staged copies under `plugins/moe-crew/` (base
  `skills/` + `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`,
  `.kimi-plugin/`, `.opencode/`, `.pi/`).
- `packages/crew/src/cli.ts` (source → compiled into the **minted**
  `plugins/moe-crew/dist/moe-crew.cjs`) — USAGE row. Requires
  `pnpm build` then `pnpm mint`.
- `packages/crew/test/cli.test.ts` (source, test) — extend the existing USAGE
  assertion (see Test plan).
- `packages/flight/README.md` (source, **not minted**) — drop `serve`.
- `packages/flight/src/qa/index.ts` (source, **not minted**) — comment-only.

Net `/plugins/` change: `plugins/moe-crew/**` only — the seven SKILL.md copies
and `plugins/moe-crew/dist/moe-crew.cjs` (from the USAGE string). The
pi-extension comment edit leaves `dist/pi-extension.mjs` byte-identical. No
other plugin changes.

---

## Acceptance

- `packages/crew/src/pi-extension/index.ts` contains no "not yet applied",
  "TODO", or "left AS-IS in C1 (still CJS)" language about the tsup format flip;
  the comments describe the ESM `.mjs` output as shipped.
- `driving-claude-code-sessions/SKILL.md` §5 names `/quit` for Codex and Pi (not
  a flat `/exit`), and its env table has a `MOE_CREW_PI_PROVIDER` row.
- `moe-crew help` output (the `USAGE` string) contains `MOE_CREW_PI_PROVIDER`.
- `packages/flight/README.md` no longer contains the string `dashboard serve`.
- `packages/flight/src/qa/index.ts` shutdown comment no longer calls PRI-1507 /
  cancellation an open gap; it describes `cancelTokens.cancelAll` +
  `registry.abortAll` + stub writing.
- Gates:
  - `pnpm check` (lint + typecheck + test) green — covers both packages,
    including the updated `cli.test.ts` and the existing
    `pi-driver.test.ts`/`stop.test.ts`.
  - `pnpm mint:check` green — asserts `/plugins/` is byte-identical after
    `pnpm mint`; catches a forgotten mint regen for the SKILL.md and the USAGE
    bundle. **The regenerated `plugins/moe-crew/**` must be committed.**
  - `pnpm provenance` — unaffected (no imported-work, NOTICE, or license
    change); run only to confirm no regression.

---

## Test plan

- **`packages/crew/test/cli.test.ts`** — in the existing case
  `"usage text references the private per-user default worker dir and lists
  subcommands"`, add `expect(usage).toContain("MOE_CREW_PI_PROVIDER");` (and, to
  lock the sibling, optionally `expect(usage).toContain("MOE_CREW_PI_MODEL");`).
  This is the guard that the new USAGE row cannot silently regress.
- **`packages/crew/test/pi-driver.test.ts`** — already asserts the provider
  behavior ("includes --provider only alongside --model when
  MOE_CREW_PI_PROVIDER is set"); no change needed. It documents that the
  now-documented knob matches its runtime contract.
- **No new test for the comment edits or the README** — comment/doc-only edits
  in `pi-extension/index.ts`, `qa/index.ts`, and `flight/README.md` are not
  behavior; `pnpm check` (typecheck + existing suites) confirms nothing broke.
  `stop.test.ts` already exercises `cmdStop` sending `ctx.driver.quitKeys`, which
  is the behavior the SKILL edit now describes accurately.
- Scoped runs while iterating:
  `pnpm --filter @bubstack/moe-crew build && pnpm --filter @bubstack/moe-crew test`
  and `pnpm --filter @bubstack/moe-flight test`, then `pnpm mint` + `pnpm mint:check`.

---

## Sequencing & dependencies

- **Independent of the v0.2.1 packaging republish** (BL-d932811282,
  "wire release-execute so tarballs carry manifest and license"). These are
  source docs/comments plus one env row; they neither block nor depend on the
  release-execute wiring. Land them **before** the final republish so the
  shipped `/plugins/` and npm tarball carry the corrected crew SKILL, USAGE, and
  pi-extension comments — but they can merge in any order relative to other
  content work.
- **Crew and flight edits are parallel-safe** — disjoint packages, no shared
  file. Within crew, the three source edits (pi-extension comments, SKILL.md,
  cli.ts USAGE) plus the cli.test.ts change are one package and must share a
  single `pnpm build` + `pnpm mint` so the committed `plugins/moe-crew/**` is
  regenerated exactly once and stays byte-consistent for `mint:check`.
- **Ordering inside crew:** edit sources → `pnpm build` (refresh `dist`) →
  `pnpm mint` (restage `/plugins/`) → `pnpm check` + `pnpm mint:check`. Running
  `mint:check` before `build`+`mint` will fail on the USAGE/SKILL drift.
- Flight requires no mint step at all.

---

## Risks

- **Forgotten mint regen.** The SKILL.md and cli.ts USAGE feed `/plugins/`;
  editing them without re-running `pnpm build`+`pnpm mint` turns `mint:check`
  red in CI. Mitigation: the ordering above; commit `plugins/moe-crew/**`.
- **USAGE column wrapping.** The USAGE block is hand-aligned; a new row must
  respect the existing indent so `pnpm lint` (biome) and the eye-parse of
  `moe-crew help` stay clean. Low risk — additive, no test asserts exact
  whitespace.
- **Comment edits are inert but must stay accurate.** If a future change flips
  the pi `--provider` gating (e.g. allow provider without model) or a harness's
  `quitKeys`, these now-corrected comments/docs must move with it. The added
  `cli.test.ts` assertion and existing `pi-driver.test.ts`/`stop.test.ts` anchor
  the behavior the prose describes.
- **README-not-minted assumption.** Confirmed: no `packages/flight/mint/`, no
  `plugins/moe-flight`, and `plugins/` holds only moe / moe-backstory /
  moe-crew / moe-glass / moe-memory / moe-statusline. If flight is later minted,
  its README/comment edits would then need a mint pass; today they do not.
