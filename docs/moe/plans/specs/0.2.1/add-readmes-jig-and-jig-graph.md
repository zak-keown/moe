# Add READMEs for `jig` and `jig-graph`  ·  no backlog id  ·  size S  ·  0.2.1 Track 3 (doc truthing)

Source: `docs/moe/plans/2026-09-04-v0.2.1-plan.md`, Track 3 → "Honesty /
discoverability", line **"Add READMEs for `jig` and `jig-graph` (neither has
one)."**

## Problem

Verified against `main` @ `64304930`. Of the 11 dirs under `packages/`, exactly
two publishable packages ship no README:

```
NO  README: /Users/zakkeown/Code/tools/moe/packages/jig-graph/
NO  README: /Users/zakkeown/Code/tools/moe/packages/jig/
```

Every other public package (`backstory`, `core`, `crew`, `flight`, `glass`,
`memory`, `mint`, `statusline`, `tab`) has a `README.md`. Both `jig`
(`@bubstack/moe-jig`, v0.1.4, `private=false`) and `jig-graph`
(`@bubstack/moe-jig-graph`, v0.1.0, `private=false`) publish to npm, so an npm
visitor sees the "no README" placeholder. The finding **still holds**.

Two facts from the work-item's one-line description need correcting so the
READMEs are accurate, not just present:

1. **"jig fronts the backlog CLI via `bin/moe.js`" is too narrow.** `bin/moe.js`
   is the dispatcher in front of *all eight* namespaces (`NAMESPACES` in
   `bin/moe.js` and its `USAGE`); `jig` is one of them. Within `jig`, backlog is
   one of ten command groups. `packages/jig/src/cli.ts` registers
   `worktree`, `plan`, `spec`, `review`, `commit`, `iterations`, `context`,
   `adr`, `progress`, and `backlog` on a program named `moe-jig`
   (`.name("moe-jig")`, `.description("Deterministic enforcement tooling for moe
   skill conventions.")`). The README must describe jig as the full enforcement
   CLI, not a backlog front-end.

2. **Neither package is a mint plugin.** Confirmed: neither `packages/jig/` nor
   `packages/jig-graph/` has a `mint/` dir, and `/plugins/` contains only `moe`,
   `moe-backstory`, `moe-crew`, `moe-glass`, `moe-memory`, `moe-statusline` —
   no jig entry, no jig in `.claude-plugin/marketplace.json`. `ARCHITECTURE.md`
   §3 classifies `@bubstack/moe-jig` as an **"npm-published CLI"**. So the
   READMEs must declare "Not a plugin" (this also satisfies the house-voice
   `plugin-declaration` discriminator; see Change), and editing them does **not**
   trigger `pnpm mint`.

Supporting surface for accurate content:

- **jig public surface** — `packages/jig/package.json`: `bin` `moe-jig` →
  `dist/cli.js`; `exports` `.` / `./parser` / `./extension`; sole runtime dep
  `commander`. Also reachable as `moe jig <…>` through the dispatcher
  (`bin/moe.js` `NAMESPACES.jig`).
- **jig extension mechanism** — `packages/jig/src/extension.ts`:
  `EXTENSION_PACKAGES = ["@bubstack/moe-jig-graph/jig-extension"]`;
  `discoverExtensionCommands()` probes it at startup and merges commands into
  existing groups (a name collision **throws**, per the module's "shadows a
  built-in command" error). This is how jig-graph plugs in.
- **jig-graph public surface** — `packages/jig-graph/package.json`: **no `bin`**;
  single export `./jig-extension` → `dist/jig-extension.js`; deps
  `@bubstack/moe-jig` (`workspace:*`) and `@modelcontextprotocol/sdk` 1.30.0.
  `src/jig-extension.ts` `commands` array registers exactly two commands in
  jig's `plan` group: `plan validate` and `plan seed`.
- **jig-graph runtime dependency** — `src/moedex.ts`: `MoedexClient` talks to a
  moedex MCP daemon over HTTP at `MOEDEX_MCP_HTTP_ADDR` (default
  `http://127.0.0.1:8081`) and "degrades gracefully — `isAvailable()` returns
  false rather than throwing". `src/jig-extension.ts` `validate.run` falls back
  to a phantom-files-only check and exits 0 when moedex is unreachable; `seed.run`
  hard-requires it ("moedex required for seed", exit 1).
- **Two non-completions jig-graph must name out loud** (truthfulness + house
  voice `named-refutation`): `plan validate --manifest` is advertised in the
  command's `options` but its handler returns `console.error("--manifest is not
  yet implemented"); return 1;` (`src/jig-extension.ts`; tracked
  `BL-b96fd965e2`). Separately, `traceCalls()` / `CallResult` in `src/moedex.ts`
  are dead exports **scheduled for removal in this same 0.2.1 release**
  (`BL-a959e92b57`) — the READMEs must **not** document them.

