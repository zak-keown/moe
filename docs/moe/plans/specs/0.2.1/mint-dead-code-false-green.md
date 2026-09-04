# Mint dead code / false-green: drop unauthored rules/variables columns; annotate mcp.ts as a staged 0.3.0 seed

Backlog: BL-2ff666d13d (support-matrix columns nothing can author) + BL-3fdd56ee5a (adapters/mcp.ts orphaned false-green) · size **S**

## Problem

Two related dead-surface findings from the promise-hunt audit, both in `packages/mint`.

### BL-2ff666d13d — `ComponentSupport.rules`/`variables` columns are impossible to author

`packages/mint/src/adapters/types.ts` declares two component fields that no
adapter and no config can ever populate with anything but `'none'`:

```ts
export interface ComponentSupport {
  skills: SupportLevel
  commands: SupportLevel
  agents: SupportLevel
  hooks: SupportLevel
  mcp: SupportLevel
  bootstrap: SupportLevel
  rules: SupportLevel
  variables: SupportLevel
}
```

`packages/mint/src/matrix.ts` renders both as columns in `renderSupportMatrix`:

```ts
const COLUMNS: Array<keyof ComponentSupport> = [
  'skills', 'commands', 'agents', 'hooks', 'mcp', 'bootstrap', 'rules', 'variables',
]
```

Verified: **every** adapter that declares a `support` block sets both to
`'none'` — `claude-code.ts` (`rules: 'none'` / `variables: 'none'`),
`cursor.ts`, `codex.ts`, `kimi.ts`, `opencode.ts`, `pi.ts`, `agent-plugins.ts`,
`copilot.ts`, plus the two unregistered adapters `maka.ts` and `openclaude.ts`
(10 `support` blocks in total). And `rules`/`variables` appear in **none** of
the authoring surfaces: a `grep` of `packages/mint/src/config.ts`,
`model.ts`, `platform/schema.ts`, `vocabulary.ts`, and every
`packages/*/mint/*.yaml` returns nothing. So the two columns are structurally
locked to `'none'` — dead surface a reader can mistake for a real capability
axis.

**Correction to the finding's wording (both the backlog note and the 0.2.1
plan say the columns render "into support-matrix.md" via `renderSupportMatrix`).**
That is inaccurate about the destination. `renderSupportMatrix` is called in
exactly one place — `packages/mint/src/cli.ts`, the `matrix` subcommand
(`process.stdout.write(renderSupportMatrix())`) — and its output is never
persisted. The **generated** `docs/support-matrix.md` is produced by the *other*
function, `renderMatrix` (via `packages/mint/src/docs-emit.ts` `supportMatrixFile`),
whose columns are `| Harness | Skill delivery | Emitted capabilities |` and which
never reads component support levels. Confirmed on disk: e.g.
`plugins/moe-crew/docs/support-matrix.md` has exactly those three columns, no
rules/variables. **Consequence for scope: dropping the two columns changes only
CLI stdout, not any file under `/plugins/`.** The finding is still valid (dead,
unauthorable columns exist); only its claim about where they surface is wrong.

The only other consumer of `ComponentSupport` is
`packages/mint/src/platform/capabilities.ts`, whose `componentCapability` map is
a `Partial<Record<keyof ComponentSupport, CapabilityId>>` listing only
skills/commands/agents/hooks/mcp/bootstrap — it never keys on `rules` or
`variables`, so removing those fields does not affect capability derivation.

### BL-3fdd56ee5a — `adapters/mcp.ts` is orphaned, kept green by its own test

`packages/mint/src/adapters/mcp.ts` exports `normalizeMcpServers`,
`emitClaudeMcp`, and `emitCodexMcp`. Verified: the only importer of these
symbols anywhere in the tree is `packages/mint/test/adapters/mcp.test.ts`. The
generation pipeline emits MCP config inline instead — `adapters/cursor.ts`
writes `CURSOR_MCP_PATH` straight from `model.mcp` (`json(model.mcp)`), and
`adapters/claude-code.ts` only points the manifest `mcpServers` key at the
source `.mcp.json`; neither routes through `mcp.ts`. So the module's passing
test suite covers code the pipeline never runs — a false-green.

**Per the 0.2.1 plan (`docs/moe/plans/2026-09-04-v0.2.1-plan.md`, "A#2 / A#9"),
this module must NOT be deleted in 0.2.1:** `emitCodexMcp` is the seed for the
0.3.0 item **H1 / BL-f4dac1becd** (wire `emitCodexMcp` into the codex adapter so
memory/glass MCP reaches Codex). The 0.2.1 job is to remove the false-green
*ambiguity* — make the module's staged, unwired status explicit in source so a
reader (or a future audit) does not re-flag it as accidental dead code — while
leaving the wiring decision to H1.

## Change

### 1. Drop the `rules`/`variables` columns (BL-2ff666d13d)

