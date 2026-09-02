#!/usr/bin/env bash
# Launcher for the Flight TUI adapter. Isolated scratch dir +
# state file, then exec the TUI directly.
set -e
SCRATCH="$(mktemp -d -t todo-card-XXXXXX)"
export TODO_STATE_FILE="$SCRATCH/state.json"
PACKAGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -d "$PACKAGE_ROOT/examples/todo" ]] || {
  echo "launcher: PACKAGE_ROOT wrong: $PACKAGE_ROOT" >&2; exit 1;
}
cd "$PACKAGE_ROOT"
exec node --import tsx "$PACKAGE_ROOT/examples/todo/tui.tsx"
