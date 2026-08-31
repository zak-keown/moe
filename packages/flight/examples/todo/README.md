# TODO fixture

A unified test target for Flight's three adapters (CLI, TUI, Web).
One TODO core, three thin frontends, eight portable cards.

## Running by hand

```bash
# CLI (single-shot)
bun run examples/todo/cli.ts add "buy milk"
bun run examples/todo/cli.ts list

# TUI
bun run examples/todo/tui.tsx

# Web
bun run examples/todo/web/server.ts
# listens on $TODO_WEB_PORT (default 7891)
```

All three frontends honor `$TODO_STATE_FILE` (default `./.todo-state.json`).
Flight's harness sets this per run for isolation.

## Running cards via Flight

Run from the moe-flight project root (so the path-relative `--target`
expansions resolve correctly):

```bash
cd "$(git rev-parse --show-toplevel)"

# CLI — the adapter spawns a bash shell for the agent; target is the
# command name the agent invokes inside it.
moe-flight qa run examples/todo/.moe-flight/stories/01-add-one.md \
  --adapter cli \
  --target "bun run $(pwd)/examples/todo/cli.ts" \
  --max-time 3m

# TUI — the adapter spawns the target program directly in a tmux pane.
moe-flight qa run examples/todo/.moe-flight/stories/01-add-one.md \
  --adapter tui \
  --target "bun run $(pwd)/examples/todo/tui.tsx"

# Web — start the server in another terminal, then point moe-flight at it.
./examples/todo/run-web.sh &
moe-flight qa run examples/todo/.moe-flight/stories/01-add-one.md \
  --adapter web \
  --target "http://localhost:7891"
```

When running the full matrix against Web, reset the server's state
between cards so leftover items from one card don't poison the next:

```bash
for story in examples/todo/.moe-flight/stories/*.md; do
  curl -s -X POST http://localhost:7891/api/reset > /dev/null
  moe-flight qa run "$story" --adapter web --target "http://localhost:7891" --max-time 5m
done
```

## Don't use this for anything real

The TODO core is a fixture — single JSON file, no locking, no auth,
no validation beyond "is this a string". It exists to give Flight's
CLI/TUI/Web adapters a deterministic regression target. Treat the
source as a fixture, not a starter.
