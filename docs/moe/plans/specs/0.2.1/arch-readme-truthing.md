# ARCHITECTURE / README truthing: package + namespace counts and harness tiering

Backlog: BL-1723a7d901 (package/namespace counts internally contradictory),
BL-0f9d99223b (README/ARCHITECTURE present "8 harnesses" flatly). Size: S.

Both findings are **verified against main @ 64304930** and still hold. This is a
doc-truthing sweep across two unguarded prose files (`ARCHITECTURE.md`,
`README.md`) plus one *generated* doc (`docs/support-matrix.md`, produced from
`packages/mint/src/docs-emit.ts`).

---

## Problem

### BL-1723a7d901 — counts are internally contradictory and omit two packages

The tree, verified today:

- **11 directories under `packages/`**: `backstory`, `core`, `crew`, `flight`,
  `glass`, `jig`, `jig-graph`, `memory`, `mint`, `statusline`, `tab`. Adding
  `py/proof` (`moe-proof`) makes **12 source packages** total. (`packages/tab`
  has no `package.json` — it is the Rust crate — but ARCHITECTURE §3 and §2
  already count it as a package, so it counts here too.)
- **6 installable plugins** — `.claude-plugin/marketplace.json` lists exactly
  `moe`, `moe-backstory`, `moe-memory`, `moe-glass`, `moe-crew`,
  `moe-statusline`; `plugins/` contains those same 6 generated dirs.
- **8 command namespaces** — `bin/moe.js` `NAMESPACES` has exactly `crew`,
  `flight`, `glass`, `jig`, `memory`, `mint`, `proof`, `tab`.

The prose contradicts itself and the tree:

**`ARCHITECTURE.md`** intro (the sentence beginning "Moe is one workspace…"):

> "Nine source packages produce six installable plugins and seven command
> namespaces."

- "Nine source packages" — wrong twice over: §3's own table lists **ten** rows
  (`moe-core`, `moe-backstory`, `moe-memory`, `moe-flight`, `moe-mint`,
  `moe-crew`, `moe-glass`, `moe-jig`, `moe-tab`, `moe-proof`), and **twelve**
  actually exist. The intro number does not even match its own §3.
