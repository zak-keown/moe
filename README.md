# Moe

<img src="./assets/moe.png" alt="Moe: a green, many-armed alien in a headset, working eight control surfaces at once" width="220" align="right">

> Just ask Moe.

Moe puts coding-agent skills, memory, browser control, worker orchestration,
software QA, transcript pricing, and model evals in one workspace.

| | |
|---|---|
| **Install** | [INSTALL.md](./INSTALL.md) |
| **Architecture** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Contribute** | [CONTRIBUTING.md](./CONTRIBUTING.md) · [AGENTS.md](./AGENTS.md) |
| **Attribution** | [NOTICE](./NOTICE) |

## Install

With the TC ProGet `@tc` scope and authentication already configured:

```sh
npx @tc/moe install
```

This is the end-user bootstrap: it runs the prerequisite check, persists the
exact TC release, and installs the Moe plugins. It is an applying command, not
a dry-run, and does not require a repository checkout or pnpm. See
[INSTALL.md](./INSTALL.md) for platform details, scoping, upgrades, and
uninstalling.

## Packages

| Package | Job |
|---|---|
| `@tc/moe-core` | Everyday and full coding-workflow skill libraries |
| `@tc/moe-backstory` | Recover a behavioral specification from an existing system |
| `@tc/moe-memory` | Semantic recall over sessions and journals |
| `@tc/moe-flight` | Drive and grade web, CLI, or TUI acceptance criteria |
| `@tc/moe-mint` | Generate native plugin manifests for supported harnesses |
| `@tc/moe-crew` | Launch and supervise coding-agent workers through tmux |
| `@tc/moe-glass` | Direct Chrome DevTools Protocol access |
| `@tc/moe-tab` | Parse usage records and estimate transcript cost |
| `moe-proof` | Run and grade model evals |

## Command line

One dispatcher fronts the tool namespaces:

```sh
moe
moe flight qa run story.md
moe tab price session.jsonl
moe crew list
```

Namespaces are `crew`, `flight`, `glass`, `memory`, `mint`, `proof`, and `tab`.
The direct `moe-<namespace>` binaries remain valid.

## Contributor development

This is the separate workflow for a repository checkout. Requirements: Node
24+, pnpm 11.23.0, and the package-specific runtimes for Rust or Python work.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm mint:check
pnpm provenance
```

Source lives in `packages/`; installable plugins are generated into `plugins/`.
Never hand-edit generated plugin output.

## License

Moe's umbrella license is Apache-2.0. Imported MIT, Apache-2.0, and
public-domain material is identified in [NOTICE](./NOTICE); complete legal texts
are in [LICENSE](./LICENSE) and [LICENSE-MIT](./LICENSE-MIT).
