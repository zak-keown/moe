# Documentation Index

One row per doc. `Reader` is the addressed reader (`user`, `operator`,
`contributor`, `adopter`, `+`-joined for genuinely sectioned docs, `—` for
point-in-time rows). `Class` is the confirmed evergreen/point-in-time
classification of record. `Owns` is machine-readable: the path globs whose
facts this doc owns; `—` for point-in-time docs. The fenced table is
machine-maintained; edit rows, never the sentinels.

This index covers the current product documentation. Point-in-time planning
artifacts remain under `docs/history/` and do not define current behavior.

<!-- doc-index:begin -->
| Doc | What | Reader | Class | Owns |
| --- | --- | --- | --- | --- |
| `README.md` | package overview, layout, and development commands | contributor | evergreen | — |
| `docs/CONFIG.md` | usage, config reference (`moe-mint.yaml`), CLI commands | user+adopter | evergreen | src/cli.ts, src/config.ts, src/bump.ts, src/validate.ts, src/test-command.ts, checks/run-checks.sh, schemas/** |
| `docs/BROCHURE.md` | what moe-mint is and who it's for | adopter | evergreen | src/adapters/**, src/cli.ts, src/generate.ts, src/manifest.ts, src/validate.ts, src/init.ts, src/import.ts, src/bump.ts, src/docs-emit.ts, src/bootstrap/generated.ts, checks/run-checks.sh, test/dogfood.test.ts |
| `docs/history/UPSTREAM-BROCHURE-PAGE.html` | upstream's v1.0.0 landing page | — | point-in-time | — |
| `docs/history/2026-08-10-everyharness-design.md` | design spec | — | point-in-time | — |
| `docs/history/2026-08-10-everyharness-core.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-dogfood-findings.md` | findings | — | point-in-time | — |
| `docs/history/2026-08-11-eval-feedback-fixes.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-everyharness-container.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-everyharness-init-import-docs.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-everyharness-inprocess-adapters.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-everyharness-manifest-adapters.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-11-hook-double-fire-findings.md` | findings | — | point-in-time | — |
| `docs/history/2026-08-12-bump-command.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-config-v2.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-exec-bits-and-unskip.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-per-harness-emithooks.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-publishable-marketplace.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-respect-user-hooks.md` | plan | — | point-in-time | — |
| `docs/history/2026-08-12-validate-loads-config.md` | plan | — | point-in-time | — |
<!-- doc-index:end -->

<!-- Decided gaps, inherited: no DICTIONARY.md yet (voice came from upstream's
publication-writer preset; revisit when project terminology needs a record,
2026-08-13); no user tutorial beyond the CONFIG usage block (that plus the
brochure's Using-it transcript cover first success; upstream's trigger for
revisiting was npm publication, which is no longer on the table for this
package — it ships as a workspace bin). -->
