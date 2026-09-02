#!/usr/bin/env bash
# Launcher for the Flight Web adapter target. Isolated state
# file per invocation, then runs the server in the foreground.
# Flight's Web runner expects the server already up — invoke
# this in one terminal, then run `moe-flight qa run` against the URL
# in another.
set -e
SCRATCH="$(mktemp -d -t todo-web-XXXXXX)"
export TODO_STATE_FILE="$SCRATCH/state.json"
export TODO_WEB_PORT="${TODO_WEB_PORT:-7891}"
PACKAGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -d "$PACKAGE_ROOT/examples/todo" ]] || {
  echo "launcher: PACKAGE_ROOT wrong: $PACKAGE_ROOT" >&2; exit 1;
}
echo "todo-web: $TODO_STATE_FILE on :$TODO_WEB_PORT"
cd "$PACKAGE_ROOT"
exec node --import tsx "$PACKAGE_ROOT/examples/todo/web/server.ts"
