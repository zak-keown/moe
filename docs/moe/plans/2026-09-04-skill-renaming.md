# Skill Renaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename 30 of the 41 skills under `packages/core/skills/` to short names, preserving import fidelity through a recorded `renamed_from` table.

**Architecture:** First install a rename-tolerant fidelity check (anchor the frozen imported literal on *upstream identities*, projected through `renamed_from ?? name`), proven against the one pre-existing rename. Then apply the rename as an atomic sweep — directories, frontmatter, the `skill-tiers.yaml` ledger, `moe.yaml` provenance, and every test-guarded reference — until the core suite is green. Then regenerate all eight plugins and clear the full gate. Then sweep the non-test-guarded references and verify no old name survives outside generated output.

**Tech Stack:** Node 24 ESM, pnpm 11 / turbo, `@bubstack/moe-mint`, vitest (`packages/core/test`), YAML ledger.

**Spec:** `docs/moe/specs/2026-09-04-skill-renaming-design.md`

## Global Constraints

- **Never hand-edit `/plugins/**`.** It is generated. Regenerate with `pnpm mint` (repo law #1).
- **New names are lowercase-hyphen**, distinct from every other skill and from known harness commands.
- **Cross-references are bare backticked names** — no `plugin:skill` prefix (guarded by `"no plugin-qualified skill reference survives"`).
- **`renamed_from` is the fidelity source of truth.** The frozen `expected` upstream-identity array in `metadata.test.ts` is the immutable anchor — it holds *upstream* names and must never be rewritten to new names.
- **`dir` name == frontmatter `name:` == `skill-tiers.yaml` key**, always, for every skill.
- **Multi-harness:** the rename lives only in source; `pnpm mint` regenerates all eight plugins. `pnpm mint:check` must stay byte-identical.
- **Bounded replacement:** when rewriting a reference, match an old name only when bordered by a non-`[A-Za-z0-9-]` character on both sides (backtick, slash, quote, space, EOL), so no old name is replaced inside a longer token.

## The rename map (canonical)

30 renamed, 11 kept. For every **imported** renamed skill, `renamed_from` = the old name (it equals the upstream identity, since none but `using-moe` was previously renamed). Authored skills carry no `renamed_from` (they are not in `imported:`).

| # | old name (dir + `name:` + key) | new name | tier | `renamed_from` |
|---|---|---|---|---|
| 1 | `test-driven-development` | `tdd` | imported | `test-driven-development` |
| 2 | `subagent-driven-development` | `sdd` | imported | `subagent-driven-development` |
| 3 | `verification-before-completion` | `verify-completion` | imported | `verification-before-completion` |
| 4 | `writing-plans` | `write-plan` | imported | `writing-plans` |
| 5 | `executing-plans` | `execute-plan` | imported | `executing-plans` |
| 6 | `using-git-worktrees` | `use-worktrees` | imported | `using-git-worktrees` |
| 7 | `finishing-a-development-branch` | `finish-branch` | imported | `finishing-a-development-branch` |
| 8 | `requesting-code-review` | `request-review` | imported | `requesting-code-review` |
| 9 | `receiving-code-review` | `receive-review` | imported | `receiving-code-review` |
| 10 | `writing-clearly-and-concisely` | `write-clearly` | imported | `writing-clearly-and-concisely` |
| 11 | `dispatching-parallel-agents` | `dispatch-agents` | imported | `dispatching-parallel-agents` |
| 12 | `writing-skills` | `write-skill` | imported | `writing-skills` |
| 13 | `working-with-claude-code` | `cc-config` | imported | `working-with-claude-code` |
| 14 | `developing-claude-code-plugins` | `cc-plugins` | imported | `developing-claude-code-plugins` |
| 15 | `finding-duplicate-functions` | `find-duplicates` | imported | `finding-duplicate-functions` |
| 16 | `using-tmux-for-interactive-commands` | `use-tmux` | imported | `using-tmux-for-interactive-commands` |
| 17 | `iterative-development` | `iterate` | imported | `iterative-development` |
| 18 | `extracting-requirements` | `extract-requirements` | imported | `extracting-requirements` |
| 19 | `scoping-the-simplest-core` | `scope-core` | imported | `scoping-the-simplest-core` |
| 20 | `running-an-iteration` | `run-iteration` | imported | `running-an-iteration` |
| 21 | `implementing-tasks` | `implement-tasks` | imported | `implementing-tasks` |
| 22 | `auditing-progress` | `audit-progress` | imported | `auditing-progress` |
| 23 | `improve-codebase-architecture` | `improve-architecture` | imported | `improve-codebase-architecture` |
| 24 | `resolving-merge-conflicts` | `resolve-conflicts` | imported | `resolving-merge-conflicts` |
| 25 | `retrieving-context` | `retrieve-context` | authored | — |
| 26 | `sequencing-plans` | `sequence-plans` | authored | — |
| 27 | `reviewing-a-codebase` | `review-codebase` | authored | — |
| 28 | `fixing-a-code-review` | `fix-review` | authored | — |
| 29 | `developing-for-moe` | `moe-dev` | authored | — |
| 30 | `smoothing-the-experience` | `smooth-experience` | authored | — |

**Kept (11):** `using-moe` (already `renamed_from: using-superpowers`), `brainstorming`, `systematic-debugging`, `mcp-cli`, `windows-vm`, `codebase-design`, `domain-modeling`, `prototype`, `docs-update`, `moe-discipline`, `merge-discipline`.

## Open Decisions

None open. The spec's three open questions were resolved on approval and must not be reopened:

- **Naming of coined initialism** — Resolution: `sdd` (fallback `drive-subagents` not taken).
- **Bikeshed rows** — Resolution: `cc-config`, `cc-plugins`, `moe-dev`.
- **Back-compat** — Resolution: clean break, no deprecation aliases.

## Not Yet Specified

- The exact boundary in Task 4 between a **live** reference (rewrite) and an **archival** one (leave, resolved through the `renamed_from` ledger). Sharpens to a concrete file list once Task 4's residual grep runs; the rule ("a closed/historical planning record may keep the old name; anything an agent still executes must be rewritten") is stated, the membership is not yet enumerable.

## Out of Scope

- Renaming skills in sibling packages (`moe-crew`, `moe-glass`, `moe-backstory`, `moe-memory`) — this plan is `packages/core/skills/` only.
- Any change to skill *behaviour*, `description`, or `triggers` prose beyond what the rename mechanically forces.
- Reviving a curation/tier split (retired 2026-09-01).

---

### Task 1: Install the rename-tolerant fidelity check

**Files:**
- Modify: `packages/core/test/metadata.test.ts` (the `tiers` type; the `expected` array's one `using-moe` entry; the assertion in `"accounts for every skill the six upstream sources shipped"`)
- Modify: `packages/core/skill-tiers.yaml` (`using-moe` entry gains `renamed_from`; header comment `27` → `32`)

**Interfaces:**
- Consumes: None
- Produces: an `imported` ledger whose keys may diverge from upstream names, with fidelity asserted via `imported[name]?.renamed_from ?? name`. Later tasks rely on this projection existing before they rename any key.

- [ ] **Step 1: Re-anchor the assertion and widen the type (RED change)**

In `packages/core/test/metadata.test.ts`, extend the `tiers` type so imported entries allow the field:

```ts
const tiers = parseYaml(readFileSync(join(PKG, "skill-tiers.yaml"), "utf8")) as {
  imported: Record<string, { from: string; why: string; renamed_from?: string }> | null;
  authored: Record<string, { from: string; why: string }> | null;
  // ...rest unchanged
};
```

In the test `"accounts for every skill the six upstream sources shipped"`, change the single array element `"using-moe"` to `"using-superpowers"` (its true upstream identity; keep the `// superpowers @ b36e082 (14) — using-superpowers renamed to using-moe` comment), and replace the final assertion with the projected form:

```ts
const upstreamIdentity = (key: string): string => imported[key]?.renamed_from ?? key;
// Anchored on UPSTREAM identities, never on current names: the array above is
// the immutable import fidelity record. A rename that omits `renamed_from`
// projects to its new name and fails here, exactly as a silent drop does.
expect(Object.keys(imported).map(upstreamIdentity).sort()).toEqual(expected);
```

- [ ] **Step 2: Run the test — verify it FAILS**

Run: `pnpm --filter @bubstack/moe-core test -- metadata`
Expected: FAIL in `"accounts for every skill the six upstream sources shipped"` — `using-moe` has no `renamed_from`, so it projects to `using-moe`, but `expected` now demands `using-superpowers`.

- [ ] **Step 3: Record the existing rename as data**

In `packages/core/skill-tiers.yaml`, add `renamed_from` to the `using-moe` entry and correct the stale count in the file header (`the 27 upstream skills` → `the 32 upstream skills`):

```yaml
  using-moe:
    from: imported
    renamed_from: using-superpowers
    why: >-
      The bootstrap. It is moe-mint's `bootstrap: { skill: }` target and the
      thing that makes every other skill fire at all.
```

- [ ] **Step 4: Run the test — verify it PASSES**

Run: `pnpm --filter @bubstack/moe-core test -- metadata`
Expected: PASS. `using-moe` now projects through `renamed_from` to `using-superpowers`; every other imported key still equals its upstream identity.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/metadata.test.ts packages/core/skill-tiers.yaml
git commit -m "test(core): anchor imported fidelity check on upstream identities via renamed_from"
```

---

### Task 2: Apply the atomic rename and sweep the test-guarded surface

Renames all 30 directories, frontmatter names, ledger keys, provenance paths, and every reference the core test suite guards — in one task, because a partial sweep fails the strict-marker and relative-link rules. The commit at the end leaves `pnpm mint:check` intentionally red (plugins not yet regenerated); Task 3 closes that.

**Files — RENAME the skill and its references (SURGICAL, per Ruling R3 — the tokens are overloaded across the corpus):**
- Rename (via `git mv`): the 30 directories in the map, under `packages/core/skills/`
- Modify: the `name:` frontmatter line in each of the 30 renamed `SKILL.md` files
- Modify: `packages/core/skill-tiers.yaml` (rename the 30 keys; add `renamed_from` to the 24 imported renames)
- Modify: `packages/core/mint/moe.yaml` — in `imported_works[*].artifact_roots`, rewrite `skills/<old>` PATH SEGMENTS only. **Do NOT touch the `- name: iterative-development` work-name field.**
- Modify: `packages/core/skills/**` — the `using-moe` "Skill Triggers" list, REQUIRED `SUB-SKILL`/`BACKGROUND` marker lines, relative markdown links into renamed dirs, backticked cross-refs to renamed skills
- Modify: every `skills/<old>/…` and `core/skills/<old>/…` PATH reference in live code/tests/config:
  - `packages/core/test/**` (parallel-execution-contract, resolved-resource-quoting, retrieving-context-contract, smoothing-*, the `iterative-development/` fixture tests, codebase-review-scripts, completion-evidence, update-docs, render-graphs, tmux-wrapper, finding-duplicate-functions, subagent-development-scripts, house-voice, …)
  - `packages/core/hooks/**` (plan-set, plan-set-notice, moe-completion-evidence, developing-for-moe-notice, hooks.json), `packages/core/agents/*.md`, `packages/core/scripts/validate_skill.py`, `packages/core/package.json`, `packages/core/vitest.config.ts`
  - `packages/mint/src/skill-runtime.ts`, `packages/mint/test/**` (core-semantics, assemble-artifact, cli)
  - `packages/jig/src/*.ts` (verify each hit is a skill ref before rewriting), `bin/lib/probes.mjs`, `packages/crew/skills/driving-claude-code-sessions/SKILL.md`

**Files — PRESERVE (untested; a wrong edit here is SILENT — hand-verified after the sweep):**
- `packages/core/test/metadata.test.ts` `expected` upstream-identity array and its upstream-naming comments (Ruling R1)
- `packages/core/mint/moe.yaml` `imported_works: - name: iterative-development`, and `NOTICE`'s "iterative-development" (WORK name ≠ skill dir)
- the `renamed_from:` VALUES in `skill-tiers.yaml` (they are the old names, on purpose)

**Files — LEAVE (archival / not-a-skill; Task 4 or never):**
- fixture DIR names: `packages/core/test/iterative-development/` (the dir stays — only skill-PATH refs *inside* its tests change), `packages/mint/test/fixtures/composed-plugin/skills/test-driven-development/`
- `biome.json` (`…/test/iterative-development/fixtures/**` is a fixture path), `.planning/**`, every package's `docs/history/**`, `CODEBASE-REVIEW.md`

**Interfaces:**
- Consumes: the `renamed_from` projection from Task 1
- Produces: a source tree whose 30 renamed skills carry new dir/`name:`/key everywhere the core suite reads, with `renamed_from` recording each imported old name

- [ ] **Step 1: Rename the directories**

For each row in the map, run `git mv packages/core/skills/<old> packages/core/skills/<new>`. Example (first three):

```bash
cd packages/core/skills
git mv test-driven-development tdd
git mv subagent-driven-development sdd
git mv verification-before-completion verify-completion
# …all 30 rows of the map
```

- [ ] **Step 2: Update each renamed skill's frontmatter `name:`**

In every renamed `SKILL.md`, set the frontmatter `name:` to the new name so `name:` matches its directory. Example:

```
# packages/core/skills/tdd/SKILL.md
name: tdd
# packages/core/skills/finish-branch/SKILL.md
name: finish-branch
```

Verify none was missed:

```bash
for d in packages/core/skills/*/; do
  n=$(basename "$d")
  grep -q "^name: $n$" "$d/SKILL.md" 2>/dev/null || echo "MISMATCH: $n"
done
```

Expected: no output.

- [ ] **Step 3: Rename the `skill-tiers.yaml` keys and record `renamed_from`**

In `packages/core/skill-tiers.yaml`, rename all 30 map keys to their new names. For each of the 24 **imported** renames, add `renamed_from: <old name>` (per the map). Authored entries get no `renamed_from`. Example:

```yaml
  sdd:
    from: imported
    renamed_from: subagent-driven-development
    why: >-
      writing-plans marks it "**REQUIRED SUB-SKILL**" ...
```

- [ ] **Step 4: Update provenance `artifact_roots` in `moe.yaml`**

In `packages/core/mint/moe.yaml`, under `imported_works`, rewrite every `skills/<old>` path segment in `artifact_roots` for the 24 imported renames to `skills/<new>`. Match with the `skills/` prefix so the replacement cannot touch the `- name: iterative-development` work-name key on the adjacent line — that names the upstream source, not the skill, and MUST stay. Authored skills do not appear in `imported_works`; leave them.

```bash
# after editing, no old imported dir path should remain:
rg -n "skills/(test-driven-development|subagent-driven-development|writing-plans|writing-skills|finishing-a-development-branch|working-with-claude-code|developing-claude-code-plugins|resolving-merge-conflicts)" packages/core/mint/moe.yaml
```

Expected: no output (spot-check across the imported renames).

- [ ] **Step 5: Sweep references in three passes (path-first, because paths are collision-free)**

The rename tokens are overloaded: bare `iterative-development` is a work name and a fixture-dir tree; the `expected` array holds bare old names as upstream identities. But the RENAME targets are overwhelmingly **path-prefixed** (`skills/<old>/`, `core/skills/<old>/`), and no work-name or anchor entry carries that prefix. So sweep paths first, bare names second (scoped), and residuals by hand.

**5a — PATH references (safe everywhere; this is the bulk).** For each renamed row, rewrite `skills/<old>/` → `skills/<new>/` and `core/skills/<old>/` → `core/skills/<new>/` across the live surface, excluding generated and archival trees. Illustrated for one row:

```bash
# writing-plans → write-plan, PATH form only:
rg -l --hidden -g '!plugins/**' -g '!node_modules' -g '!.planning/**' -g '!**/docs/history/**' -g '!docs/moe/**' -g '!.moe/**' \
   '(^|[^A-Za-z0-9-])(skills/writing-plans/|core/skills/writing-plans/)' . \
  | xargs sed -i '' -E 's#(skills/)writing-plans/#\1write-plan/#g; s#(core/skills/)writing-plans/#\1write-plan/#g'
```

This form cannot hit `- name: iterative-development` (no `skills/` prefix) or the `expected` array entries (bare, unslashed). It DOES correctly rewrite the `test/iterative-development/` fixture tests' `skills/extracting-requirements/scripts/…` constants while leaving the fixture directory name itself alone.

**5b — BARE-name cross-refs, scoped to `packages/core/skills/**` prose only.** Backticked cross-refs, REQUIRED `SUB-SKILL`/`BACKGROUND` marker lines, and the `using-moe` "Skill Triggers" list use bare names. Confine the bare-name rewrite to `packages/core/skills/**` markdown — the anchor array and work-names live in `test/` and `moe.yaml`, never under `skills/`, so a skills-scoped bare sweep cannot reach them:

```bash
# writing-plans → write-plan, bare token, skills prose only:
rg -l --hidden 'writing-plans' packages/core/skills \
  | xargs sed -i '' -E 's/([^A-Za-z0-9-]|^)writing-plans([^A-Za-z0-9-]|$)/\1write-plan\2/g'
```

**5c — residual LIVE bare-name refs, by hand.** A few live non-skills files name a skill bare, not by path (e.g. `bin/lib/probes.mjs`'s user-facing "… and the `using-tmux-for-interactive-commands` skill", `packages/core/agents/*.md`). Enumerate and fix case by case, rewriting only genuine skill references and NOT the preserve targets:

```bash
rg -n --hidden -g '!plugins/**' -g '!node_modules' -g '!.planning/**' -g '!**/docs/history/**' -g '!docs/moe/**' -g '!.moe/**' \
   '(using-tmux-for-interactive-commands|retrieving-context|smoothing-the-experience|developing-for-moe|finding-duplicate-functions|working-with-claude-code|developing-claude-code-plugins)' \
   bin packages/core/hooks packages/core/agents packages/mint/src packages/jig/src packages/crew/skills
```

**Guard the three untested hazards.** After the three passes, confirm they are byte-unchanged:

```bash
git diff -- packages/core/test/metadata.test.ts | rg -n '^\+.*"(subagent-driven-development|writing-plans|iterative-development)"' && echo "ANCHOR TOUCHED — REVERT" || echo "anchor OK"
rg -n '^\s*- name: iterative-development' packages/core/mint/moe.yaml   # must still print
rg -n 'iterative-development' NOTICE                                     # work name must still print
```

Expected: `anchor OK`; the `- name: iterative-development` line still present; `NOTICE` still names the work.

- [ ] **Step 6: Run the core AND mint suites — verify they PASS**

Task 2 edits both `packages/core` and `packages/mint`, so gate both (the base is 534/534 green in core; do not regress it):

```bash
pnpm --filter @bubstack/moe-core test && pnpm --filter @bubstack/moe-mint test
```

Expected: PASS — including `"accounts for every skill the six upstream sources shipped"` (keys project to upstream identities), `"accounts for every skill on disk in exactly one of the two maps"` (keys == frontmatter names == dirs), the three cross-reference tests, the `REQUIRED SUB-SKILL` count test, `resolved-resource-quoting`, `parallel-execution-contract`, `retrieving-context-contract`, the `iterative-development/` fixture tests, and mint's `core-semantics`. A failing test names the unresolved old token and file — fix that reference and re-run. (`repository-skill-runtime` runs in Task 3's full gate.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(core): rename 30 skills to short names; record renamed_from"
```

---

### Task 3: Regenerate all eight plugins and clear the full gate

**Files:**
- Regenerate (never hand-edit): `plugins/**` via `pnpm mint`
- Modify: remove the four Task-2 `STALE_GENERATED_*` shims now that `plugins/` carries the new names — `packages/core/test/metadata.test.ts`, `packages/core/test/resolved-resource-quoting.test.ts`, `packages/core/test/smoothing-the-experience-contract.test.ts`, `packages/core/test/retrieving-context-contract.test.ts`
- Verify only: `.claude-plugin/marketplace.json` (regenerated if mint owns it)

**Interfaces:**
- Consumes: the renamed source tree from Task 2, and its four `STALE_GENERATED_*` shims (removed here)
- Produces: generated plugins consistent with the new names across all eight harnesses; test files that assert the new names directly (no shim); a fully green Node gate

- [ ] **Step 1: Regenerate the plugins**

Run: `pnpm mint`
Expected: completes with no error; `git status` shows changes under `plugins/**` reflecting the new skill names.

- [ ] **Step 1b: Remove the four STALE_GENERATED shims**

Task 2 kept `plugins/` un-regenerated, so four tests temporarily mapped new→old names when comparing the source set against the generated root. Now that Step 1 regenerated `plugins/` with the new names, that mapping is wrong and must go. In each of the four files, delete the `STALE_GENERATED_*` table and the `?? name` translation so the assertion compares the source names to the generated names **directly** (revert that test's comparison to its pre-shim shape, but keeping the new names). Then confirm none remains:

```bash
rg -n 'STALE_GENERATED|deliberately NOT regenerated' packages/core/test packages/mint/test || echo "no shims remain ✓"
```

Expected: `no shims remain ✓`. If a test now fails, it means the generated root and the source disagree — a real rename miss to fix in source, NOT a reason to keep the shim.

- [ ] **Step 2: Commit the regen + shim removal together**

```bash
git add -A plugins .claude-plugin packages/core/test
git commit -m "chore(mint): regenerate plugins for renamed skills; drop stale-name shims"
```

- [ ] **Step 3: Verify the mint gate is byte-identical**

Run: `pnpm mint:check`
Expected: PASS — a second `pnpm mint` produces no diff, proving the committed `/plugins/` matches the source exactly.

- [ ] **Step 4: Verify provenance**

Run: `pnpm provenance`
Expected: PASS — the updated `artifact_roots` resolve and license/attribution payloads validate.

- [ ] **Step 5: Run the full Node gate**

Run: `pnpm check`
Expected: PASS — lint, typecheck, and every package's tests, including `packages/mint/test/repository-skill-runtime.test.ts` (`"every registered plugin passes skill runtime validation with zero diagnostics"`) and `checkMarketplace()`.

- [ ] **Step 6: Commit any residual formatting**

```bash
git add -A && git commit -m "chore: gate-clean after skill rename" --allow-empty
```

---

### Task 4: Sweep non-test-guarded references and verify no old name survives

**Files:**
- Modify: live references to renamed skills outside the Task 2 surface — other packages' skill prose that invokes a core skill by name, the wave/orchestration skills, hook-injected text under `packages/core/hooks/**`, and root docs (`AGENTS.md`, `CONTRIBUTING.md`, `README.md`) where they name a renamed skill
- Leave (record, do not rewrite): closed/archival planning records under `.planning/**` and the design/plan docs under `docs/moe/**` that intentionally quote the old names as history

**Interfaces:**
- Consumes: the `renamed_from` ledger (old→new source of truth) from Tasks 1–2
- Produces: a repository where no old skill name resolves to a live instruction outside generated output

- [ ] **Step 1: Enumerate residual old names**

```bash
for old in tdd-src; do :; done   # placeholder guard; use the real list below
rg -n --hidden -g '!plugins/**' -g '!node_modules' \
  '(^|[^A-Za-z0-9-])(test-driven-development|subagent-driven-development|verification-before-completion|writing-plans|executing-plans|using-git-worktrees|finishing-a-development-branch|requesting-code-review|receiving-code-review|writing-clearly-and-concisely|dispatching-parallel-agents|writing-skills|working-with-claude-code|developing-claude-code-plugins|finding-duplicate-functions|using-tmux-for-interactive-commands|iterative-development|extracting-requirements|scoping-the-simplest-core|running-an-iteration|implementing-tasks|auditing-progress|improve-codebase-architecture|resolving-merge-conflicts|retrieving-context|sequencing-plans|reviewing-a-codebase|fixing-a-code-review|developing-for-moe|smoothing-the-experience)([^A-Za-z0-9-]|$)' \
  . | grep -v -E '^\.planning/|^docs/moe/(specs|plans)/' 
```

Expected: a review list of live references (the `grep -v` drops the intended-archival paths).

- [ ] **Step 2: Rewrite the live references**

For each file the enumeration surfaces (excluding the archival paths), rewrite old→new bounded per the map. Any reference inside `metadata.test.ts`'s `expected` array is not in scope (it is an upstream identity) — the `packages/core/test` path is already clean from Task 2.

- [ ] **Step 3: Verify no live old name survives**

Re-run the Step 1 command.
Expected: only intended-archival matches remain (or none). Record in the commit message which archival files were deliberately left, noting the `renamed_from` ledger resolves them.

- [ ] **Step 4: Re-run the gate and commit**

```bash
pnpm check
```

Expected: PASS.

```bash
git add -A
git commit -m "docs: update live references to renamed skills; archival left per renamed_from ledger"
```

---

## Self-Review

**1. Spec coverage.**
- Convention + full 30-row mapping → the map table + Task 2. ✓
- `renamed_from` fidelity mechanism + re-anchored `metadata.test.ts` → Task 1. ✓
- Count stays 32 / membership unchanged → Task 1 leaves the completeness and count tests untouched; Task 2 renames keys but not membership. ✓
- Provenance `artifact_roots` → Task 2 Step 4; validated Task 3 Step 4. ✓
- `_shared` relative links + REQUIRED markers + `using-moe` triggers → Task 2 Step 5. ✓
- Atomic sweep (no partial-green on guarded surface) → Task 2 is one task. ✓
- Regenerate all eight plugins / `mint:check` byte-identical → Task 3. ✓
- Clean break, no aliases → Open Decisions (resolved); no alias task exists. ✓
- Cross-reference sweep beyond the guarded surface → Task 4. ✓
- Collision check → Task 3 Step 5 (`checkMarketplace`, runtime validation) plus the distinctness asserted in the spec's map.

**2. Placeholder scan.** Step 1 of Task 4 carries a `# placeholder guard` no-op line purely to flag that the real name list is the `rg` alternation directly below it; the executable command is complete. No `TBD`/`TODO`/"handle edge cases" remain.

**3. Type consistency.** `renamed_from?: string` is introduced in Task 1 and consumed by the same `imported[key]?.renamed_from ?? key` projection referenced in Task 2. Ledger key == frontmatter `name:` == dir is asserted in Task 2 Step 2 and Step 6.

**4. Decision vs task.** All three spec decisions are resolved and recorded under Open Decisions; none blocks a task, so no task carries a `Blocked by:` line. The one item of genuine fog (live-vs-archival boundary) is in Not Yet Specified, not invented into a step.

**5. Execution metadata.** Every task has `Files:`, `Interfaces:`, `Consumes:`, `Produces:`. Task 1 `Consumes: None`. No task depends on an interface another task does not `Produce`.
