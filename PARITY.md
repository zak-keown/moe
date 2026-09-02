# Imported-work ledger

This is Moe's compact internal provenance record. It identifies every imported
work, the frozen revision used, its legal status, and the destination that
contains it. Product documentation describes Moe itself; explicit lineage
belongs here and in the root `NOTICE`.

The gitignored snapshots under `../.moe-references/` are the comparison
baseline. They are frozen inputs, not dependencies and not an upstream-sync
mechanism.

## Map

| Upstream repo | Pinned | Date | License status | Destination |
|---|---:|---:|---|---|
| `superpowers` | `b36e082` | 2026-08-12 | MIT | `packages/core` |
| `superpowers-lab` | `51111f7` | 2026-06-01 | MIT | `packages/core` |
| `superpowers-developing-for-claude-code` | `74afe93` | 2025-12-03 | MIT declared in metadata and README; referenced license file absent | `packages/core` |
| `iterative-development` | `c05889a` | 2026-06-06 | Apache-2.0 | `packages/core` |
| `the-elements-of-style` | `05fc4f0` | 2026-08-12 | Public domain | `packages/core` |
| `double-shot-latte` | `dfe7567` | 2026-02-25 | MIT | `packages/core` |
| `mattpocock-skills` | `6654f6b` | 2026-08-24 | MIT | `packages/core` |
| `open-gsd/gsd-core` | `05092ff3` | 2026-09-01 | MIT | ten references in `packages/core` |
| `greenfield` | `6e6d4b4` | 2026-08-06 | Apache-2.0 | `packages/backstory` |
| `episodic-memory` | `1075769` | 2026-05-21 | MIT | `packages/memory` |
| `private-journal-mcp` | `016953f` | 2026-08-11 | MIT | `packages/memory` |
| `gauntlet` | `91b6f7e` | 2026-08-06 | Apache-2.0 | `packages/flight` |
| `superpowers-evals` | `114f725` | 2026-08-25 | No license grant located | five bridgehead files in `packages/flight` |
| `everyharness` | `4f7c5e2` | 2026-08-15 | MIT | `packages/mint` |
| `everyharness-container` | `2467bd7` | 2026-08-11 | MIT | `infra/container` |
| `claude-session-driver` | `d97d1eb` | 2026-06-14 | MIT | `packages/crew` |
| `ccstatusline` | `83c8ffd` | 2026-09-02 | MIT | `packages/statusline` |
| `superpowers-chrome` | `782358e` | 2026-08-07 | MIT | `packages/glass` and a vendored subset in `packages/flight` |
| `obol` | `28e3dba` | 2026-08-06 | Apache-2.0 with NOTICE | `packages/tab` |
| `smevals` | `0c28dc6` | 2026-08-11 | MIT | `py/proof` |
| `superpowers-marketplace` | `1ab7b8e` | 2026-08-12 | MIT | `.claude-plugin/marketplace.json` |
| `prime-radiant-marketplace` | `49a45ef` | 2026-06-06 | Apache-2.0 | `.claude-plugin/marketplace.json` |

### Excluded

| Upstream repo | Pinned | Reason |
|---|---:|---|
| `superpowers-autoresearch` | `6e6f33f` | Reference data only; not imported and not distributed |

## Legal source and distribution rule

- Root `LICENSE` is the canonical Apache-2.0 text.
- Root `LICENSE-MIT` is the canonical MIT text and copyright-notice set.
- Root `NOTICE` is the complete attribution register and carries the retained
  `obol` notice.
- Installable plugin `LICENSE` files are generated from those canonical root
  sources by `scripts/mint-plugins.mjs`; generated copies are distribution
  payloads, not independently maintained legal text.
- Historical evidence may retain original names and URLs under `docs/history`,
  tests, fixtures, and `.planning`.

## Imported reference set

`open-gsd/gsd-core` contributed ten MIT-licensed reference documents: nine
debugger references under `packages/core/skills/systematic-debugging/` and
`security-asvs-levels.md` under
`packages/core/skills/requesting-code-review/references/`. No skill or runtime
from that project was imported.

## Vendored build artifacts

### ccstatusline

`packages/statusline/vendor/ccstatusline/ccstatusline.js` is the published npm
build artifact (`dist/ccstatusline.js`), not a build from source — upstream's
`dist/` is gitignored in their repo, so there is no buildable source snapshot
to pin the way the other rows in the Map above do. It is pinned by both ends:
the `83c8ffd` row above is the upstream git tag `v2.2.27` the artifact was
built from, and the artifact itself is additionally identified by the npm
registry's own integrity hash for that exact version —
`sha512-8SqNdSuIaMsrefn4dCrSlBEZ7kE8UZMMa8iy4iv4OMl1INnEtmqzCYMwo7/hzmNrOVC+esFSiCj+T0pUS9HrLQ==`
(`ccstatusline@2.2.27`, shasum `7735c0ec431b01804c691be9c1d80ba108deed13`). The
bundle has zero production dependencies (verified against its `package.json`:
everything it needs — React, Ink, zod, etc. — is bundled in at upstream's own
build step), so vendoring the artifact carries no transitive dependency
surface beyond what is already checked in.

## Known legal exceptions

### Declared MIT with a missing file

`superpowers-developing-for-claude-code` declares `MIT` in its plugin metadata
and says “MIT License — See LICENSE file” in its README, but the pinned revision
contains no such file. Moe carries the standard MIT terms and Jesse Vincent
copyright notice used by the related imported works. That is a conservative
packaging decision, not a substitute for legal review of the incomplete
upstream grant.

### Unlicensed bridgehead in flight

`superpowers-evals` contains no `LICENSE` and no package license field. Moe
imports five files from it: three implementation files under `src/lab` and two
tests.

The existing decision remains in force: the material is accepted for internal
use only and `@bubstack/moe-flight` is not distributable. These controls are
load-bearing:

- `packages/flight/package.json`, `packages/flight/ui/package.json`, and
  `packages/flight/dashboard/package.json` retain `"private": true`;
- flight remains absent from `.claude-plugin/marketplace.json`;
- no publish workflow may include flight or an artifact containing its
  bridgehead files.

Publishing, open-sourcing, or sending those files outside the company requires
separate legal review first. Silence from the upstream license request grants
nothing.

## Change notices

Imported Apache-2.0 material has been modified. Root `NOTICE` carries the
repository-level statement of changes, and pertinent source-file notices must
not be removed. The exact form needed for Apache-2.0 section 4(b) remains a
counsel-review item; a branding cleanup must never silently weaken it.
