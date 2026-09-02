# Moe Artifact and Registry Foundation

Make each installable Moe plugin one complete, deterministic artifact, then
publish and mirror the exact bytes that passed verification.

**Status:** Approved for implementation planning. Implementation has not
started.

**Scope:** This is the first foundation slice of Moe's platform program. It
defines the artifact, registry, composition, provenance, and release contracts
for the six public plugins. It does not implement the common `moe` lifecycle
CLI or certify all eight targets.

**Evidence baseline:** The concept review examined source at `4adae24`. Design
investigation used `b38075e`. Before this document was written, the relevant
architecture, mint, registry, package-manifest, and publish surfaces were
compared with `706b684`; none had changed. Later implementation must record its
own base SHA, as required by the repository's integration protocol.

## Decision

`plugins/<plugin>` becomes the canonical, complete plugin artifact. Source
remains under `packages/`, and `@bubstack/moe-mint` continues to generate the
artifact. The build will assemble each plugin in a temporary tree from its
source package, package-local Mint configuration, adapter output, and legal
register. It will validate all six trees before a recoverable transaction
replaces `plugins/`.

Release automation will pack each changed generated tree once. Structural and
artifact tests will run against the extracted tarball. npm will receive that
same tarball, and GitHub will receive a byte-identical archive plus checksums
and a versioned platform catalog. Native host installers and the future common
CLI will consume or project files from that same logical artifact; they will
not receive separately assembled variants.

This decision replaces the present split distribution:

- source npm packages contain runtime code and dependency metadata but omit
  generated harness manifests, bootstrap material, and complete legal payloads;
- generated plugin trees contain harness projections and legal files but omit
  some runtime code, package dependencies, executables, prompts, and other
  package-owned payloads;
- release automation publishes from `packages/<pkg>`, not from the generated
  trees that marketplace metadata names.

Neither current tree is the product by itself. The composed artifact will be.

## Product contract

Moe commits to these platform targets:

1. Claude Code
2. Cursor
3. Codex
4. Kimi
5. OpenCode
6. Pi
7. Agent Plugins 1.0
8. GitHub Copilot CLI

Agent Plugins 1.0 is a format target, not an execution host. It receives
conformance evidence rather than a runtime certification.

Support means a common outcome contract, not identical native components. A
certified execution target must support install, discovery, update, and
uninstall, then prove every capability the plugin declares. Invocation,
automatic routing, bootstrap, hooks, skills, commands, and MCP are conditional
capabilities; a plugin is not required to invent one it does not provide. The
portable core has the stronger contract: invocation plus automatic routing or
an equivalent bootstrap are mandatory. Each plugin may expose different native
mechanisms on different hosts, provided its published capability matrix
describes them accurately.

The eight-target guarantee applies to the portable `moe` core at platform
level. Optional plugins publish their own target and operating-system matrices.
The public portfolio remains:

- `moe`
- `moe-backstory`
- `moe-memory`
- `moe-glass`
- `moe-crew`
- `moe-statusline`

Flight, Tab, Proof, and Mint remain contributor-facing internals. This work
does not place them in the public command map.

## Goals

- Produce one universal artifact for each public plugin.
- Preserve existing plugin IDs, scoped npm package names, skill names, and
  user configuration.
- Give every metadata field and payload path one authoritative producer.
- Compose adapter metadata without erasing runtime package metadata.
- Reject missing, unexpected, unsafe, or nondeterministic artifact content.
- Generate registry and marketplace projections from one platform registry.
- Test and publish the same tarball.
- Pin independently versioned plugins in a versioned platform release catalog.
- Support a cautious `0.1.x` maintenance release for the verified Claude path.
- Establish the substrate required by the future common `moe` CLI and
  eight-target certification program.

## Non-goals

- Do not implement `moe install`, `moe update`, `moe uninstall`, receipts,
  backups, rollback, `--target`, or `--all` in this slice.
- Do not claim runtime certification for Cursor, Codex, Kimi, OpenCode, Pi,
  Agent Plugins, or Copilot merely because their files were emitted.
- Do not migrate optional plugins to the future lifecycle CLI.
- Do not restructure Core or Backstory.
- Do not consolidate shared CDP, MCP, path, hook, usage, or evaluation code.
- Do not promote Flight, Tab, Proof, or Mint into end-user products.
- Do not retire current stable packages before the replacement artifacts have
  completed the maintenance rollout.
- Do not repair unrelated findings from `.moe/concept-review` in this plan,
  except for release and provenance defects that directly prevent an artifact
  gate from working.

## Planning boundary

This is one foundation phase with one acceptance boundary, but it is too risky
for a single undifferentiated change set. The implementation-planning pass must
split it into four ordered, independently reviewable plans:

1. platform registry, typed package configuration, and generated projections;
2. package-manifest composition, payload staging, and recoverable tree swap;
3. complete artifact manifest, provenance checks, and local pack/extract gates;
4. release catalog, exact-tarball publication, recovery, and the Claude
   maintenance rehearsal.

Each plan leaves the repository green and feeds the next through a tested
contract. The phase is not complete, and no stable maintenance artifact is
published, until all four plans meet this document's acceptance criteria.

## Repository invariants

The implementation must preserve these rules:

- Source lives under `packages/`; nobody hand-edits `plugins/`.
- Package-local Mint YAML describes each plugin.
- `NOTICE` is the attribution register. Generated artifacts carry the license
  terms that apply to their contents.
- The generated tree is reproducible from tracked inputs.
- `packages/core/skill-tiers.yaml` and the guarded imported-skill tests retain
  their current meaning.
- Root TypeScript project references continue to mirror runtime dependencies;
  test-only inversions remain in `tsconfig.tests.json`.
- Cross-boundary evidence cites tests, symbols, and quoted rules rather than
  line numbers.

## Architecture

