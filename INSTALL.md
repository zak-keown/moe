# Installing Moe

The installer and doctor target one host harness at a time. Both are
dependency-free Node scripts, and the installer is read-only unless `--apply`
is present.

## Quick start

Use the Mint adapter ID for your host:

```sh
node bin/moe-doctor --harness claude-code
node bin/moe-install --harness claude-code
node bin/moe-install --harness claude-code --apply
```

Valid IDs are `claude-code`, `cursor`, `codex`, `kimi`, `opencode`, `pi`,
`agent-plugins-1.0`, and `copilot`.

You may omit `--harness` when exactly one supported host executable is on
`PATH`, or set `MOE_DEFAULT_HARNESS`. Explicit `--harness` wins over the
environment and detection. Zero or multiple detected hosts are an exit-2
selection error. Agent Plugins 1.0 spans several clients and has no unique
executable, so select it explicitly or through the environment.

## Automation boundary

`moe-install` only executes routes exercised by Mint's deep harness checks or
already established by the Claude installer contract:

| Harness | Install | Upgrade | Uninstall |
|---|---|---|---|
| Claude Code | automated | manual | manual |
| GitHub Copilot CLI | automated | manual | manual |
| Cursor, Codex, Kimi, OpenCode, Pi, Agent Plugins 1.0 | manual | manual | manual |

Manual install plans render the adapter's generated-equivalent instruction for
every concrete plugin name, directory, or configuration entry. Manual lifecycle
plans likewise bind each action to an exact plugin identifier. Passing `--apply`
to a manual route exits 2 before doctor probes, host commands, or state changes.

Claude Code receives all six plugins: `moe`, `moe-backstory`, `moe-memory`,
`moe-glass`, `moe-crew`, and `moe-statusline`. The statusline configures a
Claude Code-only setting and is excluded from every other harness plan.

## Doctor

Doctor always probes the common Node and git prerequisites, then requires only
the selected host executable (`claude`, `cursor-agent`, `codex`, `kimi`,
`opencode`, `pi`, or `copilot`). It never requires Claude for another harness.
Agent Plugins 1.0 has no single host executable to require. On native Windows,
bash remains hard for Claude-layout and Cursor hook hosts because bootstrap
otherwise silently skips. Claude Code may use its
`CLAUDE_CODE_GIT_BASH_PATH` host setting; Cursor and Copilot require the
generated wrapper to find bash in a standard Git for Windows location or on
`PATH`. Pnpm is a soft contributor-workflow probe; generated plugins do not
need it at runtime.

Optional cargo, tmux, uv, Chrome, Docker, and Python probes name the capability
they disable but do not fail the report. Use `--json` for machine-readable
output. Exit codes are 0 for all hard probes present, 1 for a hard miss, and 2
for an invalid option or unresolved harness.

## Actions

Dry-run is the default for every action:

```sh
node bin/moe-install --harness claude-code
node bin/moe-install --harness claude-code --upgrade
node bin/moe-install --harness claude-code --uninstall
```

Add `--apply` to execute an automated route. Automated installs run the doctor
for the selected harness first; `--skip-doctor` bypasses that check.

Claude's verified install route registers the canonical marketplace at
`https://github.com/zak-keown/moe.git` and installs each supported
`<plugin>@moe`. Copilot's verified install route uses the adapter-emitted
`https://github.com/zak-keown/moe` repository form. Upgrade and uninstall plans
remain manual because Mint establishes neither lifecycle command. Claude Code
alone accepts `--scope user|project|local`; scopes on other harnesses are
rejected with exit 2 rather than forwarded speculatively.

## Contributor setup

These commands install the generated plugins for an end-user host. For a
contributor checkout (`pnpm install`, builds, and package tests), follow
`ARCHITECTURE.md` instead.
