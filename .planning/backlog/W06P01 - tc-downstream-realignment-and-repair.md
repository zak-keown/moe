---
slug: tc-downstream-realignment-and-repair
title: TC Downstream Realignment And Completion Repair
idea: |
  - Make origin the committed @tc downstream of the neutral mirror, publish a
    coherent TC release train to ProGet, and finish the acceptance criteria the
    completion audit found missing
status: done
size: XL
estimate: 40-55 h
depends_on: []
blocks: []
conflicts_with: []
touches:
  - ARCHITECTURE.md
  - .planning/REQUIREMENTS.md
  - package.json
  - packages/
  - bin/
  - scripts/
  - .gitlab-ci.yml
  - .claude-plugin/marketplace.json
  - plugins/
decision_needed: no
---

# TC Downstream Realignment And Completion Repair

## Completion result (2026-09-01)

All implementation workstreams are built and committed in the TC downstream.
The downstream release and capability work landed in `1c00797`; the separable
generic repairs landed as `a5dd111`, `5e3b64f`, and `e49886c` on local branches
from the recorded mirror base and were integrated through merge commits
`6384a8e`, `9f72e23`, and `134a9a2`. Those neutral candidate branches remain
local and unpushed for Zak's separate upstream excision work.

The complete eight-artifact `@tc/*` train packs successfully, and the umbrella
package passes empty-prefix install, status, doctor, namespace dispatch, MCP
initialization, and uninstall acceptance.
The ProGet publishing path is implemented and policy-tested; no package was
actually published as part of this repair. The Node gate, generated-plugin
check, provenance check, downstream-scope guard, drift manifest, Rust/Python
bindings, proof suite, tracing acceptance, and focused behavioral contracts all
pass. Follow-up repairs `f87e3c7`, `e7b7131`, `e9918d2`, and `a0f66fb` close the
DAG invocation, governance-nudge, context-routing, and cold-clone timeout defects
found by the second audit. Native Windows and the neutral-upstream history work
remain explicitly out of scope. A real WSL2/ProGet install, push, GitLab pipeline
and internal publish are still external acceptance events, itemized in
`.planning/backlog-acceptance-2026-09-01.md`.

## Goal

Turn this repository into the auditable TC downstream of `mirror`, publish every
installed artifact as a tested `@tc/*` release through ProGet, and close the
load-bearing gaps found by the 2026-09-01 completion audit. A green legacy test
suite is necessary but not sufficient: this phase finishes when the promised
user flows work from a clean environment.

The governing contracts are `ARCHITECTURE.md` under **“Upstream and
TC-downstream distribution”** and `.planning/REQUIREMENTS.md`. Where an older
backlog document conflicts, those two win.

## Preconditions

1. **Decoupled by Zak on 2026-09-01.** The separate neutral-upstream excision
   remains his work and does not block this downstream repair. The first TC
   train records the exact current `mirror/main` snapshot
   `54b4ec6c54540d472835c1e074e7e7c8e6469329`; it does not claim the later
   excision already happened.
2. The existing ProGet `@tc` feed and protected `PROGET_NPM_AUTH` variable are
   available. Never copy credentials from CI-template source into this repo.
3. Generic work below branches from that recorded upstream snapshot on isolated
   local branches. Those commits remain separable for the later upstream work;
   TC-only work belongs only to `origin/main`.

## Workstream A — establish the downstream identity

1. Re-scope every publishable package and every runtime dependency from
   `@bubstack/*` to `@tc/*` in this downstream source tree.
2. Update mint source YAML, marketplace registry entries, generated install
   metadata, CLI messages, documentation, and tests. Regenerate `/plugins/`
   only through `pnpm mint`; never edit it directly.
3. Add a machine-readable upstream-base record containing the exact
   `mirror/main` SHA and upstream version used by the current TC release.
4. Add a guard that fails when a shipped downstream artifact refers to an
   installable `@bubstack/*` package or when package versions are not lockstep.
5. Preserve imported-work provenance and legal payloads; scope changes do not
   change the source or license of imported work.

## Workstream B — build the release train

1. Create the publishable `@tc/moe` umbrella CLI. It owns `moe`, `moe-install`,
   and `moe-doctor` and exposes `npx @tc/moe install`.
2. Derive `X.Y.Z-tc.N` from the recorded upstream release, publish all TC
   packages in one train, and embed the upstream SHA in inspectable metadata.
3. Follow TC's established ProGet method: configure `@tc` through the protected
   auth variable, pack before publish, use `next` for branch/MR builds, and let
   only the default branch move `latest`.
4. Make publish depend on install, lint, typecheck, test, build,
   `pnpm mint:check`, and `pnpm provenance`. A partial package train must not
   become visible as `latest`.