Remove the two fields everywhere they are declared. This is the "drop" option
from the backlog (not "document as reserved"): nothing authors them and no
roadmap item claims them (unlike `mcp.ts`), so keeping them reserved would just
preserve dead surface.

- `packages/mint/src/adapters/types.ts` — in `interface ComponentSupport`,
  delete the `rules: SupportLevel` and `variables: SupportLevel` lines. Leaves
  the six real axes: skills, commands, agents, hooks, mcp, bootstrap.
- `packages/mint/src/matrix.ts` — in the `COLUMNS` array, delete the `'rules'`
  and `'variables'` entries. (The separator uses `COLUMNS.length + 1`, so it
  self-adjusts.)
- In each adapter's frozen `support: {...} satisfies ComponentSupport` block,
  delete the `rules: 'none',` and `variables: 'none',` lines. Ten files:
  `claude-code.ts`, `cursor.ts`, `codex.ts`, `kimi.ts`, `opencode.ts`,
  `pi.ts`, `agent-plugins.ts`, `copilot.ts`, `maka.ts`, `openclaude.ts`.
  (`maka.ts` and `openclaude.ts` are not registered in `adapters/index.ts`'s
  `adapters` array, but they still type their `support` as `ComponentSupport`,
  so they must be edited or the `satisfies` check / typecheck fails.)

### 2. Keep `mcp.ts` honest as a staged 0.3.0 seed (BL-3fdd56ee5a)

Do **not** delete `packages/mint/src/adapters/mcp.ts` or its test. Add a file
header docblock at the top of `packages/mint/src/adapters/mcp.ts` stating
plainly that the module is a staged, not-yet-wired seed. Suggested text:

```ts
/**
 * STAGED SEED — not wired into generation (as of v0.2.1).
 *
 * These helpers are imported only by test/adapters/mcp.test.ts. The pipeline
 * emits MCP config inline: cursor.ts writes model.mcp to .cursor-plugin/mcp.json
 * and claude-code.ts points the manifest at the source .mcp.json — neither
 * routes through this module.
 *
 * `emitCodexMcp` is the deliberate seed for 0.3.0 item H1 (BL-f4dac1becd):
 * wiring Codex MCP emission into adapters/codex.ts. Kept and tested ahead of
 * that work on purpose. Its green test attests the emitter's shape, not that
 * the pipeline uses it. Do not delete before H1 resolves its fate
 * (BL-3fdd56ee5a).
 */
```

Add a one-line clarifying comment at the top of
`packages/mint/test/adapters/mcp.test.ts` so the test file itself records that
it exercises an unwired seed, e.g.:

```ts
// Exercises the STAGED, unwired MCP-emit seed (src/adapters/mcp.ts). Green here
// attests the emitter's shape only; generation emits MCP inline. See H1 /
// BL-f4dac1becd for the wiring decision, BL-3fdd56ee5a for context.
```

No behavior change; the module and its tests stay exactly as they are.

## Files touched

All edits are to `packages/mint` **source and tests** (the mint tool itself),
not to plugin content. No `SKILL.md`, hook, or manifest changes.

Source:
- `packages/mint/src/adapters/types.ts` (source) — drop 2 fields from `ComponentSupport`
- `packages/mint/src/matrix.ts` (source) — drop 2 entries from `COLUMNS`
- `packages/mint/src/adapters/claude-code.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/cursor.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/codex.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/kimi.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/opencode.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/pi.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/agent-plugins.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/copilot.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/maka.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/openclaude.ts` (source) — drop 2 `support` lines
- `packages/mint/src/adapters/mcp.ts` (source) — add staged-seed docblock (no code change)
- `packages/mint/test/matrix.test.ts` (source/test) — update `renderSupportMatrix` assertion
- `packages/mint/test/adapters/mcp.test.ts` (source/test) — add one clarifying header comment

Generated: **none.** No file under `/plugins/` changes, because the generated
`docs/support-matrix.md` is produced by `renderMatrix` (three columns:
Harness / Skill delivery / Emitted capabilities), which never reads component
support levels. `pnpm mint` need not be re-run to *produce* a diff — but
`pnpm mint:check` must still be run as a gate to **confirm** `/plugins/` stays
byte-identical (see Acceptance).

## Acceptance

- `pnpm check` green (this is `pnpm lint && turbo run typecheck test`). In
  particular typecheck must pass across `@bubstack/moe-mint` after the
  `ComponentSupport` fields are removed — the `satisfies ComponentSupport` in
  all ten adapters and the `Array<keyof ComponentSupport>` in `matrix.ts` will
  compile only if every adapter block and the `COLUMNS` array agree with the
  narrowed interface.
- `packages/mint/test/matrix.test.ts` updated and green: the `renderSupportMatrix`
  case must assert a six-column, all-`full` claude-code row with **no** trailing
  `none` columns (see Test plan).
