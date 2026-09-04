# Memory + Codex documentation drift

Backlog: BL-e6e0a743f3, BL-46935c8fc8, BL-0a9962f094 — size **M**

Three documentation-vs-reality drifts, all confirmed against current `main`
(`64304930`, "chore(backlog): seed .moe/backlog and retire BACKLOG.md"). This is
the v0.2.1 D2 + D4 cluster. No product behaviour changes; the memory MCP server
and the codex adapter already behave correctly — the docs, one JSDoc header, and
one test's framing describe capabilities that either changed (nine tools, not
seven) or never shipped in 0.2.1 (Codex MCP).

Two of the edited surfaces are **mint-mirrored** and force a `/plugins/`
regeneration:

- `MCP-TOOLS.md` is a file inside the `remembering-conversations` skill, copied
  into all seven skill layouts under `plugins/moe-memory/**`.
- `adapters/codex.ts` `installDoc` renders `docs/install/codex.md`, emitted into
  **every** plugin that runs the codex adapter (`moe`, `moe-memory`, `moe-glass`,
  `moe-crew`, `moe-backstory`).

`packages/memory/docs/CODEX.md` is package-source documentation only — it is
**not** in any mint payload (`moe-memory.yaml` payloads are `dist`, `runtime`,
`vendor/sqlite-vec`, `recovery`, `prompts`; no `docs`), so it does not gate
`pnpm mint:check`.

---

## Problem

### (a) BL-e6e0a743f3 — MCP-TOOLS.md says seven tools; the server registers nine

`packages/memory/skills/remembering-conversations/MCP-TOOLS.md` opens with:

> The moe-memory plugin exposes seven MCP tools over two record types.

`packages/memory/src/mcp-server.ts` `toolDefinitions()` returns **nine** tools:
`search_conversations`, `read_conversation`, `process_thoughts`,
`search_journal`, `read_journal_entry`, `list_recent_entries`,
`read_recent_entries`, `link_memories`, `trace_provenance`. The doc's own math
(2 conversation + 5 journal) omits `link_memories` and `trace_provenance`, which
are real and db-backed: `link_memories` calls `insertEdge` and
`trace_provenance` calls `traceProvenance` in `mcp-server.ts`, both validated by
`parseTypeId` (the "CR-057" guard), with schema `LinkMemoriesInputSchema` /
`TraceProvenanceInputSchema`.

