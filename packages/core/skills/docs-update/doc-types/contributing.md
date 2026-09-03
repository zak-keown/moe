# contributing — doc-type template

You are generating or verifying a project's `CONTRIBUTING.md`.

## What to read

- `package.json`, `Cargo.toml`, `pyproject.toml`, or `go.mod` — `scripts` (or
  task equivalents), engine/version-requirement fields, and which package
  manager the lockfile implies (`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`,
  `go.sum`).
- CI config (`.github/workflows/`, `.gitlab-ci.yml`) — the actual gate: which
  commands run, in what order, on what triggers.
- Existing tests — read a sample to identify the test framework (vitest,
  jest, pytest, cargo test) and the naming/location convention (`*.test.ts`,
  `test_*.py`, a `tests/` directory).
- Linter/formatter config — `biome.json`, `.eslintrc*`, `.prettierrc*`,
  `rustfmt.toml`, `ruff.toml` — to name the actual tool and its invocation.
- `CODEOWNERS`, a pull request template, or branch-protection hints in CI
  config — for the pull request process.
- Existing `CONTRIBUTING.md` — if present, compare each command against the
  manifest and CI config.

## Sections to write (in order)

1. **Prerequisites** — exact runtime/tool versions, copied from the
   manifest's engine fields, not rounded or guessed.
2. **Setup** — the actual install command implied by the lockfile present
   (`pnpm install`, `cargo build`, `uv sync`, `go mod download`).
3. **Development workflow** — lint, test, and build commands, copied
   verbatim from the manifest's `scripts` or task-runner config.
4. **Testing** — the test framework in use, the exact command to run the
   suite, and the file-naming convention for adding a new test, drawn from
   the sampled test files.
5. **Pull request process** — only if CI config or a pull request template
   reveals one: required checks, branch naming, commit message convention.
   Omit this section rather than inventing a process the repo does not
   enforce.

## Rules

- Every command you document must appear in a manifest script, CI workflow
  step, or task-runner config — `grep` first.
- Every version constraint you cite must match the manifest's engine field
  exactly — `read` it, do not round.
- Every tool you name (linter, formatter, test framework) must have config
  or a dependency entry proving it is actually in use.
- Do not describe a pull request process, required check, or workflow step
  that CI config does not enforce.
- Invoke `writing-clearly-and-concisely` before finalizing prose.

## Verify mode

When verifying rather than generating, check each command and version claim
against the manifest and CI config, and report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: CONTRIBUTING.md
  anchor: "<quoted text from the doc>"
  actual: "<what the code actually says>"
  severity: high | medium | low
```

Severity guide:
- **high** — a setup or test command that would fail if run as documented
- **medium** — a CI-enforced gate (lint, typecheck, a required check) not
  mentioned in the doc
- **low** — a minor version mismatch or a stale tool name left over from a
  swap
