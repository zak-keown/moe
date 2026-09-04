# architecture — doc-type template

You are generating or verifying a project's `ARCHITECTURE.md`.

## What to read

- The top-level directory listing — `ls` the repo root and each first-level
  subdirectory to build the real directory tree, not a remembered one.
- Package manifests at every level — `package.json` (and its `workspaces`
  field), `Cargo.toml` (`[workspace] members`), `pyproject.toml`, `go.mod` —
  to enumerate components and their declared dependencies.
- Each component's own manifest — `dependencies`, `devDependencies`, and
  internal workspace references (`workspace:*`, path dependencies) — to trace
  which components depend on which.
- Import statements inside source files, when manifests alone don't show the
  edge, such as a package importing another by relative path inside a
  monorepo.
- Build and deploy config — `Dockerfile`, `docker-compose.yml`, CI workflow
  files, `turbo.json` or an equivalent task-graph config — for the build
  pipeline and deployment topology.
- Existing `ARCHITECTURE.md` — if present, compare its component list and
  dependency claims against what the manifests and imports actually show.

## Sections to write (in order)

1. **Overview** — what the project is, in the language of its own code, not
   marketing copy. One paragraph.
2. **Repository shape** — the actual directory tree, generated from `ls`/glob
   output, not inferred. Annotate only directories that hold components.
3. **Components** — a table of name, responsibility (one line, drawn from the
   component's own README or manifest description if one exists), and
   distribution (published package, binary, internal-only).
4. **Dependency topology** — a text diagram, arrows or an indented list, of
   which components depend on which, built from the manifest and import
   evidence gathered above. No edge without a citation you could point back to.
5. **Build pipeline** — how components are built and in what order, drawn from
   the task-runner config (`turbo.json`, `Makefile`, CI workflow steps) if one
   exists. Omit this section if there is no build pipeline.

## Rules

- Every component you name must correspond to a real directory or package —
  `ls` or `glob` it first.
- Every dependency edge you draw must appear in a manifest's `dependencies`
  field or an actual `import`/`require` statement — `grep` first.
- Every build or deploy step you describe must match a real script, workflow
  file, or config — `read` it first.
- Do not draw a dependency edge, invent a component, or describe a deployment
  target that does not exist in the codebase.
- Invoke `write-clearly` before finalizing prose.

## Verify mode

When verifying rather than generating, check each section against the
codebase and report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: ARCHITECTURE.md
  anchor: "<quoted text from the doc>"
  actual: "<what the code actually says>"
  severity: high | medium | low
```

Severity guide:
- **high** — a component or dependency edge that no longer exists, or a build
  step that would fail if followed
- **medium** — a component present in the codebase but missing from the doc
- **low** — a stale distribution note or cosmetic diagram drift