House-voice rubric available as a non-gating check: `packages/core/test/
house-voice/score.mjs` mechanically scores a package README on five
discriminators (bare-verb-phrase opening, a `**Status:**` line carrying a
number, an explicit plugin-or-not declaration, a named refutation/non-completion,
no coined tavern measure). `house-voice.test.ts` asserts only over its own
fixtures and captured arms — it does **not** score arbitrary package READMEs —
so this is a quality target, not a CI gate.

## Change

Create two new files. Do **not** edit any source, any `package.json` `files`
array, `ARCHITECTURE.md`, or the root `README.md` (the ARCHITECTURE/README
package-table omissions of jig-graph are the separate **D1** item in the same
plan). No `files` edit is required: `npm pack --dry-run` on `packages/glass`
(whose `files` is `["dist","agents","skills"]`, omitting README) shows
`README.md` in the tarball — npm always packs `README.md` regardless of `files`,
so `jig`/`jig-graph` (`files: ["dist"]`) will ship the new README to npm
untouched.

Follow the existing sibling shape (`packages/mint/README.md`,
`packages/flight/README.md`, `packages/core/README.md`): `# Moe <Name>` H1, a
one/two-sentence description, then `## CLI`, `## Layout`, `## Development`
sections. Layer in the house-voice discriminators that are both true and useful:
an explicit **Not a plugin.** line, a `**Status:**` line with a version number,
and the named non-completions for jig-graph.

### `packages/jig/README.md`

Outline and required content:

- **H1**: `# Moe Jig`
- **Opening line** (verb-phrase verdict, ≤12 words, no "This/The/A/It/is a…"
  opener): e.g. *"Turns prose-only moe skill conventions into deterministic CLI
  commands."* Follow with the package's own framing from its `description`:
  produces correct output regardless of which model or harness runs it.
- **`**Status:**` line** carrying the version: e.g. *"Published as
  `@bubstack/moe-jig` 0.1.4. Not a plugin — an npm-published CLI (see
  `ARCHITECTURE.md` §3)."* (Satisfies `counted-status` and
  `plugin-declaration`.)
- **`## CLI`** — a fenced `sh` block showing the two invocation forms
  (`moe-jig <…>` direct bin, and `moe jig <…>` via the dispatcher) and the ten
  command groups from `src/cli.ts`, e.g.:
  ```sh
  moe-jig worktree create <branch>
  moe-jig plan init <name>
  moe-jig spec init <name>
  moe-jig backlog add <title...>
  moe-jig backlog list --status open
  # also reachable through the dispatcher:
  moe jig backlog triage
  ```
  Then a "Run `moe-jig --help` and `moe-jig <group> --help` …" note (mirrors
  mint/flight). List the groups in prose: `worktree`, `plan`, `spec`, `review`,
  `commit`, `iterations`, `context`, `adr`, `progress`, `backlog`.
- **`## Extensions`** (jig-specific section) — one paragraph: jig probes for
  `@bubstack/moe-jig-graph/jig-extension` at startup and merges its commands into
  existing groups (e.g. `plan validate`, `plan seed`); missing/unresolvable
  extensions are silent, a name collision throws. Cite `src/extension.ts`
  behavior, not line numbers.
