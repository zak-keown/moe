# @bubstack/moe-example

Forward lifecycle events between sessions. Who finished, without polling.

A local unix socket carries the events; an optional redis transport covers
multi-host runs. One bin, `moe-example`.

Ships as the **`moe-example`** plugin, generated into `/plugins/moe-example` by
`@bubstack/moe-mint`. Never hand-edit the generated manifest.

**Status:** imported. 214 tests passing across 19 suites; 8 more in 2 suites skip
themselves without a local `redis`.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `session-relay` | `a3f91c2` | MIT |

## What we were wrong about

**`example → tab` is REFUTED.** We expected a cost-attribution edge. This package
never reads token usage, so there is no edge and `tab` is not a dependency.
