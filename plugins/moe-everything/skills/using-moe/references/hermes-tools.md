# Hermes Agent Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Hermes Agent these resolve to the tools below.

## Tools

| Action skills request | Hermes tool |
|---|---|
| Read a file | `read_file` |
| Create a new file | `write_file` |
| Edit a file (targeted patch) | `patch` |
| Run a shell command | `terminal` |
| Search file contents | `search_files` |
| Find files by name | `terminal` with `find` |
| Fetch a URL / read a webpage | `web_extract(urls=[...])` |
| Search the web | `web_search(query=...)` |
| Dispatch a subagent | `delegate_task(goal=..., context=..., toolsets=[...], role="leaf")` |
| Task tracking | `todo` tool |
| Invoke a skill | `skill_view("skill-name")` |

## Instructions file

When a skill mentions "your instructions file," on Hermes Agent this is **`AGENTS.md`** in the project directory, or **`SOUL.md`** globally at `~/.hermes/SOUL.md`.

## Invoking a skill

Hermes Agent has a `skills` toolset with `skill_view` and `skills_list` tools.
To invoke a Moe skill, use:

```
skill_view("brainstorming")
skill_view("test-driven-development")
```

If `skill_view` cannot find a Moe skill (it may not appear in the catalog
until the plugin fully registers it), fall back to reading the SKILL.md directly:

```
read_file(path="~/.hermes/plugins/moe-core/skills/<skill-name>/SKILL.md")
```

This fallback is the same mechanism used by other harnesses without native skill loading.

## Subagent dispatch

Use `delegate_task` to spawn isolated subagents for parallel or sequential workstreams:

```
delegate_task(goal="...", context="...", toolsets=[...], role="leaf")
```

If `delegate_task` is unavailable, do the work inline rather than inventing tool calls.

## Task tracking

Use the `todo` tool for task tracking within a session. For multi-agent task boards, use `hermes kanban` CLI if available. Treat older `TodoWrite` references as the task-tracking action.

## Native rendering ladder

The shared native-rendering ladder lives at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/native-rendering.md`. On Hermes Agent, rung 1 (the Claude Code Artifact tool) is not exposed — skills that render should start at rung 2 (brainstorm browser companion) and drop to rung 3 (local HTML file) or rung 4 (markdown file) when the sandbox blocks a browser or a port bind.