- `pnpm mint:check` green **and reports zero diff** — the change must not alter
  any generated plugin file. This is the concrete check that the fix is scoped
  to CLI stdout only. (If `mint:check` shows a diff in any `support-matrix.md`,
  the change was mis-scoped — stop and re-check.)
- `moe-mint matrix` CLI output now shows six component columns
  (skills/commands/agents/hooks/mcp/bootstrap), no rules/variables.
- `packages/mint/src/adapters/mcp.ts` carries a header docblock naming it a
  staged 0.3.0 seed tied to H1 / BL-f4dac1becd; the module and
  `packages/mint/test/adapters/mcp.test.ts` are otherwise unchanged and still
  green.
- `pnpm provenance` unaffected (no attribution/license surface touched) — run
  it if the release gate requires the full sweep, but no change is expected.

## Test plan

- **`packages/mint/test/matrix.test.ts`**, `describe('renderSupportMatrix')`,
  `it('renders one row per adapter with component support levels')`. Current
  assertion:
  ```ts
  expect(out).toMatch(/\| claude-code \|( full \|){6}( none \|){2}/)
  ```
  After dropping the two columns, claude-code has six `full` columns and no
  `none`. Change to:
  ```ts
  expect(out).toMatch(/\| claude-code \|( full \|){6}/)
  ```
  (Optionally strengthen to assert the row ends after the sixth `full`, e.g.
  anchor with a trailing `\n` or `$`, to prove the two columns are gone rather
  than merely present-and-full.)
- **`packages/mint/test/matrix.test.ts`**, `describe('renderMatrix')`: no
  change expected — `renderMatrix` never rendered rules/variables. Re-run to
  confirm.
- **`packages/mint/test/docs-emit.test.ts`**, `describe('emitDocs support-matrix.md')`,
  including `it('has exact content for the full 8-adapter registry...')`: no
  change expected (it snapshots `renderMatrix` output). Re-run to confirm it
  still passes untouched — this is the guard that proves the generated doc is
  unaffected.
- **`packages/mint/test/generate.test.ts`** support-matrix cases and the
  `__snapshots__/generate.test.ts.snap` `=== docs/support-matrix.md ===`
  block: no change expected; the snapshot must not need updating. If it does,
  the change leaked into generated output — investigate before accepting.
- **`packages/mint/test/adapters/mcp.test.ts`**: unchanged behavior; still
  green (only a comment added).

## Sequencing & dependencies

- **Independent of the packaging republish** (BL-d932811282 / the 0.2.1
  release-execute work). This change touches no generated artifact and no
  license/manifest payload, so it neither blocks nor is blocked by the tarball
  wiring. It can land before or after in any order.
- Per the 0.2.1 plan, this is Track 3 ("Backlog v1.5 follow-ups + the
  dead-code/doc sweep in parallel") and runs in parallel with the other
  dead-code/doc-truthing items.
- **Must land before / not conflict with 0.3.0 H1 (BL-f4dac1becd).** H1 will
  wire `emitCodexMcp` into `adapters/codex.ts` and revisit `mcp.ts`'s fate; the
  docblock added here is explicitly the "until H1" marker. Do not let a
  well-meaning reviewer delete `mcp.ts` as part of this item.
- No ordering constraint against the other Track 3 items, except: **do not
  collide with D3** (`docs/moe/plans/...`, adds a warning to the generated
  `support-matrix.md` Notes via `docs-emit.ts` `NOTES`). D3 edits
  `renderMatrix`'s Notes section; this item edits `renderSupportMatrix`/`COLUMNS`
  and `ComponentSupport`. Different functions, but both live in `matrix.ts` /
  `docs-emit.ts` / their tests — land them in sequence or rebase to avoid a
  trivial merge conflict, and re-run `pnpm mint:check` after whichever lands
  second (D3 *does* change generated output; this item does not).

## Risks

- **Low: hidden `ComponentSupport` consumer.** Verified the only readers are
  `matrix.ts` (`COLUMNS`) and `platform/capabilities.ts` (`componentCapability`,
  which never keys on rules/variables). Typecheck (`pnpm check`) is the backstop
  — a missed consumer surfaces as a compile error, not a silent runtime change.
- **Low: unregistered adapters.** `maka.ts` and `openclaude.ts` are absent from
  `adapters/index.ts`'s `adapters` array, so they never reach the matrix, but
  they type `support` as `ComponentSupport` and so must be edited to keep
  typecheck green. Easy to overlook; the `grep` for `variables: 'none'` (10
  files) is the checklist.
- **Low: mis-scoped edit leaking into generated output.** The whole scope rests
  on the renderSupportMatrix-vs-renderMatrix distinction. `pnpm mint:check`
  reporting zero diff, plus the untouched `docs-emit`/`generate` snapshots, is
  the guard; if either moves, the change was wrong.
- **Low: mcp.ts re-flagged or deleted by a future sweep.** Mitigated by the
  explicit docblock naming H1 / BL-f4dac1becd. This is the point of the
  annotation.
