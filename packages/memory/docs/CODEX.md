# Codex Support

Moe Memory supports Codex as a native plugin starting with `codex-cli 0.130.0`.

That version is the support floor because this plugin depends on all of these Codex surfaces:

- plugin manifests and plugin MCP loading
- plugin lifecycle hooks
- hook trust state in `hooks.state`
- app-server `thread/fork` with `ephemeral: true` for Codex-native summarization
- Codex rollout JSONL transcripts in `$CODEX_HOME/sessions`

## Install and Enable

Install the plugin through the normal Codex plugin workflow or a marketplace entry.

The installable plugin is **generated** into `<workspace>/plugins/moe-memory` by
`@bubstack/moe-mint`; this package directory is source, not a plugin. For local
development, build the package and add the generated tree as a local marketplace:

```bash
pnpm --filter @bubstack/moe-memory build
codex plugin marketplace add /path/to/moe/plugins/moe-memory
```

Then start Codex, open `/plugins`, and install/enable `moe-memory` from the `moe` marketplace.

Enable plugin hooks:

```bash
codex features enable plugin_hooks
```

Start Codex and open the hook manager:

```text
/hooks
```

Review the Moe Memory `SessionStart` hook and press `t` to trust it. New or modified unmanaged hooks do not run until trusted. After the hook is trusted, Enter or Space can toggle it enabled or disabled.

Codex stores hook trust like this in `$CODEX_HOME/config.toml`:

```toml
[hooks.state."moe-memory@test:hooks/hooks.json:session_start:0:0"]
trusted_hash = "sha256:..."
```

If the plugin changes the hook command or normalized hook config, Codex marks the hook modified and requires review again.

## Verify

Run:

```bash
moe-memory doctor codex
```

The doctor checks:

- Codex version is at least `0.130.0`
- `$CODEX_HOME/sessions` exists
- `plugins` and `plugin_hooks` are enabled
- `codex mcp list` shows `moe-memory` enabled
- the memory database and hook/background sync log paths

Hook and background sync output is written to:

```text
$MOE_MEMORY_CONFIG_DIR/logs/moe-memory.log
```

or, by default:

```text
~/.config/moe/memory/logs/moe-memory.log
```

## End-to-End Test

The real Codex E2E test is opt-in because it starts live Codex sessions and uses the configured model/account.

```bash
pnpm --filter @bubstack/moe-memory build
MOE_MEMORY_RUN_CODEX_E2E=1 MOE_MEMORY_E2E_PLUGIN_DIR=/path/to/moe/plugins/moe-memory \
  pnpm --filter @bubstack/moe-memory test:codex-e2e
```

The test creates an isolated temporary `CODEX_HOME`, copies your existing Codex auth file into it, copies the plugin into Codex's plugin cache shape, enables and trusts the plugin hook, starts Codex sessions inside `tmux`, and verifies:

- sessions are archived
- summaries are generated
- the SQLite index is created
- a later Codex session uses the Moe Memory MCP search tool and finds the earlier marker

## Summaries

Codex summaries use `codex app-server`, `thread/fork`, and `ephemeral: true`. This matters: `codex exec --ephemeral resume <session>` was tested and still appended to the resumed rollout, so it is not the quality bar for summarization.

If the Codex app-server summarizer is unavailable or below the support floor, Moe Memory logs the reason and falls back to transcript-text summarization instead of silently skipping the conversation.
