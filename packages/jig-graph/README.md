# Moe Jig-Graph

Grounds jig's plan commands in the moedex code graph.
A jig extension, not a standalone CLI — it ships no `bin` and is consumed only
through `@bubstack/moe-jig`.

**Status:** Published as `@bubstack/moe-jig-graph` 0.1.0. Not a plugin, and not a
standalone binary — a jig extension.

## Commands

Install jig-graph alongside jig; jig discovers it at startup and adds two
commands to its `plan` group:

```sh
moe jig plan validate <plan.md> [--json]
moe jig plan seed <topic> [--entry <file>]
```

`validate` compares a plan's `Files:` blocks against the graph and reports four
warning-level checks — uncovered files, missing edges, wave conflicts, and
phantom files. Findings are always `warning` severity; validate never fails the
process (`src/report.ts`: "Findings are always 'warning' severity"). `seed`
emits a graph-grounded plan skeleton — coupling-clustered tasks with
`depends_on` edges — for a topic or an entry point.

`plan validate --manifest` is **not** yet implemented: the flag is advertised in
the command's options, but its handler prints an error and exits 1
(`src/jig-extension.ts`; tracked `BL-b96fd965e2`).

## Requires moedex

Both commands talk to a moedex MCP daemon over HTTP at `MOEDEX_MCP_HTTP_ADDR`
(default `http://127.0.0.1:8081`). The client degrades gracefully: when moedex is
unreachable, `validate` falls back to the phantom-files check and exits 0, while
`seed` hard-requires moedex and exits 1 without it (`src/moedex.ts`,
`src/jig-extension.ts`).

## Layout

- `jig-extension.ts` — the `commands` export consumed via `./jig-extension`.
- `moedex.ts` — `MoedexClient`, the HTTP MCP client.
- `validate.ts` — the four validation checks.
- `seed.ts` — plan-skeleton generation.
- `report.ts` — the `Finding` type and human/JSON formatting.

## Development

```sh
pnpm --filter @bubstack/moe-jig-graph build
pnpm --filter @bubstack/moe-jig-graph typecheck
pnpm --filter @bubstack/moe-jig-graph test
```

Depends on `@bubstack/moe-jig` (`workspace:*`) and `@modelcontextprotocol/sdk`;
it extends jig without jig depending on it — the edge is one-directional, since
jig only probes for it optionally.
