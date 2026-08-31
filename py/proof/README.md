# moe-proof

Evals against small (and large) models. An Eval is a directory of YAML — Tasks,
Configs, Graders — executed by any CLI Runner you write and scored by reusable
Checkers. Runs are immutable and re-gradable; `report` prints markdown, `serve`
and `build` render a web UI.

Python, `uv`-managed, **outside** the pnpm workspace. PyPI has no scopes, so this
is `moe-proof`, not `@bubstack/anything`.

**Status:** imported. 88 tests passing across 6 suites.

The user-facing reference — vocabulary, the Runner contract, the Checker
contract, the on-disk layout, every command — is
[`src/moe_proof/reference.md`](src/moe_proof/reference.md), which is also what
`moe-proof docs` prints. This file is only about the fork.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `smevals` | `0c28dc6` | MIT |

**Two attribution facts, both true, and they are not the same fact.** The
upstream `LICENSE` holds `Copyright (c) 2026 Prime Radiant, Inc.` and is retained
verbatim. Upstream `pyproject.toml` credits **Simon Willison** as the author. In
PEP 621 terms those are different fields, so both survive here: `authors` names
Simon Willison (who wrote it), `maintainers` names the fork's maintainer. The root
[NOTICE](../../NOTICE) records smevals under Prime Radiant's MIT grant but does
**not** name Simon Willison — see Follow-ups.

## Layout

```
src/moe_proof/       the package. Was src/smevals/ upstream.
  cli.py             the six commands: run, grade, report, serve, build, docs
  site.py            shared data layer + live server + static site builder
  app.html           the report UI, one self-contained vendored file
  reference.md       the user reference. Was upstream's README.md.
tests/               6 pytest suites (88 tests)
examples/            three example Evals: haiku, markdown-tables,
                     pelican-riding-a-bicycle. Nine executable Runners/Checkers.
docs/history/        UPSTREAM-ABOUT.md — upstream's generated project-map entry.
                     Inherited record; see below.
LICENSE              upstream MIT, verbatim
uv.lock              committed; see below
```

Run it from the repo root:

```bash
uv run --project py/proof pytest          # also `pnpm proof:test`
uv run --project py/proof moe-proof --help
```

## What changed on import

**`smevals/` → `moe_proof/`, `smevals` → `moe-proof`.** Module directory, import
paths, console script, distribution name. `uv_build` derives the module name from
the project name, so `src/moe_proof/` is the whole configuration.

**`SMEVALS_*` → `MOE_PROOF_*`.** 92 substitutions. This is the load-bearing
rename and the one breaking change: the env-var prefix *is* the Runner and Checker
contract. Every Runner and Checker executable — including all nine in `examples/`
— reads `MOE_PROOF_MODEL`, `MOE_PROOF_PROMPT`, `MOE_PROOF_TASK`,
`MOE_PROOF_TASK_<KEY>`, `MOE_PROOF_RUN_DIR`, `MOE_PROOF_CHECK`,
`MOE_PROOF_CHECK_<KEY>`. An eval directory written against upstream `smevals` does
not run here until its scripts are updated. Verified end to end: a stub Runner
that reads only `MOE_PROOF_*` plus the imported `haiku-structure` Checker, through
`run -g`, `report` and `build`.

**Upstream's `README.md` became `src/moe_proof/reference.md`.** `smevals docs`
printed the README by way of `importlib.metadata`'s `Description` payload. That
mechanism only works while the README *is* the documentation, and this fork's
README is fork notes. So the reference moved into the package and `docs` now reads
it with `importlib.resources.files()` — the same mechanism `site.py` already used
for `app.html`, so no new machinery. It ships in the wheel; verified.

**The four README badges are gone, not rewritten.** All four were self-referential
(Zone A) and every target is wrong for this fork: `moe-proof` is not on PyPI (the
publish-publicly-or-not question is still open — PARITY.md), there is no GitHub
repo, no GitHub Actions, and no per-package release feed. `.gitlab-ci.yml` runs one
pipeline for the whole monorepo, so a package-scoped pipeline badge would be
meaningless. The `Installation` section was rewritten the same way, to
`uv run --project py/proof` and `uv tool install ./py/proof`.

**`pyproject.toml` reconciled against reality.** The pre-import scaffold declared
`dependencies = []`; the package actually needs `click>=8.4.2` and
`pyyaml>=6.0.3`. It also had no dev group and no pytest config. Restored from
upstream: `[dependency-groups] dev = ["pytest>=8"]` and
`[tool.pytest.ini_options] testpaths = ["tests"]`. Version stays at the scaffold's
`0.0.0` (matching `@bubstack/moe-glass`), not upstream's `0.2.0` — the fork starts
its own version lineage.

**`uv_build` widened to `>=0.12.0,<0.13.0`.** Upstream pinned `<0.12.0`, which
predates the toolchain here (`uv` 0.12.7). Matching the installed major lets uv use
its built-in backend instead of resolving an older `uv_build` from PyPI.

**pytest stayed pytest.** ARCHITECTURE §6's `vitest 3` normalization is about the
JavaScript packages; there is no Python test runner to converge here, and `uv`
already drives it from the root.

**`uv.lock` is committed**, which upstream deliberately gitignored. Upstream is a
published library, where a lock is noise. `moe-proof` is an unpublished tool in a
monorepo whose `pnpm-lock.yaml` is committed, and the CI job is
`uv run --project py/proof pytest` — a lock makes that reproducible. Verified with
`uv lock --check` and `uv run --locked`.

