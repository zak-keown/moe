# Moe Glass

Glass provides direct Chrome DevTools Protocol access for coding agents. It can
run as a CLI-backed skill or as an MCP server exposing one `use_browser` tool.
Chrome starts automatically when needed, with isolated persistent profiles for
parallel sessions.

## Layout

- `src/` — the executable and MCP transport.
- `skills/browsing/` — browser actions and CDP implementation.
- `agents/` — browser-focused agents.
- `docs/cdp/` — current protocol notes.
- `mint/` — plugin generation configuration.

The installable plugin is generated under `/plugins`. Never hand-edit the
generated manifest.

## Development

```sh
pnpm --filter @tc/moe-glass build
pnpm --filter @tc/moe-glass typecheck
pnpm --filter @tc/moe-glass test
pnpm --filter @tc/moe-glass test:chrome
```

`test:chrome` requires a local Chrome installation and is not part of the
normal Node-only gate.