- "seven command namespaces" — wrong: §8 ("The dependency-free `bin/moe.js`
  dispatcher fronts eight permanent namespace bins:") lists **eight** and is
  correct. The intro contradicts §8 in the same file.

**`ARCHITECTURE.md` §3 (Packages table)** omits `@bubstack/moe-jig-graph` and
`@bubstack/moe-statusline` entirely. `moe-statusline` is one of the six shipped
plugins (marketplace + `plugins/moe-statusline/`), so §3's 5 named
generated/npm-backed plugins do not reconcile with §5's "all six plugins" /
"All six public marketplace entries" until statusline is listed.

**`README.md` "Packages" table** (the `@bubstack/moe-*` table) lists **9** rows
and omits three real packages: `@bubstack/moe-jig`, `@bubstack/moe-jig-graph`,
`@bubstack/moe-statusline`.

**`README.md` "Command line"** section:

> "Namespaces are `crew`, `flight`, `glass`, `memory`, `mint`, `proof`, and
> `tab`."

Lists **7**, omitting `jig` — even though `bin/moe.js` fronts it
(`jig: { bin: "moe-jig", workspace: "packages/jig/dist/cli.js" }`) and `bin/moe.js`
`USAGE` documents `jig`.

(Related, out of primary scope: `bin/moe.js` line-2 header comment reads
"the dispatcher in front of the seven `moe-<ns>` bins" while its own `USAGE`
string says "eight namespace bins" and `NAMESPACES` defines 8. Same class of
error; see Change → optional.)

### BL-0f9d99223b — "8 harnesses" is presented flatly; tiering + MCP degradation invisible in prose

The tiering is real and machine-encoded but absent from the prose:

- Every shipped plugin's mint yaml marks `claude-code` `intent: certify` and the
  other seven `intent: preview`. Verified across `packages/core/mint/moe.yaml`
  (`claude-code: {intent: certify …}`, the seven others `intent: preview`),
  `packages/backstory/mint/moe-backstory.yaml`, `packages/crew/mint/moe-crew.yaml`,
  `packages/glass/mint/moe-glass.yaml`, `packages/memory/mint/moe-memory.yaml`.
  `packages/statusline/mint/moe-statusline.yaml` is the extreme case:
  `claude-code: {intent: certify …}` and every other harness `{intent: omit}`
  (statusline is Claude Code only — see `harnesses.exclude` and the package
  description "Configures a vendored… Claude Code statusline… on session start").
- Component reach is `none` on most non-Claude harnesses. From each adapter's
  `support` block in `packages/mint/src/adapters/*.ts`:

  | harness | commands | agents | hooks | mcp |
  |---|---|---|---|---|
  | claude-code | full | full | full | full |
  | cursor | full | full | partial | full |
  | codex | none | none | none | none |
  | kimi | none | none | none | none |
  | opencode | full | partial | none | none |
  | pi | none | none | none | none |
  | agent-plugins-1.0 | none | none | none | full |
  | copilot | full | full | full | full |

  So **`mcp` reaches only 4/8** — `claude-code`, `cursor`, `agent-plugins-1.0`,
  `copilot` — confirming the backlog's "memory's MCP server reaches only 4/8".
  `codex`, `kimi`, `pi` are `none` on all four of commands/agents/hooks/mcp.

- The generated `docs/support-matrix.md` (e.g. `plugins/moe/docs/support-matrix.md`)
  renders the 8-harness table but its **Notes** section (only two bullets:
  the Copilot-layout note and the CRLF/.gitattributes note) never states the
  certify/preview tiering nor warns that MCP-backed plugins degrade where `mcp`
  support is not `full`. The `NOTES` array is hardcoded in
  `packages/mint/src/docs-emit.ts`.

Neither `README.md` nor `ARCHITECTURE.md` mentions the tiering or MCP
degradation anywhere. The multi-harness parity story is honest at the machine
level (mint yaml intents, INSTALL matrix, `moe-install` refusal, the
support-matrix table) but invisible in the two most-read prose files.

---

## Change

Numbers to use, once, everywhere: **12 source packages · 6 installable plugins ·
8 command namespaces**.

### 1. `ARCHITECTURE.md` intro (source)

Replace the sentence

> "Nine source packages produce six installable plugins and seven command
> namespaces."

with

> "Twelve source packages produce six installable plugins and eight command
> namespaces."

### 2. `ARCHITECTURE.md` §3 Packages table (source)

Add two rows to the table (keep the existing column shape
`Package | Responsibility | Distribution`):

- `@bubstack/moe-jig-graph` | Graph-grounded plan validation; extends `jig` with
  moedex-powered `validate` and `seed` | npm-published extension library (no
  plugin, no namespace)
- `@bubstack/moe-statusline` | Auto-configure a vendored, MIT-licensed statusline
  (ccstatusline) on session start | generated `moe-statusline` plugin
  (Claude Code only)

Descriptions are drawn verbatim from each `package.json` `description`. Place
`moe-jig-graph` after the `moe-jig` row and `moe-statusline` after `moe-glass`
(or anywhere in the table — order is not asserted). After the edit the table has
**12 rows**, matching the corrected intro and §5's "six … plugins".

§8 already lists eight namespaces correctly — **do not touch §8's list.**

### 3. `ARCHITECTURE.md` §9 (Installation and platforms) — tiering + MCP note (source)

Append one paragraph (adjacent to the existing platform paragraph):

> "Harnesses are tiered. `claude-code` is the certify tier: it is exercised in
> CI (macOS) and every declared capability — skills, commands, agents, hooks,
> MCP, bootstrap — is validated. The other seven harnesses (`cursor`, `codex`,
> `kimi`, `opencode`, `pi`, `agent-plugins-1.0`, `copilot`) are preview: skill
> delivery is universal, but commands, agents, hooks, and MCP are `none` on most
> of them (see each plugin's generated `docs/support-matrix.md`). MCP-backed
> plugins degrade accordingly — `moe-memory` and `moe-glass` register their MCP
> server on only four harnesses (`claude-code`, `cursor`, `agent-plugins-1.0`,
> `copilot`); on the other four the plugin falls back to its skills and the
> MCP-only features are unavailable."

### 4. `README.md` Packages table (source)

Add three rows so it reaches parity with ARCHITECTURE §3:

- `@bubstack/moe-jig` | Deterministic enforcement tooling for skill conventions
- `@bubstack/moe-jig-graph` | Graph-grounded plan validation extending `jig`
- `@bubstack/moe-statusline` | Auto-configure a vendored statusline on session
  start (Claude Code only)

### 5. `README.md` "Command line" namespaces sentence (source)

Replace

> "Namespaces are `crew`, `flight`, `glass`, `memory`, `mint`, `proof`, and
> `tab`."

with

> "Namespaces are `crew`, `flight`, `glass`, `jig`, `memory`, `mint`, `proof`,
> and `tab`."

### 6. `README.md` harness-tiering note (source)

Add a short note (a new small section after "Command line", or folded into it):

> "**Harness support.** Moe ships plugins for eight harnesses. `claude-code` is
> the certify tier (validated in CI); the other seven — `cursor`, `codex`,
> `kimi`, `opencode`, `pi`, `agent-plugins-1.0`, `copilot` — are preview: skills
> work everywhere, but commands, agents, hooks, and MCP vary by harness.
> MCP-backed plugins (`moe-memory`, `moe-glass`) reach only four harnesses;
> elsewhere they degrade to skills. See each plugin's `docs/support-matrix.md`."

### 7. Generated `support-matrix.md` Notes — via `packages/mint/src/docs-emit.ts` (source → generated)

In `packages/mint/src/docs-emit.ts`, extend the `NOTES` array (currently the two
bullets in the block comment beginning "support-matrix.md's Notes section calls
out details a capability table cannot") with two more bullets, keeping the
literal-string style:

```
'- `claude-code` is the certify tier; the other seven harnesses are preview. Skill delivery is universal, but capabilities beyond skill-discovery vary by harness — see the Emitted capabilities column above.',
'- MCP-backed plugins (for example `moe-memory` and `moe-glass`) register their MCP server only where `mcp` support is `full` (`claude-code`, `cursor`, `agent-plugins-1.0`, `copilot`); on the other four harnesses the MCP-only features are unavailable and the plugin degrades to its skills.',
```

These two static bullets are accurate for all six plugins (the certify/preview
split is uniform across every yaml). This edit changes generated output, so
**`pnpm mint` must re-run and all six `plugins/*/docs/support-matrix.md` are
regenerated.**

Because two tests pin the exact Notes text, they must be updated in the same
change (see Test plan).

### 8. Optional (source, bundled): `bin/moe.js` header comment

Line-2 comment "the dispatcher in front of the seven `moe-<ns>` bins" →
"…eight `moe-<ns>` bins." Comment-only, no test asserts it, no behavior change.
Bundle it here since it is the same seven-vs-eight error; skip if the executor
prefers to keep this spec's scope to the three doc surfaces.

---

## Files touched

- `ARCHITECTURE.md` (source, unguarded prose) — intro count; §3 add two rows; §9
  tiering + MCP paragraph.
- `README.md` (source, unguarded prose) — Packages table +3 rows; namespaces
  sentence +`jig`; harness-support note.
- `packages/mint/src/docs-emit.ts` (source) — `NOTES` array +2 bullets.
- `packages/mint/test/docs-emit.test.ts` (source, test) — update the "exact
  content for the full 8-adapter registry" assertion to include the two new
  bullets.
- `packages/mint/test/__snapshots__/generate.test.ts.snap` (source, snapshot) —
  regenerate (`vitest -u`) so the `## Notes` block matches.
- `plugins/*/docs/support-matrix.md` (**generated**, 6 files) — regenerated by
  `pnpm mint`; **never hand-edit**. Any edit to `docs-emit.ts` requires
  `pnpm mint` and re-commit of `/plugins/`; `pnpm mint:check` proves the
  committed output is reproducible.
- `bin/moe.js` (source, optional) — line-2 comment count.

No mint **yaml**, SKILL.md, or hook manifest changes — the only generated
surface that moves is `support-matrix.md`, driven by `docs-emit.ts`.

---

## Acceptance

Concrete and checkable:

- `ARCHITECTURE.md` intro reads "Twelve source packages produce six installable
  plugins and eight command namespaces"; §3 table has 12 rows including
  `@bubstack/moe-jig-graph` and `@bubstack/moe-statusline`; §9 carries the
  certify/preview + MCP-degradation paragraph. No count in the file contradicts
  another (intro agrees with §3 row count and with §8's eight namespaces).
- `README.md` Packages table lists all 12 packages (jig, jig-graph, statusline
  added); the namespaces sentence lists all 8 including `jig`; a harness-support
  note states the certify/preview tiering and MCP degradation.
- Every one of the 6 `plugins/*/docs/support-matrix.md` Notes sections contains
  the two new bullets after regeneration.
- Gates:
  - `pnpm mint:check` — **must pass** (proves `/plugins/` is byte-identical to a
    fresh `pnpm mint`; catches a forgotten re-mint or a hand-edited matrix).
  - `pnpm check` — **must pass** (lint + typecheck + the updated
    `docs-emit.test.ts` and the regenerated `generate.test.ts` snapshot).
  - `pnpm provenance` — should stay green (no attribution/license surface
    changes; run to confirm the doc-emit change did not perturb payloads).
- Tests to update (by name): `packages/mint/test/docs-emit.test.ts` →
  "has exact content for the full 8-adapter registry: all rows plus the Notes
  section"; and the `generate.test.ts` snapshot in
  `packages/mint/test/__snapshots__/generate.test.ts.snap` (the block after
  `## Notes`).

No new source symbols; no new guarded surface. The `ARCHITECTURE.md`/`README.md`
edits are unguarded — no test asserts their content, so correctness there is by
inspection against this spec.

---

## Test plan

1. **`packages/mint/test/docs-emit.test.ts`** — in the test
   "has exact content for the full 8-adapter registry: all rows plus the Notes
   section", append the two new bullet strings to the expected array (after the
   existing Copilot and CRLF bullets, before the trailing `''`). Run
   `pnpm --filter @bubstack/moe-mint test`. This is the primary guard that the
   Notes text landed exactly.
2. **`packages/mint/test/__snapshots__/generate.test.ts.snap`** — regenerate
   with `pnpm --filter @bubstack/moe-mint test -- -u` (or `vitest -u`), then
   eyeball the diff: only the two Notes bullets should appear under `## Notes`
   in every affected plugin snapshot. Do not `-u` blindly if any unrelated
   snapshot moves — investigate first.
3. **`pnpm mint` then `pnpm mint:check`** — confirms the 6
   `plugins/*/docs/support-matrix.md` regenerate deterministically and the
   committed tree matches.
4. No new test is required for the `ARCHITECTURE.md`/`README.md` prose (unguarded
   by design per AGENTS.md "Unguarded prose — read carefully"); verify by reading
   the rendered tables and counts.

---

## Sequencing & dependencies

- **Must land before the packaging republish (BL-d932811282, 0.2.1 Priority 1).**
  The `support-matrix.md` change is *generated content shipped inside the plugin
  tarballs*; per the v0.2.1 plan "everything else in 0.2.1 rides on that
  republish, so it goes first" — meaning the doc-emit change and re-mint must be
  merged to `main` *before* `mint release candidate --execute` cuts the v0.2.1
  candidate, so the corrected matrix ships. If it merges after the candidate is
  cut, it misses the tarballs and needs another republish.
- The `ARCHITECTURE.md`/`README.md` prose edits are repo-doc-only (not staged
  into plugins — confirmed by ARCHITECTURE §11 "Historical evidence… none of
  which is staged into installable plugins", and support-matrix.md is the only
  doc that ships). They can land any time in the 0.2.1 window, but bundle them
  with the doc-emit change for a single coherent doc-truthing MR.
- **Parallel-safe** with the other Track-3 doc-drift items (D2 memory counts, D4
  codex caveat, D5 crew notes) and the dead-code items — no shared files. The
  only cross-item contact is `pnpm mint:check`: any Track-3 change that also
  edits mint sources must re-mint, so if two such MRs are in flight they must
  each re-mint on the latest `main` to avoid a `mint:check` conflict on
  `/plugins/`.
- Nothing must land first *before this item* except a clean `main` at the
  recorded base; this item does not depend on the packaging wiring, only the
  reverse ordering constraint above.

---

## Risks

- **Forgotten re-mint.** Editing `docs-emit.ts` without `pnpm mint` leaves
  `/plugins/*/docs/support-matrix.md` stale; `pnpm mint:check` will catch it in
  CI, but locally it is the easy miss. Run `pnpm mint` immediately after the
  source edit.
- **Snapshot over-update.** `vitest -u` will happily rewrite unrelated moved
  snapshots. Review the `generate.test.ts.snap` diff and confirm only the two
  Notes bullets changed.
- **Note appears on non-MCP plugins too.** The MCP-degradation bullet is in the
  shared `NOTES`, so it renders on `moe`, `moe-backstory`, `moe-crew`,
  `moe-statusline` as well — plugins with no MCP server. This is acceptable
  (the bullet is phrased "for example `moe-memory`/`moe-glass`" and is
  informational), but if per-plugin precision is later wanted it needs the
  `intent`/`support.mcp` data plumbed into `docs-emit.ts` — out of scope for a
  patch. Flag, do not fix here.
- **Count drift after the fact.** These are unguarded prose numbers; a future
  package addition can re-break them with no failing test. Mitigation is out of
  scope (a metadata-driven count assertion would be a 0.3.0 hardening), but note
  it so the reviewer does not expect a guard.
- **`bin/moe.js` optional edit** touches a shipped dispatcher file; it is a
  comment only and no test asserts it, so risk is nil — but confirm no
  `mint:check`/byte-identical concern by not touching any executable line.
