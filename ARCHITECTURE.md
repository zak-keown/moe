# Moe — Architecture

> Just ask Moe.

A hard fork of the Superpowers ecosystem: 19 upstream repositories collapsed into
**9 packages** in one pnpm workspace, rebranded stem to stern, built and released
as a unit.

**Status:** written as a target-shape document, and the target is hit. All nine
packages are imported and censused (Wave A: crew, mint, tab, glass, proof; Wave
B/C: core, memory, flight), and `/plugins/` is generated — six plugins for all
eleven harnesses, built by `pnpm mint`, with CI asserting it regenerates
byte-identically. Every entry in §3's tree now exists. Sections describing
decisions are records; sections describing structure describe what is there.
Where a section is still forward-looking it says so.

---

## 1. Why a monorepo

The fork inherits five package managers (pnpm, npm, bun, cargo, pip), four
manifest formats per plugin (`plugin.json`, `gemini-extension.json`, `GEMINI.md`,
`AGENTS.md`) hand-maintained in parallel, and one real cross-repo dependency
consumed through the npm registry. The DX cost is concentrated in three places:

1. **Release friction.** `superpowers-evals` depends on
   `@primeradianthq/obol@^0.9.0`, which is `obol/bindings/typescript` in the repo
   next door. Changing a cost model today means publish-to-npm, then test.
2. **Manifest drift.** `superpowers` maintains its Claude Code, Gemini and agent
   manifests by hand. `everyharness` exists to generate exactly those from one
   config file, and only `the-elements-of-style` uses it.
3. **Duplicated substrate.** `episodic-memory` and `private-journal-mcp` ship the
   same four files (`embeddings.ts`, `paths.ts`, `search.ts`, `types.ts`) and
   embed with two different releases of the same library — `@xenova/transformers`
   is the former name of `@huggingface/transformers`. Two model downloads, two
   indexes, two MCP registrations.

## 2. The rule that makes the collapse safe

**A repository is not an installable plugin.**

Upstream those were the same unit, so every skill cluster that wanted its own
release cadence needed its own repository. Here they are separate concerns:
source lives in `packages/`, and installable plugin manifests are **generated**
into `/plugins/` by `@bubstack/moe-mint`. Plugin boundaries — a lean `moe-core` and a full
`moe-everything` — are a build-time choice, made once, changeable without moving
a file.

This is what makes a 31-skill `@bubstack/moe-core` acceptable. (**31 as of the
mattpocock-skills import; was 27, and 28 before that in this document.** Counted
by frontmatter `name:` across the seven pinned sources: superpowers 14,
iterative-development 6, superpowers-lab 4, mattpocock-skills 4, sp-dev-for-cc 2,
the-elements-of-style 1, double-shot-latte 0. The original 28th was almost
certainly `example-workflow`, a pseudo-skill inside an example plugin that is not
a skill. `packages/core/test/metadata.test.ts` asserts 31, and
`packages/core/README.md` raised the 27 correction as a root change.)

The usual objection to a large plugin is context cost — every skill description
loads every session — and it binds only if source layout dictates install
layout, which it doesn't. **But the objection is also much smaller than it
sounds, and that is worth stating rather than leaving as a reason someone can
lean on later.** Measured before the mattpocock-skills import: all 27 `name`
+ `description` pairs were 5,914 characters, roughly 1,480 tokens, and that was
the entire resident cost. The bodies were 230,342 characters, roughly 57,600
tokens, and Claude Code loads them on demand — the frontmatter descriptions *are* the dispatch table, nothing else
is resident. So the lean plugin saves on the order of a few hundred tokens a
session, not tens of thousands.

Which means the tiering is not justified by token budget, and
`packages/core/skill-tiers.yaml` no longer claims it is. It is justified by
**dispatch quality**: two skills claiming the same "use when …" trigger degrade
selection, and a skill you only ever invoke by name earns nothing by competing
for attention on every turn. That is a real cost and it does not shrink with
context windows.

**Decided 2026-08-31: `core` ships as two generated plugins from one source tree.**

| Plugin | Contents |
|---|---|
| `moe-core` | The everyday set. Lean enough that twenty people leave it on permanently. |
| `moe-everything` | All 31 skills, for whoever wants the full library. |

The lean set is a curation call, and it was the one open question this decision
created. It was *proposed* with per-skill rationale rather than chosen silently
during an import, and **reviewed and settled 2026-08-31**. The selection
principle: a skill earns a place in `moe-core` if it fires on ordinary work
without being asked for. A skill you invoke deliberately, by name, when you
already know you want it, belongs in `moe-everything`.

