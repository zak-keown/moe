# Task 6 report — Plan 1 cache and projection gate

Base: `1ce1b76`

## RED

Added `registry projections > declares Plan 1 registry authorities as Mint
inputs and checks every projection` in
`packages/mint/test/platform-projections.test.ts`.

`mise exec -- pnpm --filter @bubstack/moe-mint exec vitest run
test/platform-projections.test.ts` exited 1 as intended. The new assertion
reported that `//#mint:generate` lacked `moe-platform.yaml`,
`packages/*/package.json`, and `packages/mint/src/adapters/**` in its inputs.

## GREEN

- Added the Plan 1 registry, package-manifest, and adapter source inputs; kept
  the `@bubstack/moe-mint#build` dependency; and declared the marketplace and
  public catalog as generated outputs.
- Expanded `mint:check` to diff and porcelain-check `plugins/`,
  `.claude-plugin/marketplace.json`, and
  `docs/moe/generated/plugin-catalog.md`.
- Updated the design status to `Implementation in progress; platform-registry
  plan complete.`
- Applied the formatter-prescribed, behavior-preserving formatting repair in
  `scripts/mint-plugins.mjs`, which was required for the root lint gate.

Fresh final verification:

| Command | Result |
| --- | --- |
| `mise exec -- pnpm --filter @bubstack/moe-mint typecheck` | exit 0 |
| `mise exec -- pnpm --filter @bubstack/moe-mint test` | exit 0; 445 passed, 5 established dogfood skips |
| `mise exec -- pnpm mint` | exit 0; six plugins generated |
| `mise exec -- pnpm mint:check` | exit 0; forced second generation byte-identical |
| `mise exec -- pnpm check` | exit 0; 29 Turbo tasks successful |

`git status --short -- plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md`
produced no output after generation.

## Residual boundary

This task intentionally does not assert Plan 2 runtime-output cache coverage
or Plan 3 legal/bundle cache coverage. Those remain future plan work.
