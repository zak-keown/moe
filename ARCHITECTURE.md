# Moe — architecture

> Just ask Moe.

Moe is one workspace for coding-agent skills, browser control, memory, session
orchestration, QA, transcript pricing, and evals. Nine source packages produce
six installable plugins and seven command namespaces.

This file records why the current shape exists. `PARITY.md` is the internal
import ledger; `NOTICE` is the public attribution register.

## 1. The two structural rules

### A repository is not an installable plugin

Source lives in `packages/`. Installable plugin trees are generated into
`plugins/` by `@bubstack/moe-mint`. This separation allows one source package to
emit multiple curated plugins and prevents harness-specific manifests from
becoming source-of-truth files.

Never hand-edit `plugins/`. Change a package's mint config or source content and
run `pnpm mint`; `pnpm mint:check` proves the committed output is reproducible.

### Dependencies describe runtime reachability

A package may import only what its own `package.json` declares. Root TypeScript
project references mirror that runtime graph. Test-only references belong in
`tsconfig.tests.json`, where they cannot create a circular production graph.

## 2. Repository shape

```text
moe/
├── .claude-plugin/marketplace.json
├── bin/                         dispatcher, installer, doctor
├── packages/
│   ├── core/                    everyday and full skill libraries
│   ├── backstory/               behavioral-spec recovery
│   ├── memory/                  semantic session and journal recall
│   ├── flight/                  QA runner and dashboards
│   ├── mint/                    plugin generator
│   ├── crew/                    tmux worker orchestration
│   ├── glass/                   Chrome DevTools Protocol client
│   └── tab/                     Rust transcript-pricing core and bindings
├── py/proof/                    model evals, Python + uv
├── infra/container/             shared harness test image
├── plugins/                     generated installable artifacts
├── scripts/                     repository generators and checks
├── LICENSE                      canonical Apache-2.0 text
├── LICENSE-MIT                  canonical MIT text
├── NOTICE                       attribution and change notice
└── PARITY.md                    internal frozen-source ledger
```

## 3. Packages

| Package | Responsibility | Distribution |
|---|---|---|
| `@bubstack/moe-core` | Planning, context retrieval, TDD, debugging, review, collaboration, writing, plugin authoring, and architecture skills | generated `moe` plugin |
| `@bubstack/moe-backstory` | Recover a behavioral specification from code and observable evidence | generated `moe-backstory` plugin |
| `@bubstack/moe-memory` | Index and search conversations and journals through one store and MCP server | npm-backed `moe-memory` plugin |
| `@bubstack/moe-flight` | Drive web, CLI, or TUI targets through acceptance criteria and render results | internal only; never distributed |
| `@bubstack/moe-mint` | Generate native plugin manifests and installation metadata | workspace tool |
| `@bubstack/moe-crew` | Launch and supervise coding-agent workers through tmux | generated `moe-crew` plugin |
| `@bubstack/moe-glass` | Direct Chrome DevTools Protocol access through a skill and MCP server | npm-backed `moe-glass` plugin |
| `@bubstack/moe-tab` | Parse usage records and estimate transcript cost in Rust | workspace library and CLI |
| `moe-proof` | Run and grade model evals | internal Python tool |

`core` emits a single `moe` plugin from its source tree. Membership and
rationale live in `packages/core/skill-tiers.yaml` as a fidelity ledger, and
metadata tests pin completeness of the imported set. `core` used to emit two
plugins (a lean `moe-core` and a full `moe-everything`); the split was retired
2026-09-01 because the resident cost of shipping every description (~1.5k
tokens) was not a budget worth curating against, and one plugin is a simpler
install story.

## 4. Dependency topology

```text
L0   tab        glass        mint
      │                       ▲
L1   memory     crew          │ reads content as files
      │                       │
L2              flight ───────┘
```

The only cross-package code edge is `flight → tab`. Flight imports the
TypeScript binding, declares it as `workspace:*`, and references the binding's
TypeScript project.

Flight's two frontend workspaces are build-order edges. They emit assets that
flight serves; the server does not import their application symbols.