The server side is already guarded: `mcp-startup.test.ts` ("lists all tools
without initializing heavy runtime") asserts `expect(toolNames).toHaveLength(9)`
and lists both new names. Only the doc is stale.

Same stale claim in the `mcp-server.ts` file header JSDoc:

> Seven tools over two record types:

whose ASCII diagram lists only the first seven and omits the two graph tools.
(This JSDoc is source-only; it is stripped from `dist` and not shipped.)

### (b) BL-46935c8fc8 — docs/tests claim Codex uses the moe-memory MCP tool; the mint yaml grants skill-discovery only

`packages/memory/mint/moe-memory.yaml` gives Codex skill-discovery and nothing
else:

> `codex: {intent: preview, expected_capabilities: [skill-discovery], ...}`

The codex adapter agrees — `packages/mint/src/adapters/codex.ts` `support` has
`mcp: 'none'`, `hooks: 'none'`, `agents: 'none'`, and its `emit()` produces only
`.codex-plugin/plugin.json` (with `hooks: {}`) and
`.agents/plugins/marketplace.json`. So the shipped v0.2.1 Codex plugin has **no
MCP server and no hooks** — native skill discovery only. Codex MCP emission is
explicitly deferred to 0.3.0 (H1) in the v0.2.1 plan's "Out of scope (→ 0.3.0)".

But `packages/memory/docs/CODEX.md` describes, in the present tense, a whole
stack Codex does not get in 0.2.1:

- "this plugin depends on all of these Codex surfaces: plugin manifests and
  plugin MCP loading … plugin lifecycle hooks … hook trust state in
  `hooks.state` … app-server `thread/fork` … for Codex-native summarization"
- an "Install and Enable" flow that runs `codex features enable plugin_hooks`,
  trusts a `SessionStart` hook, and stores `[hooks.state."moe-memory@test:…"]`
- a "Verify" flow whose doctor checks "`codex mcp list` shows `moe-memory`
  enabled"
- an "End-to-End Test" whose bullet: "a later Codex session uses the Moe Memory
  MCP search tool and finds the earlier marker"

The test suite encodes the same promise. `packages/memory/test/codex-e2e-script.test.ts`,
`describe("Codex E2E test harness")` → `it("contains the production Codex plugin
workflow checks")` asserts the manual harness contains `hooks/list` and
`mcp__moe_memory__`. The manual harness `packages/memory/test/manual/codex-e2e.js`
enables `plugin_hooks`, trusts a hook, runs `codex mcp list`, and asserts
`hasMcpRecall()` (a transcript containing `mcp__moe_memory__`) — an end-to-end
proof of a capability the 0.2.1 plugin does not ship.

Note `codex-e2e-cleanup.test.ts` ("CR-077: withTempRoot always removes the temp
root that holds the copied Codex auth") is a **real credential-safety
regression test**, independent of any MCP claim; it must stay active. It imports
`withTempRoot` from `codex-e2e.js`, so the manual harness file must remain on
disk.

**Adjacent, deliberately out of scope:** `remembering-conversations/SKILL.md`
"### Codex" section tells the model to "use the MCP tools directly" on Codex,
and `codex-skills.test.ts` ("documents both Claude Code and Codex invocation
paths in the skill") *requires* that phrasing. That is harness-agnostic runtime
guidance guarded by an intentional test, and the backlog scopes this item to
`CODEX.md` + the codex-e2e suite. Leave SKILL.md and `codex-skills.test.ts`
alone; revisit when Codex MCP lands in 0.3.0. (Flagged again under Risks.)

### (c) BL-0a9962f094 — codex adapter install caveat omits agents and mcp

`packages/mint/src/adapters/codex.ts` `installDoc()` ends with a single caveat
bullet:

> - Hooks and commands are not supported on Codex; bootstrap relies entirely on
>   native skill discovery, with no active injection mechanism.

But the same file's `emit()` pushes four `COMPONENT_OMITTED` limitations —
`hooks`, `commands`, `agents`, and `mcp`:

```ts
if (model.agents.length) limitations.push({ code: 'COMPONENT_OMITTED', component: 'agents', message: 'agents are not emitted for codex in v1' })
if (model.mcp !== undefined) limitations.push({ code: 'COMPONENT_OMITTED', component: 'mcp', message: 'mcp servers are not emitted for codex in v1' })
```

`adapters/codex.test.ts` ("warns about hooks, commands, agents, and mcp not
being emitted for codex") already asserts all four limitations. The caveat that
users read in `docs/install/codex.md` lists only two of the four. The generated
`plugins/moe-memory/docs/install/codex.md` shows the incomplete text verbatim.

---

## Change

### (a) Fix the tool count and document the two graph tools

**`packages/memory/skills/remembering-conversations/MCP-TOOLS.md`** (source,
mint-mirrored):

1. Change the opening sentence from "exposes seven MCP tools over two record
   types" to "**exposes nine MCP tools**" and describe three groups: the two
   **conversation** tools, the five **journal** tools, and the two **graph /
   provenance** tools (`link_memories`, `trace_provenance`). Do not describe it
   as "two record types" (the graph tools span the closed `SourceType` set
   `exchange, journal, decision, finding, moedex_symbol`).
2. Preserve the exact substring `Claude Code and Codex conversations` (asserted
   by `codex-skills.test.ts`, "describes Moe Memory as cross-harness…").
3. Add a `## link_memories` section: creates a typed edge between two memory
   records; `source`/`target` are `type:id` strings; `relation` ∈
   `caused_by | contradicts | supersedes | supports | implements`;
   `confidence` 0–1 (default 1.0). Mirror the schema in
   `LinkMemoriesInputSchema` / the tool's `inputSchema` in `mcp-server.ts`.
4. Add a `## trace_provenance` section: walks the edge graph from a `type:id`
   record; `depth` 1–10 (default 3); `direction` ∈ `causes | effects` (default
   `causes`). Mirror `TraceProvenanceInputSchema`.
5. Keep the existing note that the five journal tools are self-describing at
   `tools/list`.

**`packages/memory/src/mcp-server.ts`** (source, JSDoc only — not shipped):
update the file-header JSDoc "Seven tools over two record types:" to "Nine
tools:" and extend the ASCII diagram with a graph/provenance row listing
`link_memories` and `trace_provenance`. Keep the `Claude Code and Codex
conversations` substring that lives in the `search_conversations` tool
description untouched (also asserted by `codex-skills.test.ts`).

### (b) Make the Codex docs/tests match today's reality (no Codex MCP)

**`packages/memory/docs/CODEX.md`** (source doc, not mint-mirrored) — rewrite so
present-tense claims match the shipped 0.2.1 plugin:

- Open by stating what Codex gets today: **native discovery of the
  `remembering-conversations` skill only** — no MCP server registration, no
  session hooks, no app-server summarization. Cite that `moe-memory.yaml` grants
  Codex `[skill-discovery]`.
- Move the MCP-loading / `plugin_hooks` / hook-trust / `codex mcp list` /
  app-server `thread/fork` summarization / MCP-recall E2E content under a clearly
  labelled **"Planned for v0.3.0 (H1)"** heading, phrased in the future tense
  ("will", "is planned"), so no reader mistakes it for a working 0.2.1 path.
- The "Install and Enable" section for 0.2.1 reduces to: install/enable the
  plugin, and the skill is discovered natively — drop the `plugin_hooks` /
  `/hooks` / trust steps from the present-tense flow (they belong under Planned).
- Keep the transcript-harvesting facts that are true today (Codex rollout JSONLs
  in `$CODEX_HOME/sessions` are indexed) — these are read by the harvesting path,
  not by a Codex MCP server.

**`packages/memory/test/codex-e2e-script.test.ts`** (test) — reframe so a green
test no longer reads as a shipped-capability contract:

- Rename `describe("Codex E2E test harness")` to name it as a **v0.3.0-targeted**
  harness (e.g. `describe("Codex E2E test harness (targets v0.3.0 Codex MCP; not
  a 0.2.1 capability)")`).
- Rename `it("contains the production Codex plugin workflow checks")` to drop
  "production" (e.g. "contains the planned Codex MCP workflow checks").
- Add a leading comment tying the `hooks/list` / `mcp__moe_memory__` assertions
  to the 0.3.0 Codex MCP emitter, and citing that `moe-memory.yaml` gives Codex
  `[skill-discovery]` in 0.2.1. Keep the assertions themselves — they verify the
  harness file is intact for 0.3.0, not that the plugin ships MCP.

**`packages/memory/test/manual/codex-e2e.js`** (source, opt-in harness) — keep
(0.3.0 groundwork; `codex-e2e-cleanup.test.ts` imports `withTempRoot` from it).
Add a header comment noting it exercises the v0.3.0 Codex MCP path and is not a
0.2.1 capability. Do **not** delete.

### (c) Complete the codex install caveat

**`packages/mint/src/adapters/codex.ts`** (source, mint-mirrored via
`installDoc`) — expand the single caveat bullet in `installDoc()` into a list
covering all four omitted components, matching `emit()`'s limitation messages:

```
## Caveats

- Hooks and commands are not supported on Codex.
- Agents are not emitted for Codex.
- MCP servers are not emitted for Codex.

Bootstrap relies entirely on native skill discovery, with no active injection
mechanism.
```

(Wording is the spec author's; keep it consistent with the four `emit()`
messages "…not supported on codex" / "…not emitted for codex in v1".)

### Regenerate /plugins/

After (a) `MCP-TOOLS.md` and (c) `codex.ts`, run `pnpm mint`. `MCP-TOOLS.md`
regenerates in the seven `remembering-conversations` skill layouts under
`plugins/moe-memory/**`; `docs/install/codex.md` regenerates in `moe`,
`moe-memory`, `moe-glass`, `moe-crew`, and `moe-backstory`. The `CODEX.md` and
test edits do not touch `/plugins/`.

---

## Files touched

- `packages/memory/skills/remembering-conversations/MCP-TOOLS.md` — **(source, mint-mirrored)** count + two tool sections
- `packages/memory/src/mcp-server.ts` — **(source)** file-header JSDoc only (not shipped)
- `packages/memory/docs/CODEX.md` — **(source doc, not mint-mirrored)** rewrite present-tense Codex-MCP claims to Planned-0.3.0
- `packages/memory/test/codex-e2e-script.test.ts` — **(test)** reframe describe/it names + comment
- `packages/memory/test/manual/codex-e2e.js` — **(source)** header comment only; keep file
- `packages/mint/src/adapters/codex.ts` — **(source, mint-mirrored)** complete `installDoc` caveat list
- `packages/memory/test/*` — **(test)** add the two regression tests named below

Generated, regenerated by `pnpm mint` (do not hand-edit):

- `plugins/moe-memory/skills/remembering-conversations/MCP-TOOLS.md` and the six `plugins/moe-memory/.{claude-plugin,cursor-plugin,codex-plugin,pi,opencode,kimi-plugin}/skills/remembering-conversations/MCP-TOOLS.md`
- `plugins/{moe,moe-memory,moe-glass,moe-crew,moe-backstory}/docs/install/codex.md`

**Because `MCP-TOOLS.md` (a skill file) and `codex.ts` (installDoc) change,
`pnpm mint` must re-run and `/plugins/` is regenerated; `pnpm mint:check` will
fail if it is not.**

---

## Acceptance

- `pnpm check` green (lint + per-package typecheck + test, incl. memory and
  mint). The existing `mcp-startup.test.ts` "lists all tools…" (`toHaveLength(9)`)
  and `adapters/codex.test.ts` "warns about hooks, commands, agents, and mcp…"
  stay green unchanged.
- `pnpm mint:check` green — proves `pnpm mint` was run and `/plugins/` is
  byte-identical to the regenerated output (the regenerated `MCP-TOOLS.md` copies
  and `docs/install/codex.md` copies are committed).
- `pnpm provenance` green — not implicated (no imported-work, NOTICE, or license
  change) but part of the standard release gate.
- `MCP-TOOLS.md` contains "nine", `link_memories`, and `trace_provenance`, and
  no longer contains "seven MCP tools".
- Generated `plugins/moe-memory/docs/install/codex.md` "## Caveats" names hooks,
  commands, agents, and mcp.
- `CODEX.md` makes no present-tense claim that the 0.2.1 Codex plugin registers
  an MCP server, runs hooks, or that `codex mcp list` shows `moe-memory`; such
  content is under a "Planned for v0.3.0" heading.
- No green CI test's `describe` presents Codex MCP recall as a shipped 0.2.1
  capability.

---

## Test plan

Add / update these named cases:

1. **New — MCP-TOOLS.md count guard.** In `packages/memory/test/` (new
   `mcp-tools-doc.test.ts`, or extend `mcp-startup.test.ts`): read
   `skills/remembering-conversations/MCP-TOOLS.md` and assert it
   `.toContain("nine")`, `.toContain("link_memories")`,
   `.toContain("trace_provenance")`, and `.not.toContain("seven MCP tools")`.
   This is the regression guard the count fix currently lacks (the server has
   `mcp-startup.test.ts`; the doc has none).
2. **New — codex installDoc caveat content.** In
   `packages/mint/test/adapters/codex.test.ts`, add
   `it("installDoc caveat names hooks, commands, agents, and mcp")`: call
   `codex.installDoc(model)` and assert the returned string's caveat section
   contains `agents` and `mcp` (and still `hooks`, `commands`). No such content
   test exists today — the file only tests `emit()`.
3. **Update — `codex-e2e-script.test.ts`.** Rename the `describe`/`it` per the
   Change section; the assertions remain and stay green.
4. **Unchanged, confirm still green:** `mcp-startup.test.ts` "lists all tools…";
   `codex-skills.test.ts` "describes Moe Memory as cross-harness…" and
   "documents both Claude Code and Codex invocation paths…" (my `MCP-TOOLS.md`
   edit preserves `Claude Code and Codex conversations`, and I do not touch
   SKILL.md); `codex-e2e-cleanup.test.ts` "CR-077…"; `adapters/codex.test.ts`
   "warns about hooks, commands, agents, and mcp…".

---

## Sequencing & dependencies

- **Must land before the v0.2.1 packaging republish (plan item P, PRIORITY 1).**
  Per the v0.2.1 plan, "Everything else in 0.2.1 rides on that republish" and
  the doc/mint sweep "ship[s] in the same republish as P." The regenerated
  `MCP-TOOLS.md` copies and `docs/install/codex.md` copies must be in the trees
  P republishes. `CODEX.md` and the test edits are source-only and do not gate
  the tarball, but belong in the same release.
- **Parallelizable:** the three sub-changes are independent — (a) memory doc +
  JSDoc, (b) CODEX.md + codex-e2e test framing, (c) codex adapter caveat — and
  can be authored concurrently. Run `pnpm mint` once at the end, after both
  mint-mirrored surfaces ((a) `MCP-TOOLS.md` and (c) `codex.ts`) are edited, then
  `pnpm mint:check`.
- **0.3.0 dependency (forward):** when the Codex MCP emitter lands in 0.3.0
  (H1), CODEX.md's "Planned" section becomes present tense, the reframed
  `codex-e2e-script.test.ts` names revert, and the SKILL.md "use the MCP tools
  directly" Codex guidance becomes fully accurate. This spec deliberately leaves
  that flip for 0.3.0.
- **No dependency on** the other D-cluster items (D1 ARCHITECTURE counts, D3
  harness tiering, D5 crew notes); no shared files.

---

## Risks

- **mint:check drift.** Forgetting `pnpm mint` after editing `MCP-TOOLS.md` or
  `codex.ts` fails `mint:check`. The caveat change fans out to five plugins'
  `docs/install/codex.md`; confirm all five regenerated.
- **Guarded-substring breakage.** `codex-skills.test.ts` asserts `MCP-TOOLS.md`
  contains `Claude Code and Codex conversations` and `mcp-server.ts` contains the
  same phrase. Keep both substrings when editing.
- **SKILL.md left inconsistent (accepted).** SKILL.md's "### Codex" still says
  "use the MCP tools directly," which is not true for a 0.2.1 Codex install.
  Deliberately out of scope (guarded by `codex-skills.test.ts`; backlog scopes
  this item to CODEX.md + codex-e2e). Left for 0.3.0. If a reviewer wants it
  closed now, it is a separate, larger change touching a mint-mirrored skill and
  its guard test.
- **codex-e2e reframe vs. delete.** This spec reframes (rename + comment) rather
  than deletes or `describe.skip`s the harness contract test, to preserve 0.3.0
  groundwork and keep `codex-e2e-cleanup.test.ts`'s import alive. If the team
  wants zero MCP references in green tests, the alternative is `describe.skip`
  with the same explanatory comment; the manual `codex-e2e.js` file and the
  CR-077 cleanup test still stay.
- **CODEX.md is unguarded prose.** No test asserts its contents; the "no
  present-tense MCP claim" acceptance is verified by review. A future doctor
  subcommand or doc regen could reintroduce drift — out of scope to guard here.
