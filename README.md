# Moe

<img src="./assets/moe.png" alt="Moe: a green, many-armed alien in a headset, working eight control surfaces at once, thoroughly unimpressed" width="220" align="right">

> Just ask Moe.

A hard fork of the Superpowers ecosystem — 19 repositories, one workspace,
9 packages, rebranded stem to stern.

Eight arms, eight control surfaces, one bored expression. That is the whole
premise: one operator driving every harness at once, from one place.

| | |
|---|---|
| **What the shape is and why** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **What was forked, from where, under what license** | [PARITY.md](./PARITY.md) |
| **Who to credit** | [NOTICE](./NOTICE) |

## Status

**All 19 upstream repositories are imported and integrated.** Nine packages
build, ~3,400 tests pass, and `pnpm mint` generates six installable plugins into
`/plugins/` from one config each. `ARCHITECTURE.md` remains the spec — read it
before writing anything, because it records *why* the shape is what it is, which
the tree cannot tell you.

What is not done: nothing is published to any registry, the eval container image
has not been built, and 15 items sit in `.planning/backlog/` on a seven-wave
schedule (`.planning/backlog/WAVES.md`).

Origin is GitLab, self-hosted at `gitlab.tcdevops.com/Zak/moe`. A private mirror
exists at `gitlab.com/moe-ai/moe`; the self-hosted one is canonical, and every
self-referential URL in the tree points there. Upstream stays on GitHub — those
URLs are provenance, not links to us.

> **Note on the `@bubstack` scope.** It no longer matches the project's
> top-level group, which is `Zak`. GitLab's *instance-level* npm registry
> requires scope to equal group, so publishing would need the *project-level*
> endpoint instead. This blocks nothing today because nothing publishes; see
> ARCHITECTURE §8.

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
2. **The snapshots in `../.moe-references/` are the spec, not upstream HEAD.** Pinned
   revisions are in [PARITY.md](./PARITY.md). Parity against a moving target is
   unfalsifiable.

## License

Apache-2.0 — the umbrella the inbound licenses permit. Upstream MIT, Apache-2.0
and public-domain notices travel with the code they cover. One unresolved
exposure is documented in [PARITY.md](./PARITY.md#license-exposure).