The curation lives in `packages/core/skill-tiers.yaml`, one rationale per skill.
The review deleted one of its two tiebreak rules — see the measurement above —
and kept the split. The mechanism that acts on it is
`scripts/mint-plugins.mjs`, which stages only a tier's skills before generating,
and two assertions in `packages/core/test/metadata.test.ts` keep that
falsifiable.

**Decided 2026-08-31 (second pass): three rules that follow from dispatch
quality.** A review of two external panel debates — on whether prompt-scaffolding
frameworks still earn their keep on current models — produced seven
recommendations. Three survived contact with this tree, and they extend the
dispatch-quality argument above rather than replacing it.

1. **A skill earns a deterministic trigger when a missed trigger fails
   silently.** Descriptions are semantic triggers, and `using-moe`'s twelve-row
   Red Flags table is upstream's own record of them under-firing. That is
   tolerable wherever a miss is loud: a skipped `dispatching-parallel-agents`
   yields serial execution, which is correct and merely slower. It is not
   tolerable for `verification-before-completion`, where a miss yields a false
   completion claim and no signal at all. Silent failure is the test, and today
   it selects exactly one skill.
2. **Firing rate is the tiebreaker for tier, trigger and removal.**
   `using-moe:16` routes every skill but itself through the Skill tool, so
   invocation is a tool call in the session transcript — countable
   deterministically, with no model in the loop. Zero firing is decisive (dead
   weight, or a trigger that never fires); high firing is *not* proof of value,
   because invocation is not compliance. It is a removal signal, not a keep
   signal, and removal is the decision this repo has least evidence for.
3. **Every catch splits into a mechanizable half and a judgment half, and the
   halves are maintained separately.** `verification-before-completion` is
   evidence capture (mechanical) plus goal-backward checking (judgment).
   `receiving-code-review`'s YAGNI check is a usage grep (mechanical) plus scope
   judgment. Anti-stub is a diff grep (mechanical); "more than was asked" is
   not. Where a half is mechanizable it belongs in a hook or a CI job and should
   not be re-litigated in prose; where it is not, prose is the only place it can
   live, and no tier of model removes the need for it.

A corollary on authoring, from the same review: **a catch phrased as an
unconditional instruction inverts badly across model tiers; a catch phrased as a
conditional, evidence-gated procedure does not.** `receiving-code-review:88-97`
fires only on review feedback and greps for real usage before it proposes
anything, so no path through it ends in a stub. That is why this repo ships both
polarities to every tier at once — anti-stub at `writing-plans:131-138`,
anti-over-engineering at `receiving-code-review:88-97` — instead of compiling a
per-tier skill set the way the review's cost-tier panel recommended.

## 3. Target tree

```
moe/
├── .claude-plugin/
│   └── marketplace.json        # the one marketplace (replaces two upstream stubs)
├── ../.moe-references/                # gitignored: 19 pinned snapshots, see PARITY.md
├── bin/                        # `moe` dispatcher + installer (see §7, §7.1)
├── packages/
│   ├── core/                   # 31 skills + hooks         [content]
│   ├── backstory/              # 22 skills + 2 agents      [content]
│   ├── memory/                 # MCP: moe-memory           [L1]
│   ├── flight/                 # QA + agent-eval harness   [L2]
│   │   └── dashboard/          #   (flattened from quorum's nested workspace)
│   ├── mint/                   # plugin-manifest generator [L0]
│   ├── crew/                   # tmux worker sessions      [L1]
│   ├── glass/                  # CDP browser, MCP: moe-glass [L0]
│   └── tab/                    # Rust crate + bindings     [L0]
│       └── bindings/{typescript,go,python}
├── py/
│   └── proof/                  # Python, uv                [independent]
├── infra/
│   └── container/              # eval/install-check runtime
├── plugins/                    # GENERATED by mint — never hand-edited. Tracked,
│                               #   because marketplace.json sources ./plugins/<name>.
│                               #   `pnpm mint` builds it; `pnpm mint:check` gates it.
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── ARCHITECTURE.md
├── PARITY.md
├── NOTICE
└── LICENSE
```

## 4. The 9 packages

