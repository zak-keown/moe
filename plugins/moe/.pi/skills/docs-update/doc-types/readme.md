# readme — doc-type template

You are generating or verifying a project's `README.md`.

## What to read

- `package.json`, `Cargo.toml`, `pyproject.toml`, or `go.mod` — project name,
  version, description, scripts/commands, dependencies, engine requirements.
- The project's entrypoint files — `index.ts`, `main.py`, `main.go`, `src/lib.rs`.
- `LICENSE` or `LICENSE-MIT` — license type.
- Existing `README.md` — if present, compare against code.
- `.env.example` or `.env.template` — environment variables.
- CI config (`.github/workflows/`, `.gitlab-ci.yml`) — badges, build status.

## Sections to write (in order)

1. **Title and description** — project name from the manifest, one-sentence
   description. No marketing language.
2. **Prerequisites** — runtime versions, system dependencies. Copy exact
   version constraints from the manifest.
3. **Installation** — the actual install command from the manifest. If there is
   a `postinstall` or setup script, mention it.
4. **Usage** — the primary command or API call. Pull from `scripts` in the
   manifest, or from the entrypoint's exported interface.
5. **Configuration** — environment variables or config files, only if they
   exist. Do not invent config the project does not use.
6. **Development** — how to run tests, lint, build. Copy the exact script
   names from the manifest.
7. **License** — the license type from the LICENSE file.

## Rules

- Every file path you mention must exist — `ls` or `glob` it first.
- Every command you document must appear in a manifest or script — `grep` first.
- Every function signature you cite must match the source — `read` the file.
- Do not add badges, shields, or external service links unless they already
  exist in CI config.
- Invoke `writing-clearly-and-concisely` before finalizing prose.

## Verify mode

When verifying rather than generating, check each section against the codebase
and report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: README.md
  anchor: "<quoted text from the doc>"
  actual: "<what the code actually says>"
  severity: high | medium | low
```

Severity guide:
- **high** — a command or path that would fail if followed
- **medium** — a missing major feature or component
- **low** — a minor version mismatch or cosmetic inaccuracy