**Dropped, not ported.** `.github/workflows/test.yml` and
`.github/workflows/publish.yml` (a 5-way Python matrix, and a PyPI release on
GitHub release) collapse into the existing root `.gitlab-ci.yml` `proof:` job.
`catalog-info.yaml` was excluded outright: it is a Backstage component descriptor
for Prime Radiant's catalog (`prime-radiant.com/repo-map-rev`,
`owner: user:simonw`, `system: eval-labs`). Moe has no Backstage catalog and no
root `catalog-info.yaml`, so rebranding it would produce live-looking config that
nothing reads. The two nested `examples/*/.gitignore` files (each just `runs`) were
dropped per the root-configs-govern rule — see Follow-ups.

**No Python defects found.** `packages/glass` got one real bug out of the strict
TypeScript base; there is no equivalent lever here — Python, no type checker
configured in this workspace — and all 88 tests passed on the first run after the
rename. Also verified on Python 3.10 (the `requires-python` floor), 3.12 (the CI
image) and 3.14.7 (what `uv` resolves locally). Biome did find one genuine defect
in `app.html`: a missing `lang` attribute. Fixed.

## Rebrand, and what was deliberately left alone

143 substitutions across 20 files, longest-token-first:

| From | To | Count |
|---|---|---|
| `SMEVALS_` | `MOE_PROOF_` | 92 |
| `smevals` (CLI name, prose) | `moe-proof` | 42 |
| `smevals.cli` | `moe_proof.cli` | 6 |
| `metadata("smevals")` | `metadata("moe-proof")` | 1 |
| `files("smevals")` | `files("moe_proof")` | 1 |
| `from smevals import` | `from moe_proof import` | 1 |

Longest-first matters here: `smevals.cli` had to be consumed before the bare
token, or `import smevals.cli` would have become `import moe-proof.cli` — not a
legal module path.

Also renamed: the `<title>` and `<h1>` in `app.html`. The only other edit to that
vendored file is `<html lang="en">` — a real a11y defect biome caught, and the one
finding in it that was worth fixing rather than scoping away.

**`LICENSE` and `docs/history/UPSTREAM-ABOUT.md` are byte-identical to upstream.**
They describe a project that *was* called smevals, authored by Simon Willison and
copyrighted by Prime Radiant. Rewriting them would falsify the record and, for
`LICENSE`, break the MIT copyright notice the license itself requires.
`UPSTREAM-ABOUT.md` keeps its `github.com/prime-radiant-inc` links: those are
provenance, not self-reference.

**`Eval`, `Task`, `Config`, `Run`, `Grader`, `Grade`, `Check`, `Checker`, `Runner`,
`Suite` all keep their names.** They are the domain vocabulary, they appear in
`eval.yaml` keys and on-disk directory names, and none of them carries a brand.
Renaming any of them would break every eval directory for no identity gain — the
same call `packages/glass` made for `chrome-ws`.

**"GitHub-flavored markdown" in `examples/markdown-tables/` stays.** It names a
markdown dialect, not a host.

**The example evals keep their upstream names** — `haiku`,
`markdown-tables`, `pelican-riding-a-bicycle` — and their `openai-codex/*` and
`gpt-4.1-*` model ids. They are demonstration content, not fork identity.

## Follow-ups

- **The root `NOTICE` does not name Simon Willison.** It lists `smevals` under
  Prime Radiant's MIT grant, which matches `LICENSE`, but upstream's
  `pyproject.toml` names Simon Willison as author and that attribution is not
  recorded anywhere at the root. Worth one line in `NOTICE`.
- **`biome` needs a `py/proof` override.** Not applied here — `biome.json` is a
  shared root file. Biome's only reach into a Python package is
  `src/moe_proof/app.html`, a vendored 780-line single-file report UI whose inline
  `<script>` still trips 4 errors (`noAssignInExpressions` ×3,
  `useIterableCallbackReturn`) plus 2 warnings and 15 infos
  (`useTemplate`, `useOptionalChain`, `noDescendingSpecificity`). All stylistic;
  none is a defect, and the file's JS has no test coverage, so rewriting it blind
  is worse than scoping the linter. The override that clears it is verified —
  details in the import report.
- **`runs/` from a run of `examples/` is not gitignored.** Upstream carried a
  nested `.gitignore` per example; the root config governs here, so root
  `.gitignore` wants `py/proof/examples/*/runs/`. Until then, running an example
  leaves untracked output.
- **`ARCHITECTURE.md` lists `proof → tab` as a candidate edge** (cost data via
  tab's Python binding). The import census says **no**: `moe-proof` has exactly two
  runtime dependencies, `click` and `pyyaml`, and nothing in it reads or reports
  cost. Cost would enter through a *Checker* — a user-supplied executable — not
  through the framework. If the edge is ever wanted, it belongs in an example
  Checker, and `packages/tab/bindings/python` would become a dev dependency of
  `examples/`, not of `moe-proof`.
- **The publish decision is still open.** `pyproject.toml` deliberately carries no
  `[project.urls]`: ARCHITECTURE.md flags the GitLab project path `bubstack/moe` as
  an assumption to confirm, and `@bubstack/moe-glass` set the precedent of shipping
  no self-referential URLs until it is. Add `Homepage`/`Repository`/`Issues` once
  the path is confirmed.
- **CI floats `uv`.** The root `.gitlab-ci.yml` `proof:` job does
  `pip install uv`, while ARCHITECTURE.md pins `uv ≥ 0.12`. Pinning
  `pip install 'uv==0.12.7'` (or using an `astral-sh/uv` image) would make the
  `uv_build>=0.12.0` requirement resolve from the built-in backend rather than
  PyPI.
