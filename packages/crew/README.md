# Moe Crew

Crew launches, adopts, controls, and observes coding-agent workers in tmux. It
supports Claude Code, Codex, and Pi behind one worker-oriented CLI.

## CLI

```sh
moe-crew launch --harness codex worker-name /path/to/project
moe-crew list
moe-crew --worker worker-name status
moe-crew --worker worker-name converse "Run the focused tests"
moe-crew --worker worker-name stop
```

Run `moe-crew help` for the complete top-level and per-worker command surface.

## Layout

- `src/commands/` — command implementations.
- `src/core/` — worker state, events, transcripts, and tmux integration.
- `src/harness/` — harness drivers.
- `hooks/` and `src/hooks/` — lifecycle event adapters.
- `mint/` — plugin generation configuration.

The installable plugin is generated under `/plugins`. Never hand-edit the
generated manifest.

## Development

```sh
pnpm --filter @tc/moe-crew build
pnpm --filter @tc/moe-crew typecheck
pnpm --filter @tc/moe-crew test
```

The integration suites self-skip when tmux is unavailable.
