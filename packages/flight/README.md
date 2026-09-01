# Moe Flight

Flight drives web, CLI, and TUI targets through acceptance stories, records the
evidence, and grades the result. It includes a dashboard and reusable UI
components for reviewing runs.

## CLI

```sh
moe-flight qa run story.yaml
moe-flight qa validate story.yaml
moe-flight qa batch stories/
moe-flight dashboard serve
```

Run `moe-flight --help` and `moe-flight qa --help` for the current command
surface.

## Layout

- `src/qa/` — story execution, adapters, evidence, grading, and orchestration.
- `dashboard/` — run dashboard package.
- `ui/` — shared UI package.
- `skills/` — acceptance-story authoring guidance.
- `examples/` — runnable stories and tutorial material.
- `src/lab/` — internal experimental bridgehead; not a supported public API.

## Development

```sh
pnpm --filter @tc/moe-flight build
pnpm --filter @tc/moe-flight typecheck
pnpm --filter @tc/moe-flight test
pnpm --filter @tc/moe-flight test:chrome
pnpm --filter @tc/moe-flight test:tmux
```

Chrome, tmux, and FFI suites are environment-scoped and sit outside the normal
unit gate.
