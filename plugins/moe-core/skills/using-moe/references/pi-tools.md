# Pi Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On Pi these resolve to the tools below.

| Action skills request | Pi equivalent |
| --- | --- |
| Dispatch a subagent (`Subagent (general-purpose):` template) | Use an installed subagent tool such as `subagent` from `pi-subagents` if available |
| Task tracking ("create a todo", "mark complete") | Use an installed todo/task tool if available, otherwise track tasks in the plan or `TODO.md` |

## Subagents

Pi core does not ship a standard subagent tool. The `pi-subagents` package is a strong optional companion and provides a `subagent` tool with single-agent, chain, parallel, async, forked-context, and resume/status workflows. If no subagent tool is available, do not fabricate `Task` calls; execute sequentially in the current session or explain that the optional subagent capability is not installed.

## Task lists

Pi core does not ship a standard task-list tool. If a todo/task extension is installed, use its documented tool. Otherwise use Moe plan files, checklists in Markdown, or a repo-local `TODO.md` for task tracking. Older Moe docs may refer to `TodoWrite`; treat that as the task-tracking action above.

## Invoking a skill

Pi has native skills but does not expose Claude Code's `Skill` tool. Where a Moe
instruction says to invoke a skill, use Pi's native skill system instead: load
the relevant `SKILL.md` with `read` when the skill applies, or let a human invoke
`/skill:name` explicitly.

## Native rendering ladder

The shared native-rendering ladder lives at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/native-rendering.md`. On Pi, rung 1 (the Claude Code Artifact tool) is not exposed — skills that render should start at rung 2 (brainstorm browser companion) and drop to rung 3 (local HTML file) or rung 4 (markdown file) when a browser is unavailable.

## Built-in tools are lowercase

Pi's built-in coding tools are `read`, `write`, `edit`, `bash`, plus optional
`grep`, `find`, and `ls`. Use those for the corresponding actions: read a file,
create or edit files, run shell commands, search file contents, find files by
name, and list directories.
