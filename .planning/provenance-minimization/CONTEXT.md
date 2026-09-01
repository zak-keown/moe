# Provenance minimization — working context

**Status:** Implemented and verified  
**Started:** 2026-09-01

## Goal

Make Moe stand on its own in every user-facing surface while retaining the
minimum legal attribution and a compact internal provenance record.

The intended result is:

- no user-facing description of Moe as a Superpowers fork;
- no Superpowers or `obra` branding in READMEs, install material, manifests,
  help text, runtime messages, or other shipped documentation;
- root `NOTICE` as the sole explicit ecosystem-lineage register;
- one canonical, hand-maintained source for required license text and copyright
  notices;
- correct legal payloads generated into every independently distributed
  artifact, without hand-maintained duplicate license files;
- no legacy Superpowers namespace, path, or data-migration support.

## Decisions already made

1. Optimize for zero **user-facing** lineage mentions, not literal removal from
   every internal record.
2. Keep a compact internal provenance record for auditability.
3. Preserve the existing `superpowers-evals` internal-use risk decision and its
   no-distribution controls. Removing or independently replacing that material
   is out of scope for this work.
4. Do not retain migration guidance or compatibility behavior for old
   Superpowers paths and identifiers.
5. This work does not use a Moe roadmap or phase-directory workflow. This
   directory is the standalone planning workspace.

## Working surface boundary

Treat these as user-facing unless the inventory proves otherwise:

- root and package READMEs;
- package metadata and generated plugin manifests;
- marketplace and installation documentation;
- CLI help, diagnostics, runtime UI, and migration messages;
- documentation, examples, and comments copied into an installed plugin or
  published package.

Internal tests, fixtures, historical records, and provenance evidence are not
automatically in scope merely because they contain an upstream name. They are
in scope if they are shipped, rendered to users, or keep a user-facing claim
alive.

## Repository constraints

- Never hand-edit `plugins/`; change package mint inputs or generation code and
  regenerate with `pnpm mint`.
- Preserve legally required copyright, license, attribution, and modification
  notices. They should be brand-minimal, not removed blindly.
- Treat concurrent and unfamiliar changes as user-owned.
- Do not weaken the `@bubstack/moe-flight` private/no-distribution controls.
- Update `PARITY.md` when an imported file, provenance rule, rebrand token, or
  license treatment changes.

## Resolved design findings

- Generated installable plugin directories now contain license payloads derived
  from the root legal files and the package destinations in `PARITY.md`.
- Hand-maintained package license copies were removed. Root `LICENSE` and
  `LICENSE-MIT` are canonical; copies exist only at distribution boundaries.
- Current READMEs and product surfaces no longer call out imported lineage.
- The provenance gate cross-checks `NOTICE` and `PARITY.md` and checks generated
  plugin terms. The temporary branding scan passed and was then removed; it is
  not a long-term repository policy.

## Remaining legal-review findings

- Apache-derived modified files need a consistent, counsel-reviewed way to
  state that they were changed without repeating ecosystem lineage.
- One pinned upstream declares MIT in metadata and prose but points to a
  nonexistent license file; its treatment needs explicit review rather than an
  inferred silent repair.
- The five unlicensed bridgehead files in Flight remain internal-only and
  non-distributable under the existing risk decision.

## Verification completed

- `pnpm check`
- `pnpm proof:test`
- `pnpm bin:test`
- `pnpm tab:test`
- `pnpm provenance`
- direct, byte-identical rerun of `scripts/mint-plugins.mjs`
- `npm pack --dry-run --json` for memory and glass, confirming `dist/LICENSE`
  and no history/test/source payloads
