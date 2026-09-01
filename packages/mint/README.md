# Moe Mint

Mint generates native coding-agent plugin layouts from one YAML configuration.
It validates inputs, applies harness adapters, emits hooks and manifests, and
checks the resulting compatibility matrix.

## CLI

```sh
moe-mint init
moe-mint validate
moe-mint generate
moe-mint matrix
moe-mint test
moe-mint bump
```

Run `moe-mint <command> --help` for command-specific options.

## Layout

- `src/` — CLI, validation, generation, and adapters.
- `schemas/` — configuration schemas.
- `checks/` — generated-output checks.
- `fixtures/` — representative plugin configurations.
- `docs/` — current configuration and command reference.

At the repository root, `pnpm mint` generates `/plugins` from
`packages/*/mint/*.yaml`. Never hand-edit generated plugin output.

## Development

```sh
pnpm --filter @bubstack/moe-mint build
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint test
pnpm mint:check
```