- **`## Layout`** — bullet the real `src/` files: `cli.ts` (commander surface),
  `backlog.ts` (durable backlog in `.moe/backlog/`), `parser.ts` +
  `worktree.ts` (plan parsing, wave computation, worktree gate), `extension.ts`
  (extension discovery contract, re-exported at `./extension`), plus
  `plan.ts`/`spec.ts`-family scaffolds (`scaffold.ts`, `progress.ts`,
  `review.ts`). Note the package exports `.`, `./parser`, `./extension`.
- **`## Development`** — fenced `sh` block:
  ```sh
  pnpm --filter @bubstack/moe-jig build
  pnpm --filter @bubstack/moe-jig typecheck
  pnpm --filter @bubstack/moe-jig test
  ```
- **Monorepo-fit closing line**: jig sits at L0 in the dependency topology
  (`ARCHITECTURE.md` §4), depends only on `commander`, and is one of the eight
  namespaces fronted by `bin/moe.js`.

### `packages/jig-graph/README.md`

Outline and required content:

- **H1**: `# Moe Jig-Graph`
- **Opening line** (verb-phrase verdict, ≤12 words): e.g. *"Grounds jig's plan
  commands in the moedex code graph."* Follow with: it is a **jig extension**,
  not a standalone CLI — it has no `bin` and is consumed only through
  `@bubstack/moe-jig`.
- **`**Status:**` line**: e.g. *"Published as `@bubstack/moe-jig-graph` 0.1.0.
  Not a plugin, and not a standalone binary — a jig extension."* (Satisfies
  `counted-status` + `plugin-declaration`.)
- **`## Commands`** — the two commands it adds to jig's `plan` group, shown as
  used through jig (install jig-graph alongside jig, then):
  ```sh
  moe jig plan validate <plan.md> [--json]
  moe jig plan seed <topic> [--entry <file>]
  ```
  Describe `validate`'s four warning-level checks (uncovered files, missing
  edges, wave conflicts, phantom files; never fails the process —
  cite `src/report.ts` "Findings are always 'warning' severity") and `seed`'s
  graph-grounded skeleton output.
- **Named non-completion** (house-voice `named-refutation`, truthfulness):
  a line stating `plan validate --manifest` is **not yet implemented** — the flag
  is advertised but its handler errors and exits 1 (`BL-b96fd965e2`). Do **not**
  mention `traceCalls`/`CallResult` (removed this release, `BL-a959e92b57`).
- **`## Requires moedex`** — the daemon at `MOEDEX_MCP_HTTP_ADDR` (default
  `http://127.0.0.1:8081`). State the degrade behavior explicitly: `validate`
  falls back to the phantom-files check and exits 0 when moedex is unreachable;
  `seed` hard-requires moedex and exits 1 without it. Cite `src/moedex.ts` /
  `src/jig-extension.ts`.
- **`## Layout`** — `src/jig-extension.ts` (the `commands` export consumed via
  `./jig-extension`), `src/moedex.ts` (`MoedexClient`), `src/validate.ts`
  (the four checks), `src/seed.ts` (skeleton generation), `src/report.ts`
  (`Finding` + formatting).
- **`## Development`** — fenced `sh` block:
  ```sh
  pnpm --filter @bubstack/moe-jig-graph build
  pnpm --filter @bubstack/moe-jig-graph typecheck
  pnpm --filter @bubstack/moe-jig-graph test
  ```
- **Monorepo-fit closing line**: depends on `@bubstack/moe-jig` (`workspace:*`)
  and `@modelcontextprotocol/sdk`; extends jig without jig depending on it (the
  edge is one-directional — jig probes for it optionally).

Keep both under ~60 lines. No coined tavern measures (house-voice
`closed-vocabulary`). Facts must match the cited source exactly.

## Files touched

- `packages/jig/README.md` — **(source, new)**
- `packages/jig-graph/README.md` — **(source, new)**

No SKILL.md, hook, or manifest changes. Neither package has a `mint/` dir and
neither appears in `/plugins/`, so **`pnpm mint` does not need to re-run and
`/plugins/` is not regenerated.** No `package.json` `files` array is edited (npm
auto-packs `README.md`).

## Acceptance

- Both files exist and open with a `# Moe Jig` / `# Moe Jig-Graph` H1 in the
  sibling shape (`## CLI`/`## Commands`, `## Layout`, `## Development`).