| Package | Absorbs | Job |
|---|---|---|
| `@bubstack/moe-core` | superpowers, superpowers-lab, iterative-development, the-elements-of-style, superpowers-developing-for-claude-code, double-shot-latte, mattpocock-skills | The house skills: TDD, debugging, collaboration, iterative methodology, writing, plugin authoring, codebase design, and the stop-hook. 31 skills. |
| `@bubstack/moe-backstory` | greenfield | Recover a behavioral spec from a codebase that never had one. 22 skills, 2 agents. |
| `@bubstack/moe-memory` | episodic-memory, private-journal-mcp | One embedding layer, one store, two record types (conversation turn, journal entry), one MCP server. **Both halves are kept and genuinely reconciled** — decided 2026-08-31. |
| `@bubstack/moe-flight` | gauntlet, superpowers-evals (quorum) | Drive a target — web, CLI, or TUI — through acceptance criteria and grade it. Also drives nine agent CLIs side by side. |
| `@bubstack/moe-mint` | everyharness, everyharness-container | Generate native plugin manifests for every harness from one config. The monorepo's plugin build step. |
| `@bubstack/moe-crew` | claude-session-driver | Launch, control and monitor worker Claude sessions over tmux. |
| `@bubstack/moe-glass` | superpowers-chrome | Zero-dependency Chrome DevTools Protocol client. |
| `@bubstack/moe-tab` | obol | Price an agent transcript. What the run cost you. |
| `moe-proof` | smevals | Evals against small models. Python; stays Python. |

### Why these and not others

