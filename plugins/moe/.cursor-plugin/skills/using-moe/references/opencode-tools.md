# OpenCode Tool Mapping

## Bootstrap

OpenCode has no session-start hook. moe-mint's OpenCode adapter injects the
bootstrap skill into the first user message of each session and guards against
double injection by looking for its own marker in that message. If the bootstrap
content is already present in the conversation, it is **already loaded** — follow
it, do not call the `skill` tool to load it again.
