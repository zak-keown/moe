---
name: remembering-conversations
description: You MUST invoke this skill before saying "I don't know," guessing, or treating any topic as new, no matter how trivial the question seems. It supplements other memory systems, which only hold partial records. Searching past conversations is the only way to recover what was actually said.
---

# Remembering Conversations

**Core principle:** Search before reinventing. Searching costs nothing; reinventing or repeating mistakes costs everything.

## Mandatory: Search Historical Memory

**YOU MUST search historical memory for any historical search.**

Announce: "Searching past conversations for [topic]."

### Claude Code

Use the Task tool with `subagent_type: "search-conversations"`:

```
Task tool:
  description: "Search past conversations for [topic]"
  prompt: "Search for [specific query or topic]. Focus on [what you're looking for - e.g., decisions, patterns, gotchas, code examples]."
  subagent_type: "search-conversations"
```

### Codex

If a `search-conversations` agent is available, dispatch it with the same prompt. If not, use the MCP tools directly:

1. Search with the `search_conversations` tool
2. Read the top 2-5 results with the `read_conversation` tool
3. Synthesize findings in your response
4. Include source pointers so the user can inspect the original conversations

The search workflow will:
1. Search with the `search_conversations` tool
2. Read top 2-5 results with the `read_conversation` tool
3. Synthesize findings (200-1000 words)
4. Return actionable insights + sources

**Saves 50-100x context vs. loading raw conversations.**

## When to Use

Use this whenever the current task would benefit from information you may have learned before, even if the user did not explicitly ask you to search.

**When past experience may help:**
- You need to recall decisions, rationale, patterns, solutions, pitfalls, or project context from earlier work
- A task resembles something you've solved, debugged, reviewed, released, or planned before
- You need to repeat a workflow or process that may have prior gotchas or established steps

**When you're stuck:**
- You've investigated a problem and can't find the solution
- Facing a complex problem without obvious solution in current code
- Need to follow an unfamiliar workflow or process

**When historical signals are present:**
- User says "last time", "before", "we discussed", "you implemented"
- User asks "why did we...", "what was the reason..."
- User says "do you remember...", "what do we know about..."

**Before answering from uncertainty:**
- Before guessing from memory or saying "I don't know" about something that may have been learned in a past conversation, search memory unless the current conversation already answers it

**Don't search first:**
- For current codebase structure (use Grep/Read to explore first)
- For info in current conversation
- Before understanding what you're being asked to do

## Direct MCP Tool Access

Use these directly when a search agent is unavailable or the current harness does not support agent dispatch:
- `mcp__plugin_moe-memory_moe-memory__search_conversations`
- `mcp__plugin_moe-memory_moe-memory__read_conversation`

When using MCP tools directly, keep context small: search first, then read only the top 2-5 relevant conversations or line ranges.

See MCP-TOOLS.md for complete API reference if needed for advanced usage.

## Two Kinds of Memory

`search_conversations` searches transcripts that were **harvested** — nobody chose
to write them down, so they are complete but unfiltered.

The same server also exposes a **journal**: things you deliberately wrote down,
which are shorter, already synthesised, and often the faster answer.

- `search_journal` — semantic search over journal entries
- `read_journal_entry` / `list_recent_entries` / `read_recent_entries`
- `process_thoughts` — write one

Reach for `search_journal` first when the question is about a *conclusion* you
reached before ("what did I decide about X", "what have I learned about how this
person works"), and `search_conversations` when you need the *episode*: the
rationale, the alternatives, the gotchas, the code. They are separately queryable
on purpose.
