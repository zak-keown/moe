# Kimi Code Tool Mapping

Skills speak in actions ("ask the user", "create a todo", "dispatch a reviewer").
On Kimi Code these resolve to the tools below.

**Extracted from a manifest on import.** Upstream this mapping existed only as a
1,400-character `skillInstructions` string inside `.kimi-plugin/plugin.json`, a
hand-maintained manifest that `@bubstack/moe-mint` now generates. A mapping
living inside a generated file is lost on the next `generate`, so it lives here.

## Asking the user

- When a skill says to ask the user, ask clarifying questions, ask one question
  at a time, present multiple-choice options, use the terminal for a question, or
  wait for the user's choice, call Kimi Code's `AskUserQuestion` tool. Do not
  render those choices as plain assistant text unless `AskUserQuestion` is
  unavailable or the session is in auto permission mode.
- For `AskUserQuestion`, provide 1 question with 2–4 concrete options when
  possible. Put the recommended option first and suffix its label with
  `(Recommended)`.

## Task tracking

- Where a skill refers to `TodoWrite`, use Kimi Code's `TodoList` tool.

## Subagents

- Where a skill says `Task tool (general-purpose)` or asks you to dispatch an
  implementer or reviewer subagent, use Kimi Code's `Agent` tool with a Kimi
  subagent type. Do **not** pass `general-purpose` as `subagent_type`.
- For implementation, code review, spec review, quality review, and any filled
  subagent prompt template this plugin ships, call `Agent` with
  `subagent_type: "coder"`, paste the fully filled prompt into `prompt`, and
  provide a short `description`.
- For read-only codebase exploration that would take several searches, use
  `Agent` with `subagent_type: "explore"`.
- For read-only planning or architecture design, use `Agent` with
  `subagent_type: "plan"`.
- Keep dependent subagent steps sequential. Use multiple `Agent` calls, or
  `run_in_background: true` only when the work is independent and background
  agents are available.

## Everything else

- Where a skill refers to the `Skill` tool, use Kimi Code's native `Skill` tool.
- Use Kimi Code's `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `FetchURL`,
  `WebSearch`, and MCP tools by their actual exposed names.
- Search file contents with `Grep`; find files by path or pattern with `Glob`;
  fetch a URL with `FetchURL`; search the web with `WebSearch`.
