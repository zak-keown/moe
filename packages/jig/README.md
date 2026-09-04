# Moe Jig

Turns prose-only moe skill conventions into deterministic CLI commands.
Produces correct output regardless of which model or harness runs them —
enforcement that does not depend on an agent remembering a convention.

**Status:** Published as `@bubstack/moe-jig` 0.1.4. Not a plugin — an
npm-published CLI (see `ARCHITECTURE.md` §3).

## CLI

Two invocation forms reach the same program: the direct bin, and the `moe`
dispatcher (`jig` is one of its eight namespaces).

```sh
moe-jig worktree create <branch>
moe-jig plan init <name>
moe-jig spec init <name>
moe-jig backlog add <title...>
moe-jig backlog list --status open
# also reachable through the dispatcher:
moe jig backlog triage
```

Ten command groups are registered: `worktree`, `plan`, `spec`, `review`,
`commit`, `iterations`, `context`, `adr`, `progress`, and `backlog`. Run
`moe-jig --help` and `moe-jig <group> --help` for the current surface.

## Extensions

At startup jig probes for `@bubstack/moe-jig-graph/jig-extension` and merges any
commands it exports into existing groups (for example `plan validate` and `plan
seed`). A missing or unresolvable extension is silent — jig continues with its
built-ins. A name collision is **not** silent: jig throws rather than shadow a
built-in command (`src/extension.ts`).

## Layout

- `cli.ts` — the commander surface (the ten groups above).
- `backlog.ts` — the durable backlog stored in `.moe/backlog/`.
- `parser.ts` + `worktree.ts` — plan parsing, wave computation, and the
  parallel-dispatch worktree gate.
- `extension.ts` — the extension-discovery contract, re-exported at `./extension`.
- `plan.ts`, `scaffold.ts`, `progress.ts`, `review.ts` — file scaffolding for the
  plan/spec, adr/context/iterations, progress, and review groups.

The package exports `.`, `./parser`, and `./extension`.

## Development

```sh
pnpm --filter @bubstack/moe-jig build
pnpm --filter @bubstack/moe-jig typecheck
pnpm --filter @bubstack/moe-jig test
```

Jig sits at L0 in the dependency topology (`ARCHITECTURE.md` §4), depends only on
`commander`, and is one of the eight namespaces fronted by `bin/moe.js`.
