# Harness Neutrality 3: Crew, Installer, and Host UX

**Goal:** Make worker launch, consent, installation, and doctor behavior select
the intended harness deterministically without shared Claude state assumptions.

**Spec:** The user-supplied Harness-Neutrality Rescue Plan.

## Global Constraints

- Resolution order is worker override, command default, pack `defaultHarness`,
  `MOE_CREW_DEFAULT_HARNESS`, sole installed harness, otherwise exit 2 with
  valid installed choices.
- Per-worker pack values override every default source.
- Consent moves to Moe/XDG state with no legacy migration or fallback.
- Installer remains dry-run by default; manual-only `--apply` exits 2 without
  mutation.
- Registry data is dependency-free and shared by installer and generation
  checks.

### Task 1: Unify crew harness resolution and neutral state

**Files:**
- `packages/crew/src/cli.ts`
- `packages/crew/src/harness/*.ts`
- `packages/crew/src/core/paths.ts`
- `packages/crew/src/core/consent.ts`
- `packages/crew/src/core/packs.ts`
- `packages/crew/src/commands/launch.ts`
- `packages/crew/src/commands/pack.ts`
- `packages/crew/test/**/*.test.ts`
- `packages/crew/mint/*.yaml`
- generated crew plugin files via `pnpm mint`

**Interfaces:**
- One typed harness resolver accepts worker, command, pack, environment, and
  detected-install inputs and returns a harness or an exit-2 diagnostic.
- `MOE_CREW_PLUGIN_ROOT` precedes the bundle-relative root.
- Durable consent uses `$XDG_STATE_HOME` or `~/.local/state` under Moe ownership.

**Consumes:** `HarnessId`, driver registry, worker metadata/markers, pack schema,
CLI parsing, current consent callers.

**Produces:** Deterministic mixed-fleet routing, `defaultHarness`, neutral
consent/root lookup, controlled invalid-state errors, and help/marketplace prose
covering Claude, Codex, and Pi workers.

- [ ] Add precedence, ambiguity, corrupt-state, consent, and root tests.
- [ ] Implement the single resolver and state migration policy.
- [ ] Build and run the full crew suite; regenerate crew artifacts.

### Task 2: Route installer and doctor through the canonical registry

**Files:**
- new dependency-free shared registry under `bin/lib/`
- `bin/moe-install`
- `bin/moe-doctor`
- `bin/lib/probes.mjs`
- `bin/test/doctor.test.mjs`
- `bin/test/moe.test.mjs`
- mint registry/generation checks consuming the shared registry
- relevant README/help/generated install guides

**Interfaces:**
- `--harness <adapter-id>` plus unique-installed-harness selection.
- Canonical registry supplies current plugin names, repositories,
  harness-specific inclusion, automation mode, and manual instructions.
- Doctor hard requirements depend on the selected harness.

**Consumes:** Mint adapter registry/install docs, root marketplace entries, CLI
probe primitives.

**Produces:** Verified automated install/upgrade/uninstall only for supported
routes; manual-only plans that reject apply; no retired plugin names; selected
harness doctor output; side-effect-free dry runs.

- [ ] Add explicit/default/unique/ambiguous/manual-only/registry/dry-run tests.
- [ ] Extract and consume the canonical dependency-free registry.
- [ ] Implement truthful install and doctor routing.
- [ ] Run bin, mint, crew, repository, provenance, and reproducibility gates.
