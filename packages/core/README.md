# Moe Core

Moe's shared coding-agent skills and session hooks. The package covers planning,
implementation, debugging, review, collaboration, writing, and plugin authoring.

## Layout

- `skills/` — source skills, including shared references.
- `hooks/` — session bootstrap and guard hooks.
- `mint/` — plugin generation configuration.
- `test/` — metadata, content, hook, and behavior tests.

Skills are assigned to exactly one tier in `skill-tiers.yaml`. Add or remove a
skill there whenever its directory changes.

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