```text
moe-platform.yaml                 package-local Mint YAML
        |                                  |
        |                         plugin policy + payload
        |                                  |
        +------------+---------------------+
                     |
source package.json + build output + NOTICE + lockfile
                     |
                     v
             artifact compositor
        (temporary sibling directory)
                     |
          +----------+----------+
          | adapters + legal    |
          | manifest + checks   |
          +----------+----------+
                     |
        validate all six artifacts
                     |
                     v
      recoverable replacement of plugins/
                     |
          pack each changed tree once
                     |
            test extracted tarball
                     |
          +----------+----------+
          |                     |
        npm                  GitHub mirror
          |                     |
          +----------+----------+
                     |
          platform release catalog
```

The compositor is part of the Mint generation path. It is not a second
hand-maintained build system. `pnpm mint` remains the contributor command that
generates `plugins/`, and `pnpm mint:check` remains the byte-reproducibility
gate.

### Transaction boundary

Generation is one repository-level transaction:

1. Build every runtime package required by the six public plugins.
2. Read and validate all authoritative inputs.
3. Create a uniquely named temporary sibling of `plugins/` on the same
   filesystem.
4. Assemble all six plugin roots there.
5. Run adapters, composition, legal generation, manifest generation, and the
   complete artifact validation suite.
6. Replace `plugins/` through the recoverable swap protocol only after every
   plugin passes.

A portable rename cannot atomically replace a populated directory. The swap is
therefore journaled and recoverable:

1. Write a transaction record containing the current, next, and backup paths
   to a temporary file, `fsync` the file, rename it into place, and `fsync` its
   parent directory before the first tree rename.
2. Rename `plugins/` to the transaction's backup path.
3. Rename the validated next tree to `plugins/`.
4. If the second rename fails, restore the backup before reporting failure.
5. `fsync` the parent directory after each tree rename. After success, remove
   the backup and transaction record and sync the parent again.
6. At the start of every Mint run, detect an interrupted transaction and
   restore or complete it from the recorded state before doing new work.

A validation or assembly failure leaves the existing generated tree untouched.
A process or machine failure during the swap leaves enough state for the next
run to restore one complete tree. Transaction paths are reserved generator
state and ignored by Git. The implementation must not wipe `plugins/` before a
replacement is validated.

Recovery transitions are idempotent. An invalid, path-escaping, or internally
inconsistent journal stops without renaming anything. If restoration fails,
the command preserves the journal and both surviving trees, reports their
exact paths, and requires repair before another generation starts.

Contributor generation follows the repository's current macOS, Linux, and
WSL2 setup contract. Native Windows runtime support is a platform product goal,
not authorization to run this contributor pipeline on native Windows.

## Sources of truth

### Platform registry

A new human-authored root file, `moe-platform.yaml`, owns cross-plugin policy.
It contains:

- registry schema version;
- the eight canonical target IDs and display names;
- the default portable-core profile;
- the six public plugin source and Mint-config paths;
- platform operating-system policy;
- npm origin and GitHub mirror policy;
- stable and prerelease channel policy.

It must not repeat a plugin's version, description, author, license, repository,
homepage, keywords, runtime entry points, or dependencies.

The initial shape is:

```yaml
schema: 1

targets:
  claude-code: {display_name: Claude Code, kind: host}
  cursor: {display_name: Cursor, kind: host}
  codex: {display_name: Codex, kind: host}
  kimi: {display_name: Kimi, kind: host}
  opencode:
    display_name: OpenCode
    kind: host
    contract:
      source: https://github.com/anomalyco/opencode
      revision: ef2792511deb406f3b064e05a7cc1a01979260ee
      path: packages/opencode/src/plugin/shared.ts
  pi:
    display_name: Pi
    kind: host
    contract:
      source: https://github.com/badlogic/pi-mono
      revision: e266507b606b9552fa277252644054afd4384b11
      path: packages/coding-agent/docs/packages.md
  agent-plugins-1.0: {display_name: Agent Plugins 1.0, kind: format}
  copilot:
    display_name: GitHub Copilot CLI
    kind: host
    requires: [claude-code]

profiles:
  core:
    default: true
    plugins: [moe]

plugins:
  - id: moe
    source: packages/core
    config: packages/core/mint/moe.yaml
  - id: moe-backstory
    source: packages/backstory
    config: packages/backstory/mint/moe-backstory.yaml
  - id: moe-memory
    source: packages/memory
    config: packages/memory/mint/moe-memory.yaml
  - id: moe-glass
    source: packages/glass
    config: packages/glass/mint/moe-glass.yaml
  - id: moe-crew
    source: packages/crew
    config: packages/crew/mint/moe-crew.yaml
  - id: moe-statusline
    source: packages/statusline
    config: packages/statusline/mint/moe-statusline.yaml

platform:
  known_operating_systems: [macos, linux, wsl2, windows]
  contributor_operating_systems: [macos, linux, wsl2]
  core_cli_required_operating_systems: [macos, linux, wsl2, windows]
  formal_release_requires_target_os_matrix: true

release:
  origin:
    kind: npm
    registry: https://registry.npmjs.org
  mirror:
    kind: github-release
  channels:
    stable: latest
    prerelease: next
```

The schema uses Mint's current `ADAPTER_NAMES` as stable target IDs. In
particular, `copilot` is the canonical ID and “GitHub Copilot CLI” is its
display name. A schema validator rejects duplicate plugin IDs, duplicate paths,
unknown profiles, unsupported target IDs, absolute paths, and paths that escape
the repository.

Known operating-system IDs describe the policy vocabulary, not present support.
Contributor tooling remains limited to macOS, Linux, and WSL2 under the current
architecture. Native Windows is a required portable-core runtime target for
`0.2.0`; no plugin or target becomes certified there until its Windows evidence
passes. Optional plugins may publish narrower matrices.

This is not an eight-target by four-OS cross-product. Before a formal platform
release, every host target must gain an explicit
`required_core_operating_systems` list backed by its pinned provider contract;
the Agent Plugins format target has no OS list. The Core certification design
owns those target-specific lists. The formal gate requires the common CLI and
portable core artifact on all four platform OSes, plus every target on every OS
in that target's list. Foundation and maintenance catalogs may omit the lists
only while their affected statuses remain `preview`.

