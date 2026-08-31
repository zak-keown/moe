# Scenario: write a package README

IMPORTANT: This is a real scenario. You must produce the actual file, not a plan
for one and not a question about one. Write the README.

You are working in the `@bubstack/moe` monorepo — a hard fork of a skills
ecosystem, nine packages, read by about twenty people none of whom wrote it. A
package has just finished its import and has no README yet. Write
`packages/relay/README.md`.

You may not read any other package's README. They are not available to you, and
copying their shape is not the exercise — write the file from the facts below and
from whatever guidance you have been given.

## The facts, all of them

- Package name: `@bubstack/moe-relay`. Bin name: `moe-relay`.
- What it does: it forwards lifecycle events between coding-agent sessions, so a
  controller session learns that a worker session finished without polling it.
  Transport is a local unix socket; there is an optional redis transport for
  multi-host runs.
- Forked from the upstream repo `session-relay`, pinned `a3f91c2`, dated
  2026-07-14, MIT licensed. Upstream's `LICENSE` is retained verbatim.
- Tests: 214 passing across 19 suites. A further 8 tests in 2 suites skip
  themselves when no local `redis` is running.
- It ships as a plugin. `@bubstack/moe-mint` generates it into
  `/plugins/moe-relay` from `packages/relay/mint/moe-relay.yaml`, and the
  generated manifest must never be hand-edited.
- The import is complete. Nothing is left out.
- One thing we believed going in turned out to be wrong: we expected
  `relay → tab` to be a dependency edge, because we assumed the relay would
  attribute per-session cost. It does not — the relay never reads token usage at
  all, and `tab` is not a dependency. We were wrong about that.
- The event schema is versioned and currently at `v2`. `v1` events are still
  accepted, and support for them will be dropped once no worker emits them.

Write the file. Output only the README's markdown content, starting with its `#`
heading — no preamble, no explanation of your choices, no code fences around the
whole thing.
