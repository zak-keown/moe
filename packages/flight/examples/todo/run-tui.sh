#!/usr/bin/env bash
# Launcher for the Flight TUI adapter. Isolated scratch dir +
# state file, then exec the TUI directly.
set -e
SCRATCH="$(mktemp -d -t todo-card-XXXXXX)"
export TODO_STATE_FILE="$SCRATCH/state.json"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -d "$REPO_ROOT/examples/todo" ]] || {
  echo "launcher: REPO_ROOT wrong: $REPO_ROOT" >&2; exit 1;
}
exec node --import tsx "$REPO_ROOT/examples/todo/tui.tsx"