### Package-local Mint configuration

Each `packages/<pkg>/mint/*.yaml` remains authoritative for:

- plugin ID and public descriptive metadata;
- plugin version, reconciled with the source package version;
- bootstrap behavior;
- intended targets and expected capabilities;
- generated harness components;
- source and built runtime payloads;
- npm distribution identity;
- imported works.

The configuration gains typed `distribution`, `artifact`, and target-intent
fields. The following shape is illustrative but normative in meaning:

```yaml
name: moe-memory
version: 0.1.5
description: Persistent, local project memory for coding agents.
author:
  name: Zak Keown
  email: zak.keown@outlook.com
license: MIT
repository: https://github.com/zak-keown/moe
homepage: https://github.com/zak-keown/moe

distribution:
  npm: "@bubstack/moe-memory"

artifact:
  payloads:
    - from: dist
      to: dist
      required: true
    - from: vendor
      to: vendor
      required: false

targets:
  claude-code:
    intent: certify
    expected_capabilities:
      [skill-discovery, hook-execution, mcp-registration, bootstrap-routing]
    operating_systems: [macos, linux, wsl2]
  codex:
    intent: preview
    expected_capabilities: [skill-discovery]
    operating_systems: [macos, linux, wsl2]

imported_works:
  - name: episodic-memory
  - name: private-journal-mcp
```

`artifact.payloads` declares roots, not arbitrary shell operations. `from` is
relative to the source package; `to` is relative to the artifact root. Both
must be normalized repository-relative paths. Globs, parent traversal,
symlinks, devices, sockets, and destinations reserved for compositor output are
invalid. A missing required root fails. An absent optional root is recorded as
an expected omission. A content-only package may declare `payloads: []` when
its existing `components` paths account for all skills, commands, agents,
hooks, and MCP source material. Other content roots, including prompts, use
explicit payload entries.

Existing scalar `imported_works` entries migrate mechanically to typed entries.
The work name remains a key into `NOTICE`; source revision, license, and notices
stay centralized there.

`targets.<id>.intent` is one of `certify`, `preview`, or `omit`.
`expected_capabilities` describes what the package expects an adapter to emit.
It does not confer certification. Adapter output and test evidence decide the
published result. `operating_systems` is the plugin's intended target matrix
and must be a subset of the platform policy. Source-package `os` and `cpu`
fields remain technical installation constraints and must not contradict it.
The example shows schema shape, not a certified Memory support claim.

`targets` replaces `harnesses.exclude` as the authority for adapter membership.
During migration, `intent: omit` must correspond to an excluded adapter and
`certify` or `preview` must correspond to an active adapter. A disagreement
fails configuration. After all six configs migrate, `harnesses.exclude` is
removed. Existing `harnesses.<id>` blocks remain only for adapter-specific hook
and manifest settings; an omitted target may not retain such settings.

Target prerequisites are part of the platform registry. In version 1,
`copilot` requires `claude-code` because Copilot consumes the Claude marketplace
projection rather than an independent layout. A plugin cannot activate
Copilot while omitting Claude. The Copilot adapter records Claude as its
projection owner and reports capabilities from the validated shared files; it
does not duplicate them. A missing prerequisite, ownership disagreement, or
capability mismatch fails generation.

Platform OS IDs describe user environments: `macos` maps to Node `darwin`,
`linux` maps to non-WSL Node `linux`, `wsl2` maps to Node `linux` with WSL
environment detection, and `windows` maps to Node `win32`. CPU values use
Node's canonical architecture names. The validator applies this mapping when
it reconciles product intent with package constraints.

Version 1 capability IDs are `skill-discovery`, `skill-invocation`,
`command-discovery`, `command-invocation`, `agent-discovery`,
`hook-execution`, `mcp-registration`, `bootstrap-routing`,
`executable-invocation`, and `format-conformance`. A plugin declares only the
outcomes it provides. Install, update, and uninstall are lifecycle evidence in
the release catalog, not adapter-emitted capabilities.

Expected capabilities are release requirements, not aspirations. For both
`certify` and `preview`, the adapter's emitted set must equal the configured set
after sorting and deduplication; a missing or undeclared extra capability fails
generation. `preview` means the expected files exist but runtime certification
evidence is incomplete. Planned capabilities that no adapter emits belong in a
later target-adapter design, not this configuration.

Mint's current static `HarnessAdapter.support` matrix is replaced by a typed
per-plugin emitted-capability result. During migration, a compatibility mapper
translates each existing `full`, `partial`, or `none` component declaration and
the actual emitted files into the version-1 vocabulary. Golden tests compare
the mapper with adapter output. The compatibility field is removed once all
eight adapters return typed emitted capabilities directly; it is never
published as certification.

### Source package manifests

`packages/<pkg>/package.json` remains authoritative for workspace build and
runtime facts:

- scoped npm package identity, which must agree with `distribution.npm`;
- runtime dependencies and optional dependencies;
- executable mappings;
- runtime exports and types;
- engines, operating systems, and CPU constraints;
- workspace scripts and build-only metadata.

The source package's version and license must agree with the Mint YAML. The
compositor rejects disagreement; it does not select one value silently.
Development-only fields do not enter the artifact unless a field-specific rule
allows them.

### Legal register and build graph

`NOTICE` remains the canonical attribution surface. This slice preserves and
strengthens the existing legal contract: every imported work physically staged
or bundled into an artifact must appear in `NOTICE` and in that plugin's typed
`imported_works` list, and its generated license payload must contain the
applicable terms. An artifact fails if those records do not reconcile.

An npm dependency named in `package.json` but not copied or bundled into the
artifact remains a separate distribution and does not add its license text to
Moe's tarball. If a build bundles dependency code, the package-specific work
must identify that redistributed code before the bundle can be staged.