Glass and flight contain separate CDP implementations. Flight's copy has
behavior required by its evidence and credential workflows, so convergence is
a future refactor rather than a dependency edge.

Tab's bindings cross a C ABI rather than a module graph. The Rust symbols,
committed header, and TypeScript, Python, and Go bindings must change together;
`pnpm tab:test:bindings` is the equivalence gate.

## 5. Plugin generation

`scripts/mint-plugins.mjs` stages each plugin into its own generated root. A
staging root receives:

1. one `moe-mint.yaml` configuration;
2. the selected skills and other component directories;
3. a generated legal payload derived from the canonical root legal files; and
4. the manifests emitted by every supported harness adapter.

Staging is wiped before every run, directory traversal is sorted, and generated
manifests contain no timestamps. These properties make `pnpm mint:check` a byte
reproducibility check rather than a best-effort comparison.

The marketplace and plugin registry are checked in both directions. A generated
plugin without a listing is unreachable; a listing without a generator is
broken. Content plugins install from tracked local plugin directories. Memory
and glass use npm-source marketplace entries because their runtime dependencies
need normal package installation.

## 6. Toolchain and project references

- Node 24 and pnpm 11.23.0
- TypeScript 5.9 project references
- Turborepo for workspace ordering
- Vitest for Node package tests
- Biome for repository linting
- Cargo for tab
- uv and pytest for proof

Each TypeScript package uses two configurations:

- `tsconfig.json` is the production composite project and mirrors runtime
  dependencies;
- `tsconfig.tests.json` holds test-only reachability and is not a production
  solution edge.

Bundlers remain only where an artifact needs to be self-contained: crew's CLI
and hooks, glass's MCP bundle, flight's frontends, and similar loose-file entry
points.

pnpm postinstall scripts must be approved by package name under `allowBuilds` in
`pnpm-workspace.yaml`. The old pnpm 10 setting is ignored by pnpm 11.

## 7. Commands and runtime names

The dependency-free `bin/moe.js` dispatcher fronts seven permanent namespace
bins:

```text
moe crew       moe flight      moe glass      moe memory
moe mint       moe proof       moe tab
```

The corresponding `moe-<namespace>` binaries remain valid direct entry points
because manifests, MCP hosts, and scripts refer to them.

MCP server keys are `moe-memory` and `moe-glass`. State and cache paths use Moe
names exclusively. There is no compatibility or migration layer for retired
product identifiers, paths, or environment variables.

## 8. Installation and platforms

`bin/moe-doctor` checks hard prerequisites and reports optional capabilities.
`bin/moe-install` is dry-run by default and executes only with `--apply`. Both
are dependency-free Node scripts so they work before workspace installation.

macOS, Linux, and WSL2 are supported. Native Windows is not first-class yet:
crew requires tmux, hook execution requires bash, and sandbox support differs.
Every script and polyglot hook is pinned to LF by `.gitattributes`, including a
checkout reached from WSL through a Windows filesystem.

## 9. Verification and CI

The normal local gates are:

```sh
pnpm check
pnpm mint:check
pnpm provenance
```

`pnpm check` runs lint, typecheck, build dependencies, and tests across the Node
workspace. Rust and Python have path-scoped CI jobs and local commands. Chrome,
model-download, and tmux suites require runtimes unavailable in the base CI
image and are intentionally separate.

The single GitLab pipeline runs install, lint, typecheck, test, build, plugin
reproducibility, and provenance gates. Nothing publishes publicly. Flight is
also explicitly private because it contains an internal-only legal exception;
the exact controls are recorded in `PARITY.md`.

## 10. Hosting, provenance, and legal payloads

The canonical project is `gitlab.com/moe-ai/moe`. Package scope and
project group are intentionally decoupled; any future registry publication must
use a compatible project-level endpoint or move the project under a matching
group.

Current documentation and metadata point only at Moe. Original project names,
frozen revisions, and legal status live in `PARITY.md` and root `NOTICE`.
Historical evidence remains under `docs/history`, tests, fixtures, and planning
records, none of which is staged into installable plugins.

Root legal files are canonical. Physical copies inside generated plugin
artifacts exist because each plugin is independently distributed; they are
generated and never maintained by hand.
