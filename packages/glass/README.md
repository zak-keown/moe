# @bubstack/moe-glass

Direct Chrome DevTools Protocol access. Skill mode (17 CLI commands via
`chrome-ws`) plus MCP mode (a single `use_browser` tool). Auto-starts Chrome.

Ships as the **`moe-glass`** plugin, generated into `/plugins/moe-glass` by
`@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** imported. 510 tests passing across 48 suites.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `superpowers-chrome` | `782358e` | MIT |

MIT, not the repo's Apache-2.0 — the inbound license governs and the upstream
`LICENSE` (Copyright © 2025 Jesse Vincent) is retained verbatim.

## Layout

```
src/               MCP server (TypeScript). Was mcp/src/ upstream.
skills/browsing/   The skill: SKILL.md, the chrome-ws CLI, 32 zero-dependency lib modules.
agents/            browser-user, a read-only analysis agent.
test/              48 vitest suites (510 tests).
  manual/          Seven upstream issue-repro scripts, kept as provenance.
  scenarios/       14 manual QA scenario cards.
docs/cdp/          CDP research notes: flatten mode, target lifecycle, timing races.
docs/history/      Upstream plans, specs and dev notes. Inherited record — see below.
```

## Not zero-dependency

The plugin description upstream says "zero dependencies", and the *skill* half is
— `skills/browsing/lib/` uses platform built-ins only. The MCP half has two
runtime dependencies, `@modelcontextprotocol/sdk` and `zod`. Keep the skill half
dependency-free; that is what makes it usable without an install step.

## What changed on import

**Flattened `mcp/`.** The nested npm project (its own `package.json`,
`package-lock.json` and `tsconfig.json`) is gone; `mcp/src/` is now `src/`. Two
runtime path resolutions shifted with it — `src/index.ts` loads
`../skills/browsing/chrome-ws-lib.js` through `createRequire` (was `../../`), and
six test files pointed at `mcp/dist/index.js`.

**`node --test` → vitest.** All 51 suites converted: the import source changed,
and node:test's `before`/`after` became `beforeAll`/`afterAll` in 4 files.
`node:assert` assertions were left alone — they work unchanged.

**Two vitest projects.** Three suites drive a real Chrome. `pnpm test` runs the
CI-safe set; `pnpm test:chrome` is opt-in. Upstream ran everything in one pass
and shipped no CI, which does not survive contact with a container.

**Dropped `scripts/check-bundle-fresh.sh`.** It compared a committed `dist/`
against a fresh build. `dist/` is gitignored here, so its premise is gone. The
invariant it protected is still covered: `test/bundle-drift.test.mjs` checks that
every `chromeLib.X(` call in the built bundle exists on the lib session object,
and turbo's `test dependsOn build` guarantees the bundle is present.

**Dropped `.private-journal/`** — three of the upstream author's private journal
entries, committed upstream. Not ours to redistribute.

**One real bug fixed.** `--port=` with an empty value parsed to `NaN` and became
a silently-broken port. Found by the workspace's `noUncheckedIndexedAccess`,
which was the only error the strict base produced across 1000+ imported lines.

## Rebrand, and what was deliberately left alone

Renamed: the package and bin (`superpowers-chrome-mcp` → `moe-glass`), the MCP
server key (`chrome` → `moe-glass`), the agent's tool and skill references, the
XDG cache namespace (`~/.cache/superpowers/` → `~/.cache/moe/`), the default
Chrome profile (`superpowers-chrome` → `moe-glass`, falling through to `-2`,
`-3`), and two lock-file prefixes. 133 substitutions across 30 files.

**`chrome-ws` keeps its name.** It describes what it is — a Chrome WebSocket
client — and it is referenced throughout `SKILL.md` and the 17 CLI commands.
Renaming it buys no identity and costs churn. Same for the `browsing` skill name
and the `CHROME_WS_*` environment variables.

**`CHANGELOG.md`, `LICENSE` and `docs/history/` are untouched.** They describe a
project that *was* called superpowers-chrome. Rewriting them would falsify the
record and, for `LICENSE`, break the MIT notice. This is the same rule the URLs
follow: provenance is preserved, self-reference is rewritten.

## Follow-ups

- `test/lib/chrome-process.test.mjs` restores a patched module cache in a
  `finally` that a timeout skips, which then fails the next test in the file. One
  real-Chrome test carries a 30s timeout to avoid tripping it; an `afterEach`
  restore would be sturdier.
- The same file keeps a per-`it` setup helper that worked around node:test
  lacking describe-scope hooks. vitest's `beforeEach` would do it; converting is
  a behavior change, not a rename.
- `test/scenarios/` are acceptance-criteria cards in all but name. They should
  become `@bubstack/moe-flight` story cards once flight lands.
