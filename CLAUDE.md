# Moe rules — see AGENTS.md
@AGENTS.md

## Moe is multi-harness, NOT Claude-only

Moe ships plugins for 8 harnesses (claude-code, codex, cursor, kimi, opencode,
pi, agent-plugins-1.0, copilot). Every design call — packaging, install paths,
marketplace shape, docs, CI — has to work for all eight. Claude Code
conventions are one input, not the default. A path that works only because a
consumer has `./plugins/<name>` from a git clone (Claude Code's native
marketplace flow) breaks the other seven; publishing to npm without shipping
the harness-specific manifests breaks them too. When in doubt, design for the
harness-agnostic case first, then confirm each of the eight actually reaches
it.
