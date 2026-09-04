---
name: smoothing-the-experience
description: Use when a developer wants to reduce repeated agent permission prompts, audit permanent tool permissions, or inspect recent Claude Code and Codex sessions for safe allow rules
---

# Smoothing the Experience

Run the skill-owned helper with Node. The audit is local, deterministic, on demand, and never a background service. It evaluates Claude Code and Codex on a best-effort basis. Report any other installed harness as `not evaluated`; do not imply that Moe audited it.

1. Resolve `<skill-dir>` to the directory containing this loaded `SKILL.md`, using the current harness's installed skill path. Under Claude Code this is `${CLAUDE_PLUGIN_ROOT}/skills/smoothing-the-experience`; repository development may use `packages/core/skills/smoothing-the-experience`.
2. Run `node "<skill-dir>/scripts/smooth.mjs" scan --days 30`.
3. Present Claude Code and Codex separately. Preserve `not evaluated`, `blocked`, and `no narrow renderer` dispositions.
4. Ask the user to select individual candidate IDs. Never offer select-all.
5. Run `node "<skill-dir>/scripts/smooth.mjs" plan --select <comma-separated-ids>` for exactly one harness and show the exact diff.
6. Explain the destination and whether a new session is required.
7. Do not run `apply` until the user explicitly confirms that exact diff, one harness at a time.
8. Pass the plan path and printed confirmation token to `node "<skill-dir>/scripts/smooth.mjs" apply --plan <path> --confirm <token>`. Report whether the change applied and whether the user must start a new session. Leave every other harness unchanged.

Never summarize raw transcripts, broaden a rule, reinterpret an ineligible item, or bypass a helper refusal.