**Decided 2026-08-31: both of `flight`'s frontends are imported and made green** —
the React + Vite SPA (from `gauntlet/ui`) and the server-side reporter (from
quorum's `@quorum/dashboard`). They are not duplicates, and neither is dropped.

- **`flight` is one package, not two.** quorum's README states it drives agent
  CLIs *through a Gauntlet QA agent*; gauntlet is referenced across ~8 of
  quorum's test files. Gauntlet is quorum's execution engine, and they share the
  acceptance-criteria, verdict and evidence vocabulary. quorum's nested
  `packages/dashboard` workspace flattens into `packages/flight/dashboard` so it
  does not collide with the outer workspace.
- **`backstory` stays out of `core`.** 22 skills, 2 agents, and a genuinely
  different job. It is the only content repo that earns a boundary.
- **`proof` stays out of `flight`.** `proof` evaluates models, `flight`
  evaluates agent workflows and software under development. Three jobs sharing a
  syllable is not a merge argument — and it is Python.
- **`tab` stays out of `flight`.** It is flight's dependency, not its subset,
  and its Go and Python bindings serve consumers flight does not know about.
- **`glass` stays out of `flight`.** flight's web adapter drives Chrome, but
  glass is independently installable as an MCP server. Workspace edge, not merge.

## 5. Dependency layers

Edges flow one way, L0 → L2. Content packages have no code dependencies; `mint`
consumes them as data to emit plugin manifests.

```
L0   tab        glass        mint
      │           │            ▲
L1   memory     crew          │  (reads core, backstory as data)
      │           │            │
L2         flight ─────────────┘
```

**Confirmed edges** (from upstream manifests and imports):

- `flight → tab` — `superpowers-evals/package.json` depends on
  `@primeradianthq/obol@^0.9.0`, i.e. `obol/bindings/typescript`. Becomes
  `workspace:*`.
- `flight` internal — quorum → gauntlet.

**Census results, 2026-08-31.** All nine packages are now imported and censused.
Wave A covered five — `crew`, `mint`, `backstory`, `tab`, `proof` — with **zero
internal edges among them.** Every one is a leaf. Specifically:

- `mint` has no workspace dependencies in either direction. It reads plugin trees
  through the filesystem, not through module imports, so its tsconfig `references`
  stays `[]`. Confirms its L0 placement — stated positively here so nobody goes
  looking for the edge.
- **`proof → tab` is REFUTED.** It was inferred from the fact that `tab` ships a
  Python binding and `proof` is Python. `proof` contains no reference to it. Do not
  add the dependency without new evidence.

**Wave B/C census, 2026-08-31.** `core`, `memory` and `flight` are in, and both
candidate edges out of `flight` are now settled. Neither is an edge.

- **`flight → tab` is CONFIRMED and is the only inter-package code edge in the
  graph.** `packages/flight/src/lab/tab/index.ts` imports `CostEstimate` and
  `estimatePath` from `@bubstack/moe-tab`; `package.json` carries it as
  `workspace:*` and `tsconfig.json` references `../tab/bindings/typescript`. This
  is the edge `superpowers-evals`' dependency on `@primeradianthq/obol`
  predicted, and it survived the rename.
- **`flight → glass` is REFUTED as an edge, though the lineage is real.**
  `packages/flight/src/qa/adapters/web/lib/` is a hand-maintained *vendored fork*
  of what is now `packages/glass/skills/browsing/lib/` — 3 of 28 files still
  byte-identical, 22 diverged, and flight's fork carries six functions glass does
  not have (`setCookies`, `clearBrowserData`, `webAuthnOpenSession`,
  `openObserverSession`, `onCdpEvent`, `offCdpEvent`) that its passkey tool,
  evidence logger and screencast all depend on. There is **no import, require or
  resolved path** from flight to glass: flight requires its own copy at
  `./lib/chrome-ws-lib.js`, scoped back to CommonJS by a marker `package.json` —
  the same mechanism glass uses at `skills/browsing/package.json`. Converging
  them is a refactor, not a wiring change, and it is deferred deliberately.
  `packages/flight/docs/upstream-sync.md` is the spec for either
  direction.
- **`flight → crew` is REFUTED.** The single occurrence of `crew` anywhere in
  flight is `packages/flight/docker/Dockerfile:53`, a
  `COPY packages/crew/package.json` line that exists because the image copies
  every workspace manifest before installing. No code reference in either
  direction. They are independent implementations of the same tmux CLI and
  disagree on every load-bearing detail — private `-L <socket>` server versus the
  default shared one, `kill-server` with descendant reaping versus `kill-session`,
  synchronous `spawnSync` versus an async `execFile` factory.

**`flight`'s two frontends are build-output edges, not module imports.**
`@bubstack/moe-flight-dashboard` and `@bubstack/moe-flight-ui` are `workspace:*`
dependencies so that turbo orders their builds and flight can serve their emitted
assets by path. `tsconfig.json` references `./dashboard` for the same reason.
Classify them as such; nothing in flight's `src/` imports a symbol from either.

An edge is not always a module import. `glass`'s MCP server reaches its own skill
lib through `createRequire(join(__dirname, '../skills/...'))` — a runtime file path
with real breakage potential that no dependency graph shows. `tab`'s bindings reach
the Rust core across a C ABI. Both count; classify them, don't miss them.

Derive every edge by import census, not by reading names. A package may import
exactly what its own `package.json` `dependencies` names; transitive
reachability is not importability.

## 6. Toolchain

pnpm workspaces + Turborepo. 11 workspace members; `packages/tab` (cargo) and
`py/proof` (uv) sit outside the pnpm graph and are driven by root scripts.

Upstream arrives fragmented. One choice per concern, each picked as the option
already most used upstream:

| Concern | Upstream spread | Moe |
|---|---|---|
| Package manager | pnpm ×1, npm ×3, bun ×2 | **pnpm 11** |
| Test runner | vitest ×3, bun test ×2, jest ×1, `node --test` ×1 | **vitest 3** |
| Lint + format | biome ×3, eslint + prettier ×1, none ×rest | **biome 2** |
| Library build | tsc ×3, tsup ×1, esbuild bundle ×1, `bun build --compile` ×1 | **`tsc -b`**, with tsup/esbuild/vite only where a bundle is genuinely needed |
| TypeScript | ^5.7 – ^5.9 | **^5.9.0** |
| Git hooks | lefthook ×1, custom shell ×1 | one root-level mechanism |

**TypeScript stays on 5.9 deliberately.** Upstream is on ^5.9 and TypeScript 7
is out. Importing ^5.9 code under a new major mixes two migrations; the upgrade
is a separate, deliberate step once the code is in.

### Two configs per package, and they must agree

Adopted from the sibling `askmoe` workspace, where it is load-bearing:

- `tsconfig.json` `references` — the **runtime** DAG, mirroring `dependencies`
  one for one.
- `tsconfig.tests.json` `references` — **test-only** edges, including the ones
  that point *up*. A test-fixture inversion is legal in pnpm `devDependencies`
  and produces `TS6202: Project references may not form a circular graph` if you
  put it in `tsconfig.json`.

Both are empty today. Populate them from an import census, not from names.

### Local prerequisites

`pnpm install && pnpm check` passes on a clean checkout. Beyond Node and pnpm:

| Tool | For | Status |
|---|---|---|
| `cargo` ≥ 1.98 | `pnpm tab:build`, `pnpm tab:test` | installed, **needs a PATH entry** |
| `uv` ≥ 0.12 | `pnpm proof:test` | installed; resolves Python 3.14 |

**cargo is installed but not on PATH.** rustup owns the toolchain, brew's `rust`
formula could not link over rustup's shims, and `brew cleanup` then pruned
`/opt/homebrew/bin/{cargo,rustc}`. There is no `~/.cargo/bin`. The working binary
is inside the rustup toolchain:

```sh
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
```

Make it permanent with either `brew unlink rustup && brew link --overwrite rust`,
or `rustup default stable` once rustup's shim dir is on PATH. The repo scripts
call bare `cargo` deliberately — pinning a machine-specific path in
`package.json` would not survive a second developer.

**Windows: WSL2, and that is the answer for now.** Decided 2026-08-31, Zak
Keown. Native Windows becomes first-class once this works solidly on macOS, not
before. What that buys and what it defers:

| | Under WSL2 | Native Windows, deferred |
|---|---|---|
| hooks | Linux shell scripts run directly; `run-hook.cmd`'s cmd half is never reached | needs a bash (Git for Windows); the wrapper now *says so* instead of exiting silently |
| `moe crew` | tmux works | no story at all — tmux does not exist |
| CI | none needed; `.gitlab-ci.yml` runs `node:24` | would need a Windows runner |
| line endings | native LF | `core.autocrlf=true` breaks the cmd/bash polyglot — see `.gitattributes` |

Two things are still done natively-correctly, because they were free: every
package bin carries a `#!/usr/bin/env node` shebang (cmd-shim reads it to pick
an interpreter, and `moe-crew` had none), and `.gitattributes` pins LF. Both
also matter under WSL2 the moment someone clones on the Windows side and reaches
the tree through `/mnt/c`, which is a normal thing to do by accident.

### Gotcha worth remembering

pnpm 11 refuses to install until every transitive postinstall script is approved
by name in `pnpm-workspace.yaml` under `allowBuilds` — which supersedes pnpm 10's
`onlyBuiltDependencies`, so the older key is silently ignored. `esbuild` arrives
via vitest and needs an entry. Leave one unresolved and
`pnpm install --frozen-lockfile` fails in CI with `ERR_PNPM_IGNORED_BUILDS`.

## 7. Naming

Full rename. Nothing user-visible keeps an upstream name. The vocabulary is a
tavern and its measures: you run a `tab`, you order a `flight`, you check the
`proof`, you look through the `glass`.

Binaries: one dispatcher, `moe`, in front of seven namespace bins — `moe-flight`,
`moe-tab`, `moe-mint`, `moe-crew`, `moe-glass`, `moe-memory`, `moe-proof`.
`moe <ns> …` is the human entry point; the `moe-<ns>` names are permanent, and
are what MCP hosts, generated plugin manifests and scripts reference directly
(`packages/mint/src/adapters/claude-code.ts` emits the `mcpServers` path
against `moe-glass` / `moe-memory` — nothing between). MCP server keys:
`moe-memory`, `moe-glass`.

The dispatcher is Node stdlib only (`bin/moe.js`), never links itself onto
PATH — that is `bin/moe-install`'s job — and resolves `moe <ns>` in order:
sibling to the script, then PATH, then a checkout fallback (`uv run --project
py/proof` for `proof`; `packages/tab/target/release/moe-tab` for `tab`; the
built dist bundles for the five Node bins). Grammar copied from
`packages/flight/src/cli.ts`, and vitest at `bin/test/moe.test.mjs` covers
every branch — including the platform ones — without a Windows runner.

The bare name is contested on a developer machine — three projects have
claimed it. See §7.1.

**This is a breaking cut, taken once.** Renaming MCP server keys
(`episodic-memory` → `moe-memory`, `chrome` → `moe-glass`) invalidates existing
user configs, and every binary name changes. Acceptable for an internal audience;
not something to do twice. See PARITY.md for the full token inventory.

### 7.1 The bare `moe` name has three claimants

Recorded 2026-08-31 because the collision is not visible from the tree.

| # | Project | Where | Status | Impact on this repo |
|---|---|---|---|---|
| 1 | **This repo — the dispatcher** | `bin/moe.js`, linked onto PATH by `bin/moe-install` | keeper; policy above | — |
| 2 | `moedex` (Go, unrelated repo) | `~/Code/tools/moedex`, currently ships `~/.local/bin/moe` from an uncommitted rearchitecture | reverting to `moedex`; the on-disk `moe` is deleted, not symlinked | freeing the name is a prerequisite to `bin/moe-install`'s PATH claim landing |
| 3 | `~/.claude/moe-core` | abandoned rebranded GSD-core install; `bin/lib/package-identity.cjs` declares `binName = "moe"` but the install dir carries no `moe` bin on disk | nominal only, no PATH entry | none — the origin is `gitlab.com/moe-ai/moe-cc`, a different GitLab instance from `gitlab.tcdevops.com/Zak/moe`, so no registry collision either |

`~/Code/tools/moe` (the sibling `askmoe` workspace) is *not* a fourth claimant:
its `package.json` declares no `bin`. Adding a fourth claimant is a decision,
not a commit — the point of this table is to keep the count at three.

## 8. Hosting and CI

**Origin: GitLab, self-hosted at `gitlab.tcdevops.com`.** Not GitHub. Upstream
is on GitHub and stays there — `github.com/obra` and
`github.com/prime-radiant-inc` URLs are provenance and belong in `NOTICE` and
`PARITY.md`. The distinction to hold while rebranding:

- **Provenance URLs** — "derived from `github.com/obra/superpowers`" — keep the
  GitHub URL. Rewriting them destroys the attribution the licenses require.
- **Self-referential URLs** — `homepage`, `repository`, `bugs`, badge links,
  "clone this repo", issue links — become GitLab.

> **Confirmed 2026-08-31: the project path is `Zak/moe`**, i.e.
> `git@gitlab.tcdevops.com:Zak/moe.git`. The earlier guess was `bubstack/moe`,
> swept out of the tree in the same commit that recorded this.
>
> **The npm scope and the project path are now decoupled, and that is a real
> constraint, not a tidiness note.** GitLab's *instance-level* npm registry
> requires the package scope to equal the **top-level group** name — so
> `@bubstack/*` implies a `bubstack` group, which `Zak/moe` is not. The scope was
> left as `@bubstack` deliberately: renaming it touches every `package.json`,
> every `workspace:*` edge and `pnpm-lock.yaml`, for no benefit while nothing is
> published. The consequence to carry forward: **`@bubstack` packages cannot use
> the instance-level registry from `Zak/moe`.** Publishing, if it ever happens,
> must use the *project-level* endpoint
> (`/api/v4/projects/:id/packages/npm/`), which has no scope-equals-group rule.
> Either that, or move the project under a `bubstack` group and revert the path.
> This is a release-time decision; it blocks nothing today, because nothing
> publishes.
>
> A second remote exists: `gitlab.com/moe-ai/moe`, a private mirror on GitLab
> SaaS. `gitlab.tcdevops.com/Zak/moe` stays canonical — every self-referential
> URL in the tree points there — because it is the only one on company
> infrastructure.

### Packages and registry

All eight TypeScript packages carry the `@bubstack` scope for workspace
addressing. Which of them become npm artifacts is a release decision, not a
naming one: `moe-core` and `moe-backstory` are skill content and ship as
*generated plugins* through the marketplace, never as npm tarballs. `moe-proof`
is Python and PyPI has no scopes, so it stays `moe-proof`.

```
@bubstack/moe-core        @bubstack/moe-mint
@bubstack/moe-backstory   @bubstack/moe-crew
@bubstack/moe-memory      @bubstack/moe-glass
@bubstack/moe-flight      @bubstack/moe-tab
moe-proof                 (PyPI, unscoped)
```

Root `.npmrc` points the scope at the instance registry:

```
@bubstack:registry=https://gitlab.tcdevops.com/api/v4/packages/npm/
```

### CI

Upstream ships **11 GitHub Actions workflows across 7 repositories**. None
survive; they port to a single root `.gitlab-ci.yml` driving turbo, with rules
scoped by changed path so a docs edit does not rebuild the Rust crate.

**Decided 2026-08-31: Moe publishes nothing publicly.** All four upstream release
workflows — `obol`'s `crates-release.yml`, `pypi-release.yml` and `release.yml`, and
`smevals`' `publish.yml` — are **deleted, not ported**. Nothing goes to crates.io or
PyPI. A package that must be consumable outside this repo goes to the GitLab
instance registry under `@bubstack`; nothing else leaves the company.

That is the same boundary `flight`'s license decision draws (PARITY.md, License
exposure): no distribution anywhere in the tree means no exposure anywhere in the
tree. Reversing it for any package means revisiting that section first.

`superpowers/.github/FUNDING.yml` is **deleted, not ported** — it solicits
sponsorship for the upstream author. `superpowers-evals/.github/CODEOWNERS` and
the two `PULL_REQUEST_TEMPLATE.md` files become their GitLab equivalents
(`CODEOWNERS`, `.gitlab/merge_request_templates/`).