Plan 3 produces a deterministic bundled-content inventory for every
runtime-bearing plugin. Bundler metafiles and nearest package manifests map
each third-party input to package name, version, source path, and output bundle;
the result sorts by package name and version and is retained as release
evidence. A new bundled package fails until its legal disposition is recorded:
a bundled third-party package is imported work for repository purposes, even
when it also appears as a normal npm dependency. It must have a `NOTICE` entry,
appear in the affected package's typed `imported_works`, and contribute its
applicable terms to the generated legal payload. There is no second legal
register. Glass's existing bundle is explicitly in this inventory gate, and
`pnpm provenance` reconciles every bundled-inventory row with these two
authoritative surfaces.

Automatic transitive SBOM generation and license inference remain outside this
foundation slice. The lockfile is hashed in the release catalog as build
provenance; that hash is not presented as legal closure.

Build output remains derived data. Package source, build configuration,
package manifests, the lockfile, root legal files, platform registry, Mint
configuration, adapter source, and staged runtime output are all cache inputs
to artifact generation.

### Generated projections

Version 1 has two committed registry projections:

- `.claude-plugin/marketplace.json` contains the Claude marketplace entries;
- `docs/moe/generated/plugin-catalog.md` contains the public six-plugin table,
  npm identities, summaries, and emitted target matrix.

Generation compares both files byte for byte. Manual changes fail their check
and direct contributors to `moe-platform.yaml` or the named package Mint file.
README, `ARCHITECTURE.md`, package READMEs, and design documents remain wholly
human-authored; the generator neither rewrites them nor owns marker-delimited
regions inside them.

The publish package matrix is an ephemeral JSON result from the registry
resolver and is retained with release evidence, not committed as another
registry. Release tooling consumes that result at runtime; workflow YAML must
not retain a second literal list of six packages. Per-artifact target metadata
belongs in `.moe/artifact.json`, and the future common CLI consumes the
versioned platform release catalog.

## Package manifest composition

The artifact's root `package.json` is a composed runtime manifest. Adapters may
add their namespaced fields, but no adapter may replace the document.

| Field | Authority | Composition rule |
| --- | --- | --- |
| plugin ID | Mint YAML | Emit into harness manifests and `.moe/artifact.json`; it is not the npm `name` field. |
| version, description, author, license, repository, homepage, keywords | Mint YAML | Emit normalized values; duplicated source values must agree. |
| npm `name` | `distribution.npm` | Emit the scoped name and require exact agreement with the source package name. |
| `type`, `main`, `exports`, `imports`, `types`, `bin`, `engines`, `os`, `cpu`, `sideEffects` | source `package.json` | Preserve runtime meaning; validate every local path. |
| `dependencies`, `optionalDependencies`, `peerDependencies`, `peerDependenciesMeta` | source `package.json` | Preserve runtime entries; resolve workspace protocols only through the compositor's validated release transform. |
| Pi discovery | Pi adapter | Add the `pi` field without changing other fields. |
| OpenCode server discovery | OpenCode adapter | Add `exports["./server"]`; preserve `exports["."]` and unrelated subpaths. |
| `files` | compositor | Generate a sorted exhaustive allowlist for the completed artifact, including hidden adapter and manifest paths. |
| `publishConfig` | platform policy | Emit public access and the canonical npm registry; channel stays a release-command argument. |
| `scripts` | compositor | Omit all source scripts. Source scripts may build inputs, but pack and publish never run them; the final manifest contains no lifecycle scripts. |
| `devDependencies`, `private`, `workspaces`, `packageManager`, `overrides`, `pnpm` | compositor | Omit development-only fields after validating that no runtime path relies on them. |
| `bundledDependencies`, `bundleDependencies` | compositor | Reject because universal artifacts contain no `node_modules`. |

These are field-specific policies, not a generic deep merge:

- a scalar with two authorities is an error;
- a descriptive duplicate must normalize to the same value;
- arrays use a named policy: ordered replacement, ordered union, or forbidden;
- object keys have explicit owners, and duplicate keys fail unless their policy
  permits exact equality;
- adapter fields must be disjoint or use a documented shared-field merger;
- any unclassified field fails composition.

The preceding table is the complete version-1 field policy. A new source field
must first receive an authority, composition rule, and negative test. The
compositor must not pass unknown fields through.

Metadata equality uses these version-1 rules:

- npm name and SemVer version compare as exact trimmed strings;
- license compares as an exact trimmed SPDX expression;
- description compares after CRLF-to-LF and Unicode NFC normalization, with no
  semantic rewriting or whitespace collapsing;
- author must use the object form; `name` and optional URL compare after trim,
  and email also lowercases for comparison;
- repository accepts the package-json string or `{type: "git", url}` form,
  removes `git+`, a terminal `.git`, and a terminal slash, then compares the
  canonical HTTPS URL;
- homepage uses the same URL normalization without Git-specific prefixes;
- keywords compare as a case-sensitive deduplicated set; the Mint order is the
  emitted order.

The canonical repository and homepage for this project are
`https://github.com/zak-keown/moe`. Current GitLab URLs, divergent
descriptions, and divergent keyword sets are migration errors to resolve in
the package configs; the compositor must not guess which prose was intended.

Before adapters add subpaths, the compositor normalizes the source `exports`
shape:

- if `exports` is absent and `main` exists, synthesize `exports["."]` from
  `main` and add a `types` condition when top-level `types` exists;
- if `exports` is a string or a root conditional object, preserve its meaning
  under `exports["."]`;
- if `exports` is already a subpath map, preserve every declared subpath;
- reject a mixed conditional/subpath object or a local target that does not
  exist in the artifact;
- add `exports["./server"]` only after the root export is normalized, and fail
  if a source-owned `./server` target differs.

This migration prevents the addition of an OpenCode subpath from accidentally
encapsulating the existing Memory or Glass package root. Loader-level tests
must import the scoped package root and `<package>/server` from a clean
consumer, then invoke the pinned OpenCode resolution path.

