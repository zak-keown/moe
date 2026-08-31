# Moe

> Just ask Moe.

A hard fork of the Superpowers ecosystem — 19 repositories, one workspace,
9 packages, rebranded stem to stern.

| | |
|---|---|
| **What the shape is and why** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **What was forked, from where, under what license** | [PARITY.md](./PARITY.md) |
| **Who to credit** | [NOTICE](./NOTICE) |

## Status

Target-shape only. No code imported yet. `ARCHITECTURE.md` is the spec; read it
before writing anything.

Origin is GitLab (`gitlab.tcdevops.com`); packages publish to the GitLab Package
Registry under `@bubstack`. Upstream stays on GitHub — those URLs are provenance,
not links to us.

## The 9 packages

| Package | Job |
|---|---|
| `@bubstack/moe-core` | The house skills: TDD, debugging, collaboration, iterative methodology, writing, plugin authoring |
| `@bubstack/moe-backstory` | Recover a behavioral spec from a codebase that never had one |
| `@bubstack/moe-memory` | Semantic recall over past sessions and journal entries |
| `@bubstack/moe-flight` | Drive web, CLI or TUI targets through acceptance criteria and grade them |
| `@bubstack/moe-mint` | Generate native plugin manifests for every harness from one config |
| `@bubstack/moe-crew` | Launch, control and monitor worker sessions over tmux |
| `@bubstack/moe-glass` | Zero-dependency Chrome DevTools Protocol client |
| `@bubstack/moe-tab` | Price an agent transcript — what the run cost you |
| `moe-proof` | Evals against small models (Python) |

## Two rules

1. **A repository is not an installable plugin.** Source lives in `packages/`;
   plugin manifests are generated into `/plugins/` by `@bubstack/moe-mint`. Never
   hand-edit a generated manifest.
2. **The snapshots in `.references/` are the spec, not upstream HEAD.** Pinned
   revisions are in [PARITY.md](./PARITY.md). Parity against a moving target is
   unfalsifiable.

## License

Apache-2.0 — the umbrella the inbound licenses permit. Upstream MIT, Apache-2.0
and public-domain notices travel with the code they cover. One unresolved
exposure is documented in [PARITY.md](./PARITY.md#license-exposure).
