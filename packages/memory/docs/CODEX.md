# Codex Support

Moe Memory ships as a native Codex plugin. On Codex today (v0.2.1) it provides
one thing: **native discovery of the `remembering-conversations` skill**. It
does **not** register an MCP server, run session hooks, or summarize through the
Codex app-server on Codex.

That scope is deliberate. `packages/memory/mint/moe-memory.yaml` grants Codex
the skill-discovery capability and nothing else:

```yaml
codex: {intent: preview, expected_capabilities: [skill-discovery], ...}
```

The codex adapter honors that grant — it emits no MCP server and no hooks for
Codex — so the skill is the whole 0.2.1 Codex surface. When the skill runs (on
a harness whose MCP tools are available), it searches your Moe Memory of past
conversations. The MCP-backed recall stack is planned for v0.3.0 (see below).

## What is searchable today

Moe Memory's harvesting path indexes Codex rollout JSONL transcripts from
`$CODEX_HOME/sessions`, the same way it indexes Claude Code transcripts. Once
indexed, past Codex conversations are searchable through Moe Memory. This
indexing is done by the harvesting path reading the rollout files directly — it
does **not** depend on a Codex-side MCP server or hook.

## Install and Enable

Install the plugin through the normal Codex plugin workflow or a marketplace
entry. The skill is then discovered natively; there are no hook-trust or feature
flags to enable for 0.2.1.

The installable plugin is **generated** into `<workspace>/plugins/moe-memory` by
`@bubstack/moe-mint`; this package directory is source, not a plugin. For local
development, build the package and add the generated tree as a local marketplace:

```bash
pnpm --filter @bubstack/moe-memory build
codex plugin marketplace add /path/to/moe/plugins/moe-memory
```

Then start Codex, open `/plugins`, and install/enable `moe-memory` from the `moe`
marketplace. Once installed, Codex discovers the `remembering-conversations`
skill natively.

## Verify

Run:

```bash
moe-memory doctor codex
```

For 0.2.1 the doctor checks the facts that back native skill discovery and
harvesting:

- `$CODEX_HOME/sessions` exists (so Codex transcripts can be harvested)
- the memory database and background sync log paths

Background sync output is written to:

```text
$MOE_MEMORY_CONFIG_DIR/logs/moe-memory.log
```

or, by default:

```text
~/.config/moe/memory/logs/moe-memory.log
```

---

## Planned for v0.3.0 (H1)

The following stack is **not shipped in 0.2.1**. It is planned for v0.3.0 (H1),
when the codex adapter will emit an MCP server and plugin hooks for Codex. Until
then, treat everything in this section as a roadmap, not a working path.

When it lands, Moe Memory on Codex **will** depend on all of these Codex
surfaces, which is why the v0.3.0 support floor will be higher (`codex-cli
0.130.0`+; the opt-in E2E harness pins its own floor of `0.152.1`):

- plugin manifests and plugin MCP loading
- plugin lifecycle hooks
- hook trust state in `hooks.state`
- app-server `thread/fork` with `ephemeral: true` for Codex-native summarization

### Enabling MCP and hooks (planned)

The 0.3.0 install flow **will** additionally enable plugin hooks and trust the
`SessionStart` hook:

```bash
codex features enable plugin_hooks
```

You **will** then start Codex, open the hook manager:

```text
/hooks
```

review the Moe Memory `SessionStart` hook, and press `t` to trust it. New or
modified unmanaged hooks will not run until trusted; after trust, Enter or Space
will toggle it enabled or disabled.

Codex **will** store hook trust like this in `$CODEX_HOME/config.toml`:

```toml
[hooks.state."moe-memory@test:hooks/hooks.json:session_start:0:0"]
trusted_hash = "sha256:..."
```

If the plugin changes the hook command or normalized hook config, Codex marks
the hook modified and requires review again.

### Doctor checks (planned)

Once MCP and hooks ship, `moe-memory doctor codex` **will** additionally verify:

- Codex version is at least the v0.3.0 support floor
- `plugins` and `plugin_hooks` are enabled
- `codex mcp list` shows `moe-memory` enabled

### Summaries (planned)

Codex summaries **will** use `codex app-server`, `thread/fork`, and
`ephemeral: true`. This matters: `codex exec --ephemeral resume <session>` was
tested and still appended to the resumed rollout, so it is not the quality bar
for summarization.

If the Codex app-server summarizer is unavailable or below the support floor,
Moe Memory **will** log the reason and fall back to transcript-text
summarization instead of silently skipping the conversation.

### End-to-End Test (planned)

The Codex MCP E2E test is opt-in and targets the v0.3.0 path — it exercises a
capability the 0.2.1 plugin does not ship. It starts live Codex sessions and
uses the configured model/account.

```bash
pnpm --filter @bubstack/moe-memory build
MOE_MEMORY_RUN_CODEX_E2E=1 MOE_MEMORY_E2E_PLUGIN_DIR=/path/to/moe/plugins/moe-memory \
  pnpm --filter @bubstack/moe-memory test:codex-e2e
```

The test creates an isolated temporary `CODEX_HOME`, copies your existing Codex
auth file into it, copies the plugin into Codex's plugin cache shape, enables and
trusts the plugin hook, starts Codex sessions inside `tmux`, and verifies:

- sessions are archived
- summaries are generated
- the SQLite index is created
- a later Codex session uses the Moe Memory MCP search tool and finds the earlier
  marker

Because MCP and hook emission for Codex are 0.3.0 work, this harness will only
pass once that emitter lands.
