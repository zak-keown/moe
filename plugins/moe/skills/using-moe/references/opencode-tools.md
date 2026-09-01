# OpenCode Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file").
On OpenCode these resolve to the tools below.

This mapping belongs in the skill rather than the generated OpenCode loader, so
it survives every `moe-mint generate` run.

| Action skills request | OpenCode equivalent |
| --- | --- |
| Create or update todos | `todowrite` |
| `Subagent (general-purpose):` | `task` with `subagent_type: "general"` |
| Invoke a skill | OpenCode's native `skill` tool |
| Read files | `read` |
| Create, edit, or delete files | `apply_patch` |
| Run shell commands | `bash` |
| Search files | `grep`, `glob` |
| Fetch a URL | `webfetch` |

Use OpenCode's native `skill` tool to list and load skills.

## Native rendering ladder

The shared native-rendering ladder lives at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/native-rendering.md`. On OpenCode, rung 1 (the Claude Code Artifact tool) is not exposed — skills that render should start at rung 2 (brainstorm browser companion) and drop to rung 3 (local HTML file) or rung 4 (markdown file) when a browser is unavailable.

## Bootstrap

OpenCode has no session-start hook. moe-mint's OpenCode adapter injects the
bootstrap skill into the first user message of each session and guards against
double injection by looking for its own marker in that message. If the bootstrap
content is already present in the conversation, it is **already loaded** — follow
it, do not call the `skill` tool to load it again.