- Every factual claim is verifiable against the cited source: jig's ten command
  groups match `src/cli.ts`; jig-graph documents exactly `plan validate` and
  `plan seed` and no removed `traceCalls`/`CallResult`; the `--manifest`
  non-completion and the moedex-degrade behavior are stated.
- Both state **Not a plugin** explicitly and neither claims to be mint-generated.
- **`pnpm check`** green — biome does not lint Markdown (no `.md` handling in the
  biome config; confirmed inert), and no test asserts over these files'
  contents, so the change is inert to the Node gate but must not break it.
- **`pnpm mint:check`** green and unchanged — proves no `/plugins/` regeneration
  was triggered (the READMEs are not part of any plugin surface).
- `pnpm provenance` unaffected (no legal-metadata surface touched) — run it only
  as the release-wide gate, not because this item changes provenance.
- Tarball check: `cd packages/jig && npm pack --dry-run` lists `README.md`
  (and likewise for `jig-graph`) — confirms the README ships to npm with no
  `files` edit.
- Optional quality target (not a gate): `node packages/core/test/house-voice/
  score.mjs packages/jig/README.md packages/jig-graph/README.md` should score
  the five house-specific discriminators well (aim 4–5/5); it is advisory only.

No new automated test is required — there is no per-package README-content test,
and the guarded-surface list in `AGENTS.md` names none for these files. Do not
add one; the house-voice `score.mjs` is the existing instrument if a check is
ever wanted.

## Test plan

- Manual: run the two `npm pack --dry-run` commands above; confirm `README.md`
  appears in each tarball listing.
- Run `pnpm check` and `pnpm mint:check` from the repo root; confirm both stay
  green and `mint:check` reports no `/plugins/` diff.
- Advisory: run `score.mjs` against both new files and read the per-detector
  PASS/FAIL output; fix any FAIL on `plugin-declaration`, `counted-status`, or
  `named-refutation` (the three this spec explicitly designs for).
- Cross-check content against source: re-read `packages/jig/src/cli.ts` command
  registrations and `packages/jig-graph/src/jig-extension.ts` `commands` to
  confirm no command is invented or omitted.

## Sequencing & dependencies

- **Independent and parallelizable.** Doc-only, source-only, touches no shared
  surface; can land in parallel with every other 0.2.1 item.
- **Not gated by packaging P (`BL-d932811282`).** P wires the release
  `--execute` paths that republish complete *plugin* trees; jig and jig-graph are
  npm-published non-plugins, so P's manifest/LICENSE work does not apply to them.
  Their READMEs ride the standard npm tarball built by the release candidate/
  promote CLI (`publish.yml`), which packs each package dir (README auto-included).
- **Timing constraint:** merge to `main` **before the `v0.2.1` tag is cut** so the
  README is present in the published 0.2.1 tarballs. If it lands after the tag,
  npm shows the placeholder until the next version. This is the only ordering
  requirement.
- No dependency on the D1 ARCHITECTURE/README-count truthing item, though the
  two are complementary (D1 adds jig-graph to the repo-level tables; this adds
  the package-level READMEs). They can land in either order.

## Risks

- **Content drift / inaccuracy.** The main risk is documenting surface that does
  not exist or that is being removed this release (`traceCalls`/`CallResult`,
  `--manifest` as if working). Mitigation: the spec pins every command to its
  source and calls out the two non-completions explicitly; the reviewer
  re-reads `cli.ts` and `jig-extension.ts` per the test plan.
- **Version staleness.** The `**Status:**` line hardcodes `0.1.4` / `0.1.0`. If
  A#10 version reconciliation bumps jig or jig-graph in the same release, update
  the number in the same commit. Low impact (a stale patch number), but flag it.
- **Accidental scope creep** into the `files` array or root docs. Mitigation:
  the spec forbids those edits; npm auto-packing README is verified, so no
  `files` change is justified.
- **House-voice over-fitting.** Chasing all five `score.mjs` detectors could push
  the prose toward gaming a regex (e.g. an empty `**Status:**` number). The
  scorer "rewards form"; keep the content honest and useful first, treat the
  score as advisory.