5. Test the publish policy without sending packages: assert registry, scope,
   version, package set, dependency rewrites, and dist-tag selection from dry-run
   or packed artifacts.

## Workstream C — finish the generic completion gaps upstream-first

1. **Installer and dispatcher:** remove the superseded migration requirement;
   support macOS/Linux/WSL2; install all three CLI entries on PATH; report
   namespace presence/absence; cover install, upgrade, uninstall, and a clean
   home. Native Windows stays deferred.
2. **Completion evidence:** make gitignored repo-local `.audit/` the default,
   retain an explicit home-store escape, and add behavioral tests for transcript
   parsing, command/exit/output capture, warnings, and firing counts.
3. **Context routing:** promote `retrieving-context` to core and document the
   deliberate authored-skill tier exception in the registry and its guard.
4. **Parallel execution:** fail closed to sequential execution unless file
   ownership, handoff interfaces, and one-worktree-per-worker isolation all hold.
   Remove the contradictory non-isolated parallel rung.
5. **Review scripts:** add direct behavioral regression coverage for review
   scoping, merging, and disposition stamping rather than relying only on parse
   checks and historical GREEN-run prose.

Merge the resulting neutral upstream commits into `origin/main` before applying
the TC-only workstream below. Do not reimplement or cherry-pick the same patch on
both sides.

## Workstream D — finish the TC-only capabilities

1. Add watch-only drift rows for `ai/aigovernance` and `ai/tc-guide`.
2. Keep the SessionStart governance check non-blocking by default. Add blocking
   `PreToolUse` enforcement only behind an explicit opt-in setting, with tests
   proving both modes and the fail-open default.
3. Build `packages/core/skills/tracing-across-the-stack/SKILL.md` in the
   everything tier:
   - CodeGraph `Route` search plus `graph_trace(operation: "impact")` is the
     endpoint-to-UI baseline.
   - convention-led Grep over selectors/effects/services is the degraded path
     and must state what it cannot prove.
   - Moedex trace/impact tools are an optional enhancement when present.
   - `consumers` is explicitly rejected for the verified Route case, and NgRx
     convention matches are never described as graph-proven edges.
4. Run the known-good endpoint trace and a no-CodeGraph negative case literally
   from the skill instructions. Record commands, results, tool availability, and
   SHA.

## Workstream E — reconcile the record

Update the historical backlog without rewriting history:

- WSL2 is supported; native Windows is deferred.
- MCP-key migration is canceled, not missing.
- The 17 TC skills are declined/superseded, not completed.
- `retrieving-context` is core by explicit exception.
- repo-local evidence is the default; the home store is an escape.
- governance is a nudge by default and blocking only when opted in.
- cross-stack tracing is not described as built until its skill and acceptance
  evidence exist.

Use quoted decisions, symbols, and test names for citations. Do not use line
numbers that will go stale during the re-scope.

## Dependency shape

```text
Zak records neutral mirror base
            |
            v
generic upstream repairs -----> merge upstream into origin
                                      |
                     +----------------+----------------+
                     v                                 v
          downstream re-scope/release          TC-only capabilities
                     +----------------+----------------+
                                      v
                         record reconciliation
                                      |
                                      v
                         clean-environment acceptance
```

The generic and TC-only branches may run concurrently only after the neutral
base is recorded and only under the worktree-isolation rule. The final release
train waits for both.

## Verification

1. `git merge-base origin/main mirror/main` equals the recorded upstream base or
   an explicitly documented later upstream merge; generic changes are visible in
   both histories and TC-only changes only in `origin`.
2. No publishable downstream package, generated plugin, marketplace entry, CLI
   help surface, or install instruction refers to an installable
   `@bubstack/*` artifact.
3. Packed artifacts all carry one `X.Y.Z-tc.N` version, the recorded upstream
   SHA, internal `@tc/*` dependency edges, and the expected ProGet registry.
4. A branch dry run selects `next`; a default-branch dry run selects `latest`;
   a failing prerequisite gate prevents the publish job.
5. From a clean home with the TC scope configured,
   `npx @tc/moe install` makes `moe`, `moe-install`, and `moe-doctor` runnable;
   upgrade and uninstall leave no stale TC package or shim.
6. The evidence-hook, governance-mode, review-script, dispatcher, parallel-gate,
   and tracing behavioral suites pass in addition to `pnpm check`,
   `pnpm mint:check`, and `pnpm provenance`.
7. Generated `/plugins/` is byte-identical to a fresh `pnpm mint`, and the
   worktree is clean after every gate.

## Explicitly out of scope

- Rewriting or purging the existing `mirror` history; Zak owns that separately.
- Native Windows support.
- Retired MCP-key migration or compatibility aliases.
- Porting the 17 `tc-*` skills.
- Publishing any `@tc/*` artifact publicly.
- Making Moedex mandatory for context retrieval or cross-stack tracing.
