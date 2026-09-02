# Moe Statusline

Gives a fresh Claude Code install a working statusline with no setup: a
`SessionStart` hook points `statusLine` in `~/.claude/settings.json` at a
vendored copy of [ccstatusline](https://github.com/sirmalloc/ccstatusline)
(MIT, © Matthew Breedlove) — but only when the user has not already
configured one. It never overwrites an existing `statusLine`.

Claude Code plugins cannot declare `statusLine` directly (unlike hooks or MCP
servers), so this hook is the only automatic path available.

## Layout

- `src/hooks/ensure-statusline.ts` — the hook: reads/writes `settings.json`.
- `vendor/ccstatusline/` — the vendored, pinned ccstatusline build. See
  `NOTICE` at the repo root for attribution.
- `hooks/hooks.json` — registers the hook for `SessionStart`.

This plugin is Claude Code only — see `harnesses.exclude` in
`mint/moe-statusline.yaml`.
