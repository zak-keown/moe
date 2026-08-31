# OpenCode Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file").
On OpenCode these resolve to the tools below.

**Extracted from an adapter on import.** Upstream this mapping existed only as an
inline template literal inside `.opencode/plugins/superpowers.js`, the
hand-maintained OpenCode loader. `@bubstack/moe-mint` regenerates that loader, so
a mapping living inside it would be lost on the next `generate`. It belongs here,
where every harness reads it and nothing overwrites it.

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

## Bootstrap

OpenCode has no session-start hook. moe-mint's OpenCode adapter injects the
bootstrap skill into the first user message of each session and guards against
double injection by looking for its own marker in that message. If the bootstrap
content is already present in the conversation, it is **already loaded** — follow
it, do not call the `skill` tool to load it again.
