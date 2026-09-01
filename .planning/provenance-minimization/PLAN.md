# Provenance minimization — implementation plan

## Outcome

Moe presents itself as an independent product. Explicit ecosystem lineage is
confined to the root legal/provenance records; installable artifacts receive
the license material their contents require; obsolete namespace migration
behavior is removed.

## Work

1. **Canonical legal source**
   - Keep the Apache-2.0 text once at root `LICENSE`.
   - Add one canonical MIT text at root, with the copyright notices represented
     in `NOTICE`.
   - Collapse `PARITY.md` to the pinned-source and license-risk ledger.
   - Rewrite `NOTICE` as the complete imported-work attribution register.
   - Remove hand-maintained package-level copies of standard license texts.

2. **Artifact legal payloads**
   - Derive each plugin's imported works from package destinations in
     `PARITY.md`, without maintaining a second source-name list.
   - Generate a deterministic `LICENSE` into every plugin from the canonical
     root texts and `NOTICE` data.
   - Extend the provenance gate to verify ledger/NOTICE completeness and
     generated plugin licenses.

3. **Product documentation**
   - Rewrite the root architecture and package READMEs around current behavior,
     commands, layout, and verification—not import history.
   - Remove lineage language from current contributor docs, metadata,
     changelogs, and active technical documentation.
   - Leave `docs/history`, tests, fixtures, and `.planning` alone unless they
     leak into a shipped artifact; collapse the skill registry's repeated
     source names to `from: imported`.

4. **Runtime cleanup**
   - Remove old data-directory discovery and migration messages.
   - Remove the deprecated journal environment alias and upstream-sidecar
     import command.
   - Remove user-facing upstream names from CLI errors and help.
   - Keep normal database/schema migrations; they are product upgrades, not
     ecosystem migration support.

5. **Generated output and guards**
   - Regenerate `/plugins/`; never edit it directly.
   - Run a one-time forbidden-lineage scan, then remove that temporary guard
     after the cleanup passes.
   - Preserve `@bubstack/moe-flight` private/no-distribution controls and the
     documented unlicensed-code risk decision.

## Verification

- `pnpm provenance`
- affected package tests and typechecks
- `pnpm mint`
- `pnpm mint:check`
- `pnpm check`
- final repository occurrence and license-file inventories

All verification above passed. Because the generated plugin changes are not
yet committed, `pnpm mint:check` would compare them to the old `HEAD`; a direct
generator rerun was instead compared byte-for-byte and was identical.

## Legal review boundary

This implementation can make license material complete and mechanically
consistent, but it cannot provide legal advice or corporate counsel approval.
The declared-MIT source with a missing upstream license file and the form of
Apache modification notice remain explicit review items in `NOTICE`/`PARITY`.
