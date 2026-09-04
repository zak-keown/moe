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

## Packages

| Package | Job |
|---|---|
| `@bubstack/moe-core` | Coding-workflow skill library — brainstorming, planning, TDD, debugging, review, worktrees, plugin authoring |
| `@bubstack/moe-backstory` | Recover a behavioral specification from an existing system |
| `@bubstack/moe-memory` | Semantic recall over sessions and journals |
| `@bubstack/moe-flight` | Drive and grade web, CLI, or TUI acceptance criteria |
| `@bubstack/moe-mint` | Generate native plugin manifests for supported harnesses |
| `@bubstack/moe-crew` | Launch and supervise coding-agent workers through tmux |
| `@bubstack/moe-glass` | Direct Chrome DevTools Protocol access |
| `@bubstack/moe-statusline` | Auto-configure a vendored statusline on session start (Claude Code only) |
| `@bubstack/moe-jig` | Deterministic enforcement tooling for skill conventions |
| `@bubstack/moe-jig-graph` | Graph-grounded plan validation extending `jig` |
| `@bubstack/moe-tab` | Parse usage records and estimate transcript cost |
| `moe-proof` | Run and grade model evals |

## Command line

One dispatcher fronts the tool namespaces:

```sh
moe
moe flight qa run story.md
moe tab price session.jsonl
moe crew list
```

Namespaces are `crew`, `flight`, `glass`, `jig`, `memory`, `mint`, `proof`,
and `tab`. The direct `moe-<namespace>` binaries remain valid.

**Harness support.** Moe ships plugins for eight harnesses. `claude-code` is
the certify tier (validated in CI); the other seven — `cursor`, `codex`,
`kimi`, `opencode`, `pi`, `agent-plugins-1.0`, `copilot` — are preview: skills
work everywhere, but commands, agents, hooks, and MCP vary by harness.
MCP-backed plugins (`moe-memory`, `moe-glass`) reach only four harnesses;
elsewhere they degrade to skills. See each plugin's `docs/support-matrix.md`.

## Development

Requirements: Node 24+, pnpm 11.23.0, and the package-specific runtimes for
Rust or Python work.

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
