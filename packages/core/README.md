# Moe Core

Moe's shared coding-agent skills, focused agents, and session hooks. The package
covers planning, context retrieval, implementation, debugging, review,
collaboration, writing, and plugin authoring.

## Layout

- `skills/` — source skills, including shared references.
- `agents/` — focused retrieval and review agents.
- `hooks/` — session bootstrap and guard hooks.
- `mint/` — plugin generation configuration.
- `test/` — metadata, content, hook, and behavior tests.

Skills are assigned to exactly one tier in `skill-tiers.yaml`. Add or remove a
skill there whenever its directory changes.

## Governance hook

`hooks/governance-marker-check` is an optional SessionStart hook that checks
whether a caller-configured governance policy is loaded on this machine, and
emits an installation hint when it is not. It is off by default and does
nothing until a fork opts in:

- `MOE_GOVERNANCE_MARKER` — the exact marker line (usually a policy
  document's H1) to look for in `~/.claude/CLAUDE.md` or
  `~/.codex/AGENTS.md`. Unset means the hook exits silently.
- `MOE_GOVERNANCE_POLICY_HINT` — optional text appended to the SessionStart
  context when the marker is missing, e.g. where to install it from.
- `MOE_GOVERNANCE_MARKER_CHECK_DISABLED` — any non-empty value disables the
  hook outright, regardless of the other two variables.

## Generated plugin

The installable output is generated under `/plugins` from `mint/*.yaml`.
Never hand-edit the generated manifest.

## Development

```sh
pnpm --filter @bubstack/moe-core typecheck
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core test:python
pnpm --filter @bubstack/moe-core test:shell
pnpm mint
```

Some optional suites require Python, Graphviz, or a browser runtime; see the
root `AGENTS.md` for the supported gate matrix.