The generated `files` array enumerates every intended payload path, including
`.claude-plugin`, `.codex-plugin`, other dot-directories, and
`.moe/artifact.json`. npm's mandatory `package.json` is reconciled separately.
No `.npmignore` participates. A pack/extract test compares npm's actual output
with the artifact inventory and fails on any npm inclusion or exclusion the
compositor did not predict.

The supported OpenCode contract is pinned to upstream revision
`ef2792511deb406f3b064e05a7cc1a01979260ee`, not a moving branch. That loader
resolves a server plugin through the `./server` export before falling back to
`main`. The adapter will use that subpath rather than take ownership of `main`,
so the normal runtime export can remain at `exports["."]`. See the pinned
[OpenCode plugin loader](https://raw.githubusercontent.com/anomalyco/opencode/ef2792511deb406f3b064e05a7cc1a01979260ee/packages/opencode/src/plugin/shared.ts).
`moe-platform.yaml` records the source, revision, and source path as the target
contract pin. Offline loader-level fixtures must prove that `exports["."]`,
`exports["./server"]`, CLI bins, and Pi metadata coexist. Updating the pin is a
reviewed compatibility change, not an automatic fetch of upstream HEAD.

Pi's package contract at pinned revision
`e266507b606b9552fa277252644054afd4384b11` uses an additive `pi` field for
extensions, skills, prompts, and themes. The Pi adapter will add that field
without replacing npm metadata. See the pinned Pi
[package documentation](https://raw.githubusercontent.com/badlogic/pi-mono/e266507b606b9552fa277252644054afd4384b11/packages/coding-agent/docs/packages.md).

The artifact contains no `node_modules`. Runtime dependencies may remain npm
dependencies when the supported install path resolves them. A plugin that must
run after a file-only install must instead stage a self-contained runtime as a
package-specific design decision. The universal artifact contract supports
both forms; it does not silently bundle every dependency.

## Artifact contents

Every `plugins/<plugin>` tree contains, when declared by that plugin:

- a composed root `package.json`;
- built runtime and type declarations;
- executable entry points with their execute bits;
- skills, commands, agents, hooks, prompts, and MCP configuration;
- all eight adapter projections that are not intentionally omitted;
- bootstrap material;
- package documentation needed by installed users;
- root and third-party license payloads;
- `.moe-mint/manifest.json`;
- `.moe/artifact.json`.

Source code, tests, local caches, VCS history, planning history, source maps that
disclose build paths, package-local `moe-mint.yaml` staging inputs, private
contributor configuration, and undeclared files are excluded.

### Mint ownership ledger

`.moe-mint/manifest.json` retains its current narrow role: it records the files
owned by Mint adapters so regeneration can detect drift and remove stale
adapter output. It is not expanded into the complete artifact inventory.

### Complete artifact manifest

`.moe/artifact.json` records the final tree. Its schema contains:

```json
{
  "schema": 1,
  "plugin": {
    "id": "moe-memory",
    "package": "@bubstack/moe-memory",
    "version": "0.1.5"
  },
  "files": [
    {
      "path": "dist/cli.js",
      "size": 12345,
      "sha256": "<lowercase hex>",
      "mode": "0755"
    }
  ],
  "tree_sha256": "<lowercase hex>",
  "targets": {
    "claude-code": {
      "emitted_capabilities": [
        "skill-discovery",
        "mcp-registration",
        "bootstrap-routing"
      ]
    }
  }
}
```

The file list contains every regular file except `.moe/artifact.json` itself.
Paths use `/`, are UTF-8, are relative to the artifact root, contain no `.` or
`..` segment, and sort by raw UTF-8 byte order. `size` is the byte length.
`sha256` hashes the raw bytes. `mode` is `0644` or `0755`; other permission
bits are normalized or rejected before the manifest is written.

The canonical tree digest is SHA-256 over the ordered manifest rows encoded as:

```text
path NUL mode NUL decimal-size NUL lowercase-sha256 LF
```

The manifest omits timestamps, user IDs, group IDs, source paths, host paths,
and tool-local cache data. The release catalog hashes the completed manifest,
which closes the self-reference without excluding the manifest from the
tarball's integrity record.

Artifact validation rejects:

- a symlink, hard link, device, socket, or named pipe;
- a path escape, absolute path, case-fold collision, or Unicode-normalization
  collision;
- a required payload that is absent;
- an undeclared or unexpected file;
- a manifest size, hash, mode, or tree-digest mismatch;
- a runtime entry point that is absent or points outside the artifact;
- nondeterministic output from identical inputs.

## Target capabilities and certification

Three values must remain distinct:

1. **Expected capabilities** are authored in package-local Mint YAML.
2. **Emitted capabilities** describe the validated files and metadata produced
   by an adapter.
3. **Certification** records the outcome of target-specific conformance or
   runtime tests against a packed artifact.

The release catalog assigns each plugin-target-operating-system tuple one
status. Format targets such as Agent Plugins omit the operating-system axis:

- `certified`: every required test for the declared capability set passed on
  the named target and operating system;
- `preview`: output exists and passes structural checks, but the complete
  target contract has not passed;
- `unsupported`: no support is claimed; output may be absent.

Generation alone can establish emitted capabilities. It can never promote a
target to `certified`. The `0.1.x` maintenance release may certify the Claude
path after its release checks pass. Every other newly composed target remains
`preview` until a later certification slice supplies evidence.

The first formal platform release is `0.2.0`. It requires the portable core to
be certified on all eight targets, with Agent Plugins receiving format
conformance. Optional plugins may remain preview or unsupported where their own
published matrices say so.

### Certification evidence

A certification result is a checksummed GitHub release asset named
`moe-evidence-<plugin>-<target>-<os>-<arch>.json`; format conformance omits OS
and architecture. Its schema contains:

- schema version and result ID;
- plugin ID, npm name, plugin version, artifact tree digest,
  artifact-manifest hash, and tarball SHA-512;
- target ID, target version or contract revision, OS, architecture, and runtime
  versions;
- one pass, fail, or skipped result for install, discovery, update, and
  uninstall;
- one result for every expected capability;
- redacted command transcript or log digest;
- producer kind, repository, workflow path, workflow SHA, run ID, job ID,
  actor, and runner image for CI evidence;
- operator, approval actor, checkpoint ID, and UTC timestamps for an
  authenticated manual smoke;
- overall outcome.

Reports contain no tokens, home-directory paths, registry credentials, or user
data. The stable catalog records each passing report's SHA-256 and GitHub asset
name. Stable promotion rejects a missing report, a digest mismatch, a subject
artifact mismatch, a missing expected-capability result, an unapproved manual
checkpoint, or any non-pass required outcome. Candidate reports may be added to
the candidate GitHub prerelease after the candidate packages publish; they do
not change its plugin artifacts. The stable catalog is the immutable binding
between those reports and the promoted artifact records.

Only the repository's protected release workflow may attach an accepted
evidence report. An operator performs an authenticated smoke at the workflow's
explicit checkpoint; the workflow, not a manually uploaded file, serializes the
result with its run and approval identity. GitHub environment protection and
release permissions authenticate the producer, and catalog checksums protect
the report-to-artifact binding.

## Versioned platform release catalog

Each release produces an external catalog, named
`moe-platform-v<platform-version>.json`. It is a GitHub release asset and a
future common CLI input; it is not embedded in any plugin tarball.

The Git tag `v<semver>` is the authority for `platform-version`.
Stable tags contain no prerelease identifier and promote npm packages to
`latest`; prerelease tags publish or retain candidates under `next`. The
platform version is a release coordination version, not a seventh npm package
version, and need not equal any plugin version. `moe-platform.yaml` owns tag
and channel policy but does not duplicate the current platform version.

Candidate releases use the final immutable plugin versions. For example, a
platform tag `v0.1.5-rc.1` may publish `@bubstack/moe-memory@0.1.5` under
`next`. After that exact tarball passes the authenticated maintenance smoke,
the stable `v0.1.5` workflow verifies its recorded integrity and moves
`@bubstack/moe-memory@0.1.5` to `latest`; it does not edit, repack, or republish
the package. Any byte change requires a new plugin version and a new candidate.
Both prerelease and stable catalogs may therefore reference stable plugin
versions, but only a stable catalog may authorize their `latest` dist-tags.

The catalog records:

- catalog schema and platform version;
- source Git SHA;
- lockfile hash;
- platform-registry schema and hash;
- Mint package version;
- release channel;
- one record for every public plugin;
- plugin ID, npm package, independent version, and target/OS matrix;
- artifact tree digest and artifact-manifest hash;
- npm tarball SHA-512 integrity and byte size;
- GitHub mirror asset name and digest;
- legal payload hashes;
- emitted capability matrix;
- certification status and evidence identifiers.

Plugin versions remain independent. A release may publish only changed
plugins, but the catalog pins a complete six-plugin set. If a plugin artifact's
bytes change without its version changing, the release fails. An unchanged
plugin is referenced by its already published version and verified integrity.

For an ordinary candidate, the comparison base is the highest verified catalog
already published in its channel. For a stable tag, the base is the highest
verified prerelease catalog with the same SemVer core, such as
`v0.1.5-rc.2` for `v0.1.5`; the stable workflow must adopt its six exact
plugin records. The first catalog is a genesis release: it treats all six
composed artifacts as changed and requires new immutable npm versions, so it
never attempts to equate legacy source tarballs with the new artifact format.

Maintenance `0.1.x` tags do produce platform catalogs. Those catalogs coordinate
the six artifacts and label only the verified Claude capabilities certified;
they do not carry the formal all-target platform guarantee reserved for
`0.2.0`.

The catalog is published only after all changed plugins have reached the npm
origin and GitHub mirror. This prevents the future CLI from selecting a
partial platform release.

## Release process

### Candidate build, pack, and verify

The prerelease candidate workflow performs these operations in order:

1. Check the platform tag, channel, plugin versions, and release policy. The
   tag names the platform catalog version; it need not equal every independently
   versioned plugin. Each plugin's source and Mint versions must agree.
2. Install the frozen lockfile and build every required package.
3. Run `pnpm mint` and assert clean reproducibility.
4. Run registry, provenance, artifact, and package-composition gates.
5. Determine which plugin versions differ from the preceding platform catalog.
6. Pack each changed `plugins/<plugin>` tree once with npm.
7. Record each tarball's SHA-512 integrity and size.
8. Extract each tarball into a clean temporary directory.
9. Compare the extraction with its generated artifact, accounting only for
   npm's specified `package/` prefix and archive metadata normalization.
10. Run structural and package-specific probes against the extraction.
11. Create a draft GitHub release and upload tarballs and checksum files.
12. Publish those exact local tarball files to npm under `next`.
13. Fetch npm metadata and verify the registry integrity against the local
   tarball.
14. Upload the complete prerelease platform catalog and finalize the GitHub
    prerelease.

The workflow must not run `npm publish` from `packages/<pkg>` and must not
invoke a pack or prepack step after verification.

### Stable promotion

A stable `v<semver>` tag requires a verified prerelease catalog with the same
SemVer core and the same source Git SHA. Its workflow:

1. Downloads the candidate catalog, tarballs, and checksums from GitHub.
2. Verifies their hashes, extracts the tarballs, and reruns offline artifact
   and structural probes against those bytes.
3. Confirms npm holds every plugin version at the recorded integrity under
   `next` or already under `latest`.
4. Confirms the authenticated Claude maintenance evidence belongs to those
   exact artifact digests.
5. Moves the recorded stable plugin versions to `latest` without publishing
   or repacking them.
6. Produces a stable platform catalog with identical plugin artifact records
   and the promoted certification evidence.
7. Publishes the stable catalog and byte-identical mirror assets in the stable
   GitHub release.

If source or artifact bytes change after the candidate, promotion is invalid;
the project creates new plugin versions and another prerelease candidate.

### Partial-publish recovery

npm package versions are immutable, so release recovery is resumable rather
than transactional:

- preflight confirms authentication, version availability, target dist-tag,
  and every local tarball before the first publish;
- the platform catalog and stable GitHub release remain unpublished until all
  changed npm packages succeed;
- retry checks an already published version's integrity against the local
  tarball and treats an exact match as complete;
- retry stops on an integrity mismatch and requires a new plugin version;
- unpublished packages continue from the same verified local tarballs;
- across workflow runs, the existing draft GitHub release is the recovery
  store: retry downloads its tarballs, verifies their recorded hashes, and
  publishes those bytes rather than rebuilding them;
- if any npm package has published and a draft asset is missing or mismatched,
  recovery stops; it does not reconstruct a supposedly identical tarball;
- stable dist-tag promotion is also resumable: an already moved tag is accepted
  only after its registry integrity matches the candidate catalog;
- the future CLI never selects orphan package versions because no complete
  platform catalog references them.

### Failure messages

Every error names the plugin, source authority, field or path, violated rule,
and corrective action. Stable error classes include:

- invalid platform or package metadata;
- package-manifest collision;
- missing runtime payload;
- missing or unsafe entry point;
- legal-closure failure;
- unsafe path or file type;
- unexpected artifact file;
- permission-mode drift;
- nondeterministic generation;
- packed-tree mismatch;
- registry-integrity mismatch.

Diagnostics have `severity`, stable `code`, `plugin`, optional `target`,
`source`, optional `field` or `path`, `message`, and `action`. Tests assert the
code and structured context rather than the rendered prose. A declared preview
limitation or absent optional payload may warn. An unexpected adapter warning,
discarded field, or unclassified file fails generation. Warnings are never
swallowed by a broad catch or shell pipeline.

## Verification strategy

### Registry and composition tests

Tests validate:

- the platform registry schema and all six package references;
- one-to-one agreement between platform registry, Mint configs, generated
  trees, marketplace projection, and publish matrix;
- version, license, and npm-name agreement between Mint and source manifests;
- every field-ownership and merge rule;
- coexistence of runtime exports, `exports["./server"]`, and `pi`;
- rejection of unknown fields, duplicate owners, ambiguous arrays, and
  adapter replacement manifests;
- rejection of unsafe, missing, colliding, and undeclared payload paths.

Negative fixtures are first-class tests. Each failure class has at least one
fixture that proves both rejection and actionable diagnostics.

### Universal kitchen-sink fixture

A synthetic plugin exercises the compositor without relying on a convenient
real package. It includes:

- JavaScript runtime and type declarations;
- a POSIX executable;
- runtime and optional dependencies;
- an MCP server;
- skills, commands, prompts, agents, hooks, and bootstrap content;
- mixed MIT and Apache-2.0 imported works;
- all eight adapters;
- root exports plus OpenCode and Pi discovery metadata.

The fixture is assembled twice in clean directories and must produce identical
trees and manifests. Tamper cases cover changed bytes, changed modes, added
files, removed files, symlinks, path traversal, case collisions, Unicode
collisions, adapter field collisions, and stale legal metadata.

### Transaction recovery fixture

Deterministic fault injection interrupts the swap after journal durability,
after the first rename, after the second rename, during backup removal, and
during restoration. At least one complete validated tree must survive every
transition. Recovery deterministically chooses the committed next tree or the
restored previous tree from the journal state; it need not retain both after
backup removal begins. Separate tests cover a malformed journal, a stale
journal whose transaction already completed, missing next or backup paths,
path traversal, and a forced restore failure that must preserve all surviving
recoverable state.

### Six real-plugin artifact tests

Each public plugin is built, minted, packed, extracted, and tested from the
extraction. Tests assert:

- scoped npm identity and expected independent version;
- every package entry point resolves;
- executable bits survive packing;
- runtime dependencies and exports survive composition;
- referenced harness files exist inside the extraction;
- declared target projections are present or intentionally omitted;
- bootstrap and discovery metadata point to real files;
- planning history, tests, source-only material, and VCS files are absent;
- license and notice payloads match the resolved legal closure;
- the extracted file inventory, excluding `.moe/artifact.json` itself, matches
  that manifest exactly;
- the tarball integrity matches the release record.

Package-specific runtime checks remain owned by each package. The foundation
supplies a uniform way to run them against an extracted artifact.

### CI gates and commands

The contributor interface is:

- `pnpm mint` builds the required outputs and regenerates all six artifacts;
- `pnpm mint:check` proves regeneration is byte-identical;
- `pnpm artifact:check` validates the complete generated artifacts and their
  package manifests;
- `pnpm provenance` validates attribution and legal closure.

`pnpm check` remains the Node quality gate. Artifact work adds tests to the
appropriate package suites instead of hiding a second test runner in release
automation.

Turbo's Mint inputs expand to include `moe-platform.yaml`, source package
manifests, runtime output, build configuration, the lockfile, `NOTICE`, root
licenses, package Mint files, staged content, adapter source, and the generation
script. A cache hit must never permit missing or stale runtime output.

The current provenance red-fixture in CI must be repaired as part of this
slice. Its shell structure allows `bash -e` to miss the intended failing
command, so it does not prove that the negative path is red. The replacement
test must capture the command status explicitly and fail unless the tampered
fixture is rejected for the expected reason.

## Maintenance rollout

The artifact foundation lands before a formal platform release.

1. Publish final immutable plugin versions for every changed artifact under
   npm's `next` dist-tag through a prerelease platform catalog.
2. Install each candidate through the Claude marketplace path in an isolated
   environment.
3. Verify install, discovery, update, and uninstall against the packed
   candidate, plus every capability that plugin declares: bootstrap for Core
   and Memory, hook execution for hook-bearing plugins, skill or command
   invocation for content plugins, and runtime startup for MCP or executable
   plugins.
4. Use an explicit authenticated checkpoint for any smoke test that cannot run
   safely with a local fixture.
5. Move the exact passing plugin versions to `latest`, publish the stable
   `0.1.x` platform catalog, and confirm the committed marketplace projection
   names those same versions.
6. Keep other adapter outputs at `preview`; do not advertise eight-target
   certification.
7. Deprecate a previous distribution path only after its replacement passes
   the stable Claude install, update, and uninstall checks.

The minimum `0.1.x` promotion gate is one passing Claude Code report for each
plugin on macOS, using the exact candidate digest. Linux, WSL2, and native
Windows tuples remain `preview` unless the same artifacts receive separate
passing reports on those environments. Structural CI on Linux does not count
as authenticated host evidence. A maintenance catalog must never copy the
macOS result across OS rows.

A failed plugin does not force an unrelated plugin to take a gratuitous version
bump. A changed artifact does require a new immutable npm version, even when
its source runtime did not change. The first composed-artifact release treats
all six artifacts as changed because no preceding platform catalog can attest
that their current npm tarballs have the new artifact identity.

## Compatibility and migration

- Existing plugin IDs and scoped npm package names remain stable.
- Existing skill names and configuration paths remain stable.
- `moe-core` and `moe-everything` stay retired; no compatibility aliases revive
  them.
- The legacy installer is not extended. The later common CLI replaces its role.
- npm is the canonical artifact origin. GitHub release assets mirror exact
  archives and publish independent checksums.
- The artifact contains no installed dependency directory. Host or CLI
  installation policy decides whether dependencies are installed or whether a
  package supplies a self-contained runtime.

## Follow-on platform sequence

Each item below requires its own design and implementation plan:

1. **Artifact and registry foundation** — this specification.
2. **Common CLI kernel** — install plans, explicit multi-host selection,
   confirmation, `--yes`, `--dry-run`, backup, receipts, rollback, update, and
   uninstall. Bare `moe install` installs portable core only.
3. **Core install adapters** — group Claude Code with Copilot marketplace
   behavior; Cursor, Codex, and Kimi manifest behavior; OpenCode and Pi npm
   package behavior; Agent Plugins format conformance.
4. **Core certification** — end-to-end fixture and operating-system matrix for
   all eight targets.
5. **Optional plugin migration** — per-plugin target and OS support, runtime
   packaging, and lifecycle integration.
6. **Product-surface cleanup** — public command map, documentation, retired
   install paths, and explicit contributor-tool boundaries.
7. **Internal convergence** — shared CDP, MCP, paths, hooks, usage, and
   evaluation seams where evidence supports consolidation.
8. **Platform 0.2.0** — first formal catalog release after the common CLI and
   portable core pass all certification gates.

The `0.2.0` release remains a prerelease or draft while any portable-core
target lacks its required evidence. It becomes the first formal platform
release only after every certification gate passes.

When the common CLI arrives, multiple detected hosts require `--target`; it
must never guess. `--all` is an explicit request. The CLI will consume the
versioned platform catalog and expose lifecycle operations plus installed
add-on commands. Mint remains an internal or experimental contributor tool.

## Acceptance criteria

This foundation is complete when all of the following are true:

- `moe-platform.yaml` validates and is the only hand-authored public plugin
  registry.
- All six package-local Mint configs declare npm identity, artifact payloads,
  target intent, and imported works through the typed schema.
- `pnpm mint` assembles all six artifacts in a temporary tree and uses the
  journaled recovery protocol to replace `plugins/` only after complete
  validation.
- Every generated plugin tree contains its required runtime, adapter,
  bootstrap, package, and legal content.
- No adapter emits a replacement `package.json`.
- OpenCode and Pi metadata coexist with source runtime exports, binaries,
  dependencies, types, and engines in the pinned loader-level fixture.
- `.moe-mint/manifest.json` remains the adapter ownership ledger, and
  `.moe/artifact.json` accounts for the complete final tree.
- Every runtime-bearing plugin has a deterministic bundled-content inventory;
  no staged third-party input has an unresolved legal disposition.
- Artifact validation rejects unsafe paths, unsupported file types, unexpected
  files, missing files, digest drift, and mode drift.
- Fault-injection tests prove every journaled swap and recovery transition,
  including malformed state and failed restoration.
- Marketplace and public catalog projections are generated at their named
  paths, and the release job consumes an ephemeral publish matrix from the same
  registry resolver.
- The kitchen-sink fixture and all six real-plugin pack/extract suites pass.
- `pnpm mint:check`, `pnpm artifact:check`, `pnpm provenance`, and `pnpm check`
  pass from a clean checkout.
- Release automation publishes exact pretested tarballs and verifies npm
  integrity before finalizing the platform catalog.
- Stable promotion moves exact candidate versions from `next` to `latest` only
  when checksummed certification reports bind the required plugin-target-OS
  results to those artifact digests.
- Partial npm publication is resumable without exposing an incomplete platform
  catalog.
- The Claude maintenance path passes install, discovery, update, and uninstall
  for every claimed plugin, plus each plugin's declared bootstrap, hook,
  skill, command, MCP, or executable capabilities.
- The maintenance release labels non-Claude target output `preview` rather than
  certified.
- No common-CLI, full-certification, optional-plugin migration, or unrelated
  convergence work is smuggled into this foundation slice.

## Design rationale

An artifact-first sequence removes the ambiguity beneath every later product
decision. A common CLI cannot install reliably when no complete unit exists to
install. Target certification cannot be meaningful when tests exercise a
different tree from the one npm publishes. Optional-plugin migration cannot be
compared across hosts while adapters can erase runtime metadata.

This foundation gives later work one stable object: a content-addressed,
independently versioned plugin artifact with explicit provenance, capability
claims, and release evidence. The CLI, host adapters, and certification program
can then evolve without reopening artifact identity.
