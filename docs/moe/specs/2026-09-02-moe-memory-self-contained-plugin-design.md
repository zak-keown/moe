# Moe Memory: Self-Contained Plugin Design

Run memory from the artifact every supported harness installs.

**Status:** Approved for implementation; implementation has not started.
Local feasibility probes passed on Node 22.13, Node 22.23, and Node 24.20 on
macOS arm64. The release matrix in this document remains a required gate.

**Plugin:** This changes the generated `moe-memory` plugin. Source changes
belong under `packages/`; nobody hand-edits `plugins/moe-memory`.

## Problem

`moe-memory` works in Claude Code because Claude's marketplace cache installs
eligible Node dependencies. The same plugin fails in Codex for two independent
reasons:

1. The generated Codex manifest contains `"hooks": {}`. That field overrides
   Codex's default `hooks/hooks.json` discovery with an empty definition, so the
   `SessionStart` hook cannot run.
2. The Codex package cache contains the downloaded package files but no
   `node_modules`. The MCP entry point therefore fails while importing runtime
   dependencies such as the MCP SDK and `better-sqlite3`.

The release pipeline creates the deeper fault. `plugins/moe-memory` has the
harness manifests but lacks `dist` and its runtime. The npm package has `dist`
and dependencies but omits parts of the generated plugin. Neither is a complete
installable artifact. Existing end-to-end tests copy a generated tree into a
workspace where shared dependencies mask that split.

`bin/moe-install` has stale repository and plugin names, but it is not the cause
of the Codex failure. Codex installs plugins through its own package path and
does not call that Claude-oriented convenience script.

## Goals

- Publish one tested `@bubstack/moe-memory` tarball that contains every file
  required by the supported surfaces of the Claude Code, Codex, OpenCode, Pi,
  Cursor, Kimi, Copilot, and Agent Plugins adapters.
- Start the MCP protocol without a package-manager step or a local
  `node_modules` directory.
- Restore the memory `SessionStart` hook in Codex without enabling unaudited
  hooks in other Moe plugins.
- Preserve Claude Code behavior, database contents, retrieval semantics,
  resumable summaries, and the existing source-of-truth rules.
- Make the exact published tarball—not a workspace approximation—the release
  test subject.

## Non-goals

- Do not make native Windows a first-class runtime. Moe continues to support
  macOS, Linux, and WSL2.
- Do not teach `bin/moe-install` to repair Codex caches or install plugin
  dependencies.
- Do not bundle the embedding model. It remains a pinned first-use download.
- Do not change the database schema, embedding dimensions, search APIs, tool
  names, or journal format.
- Do not enable core or crew hooks in Codex until each package has its own hook
  compatibility audit.
- Do not hand-maintain a second release tree outside mint.

## Design constraints

The design keeps these repository invariants:

- `packages/memory` owns memory source and build inputs.
- `packages/memory/mint/moe-memory.yaml` owns plugin generation policy.
- `@bubstack/moe-mint` generates `plugins/moe-memory` reproducibly.
- `NOTICE` and each mint YAML's `imported_works` list remain the canonical
  attribution surfaces.
- The generated package manifest retains npm identity and every active harness
  field; one adapter may not overwrite another adapter's fields.
- The source package may use workspace dependencies while building. The release
  artifact may not need them at runtime.

## Architecture

```text
packages/memory source + mint config + locked third-party inputs
                              |
                              v
                    build self-contained runtime
                              |
                              v
                    pnpm mint (deterministic)
                              |
                              v
              plugins/moe-memory (complete plugin root)
                              |
                    npm pack this exact tree
                              |
                              v
                    test tarball -> publish tarball
```

The generated plugin becomes the canonical release payload. Claude and Codex
npm marketplace installs receive the same tarball. Other adapters consume the
same tree when their host install path supports npm, but they promise only the
surfaces their support matrix declares. The source package remains the
development unit; it is no longer a second, different distribution.

### Module seams

The plugin keeps its present external interface: one executable, one library
entry point, the existing MCP tools, and the existing skill. Portability work
stays behind that interface.

Three internal seams earn separate adapters because behavior genuinely varies:

- model acquisition takes an HTTP/filesystem adapter in production and a
  deterministic local adapter in tests;
- summarization takes a process adapter for Claude or Codex and a scripted
  process adapter in tests;
- mint takes a runtime-payload declaration and hides staging, collision checks,
  inventory, and manifest composition behind its existing generation command.

SQLite and embedding backends do not become public provider abstractions. Moe
has one supported implementation of each. Tests exercise them through memory's
existing interface, with internal reset and temporary-path seams where needed.

### Public API and release version

The current `dist/index.js` barrel publicly re-exports raw
`better-sqlite3`-typed database and journal APIs. A dependency-free
`DatabaseSync` implementation cannot honestly preserve that database object's
methods or types. This change therefore ships in the next pre-1 minor line,
`0.2.0`, not as a `0.1.x` patch.

The executable, MCP server identity, seven tool contracts, database contents,
CLI commands, and harness behavior remain compatible. The library entry point
stays available through `exports["."]`, but its supported contract becomes
package-owned DTOs, pure parsing/formatting utilities, and high-level memory
operations. Raw database handles and helpers that accept
`better-sqlite3.Database` become internal. Because the prerequisite artifact
foundation releases the composed predecessor first, a generated API diff
against 0.1.5, a migration guide, and compile/runtime fixtures for every
retained export make the break explicit. If release policy will not permit
that pre-1 breaking minor, the backend replacement is blocked; the design must
not disguise the raw database change as compatible.

### Artifact contract

The generated root must contain:

| Surface | Required payload |
| --- | --- |
| Node package | Scoped name, version, supported engine range, `bin`, `main`, `types`, and `exports` |
| Runtime | Bundled `dist/cli.js`, bundled library entry point, declarations, and license |
| Native search | Package-owned `sqlite-vec` libraries for five target triples |
| Embeddings | ONNX Runtime Web JavaScript and one package-owned WASM binary |
| Model fetch | Pinned model manifest containing revision, file sizes, and hashes |
| Claude and compatible hosts | `.claude-plugin/plugin.json`, `claude.mcp.json`, and `hooks/claude.json` |
| Codex | `.codex-plugin/plugin.json`, `codex.mcp.json`, and `hooks/codex.json` |
| OpenCode | `package.json#exports["./server"]` and the generated `.opencode` entry point |
| Pi | `package.json#pi` and the generated `.pi` extension |
| Other harnesses | Their generated manifests, skills, prompts, and agents |
| Legal | Moe licenses plus the generated third-party license payload |

Artifact validation follows every manifest path and package-relative command
argument recursively. Each target must be a regular file beneath the installed
root, appear in the package allowlist, carry its required executable mode and
LF encoding, and itself have closed references. This includes
`hooks/moe-mint/run-hook.cmd` and
`hooks/moe-mint/session-start`, which the merged Claude hook invokes. Existing
bootstrap and Claude-adapter tests gain this closure invariant.

The tarball must have no runtime dependencies and no install or postinstall
script. Installing it is a file copy. A host package manager is an optimization,
not a correctness requirement.

## Build and mint

### Runtime bundle

The memory build emits two dependency-free JavaScript entry points:

- `dist/cli.js` for `moe-memory` and the MCP server;
- `dist/index.js` for the package's public library API.

The build also emits TypeScript declarations and deterministic ESM split
chunks. Vector-only code lives behind dynamic imports, so loading either entry
point, completing MCP discovery, or running text search does not evaluate ONNX
Runtime or tokenizer modules. The chunk manifest is exhaustive and content
hashed; mint stages every listed chunk, and artifact and provenance checks
reject an unlisted or missing chunk. JavaScript dependencies are bundled from
the locked workspace graph. Platform libraries, WASM, model metadata, and
license texts remain explicit files so the runtime can select and verify them
without decoding JavaScript.

The bundler must produce an input metafile. That inventory is one input to
license closure, not the whole inventory: already-bundled packages can appear
as one wrapper file. Provenance also reconciles the lockfile, installed package
licenses, explicit native and WASM assets, and upstream notice hashes.

### Memory-specific staging

The root artifact compositor invoked by `scripts/mint-plugins.mjs` receives
distinct trusted source and temporary destination roots from
`moe-platform.yaml`. Memory's Mint YAML owns physical payload mappings;
`packages/memory/runtime-contract.json` owns forwarded environment variables
and runtime asset-selection semantics. Neither repeats the other's paths.
Source paths are package-root-relative; destination paths are
plugin-root-relative. Both schemas reject absolute paths, `..`, symlink
escapes, devices, sockets, and duplicate destinations.

The compositor realpath-validates completed build output and static assets,
then copies raw bytes into the temporary plugin root before adapters run. Mint
never reaches outside that root. The staging producer owns every declared
runtime destination; a collision with source content or adapter output fails
with both producers named. This facility is initially enabled only for memory.
Other plugins receive no runtime payload; their only generated-tree change is
the harness-specific hook/MCP topology required to keep Codex from discovering
another harness's defaults.

The facility is binary-safe end to end. `GeneratedFile.content`, file-set
deduplication, `writeFileSet`, `sha256`, `saveManifest`, and `checkDrift` accept
and hash raw bytes. Existing text adapters keep emitting strings and must remain
byte-identical. Tests round-trip non-UTF-8 fixtures so a WASM, dylib, shared
object, or DLL can never be decoded and rewritten as text.

The root `//#mint:generate` task depends on `@bubstack/moe-memory#build`. Its
cache inputs cover memory source, package metadata, lockfile, build
configuration, native/WASM source assets, and generated runtime output. A clean
or cached CI run must never mint from an absent or stale `dist`.

`scripts/mint-plugins.mjs` stages the byte-safe payload only after that build.
It assembles all plugin roots in a temporary sibling and replaces `plugins/`
only after every root validates, so failure does not destroy the prior
generated tree. `pnpm mint:check` regenerates and byte-compares the tracked
plugin tree.

### Manifest composition

The root `package.json` is a merged artifact, not an adapter winner. Field
ownership is explicit:

| Field | Owner |
| --- | --- |
| `name`, `version`, `engines`, `bin`, `types`, `exports`, `publishConfig` | source package |
| `main` | source package library entry point |
| `exports["./server"]` | OpenCode adapter |
| `pi` | Pi adapter |
| `description`, `author`, `license`, `repository`, `homepage`, `keywords` | mint metadata, reconciled with any source-package duplicate |
| `files` | release staging inventory |

The GitHub repository is canonical. Implementation updates stale GitLab values
in both metadata producers. A duplicated descriptive field must normalize to
the same value or mint fails with both producers named. Adapter-owned fields
remain disjoint and are covered by a complete golden `nodePackageManifest`
test.

The source package keeps `main` and `exports["."]` on the library entry point,
whose import and types targets are `dist/index.js` and `dist/index.d.ts`.
OpenCode owns only `exports["./server"]`, pointing at the generated `.opencode`
server entry. Release tests must load OpenCode through that pinned subpath and
compile and run a clean consumer through the package root.

Generated runtime packages omit workspace `dependencies`, `devDependencies`,
and lifecycle scripts. Mint generates an exhaustive `files` allowlist from the
staged release tree instead of carrying the source package's narrower list. It
includes all runtime, declaration, hidden harness, native, WASM, model-manifest,
documentation, and legal paths. It excludes mint configuration, staging
manifests, source maps that disclose build paths, tests, and other generation
internals that no host consumes. `npm pack --dry-run` must match that allowlist
exactly. Conflicting scalar fields fail mint with both producers named. Arrays
and objects use explicit merge rules; silent last-writer-wins behavior is
forbidden.

A clean consumer installs the extracted tarball, imports its public API, and
typechecks against the shipped declarations. Separate tests load OpenCode via
`exports["./server"]` and Pi via `pi`, proving those harness entries coexist
with the package root export.

### Pack and publish

One reusable root command, `pnpm memory:artifact:test`, builds memory, mints,
packs `plugins/moe-memory`, extracts the resulting `.tgz` into a clean temporary
directory, and runs every artifact test against that extraction. The pre-merge
gate and tagged publish workflow call this command unchanged. Publication uses
that same `.tgz`; it must not invoke `npm publish` on `packages/memory` or
repack after verification. The command always asserts equality among the source
package, memory mint YAML, `src/version.ts#VERSION`, generated package, and
packed-package versions. It accepts an optional `--expected-version`; the
publish job supplies the independently selected memory version from the
platform release catalog, while pre-merge runs omit it. The platform tag need
not equal an independently versioned plugin. The command records the verified
tarball's SHA-256 for the publish job. Every changed plugin publishes from its
generated tree through the shared exact-artifact path. Any package whose
generated hook/MCP topology changes receives a new independent version;
immutable npm versions are never overwritten merely because memory is the
motivating fix.

`moe-platform.yaml#release` makes tag selection explicit. A platform tag names
one generated release catalog; the workflow compares it with the preceding
catalog, verifies each selected plugin's independent version and integrity, and
publishes only changed packages. The artifact job uploads the already-tested
memory `.tgz` and digest. The publish job downloads those exact files and skips
unchanged packages; it neither republishes them nor rebuilds memory.

## Runtime design

### SQLite and vector search

Replace `better-sqlite3` with Node's built-in `node:sqlite` `DatabaseSync`.
Node 22.13 added the extension APIs required by this design, so the published
engine range becomes `>=22.13.0 <23 || >=24 <25`; the repository toolchain
remains Node 24. Future odd and even majors require qualification before the
range expands.
The implementation follows the [Node 22.13 SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html).

The plugin carries `sqlite-vec` 0.1.9 libraries for:

- macOS arm64;
- macOS x64;
- Linux arm64;
- Linux x64;
- Windows x64.

The release cannot rely on the publisher's host-selected optional dependency.
The workspace declares the required operating systems and CPUs through pnpm's
supported-architecture configuration, locks all five `sqlite-vec` target
packages, and makes them available to the asset verifier. It may stage a target
package only when its binary metadata meets Moe's platform floor. A manifest
records each asset's source, revision or package integrity, target triple,
minimum OS/libc, byte count, and SHA-256 hash. Missing, duplicate, unexpected,
or over-floor targets fail the build.

Moe's native floor matches the Node 24 binary floor: macOS 13.5 on arm64 and
x64, and Linux kernel 4.18 with glibc 2.28 on arm64 and x64. The upstream 0.1.9
macOS assets declare macOS 14.0 on arm64 and 15.0 on x64, so they cannot ship.
An audited asset-refresh workflow compiles both Darwin libraries from
[`sqlite-vec` v0.1.9](https://github.com/asg017/sqlite-vec/tree/e9f598abfa0c06b328d8fe5da9c3760cce74be10)
at pinned commit `e9f598abfa0c06b328d8fe5da9c3760cce74be10` with
`MACOSX_DEPLOYMENT_TARGET=13.5`. The Linux package binaries require no newer
than glibc 2.28, but still run load/KNN probes on actual floor images. Release
tests inspect Mach-O and ELF metadata and execute on real arm64 and x64 floor
systems, not only emulation. These floors follow Node's
[supported-platform contract](https://github.com/nodejs/node/blob/main/BUILDING.md#platform-list).

The two rebuilt Darwin libraries and their source/build manifest are tracked
under `packages/memory/vendor/sqlite-vec/`; normal mint and pack runs stage
those verified inputs and do not compile host-dependent bytes. A dedicated
`pnpm memory:native:refresh` command uses a manifest-pinned Xcode build, macOS
SDK build and hash, compiler identity, source archive hash, target architecture,
deployment target, compiler/linker flags, and output hashes. Its `--check` mode
rebuilds and byte-compares both files on that exact macOS release image. A clean
Linux checkout only verifies and stages the committed canonical bytes. This is
a third-party input cache, not an alternate plugin tree; provenance connects
each byte to the pinned upstream revision and build recipe.

Windows receives the small DLL so database-level portability can be tested,
but native Windows hooks and the wider Moe toolchain remain unsupported.
Native musl is unsupported until an exact `sqlite-vec` asset passes the same
qualification matrix; WSL2 follows the glibc Linux contract.

Database startup constructs `DatabaseSync` with extension loading enabled,
loads only the asset matching `process.platform` and `process.arch`, then
immediately disables extension loading. Each public entrypoint resolves and
injects the installed package root from its own `import.meta.url`; shared split
chunks never infer the root from their chunk location. Environment input cannot
select an arbitrary library.
Unsupported platform pairs fail with a message that names the detected pair
and the supported pairs.

The adapter preserves the current schema, WAL configuration, foreign keys,
`busy_timeout = 5000`, vector tables, database paths, and 384-dimensional float
representation.
`better-sqlite3` convenience methods map as follows:

- `.pragma(...)` becomes explicit SQL;
- `.transaction(fn)` becomes an exception-safe helper using `BEGIN`, `COMMIT`,
  and `ROLLBACK`;
- returned blobs are normalized from `Uint8Array` where callers require
  `Buffer` behavior.

Any migration that temporarily disables foreign keys, including
`migrateToolCallsCascade`, restores the prior setting in a `finally` block.
Two-connection and two-process contention tests prove the busy timeout and WAL
behavior under the hook/MCP concurrency that occurs in production.

Every v3 database connection also holds a cross-process shared lease for its
lifetime. Snapshot, recovery, and database replacement close their own
connection and require the exclusive maintenance lease. Upgrade and rollback
preflight inspect existing sync locks/PIDs and open database handles on the
supported macOS/Linux platforms; an in-flight v2 process does not understand
the new lease, so maintenance refuses to proceed until that process exits. It
never swaps a database underneath an uncooperative legacy connection.

The feasibility matrix loaded the following exact combinations, all with
`sqlite-vec` 0.1.9:

| Node | Bundled SQLite | Result |
| --- | --- | --- |
| 22.13.0 | 3.47.2 | Passed |
| 22.23.2 | 3.51.3 | Passed |
| 24.20.0 | 3.53.4 | Passed |

The probes produced exact nearest-neighbor results, reopened a WAL database,
preserved blobs, rolled back failed transactions, passed integrity checks, and
enforced cascading foreign keys.

Node 22 reports `node:sqlite`'s experimental status on stderr. That warning is
acceptable because MCP reserves stdout, but the exact-minimum lane must catch
any future Node 24-only API use hidden by the repository toolchain.

### Embeddings

Replace the Node entry point of `@huggingface/transformers` with direct public
APIs:

- `Tokenizer` from `@huggingface/tokenizers` 0.1.3;
- `onnxruntime-web/wasm` from
  `onnxruntime-web` 1.26.0-dev.20260416-b7804b056c;
- `ort-wasm-simd-threaded.wasm`, 12,942,611 bytes with SHA-256
  `f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a`.

The runtime sets ONNX WASM proxying off and uses one thread. It passes the
package-owned WASM bytes directly to the runtime and creates a WASM execution
session from verified model bytes. Token IDs, attention masks, and token-type
IDs use `int64` tensors. The last hidden state is reduced with masked mean
pooling and L2 normalization.

The semantic contract remains:

- model `Xenova/bge-small-en-v1.5` at q8;
- 384 output dimensions;
- 2,000-character input truncation;
- tokenizer truncation at 512 tokens and right padding;
- the existing BGE query prefix for queries only;
- mean pooling and normalized float output.

The direct WASM pipeline matched the Transformers browser/WASM path exactly in
the feasibility probe. It differs slightly but deterministically from the
current native backend: measured cosine similarity was about 0.995 with a
maximum absolute component difference near 0.018. Dimension equality would
hide a mixed corpus, so `EMBEDDING_VERSION` must move from 2 to 3. Existing rows
are re-embedded through a shared migration module; old and new vectors are
never searched together.

The current migration runs only during sync, so the change also moves version
gating into the vector-search interface. Conversation and journal vector SQL
selects only rows stamped with the current embedding version. A vector request
starts or resumes one migration coordinator that counts both conversation and
journal records. Vector search remains closed until both current-version counts
are complete; the SQL version predicates remain a race-safety backstop.
Until then, `mode: "both"` returns text results and reports vector-upgrade
progress, while vector-only mode reports that the index is upgrading instead of
searching a partial or mixed vector corpus.

The database lease's exclusive writer lock coordinates snapshot creation,
future-version checks, raw ingestion that creates version-0 rows, every
version-3 write, the final readiness check, and the vector query it authorizes.
Embedding computation may occur outside the lock, but the writer must reacquire
it and revalidate the database epoch before committing. This prevents a second
hook or MCP process from inserting a pending row between a zero-pending count
and search. Text-only queries remain available without waiting for vector
readiness.

Source ingestion no longer waits for embeddings. Sync writes searchable
conversation and journal text first with `embedding_version = 0`, then enriches
pending rows with summaries and vectors when the model and summarizer are
available. The existing schema already represents this pending state. A fresh
offline install can therefore ingest and text-search raw sources without a
model download. Conversation fallback retains its bound `LIKE` query; journal
fallback adds an equivalent bound `LIKE` query over `journal_entries.text`
with the existing scope/time filters and excerpt formatting. No new FTS table
is implied.

The bundle adds about 13 MB for ONNX Runtime WASM and less than 200 KB for its
JavaScript and tokenizer glue. The approximately 34.7 MB model remains outside
the plugin.

The source package declares those two libraries and `sqlite-vec` 0.1.9 as
direct, exact dependencies rather than relying on transitive reachability or
ranges. The runtime manifest pins the selected WASM and all five native assets
by SHA-256. The workspace removes stale build approvals for
`better-sqlite3`, `onnxruntime-node`, and `sharp` after their dependency paths
disappear. Any change to the model revision, tokenizer, ONNX runtime, dtype,
pooling, normalization, prefix, or truncation requires an
embedding-equivalence probe and an explicit `EMBEDDING_VERSION` decision.

Those direct dependencies remain truthful in the source package. Memory's Mint
policy alone marks them as `bundled` for generated-package composition, and the
compositor may omit them from the generated `package.json` only after bundle,
native, and WASM inventories prove the artifact contains their required runtime
closure. Every other plugin defaults to preserving its source dependencies.

### Model cache and downloader

Moe owns model acquisition instead of inheriting a library's cache behavior.
A checked-in manifest pins one Hugging Face revision and inference variant and
records the source URL, model license, required files, byte counts, and SHA-256
hashes. The cache namespaces complete sets by model, revision, and variant. The
downloader:

1. verifies a complete cached set before any network request;
2. takes a cross-process lock scoped to the model, revision, and variant;
3. checks HTTP status, content length, timeout, and final hash;
4. stages every file in one sibling directory;
5. writes the completion marker last and atomically activates the verified set;
6. removes incomplete staging directories after failure.

The runtime never combines files from two revisions or variants. A valid
legacy unversioned cache is copied or reflinked into a sibling staging
directory, rehashed there, and atomically activated without a download. It is
never moved or hard-linked. An invalid legacy cache is left untouched and
reacquired. The original cache remains byte-identical through the rollback
window, so old and new plugin versions can use separate complete sets while the
revision-scoped lock serializes each activation.

Offline startup succeeds when the verified cache is complete. A missing model
does not prevent MCP initialization or text search. A vector operation starts
the first download and returns an actionable error if the network or cache is
unavailable.

### Harness summarization

The Codex summarizer remains on its existing `codex app-server` path.
`runCodexCommand` continues to require the supported Codex version, fork the
source thread ephemerally under a read-only sandbox, and fall back to transcript
text if the fork is unavailable. The self-contained bundle includes that
implementation but not the host's Codex executable.

#### Claude

Remove the runtime dependency on `@anthropic-ai/claude-agent-sdk`. Bundling it
would also redistribute SDK code under a package-specific license that is not
compatible with an automatic third-party payload decision.

The summarizer invokes the installed Claude CLI through one exact documented
non-interactive contract. Its base argv is:

```text
claude -p --input-format text --output-format json \
  --no-session-persistence --model <model>
```

Fresh summaries add `--system-prompt <prompt>`. Resumed summaries add
`--resume <session-id>` and do not replace the resumed session's system prompt.
The child uses the caller working directory. The summary request is written
once as UTF-8 to stdin, and stdin is always closed. Streaming input and output
are outside this adapter contract.

These flags are part of the [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).
After process close, the adapter parses exactly one JSON result object. A
parseable `is_error` result takes precedence over exit status and becomes
`SummarizerSdkError(subtype ?? "unknown", session_id)`. Spawn failure, timeout,
or signal termination becomes a process error; a nonzero exit without a
structured error becomes an exit error with bounded, sanitized stderr; and a
zero exit with malformed JSON or a non-string result becomes a protocol error.
Claude 2.1.258 reports a missing resume target as exit 1 with empty stdout and
`No conversation found with session ID: <id>` on stderr. Before applying the
generic exit rule, the adapter narrowly matches that complete message against
the exact requested ID and synthesizes
`SummarizerSdkError("error_during_execution", requestedId)`. Only that case or
the equivalent structured subtype triggers one resume-to-fresh retry. Every
version in the Claude compatibility manifest tests this classifier.

The child process receives the baseline process environment, including `PATH`,
home/profile variables, standard Claude credentials, proxy settings, and TLS
certificate configuration. It drops only `NODE_OPTIONS`, overlays custom
Anthropic endpoint/token/timeout mappings, and sets
`MOE_MEMORY_SUMMARIZER_GUARD=1`. It does not synthesize the SDK-only
`CLAUDE_CODE_ENTRYPOINT=sdk-ts`; if the caller already supplied an entrypoint,
that value is inherited. It does not add flags that suppress hooks, settings,
project context, or tools.

The current `max_tokens: 4096` SDK option has no documented Claude CLI
equivalent and is not an effective public contract. Remove that option and its
assertion explicitly; do not invent an undocumented CLI flag. Preserve and
test the primary/fallback model selection, thinking-budget fallback, base URL,
token, API timeout, working directory, and reentrancy guard.

Claude Code guarantees a Claude CLI in the host where Claude summarization
already works. Other harnesses may not. The lookup order is:

1. `MOE_MEMORY_CLAUDE_BIN`, when set;
2. `claude` on `PATH`.

If neither exists, indexing and raw exchange recall continue. Native Codex
sessions still use `codex app-server`. A Claude-backed summary operation records
the existing error sentinel and reports how to install or configure Claude; it
does not make the MCP server unavailable.

Moving from an SDK-pinned executable to the host CLI creates a version
interface. Implementation introduces `MIN_CLAUDE_VERSION` and qualifies the
old SDK's Claude 2.1.141 baseline, the current 2.1.258 CLI, and intermediate
versions until it finds the first version that satisfies fresh structured
output, resumed structured output with no new persisted session, and source
session immutability. That oldest passing version becomes the exact constant
and engine diagnostic. A failed qualification raises the floor; release may
not infer compatibility from flag presence alone.

A committed Claude compatibility manifest names every qualification candidate,
its exact `@anthropic-ai/claude-code` npm version and registry integrity, the
expected pass/fail result, the selected minimum, and the current-version lane.
Tests install those exact tarballs in isolation. The release may update the
manifest deliberately, but cannot resolve an unpinned `latest` during a gate.

Structured-output tests cover success, missing-session subtype and session ID,
nonzero exit, signal termination, timeout, malformed JSON, and incomplete
streams. They also prove the source session remains byte-identical.

### Configuration propagation

`packages/memory/runtime-contract.json` is the memory-owned declarative
contract for runtime asset-selection semantics and environment variables a
plugin host may forward. Physical `from`/`to` payload mappings remain in
`packages/memory/mint/moe-memory.yaml`.
`packages/mint/schemas/runtime-contract.schema.json` defines the data-only
runtime schema. The memory build validates it; the root compositor and mint
read it as data and generate harness-specific MCP files without importing
memory code or adding a project reference. Its forwarded set is exact:

- path and profile inputs: `MOE_MEMORY_CONFIG_DIR`, `MOE_MEMORY_DB_PATH`,
  `MOE_MEMORY_JOURNAL_PATH`, `MOE_MEMORY_MODEL_CACHE_DIR`, `MOE_DATA_DIR`,
  `XDG_CONFIG_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and
  `CONVERSATION_SEARCH_EXCLUDE_PROJECTS`;
- indexing and model controls: `MOE_MEMORY_MIGRATION_BATCH`,
  `MOE_MEMORY_MODEL_INIT_TIMEOUT_MS`, and
  `MOE_MEMORY_SUMMARY_ERROR_RETRY_HOURS`;
- Claude controls: `MOE_MEMORY_CLAUDE_BIN`, `MOE_MEMORY_API_MODEL`,
  `MOE_MEMORY_API_MODEL_FALLBACK`, `MOE_MEMORY_API_BASE_URL`,
  `MOE_MEMORY_API_TOKEN`, and `MOE_MEMORY_API_TIMEOUT_MS`;
- Codex controls: `MOE_MEMORY_CODEX_BIN`, `MOE_MEMORY_CODEX_MODEL`, and
  `MOE_MEMORY_CODEX_SUMMARY_TIMEOUT_MS`.

Internal guards and test-only variables are not host configuration. A test
reconciles this contract with real configuration loaders and an explicit
internal/test allowlist, so adding a new supported variable without forwarding
it fails the gate.

This allowlist governs host-to-MCP filtering only. It does not replace the
baseline environment inherited by Claude and Codex child processes under their
process-adapter contracts.

Artifact tests launch memory through the real Claude and Codex plugin loaders
to prove host filtering preserves those variables. Direct child-process tests
alone are insufficient.

## MCP startup and failure isolation

`runMemoryMcpServer` connects the stdio transport before journal refresh,
database creation, model initialization, or network access. A host must be able
to complete `initialize` and `tools/list` within two seconds from a cold,
extracted tarball on every release lane.

The startup bundle may register lazy factories, but it may not import ONNX
Runtime, tokenizer implementation code, or model assets, nor read the model
cache, before a vector operation requests them. An offline first run can create
the database, ingest raw source records, and text-search them without touching
the network.

After connection:

- text-only operations initialize the database but not the model;
- vector operations initialize the database and embedding model lazily;
- journal refresh starts in the background and logs only to stderr;
- a failed refresh leaves MCP tools available and can retry later;
- the detached `SessionStart` sync remains best-effort and reentrancy-guarded.

No dependency-oriented `install-check` remains. Runtime diagnostics report
capabilities instead: Node version, platform asset, database readiness, model
cache state, Claude CLI availability, and configured writable paths.

The MCP artifact test snapshots server identity (`moe-memory` plus the packed
version) and the complete names, input schemas, output schemas, descriptions,
and annotations for all seven tools: `search_conversations`,
`read_conversation`, `process_thoughts`, `search_journal`,
`read_journal_entry`, `list_recent_entries`, and `read_recent_entries`. It
captures the complete stdout byte stream while exercising legacy migrations,
offline errors, and failed lazy initialization. Every byte must belong to a
valid JSON-RPC frame; migration status and diagnostics use stderr or the
structured MCP result instead of `console.log`.

## Harness integration

### Codex

The Codex adapter's current support declaration is stale. Codex 0.152.1 exposes
plugins and hooks as stable capabilities and has removed the old
`plugin_hooks` feature. That version becomes `MIN_CODEX_VERSION` for the Codex
adapter and native Codex summarizer, replacing the summarizer-only 0.130.0
floor. It is not a global MCP or package engine check: absent or older Codex
cannot disable Claude, OpenCode, Pi, direct MCP startup, text recall, or Claude
summarization. Doctor messages and E2E setup must not tell users to enable a
removed feature.

Memory's manifest names Codex-specific MCP and hook files:

```json
{
  "skills": "./skills/",
  "mcpServers": "./codex.mcp.json",
  "hooks": "./hooks/codex.json"
}
```

`codex.mcp.json` contains the direct server map accepted by the documented
Codex package format. It is generated from the same memory-owned runtime
contract as `claude.mcp.json`, whose Claude-compatible `mcpServers` wrapper
does not change. The Codex entry keeps `args: ["./dist/cli.js",
"mcp-server"]` and `cwd: "."`. A packed-artifact parser test and real host E2E
must prove Codex resolves that working directory to the installed plugin root.
If it does not, release is blocked until a documented root-relative contract
replaces it; the server may not fall back to the invoking project's directory.

`hooks/codex.json` contains only memory's source `SessionStart` sync hook. It
does not contain the Claude bootstrap-context hook from the mint-merged
`hooks/claude.json`, so a Codex session schedules exactly one sync and receives
no duplicate bootstrap injection. The generated command uses an internal
`sync --hook` mode: it launches background sync, emits no success stdout,
bounds failures on stderr, and always exits zero. A shell-level final guard also
returns zero when Node, the plugin root, or the CLI entry point is unavailable.
Direct user invocation of `sync` or `sync --background` retains its current
status output and error exit codes.

The [Codex plugin manifest documentation](https://developers.openai.com/plugins/build/plugins)
defines path-valued MCP and hook components, plugin-root path rules, and
`PLUGIN_ROOT`/`CLAUDE_PLUGIN_ROOT` compatibility. The
[Codex MCP reference](https://developers.openai.com/codex/mcp) defines the
stdio server fields. Tests exercise both the minimum and current Codex parser
rather than assuming Claude's MCP shape is interchangeable.

Mint must not enable hooks merely because a package has a hooks directory.
Codex hook behavior becomes an explicit per-plugin setting:

- memory points to its source-sync-only Codex hook file;
- packages not yet audited point to a generated
  `hooks/codex-disabled.json` containing an empty hook map;
- generated install documentation and support warnings reflect the setting.

Codex supplements custom component paths on top of default discovery. Mint
therefore treats source hook and MCP component files as inputs and does not
publish active `hooks/hooks.json` or `.mcp.json` files at their default paths.
It emits `hooks/claude.json`, `hooks/codex.json` or
`hooks/codex-disabled.json`, and any other harness-specific hook files instead,
plus `claude.mcp.json`, `codex.mcp.json`, and the MCP files required by other
adapters. Hook scripts remain under `hooks/`.

This topology applies to every generated plugin, preserves each audited
harness's behavior through an explicit manifest pointer, and prevents default
discovery from bypassing a per-harness decision. Mint uses only the documented
path form in `.codex-plugin/plugin.json`; it does not rely on an inline empty
object as a suppression sentinel.

Codex does not trust third-party hooks on installation. Users must review and
trust the hook in `/hooks`; that security boundary is never bypassed. Negative
tests prove a newly installed or modified hook does not run before trust,
trusting it enables exactly one sync, and changing its bytes invalidates that
trust.

### Claude Code

Claude keeps the existing MCP declaration semantics, source `SessionStart`
behavior, bootstrap hook merge, skill, agents, and prompts. Its plugin manifest
points to `claude.mcp.json` and `hooks/claude.json`; the generated plugin does
not also expose default `.mcp.json` or `hooks/hooks.json` files. Claude's plugin
cache may install eligible Node dependencies and exposes
`${CLAUDE_PLUGIN_ROOT}`, but this design does not depend on either installation
side effect. The relevant cache, MCP, hook, and path contracts are in the
[Claude plugin reference](https://code.claude.com/docs/en/plugins-reference).

Tests must prove the source hook command and mint-merged generated hook file
resolve with `CLAUDE_PLUGIN_ROOT`. In one Claude `SessionStart`, the merged file
runs memory sync exactly once and injects bootstrap context exactly once. The
compatibility expression continues to accept `PLUGIN_ROOT` for Codex.

### OpenCode, Pi, and the remaining adapters

OpenCode must still load the generated `.opencode/plugins/moe-memory.js` through
`exports["./server"]`. Pi must still load its extension and skill list through
`package.json#pi`. Cursor, Kimi, Copilot, and Agent Plugins retain their current
behavior through their generated paths and manifests. Hook and MCP filenames
may become harness-specific, but every adapter must point at its exact output.
The merged package manifest and per-adapter golden tests are the regression
boundary for these runtimes.

GitHub Copilot CLI currently consumes Claude's default hook/MCP layout rather
than emitting its own files. Because this design removes those defaults, a
committed Copilot compatibility manifest pins minimum and current CLI builds
and their acquisition integrities. Real install tests must prove both builds
honor `.claude-plugin/plugin.json` pointers to `hooks/claude.json` and
`claude.mcp.json`, execute one hook, and initialize one MCP server. If either
build ignores custom pointers, release is blocked; Moe does not silently weaken
Copilot support or restore defaults that Codex would also discover.

## Installer scope

`bin/moe-install` remains an optional Claude convenience command. It receives a
separate cleanup within the implementation:

- replace the retired GitLab URL with the canonical GitHub repository;
- read a dependency-free install-catalog projection generated from the data-only
  `moe-platform.yaml` registry instead of maintaining a private list;
- update its tests and help text.

A bidirectional equality test covers the registry, marketplace, mint inputs,
and installer selections, including `moe`, `moe-backstory`, `moe-memory`,
`moe-glass`, `moe-crew`, and `moe-statusline`. A newly added or retired plugin
must make stale installer data fail the gate.

It does not install plugin dependencies, mutate Codex caches, or become part of
the memory startup path.

## Security and legal requirements

- Resolve native SQLite extensions beneath the real installed plugin root,
  reject escapes and unexpected filenames, verify their release-manifest hash,
  then disable extension loading. Plugin caches are user-writable and are not
  described as an immutable trust boundary; installation integrity comes from
  the verified tarball and host package cache.
- Verify every downloaded model file before use. Never execute a partial or
  hash-mismatched model.
- Keep model downloads and all writable state outside the ephemeral plugin
  root.
- Preserve MCP stdout exclusively for JSON-RPC; diagnostics and model progress
  go to stderr.
- Preserve Claude's marketplace install/enable confirmation and normal
  permission prompts, plus Codex's hook-byte trust review. This design does not
  claim Claude has Codex-style per-hook hash invalidation.
- Generate notices from the actual bundle input inventory and explicit assets.
- Add mandatory imported-work records for redistributed `sqlite-vec`, Hugging
  Face tokenizer code, and ONNX Runtime Web artifacts to `NOTICE` and
  `packages/memory/mint/moe-memory.yaml#imported_works`.
- Reconcile the bundler metafile with the lockfile, direct and transitive
  package-license metadata, every native/WASM hash, upstream license-file
  hashes, and ONNX third-party notices. Missing, unknown, or extra inputs fail
  `pnpm provenance`; bundled `dist` files may not be skipped. The only
  non-imported exclusions are Node built-ins, memory-owned source, and Moe's own
  license payload, each represented by a named rule rather than a path-wide
  skip.
- Ship all required MIT, Apache-2.0, and ONNX Runtime license and notice texts
  inside the tarball, with an artifact test that maps every bundled input to
  one shipped legal record.
- Apply the same inventory-to-license closure to each platform recovery capsule;
  historical dependencies do not bypass current redistribution review.
- Do not bundle the Claude Agent SDK without a separate license decision.

The embedding model is downloaded by the user rather than redistributed, but
its exact revision and hashes remain part of the reproducibility contract.

## Compatibility contract

The change may ship only if these behaviors remain true:

| Behavior | Claude | Codex | Other supported harnesses |
| --- | --- | --- | --- |
| Plugin installs without a Moe-specific repair step | Required | Required | Required |
| MCP initializes from a clean extracted tarball | Required | Required | Path-appropriate |
| `SessionStart` schedules background sync | Required | Required after trust | Where hooks exist |
| Text search works without a model or network | Required | Required | Required |
| Existing database opens in place | Required | Required | Required |
| Version-2 vectors migrate before vector search | Required | Required | Required |
| Missing Claude CLI leaves raw recall usable | Host supplies CLI | Required degradation | Required degradation |
| OpenCode `exports["./server"]` and Pi metadata survive | N/A | N/A | Required |

No change is considered compatible merely because source-tree tests pass.
Compatibility is measured from the packed release artifact.

## Verification and release gates

### Artifact identity

- Build, mint, and pack from a clean checkout.
- Extract the exact `.tgz` under a temporary directory with no `node_modules`.
- Assert the scoped package identity, engine range, `bin`, `main`, `types`,
  `exports`, OpenCode metadata, and Pi metadata.
- Assert both bundled JavaScript entry points, declarations, WASM, all five
  vector extensions, model manifest, harness manifests, and legal payloads.
- Add narrow `.gitignore` exceptions for `plugins/moe-memory/dist/**` and every
  other generated runtime asset, then assert each expected artifact appears in
  `git ls-files`. An ignored or untracked runtime file is a release failure even
  if local `mint:check` sees no diff.
- Reject runtime dependencies, lifecycle scripts, undeclared bundle inputs,
  absolute build paths, timestamps, and post-verification repacking.

### Runtime

- Complete MCP `initialize` and `tools/list` before model or journal work.
- Run text search against an empty temporary database without network access.
- Instrument module evaluation and filesystem reads, and reconcile the bundler
  metafile, to prove ONNX/tokenizer chunks and model assets remain untouched
  through library import, `initialize`, `tools/list`, and text-only search.
- Run vector search against a preseeded, hash-verified model cache.
- Open and migrate a copy of a real version-2 database; prove foreign keys,
  WAL, transactions, integrity, KNN ordering, and version-3 re-embedding.
- Exercise concurrent model initialization, interrupted downloads, hash
  mismatch, lock recovery, legacy-cache adoption, atomic set activation,
  offline cache hits, and unsupported platforms.
- Exercise two connections and two processes against the same database, and
  prove foreign-key restoration after a failed cascade migration.
- Hold a real version-2 sync process and MCP process open during upgrade and
  rollback preflight. Prove maintenance refuses without changing the active
  database, then succeeds after both legacy processes exit.
- Run the database and MCP smoke suites on Node 22.13.0, 22.23.2, and 24.20.0.

### Hooks and summaries

- Execute the exact source and generated `SessionStart` commands under both
  `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT`.
- Prove background detachment, reentrancy protection, empty success stdout,
  stderr-only failure logging, and nonfatal sync failure.
- Through both real Claude and Codex hook runners, remove Node, the plugin
  root, and the CLI entry point in turn and force background-spawn failure.
  Every hook invocation must still exit zero, while direct `sync` and
  `sync --background` retain their documented status output and failure codes.
- On Codex, prove no hook runs before trust, exactly one source sync runs after
  trust, no bootstrap context is injected, and a byte change invalidates trust.
- On Claude, prove exactly one source sync and one bootstrap-context injection
  occur per matching `SessionStart`.
- For every generated plugin with hooks or MCP, compare the pre-change and
  post-change Claude event/server inventory and execute each hook-bearing
  plugin's existing Claude flow. In Codex, prove each unaudited plugin loads no
  hook while its non-hook components remain available.
- In an isolated authenticated Claude configuration, prove fresh summaries,
  resume, resume fallback, missing working directories, nested-hook guarding,
  and unchanged source JSONL hashes.
- Prove `--resume` can read an existing session while
  `--no-session-persistence` prevents the summarizer run from writing a new or
  resumable session. Treat failure of that combined contract on the supported
  minimum Claude CLI as a release blocker, not a reason to drop either
  behavior.
- Prove missing Claude CLI does not prevent indexing or raw recall.
- From the packed artifact, preserve `runCodexCommand` `thread/fork`, ephemeral
  execution, read-only sandbox, `getCodexModel`, minimum-version and timeout
  errors, and transcript fallback through a fresh Claude summary when Codex
  summarization is unavailable.
- Prove an absent or pre-0.152.1 Codex executable degrades only Codex-native
  features and cannot prevent MCP initialization, text recall, or Claude
  summarization.

### Harnesses and platforms

- Install the extracted tarball into clean raw Codex and Claude plugin caches,
  with no workspace or inherited `node_modules`, and prove the corresponding
  flows: Codex enable and hook trust; Claude install/enable confirmation; then
  archive, MCP initialization, and recall in each host.
- Publish the same bytes to a prerelease channel and exercise each host's real
  marketplace install and update commands. Prove cache refresh replaces the
  old version, the installed package hash matches the verified tarball, Claude
  behavior is unchanged, and Codex uses its dedicated MCP and hook files.
- Load OpenCode and Pi entry points; validate Cursor, Kimi, and Agent Plugins
  paths. Install the pinned minimum and current Copilot CLI builds for real and
  prove each follows the custom Claude manifest pointers, starts exactly one
  MCP server, and executes exactly one hook. A failure blocks release.
- Run native asset lanes on macOS and Linux, arm64 and x64. Treat WSL2 as the
  Linux contract. Run a Windows x64 database-asset smoke test without claiming
  native Windows plugin support.

### Repository gates

- Add targeted tests by symbol and behavior, including
  `runMemoryMcpServer`, `nodePackageManifest`, Codex `pluginManifest`, embedding
  migration, hook execution, and artifact extraction.
- Run `pnpm check`, `pnpm mint:check`, `pnpm provenance`, and
  `pnpm memory:artifact:test`; the tagged workflow invokes the last command
  rather than duplicating its steps.
- Add a clean-checkout memory-artifact job to `.github/workflows/ci.yml`; the
  current plugins job's `mint:check` alone is not this gate.
- Run `pnpm memory:native:refresh --check` on the pinned macOS builder and
  inspect/load every native asset on its declared floor lane.
- Update `ARCHITECTURE.md` only after the implementation makes memory a
  generated self-contained distribution.
- Publish only the `.tgz` that passed every release gate.

## Rollout and recovery

This is the `0.2.0` pre-1 breaking library release described above, with a
data-compatible schema and an embedding-version migration. CLI, MCP, stored
data, and supported harness behavior remain compatible.

1. Land the self-contained build, mint composition, runtime replacements, and
   artifact tests together. A partial release would reproduce the split.
2. Publish a prerelease tarball and run the authenticated Claude and Codex
   matrices from that tarball.
3. Publish the verified tarball unchanged.
4. On first vector use, version-2 rows enter the existing re-embedding path.
   Text search remains available during migration.

Before the first version-3 vector write, the new runtime creates a consistent
version-2 database snapshot with `VACUUM INTO` while holding the exclusive
maintenance lease. Creation is atomic and once-only. A durable sidecar records
the database identity, schema version, from/to embedding versions, source artifact
integrity, snapshot hash, creation time, and a sorted inventory of every mutable
transcript/journal source by canonical identity, contained path, and content
SHA-256. If creation or verification fails,
migration does not begin and text recall remains available. A vector operation
hard-fails on an embedding version newer than the running code; it never
silently downgrades it.

Before 0.2.0 ships, the release publishes a recovery capsule for each supported
0.1.5 macOS/Linux target. The artifact-foundation prerequisite publishes 0.1.5,
so that version—not the pre-foundation 0.1.4 package—is the exact rollback
predecessor. Each capsule contains the exact old tarball plus its fully
installed dependency, peer, optional-native, and lifecycle-script closure from
the historical lockfile. A recovery manifest records every package version,
registry integrity, platform asset, executed build policy, file hash, and legal
payload. An upgrade from version 2 must download and verify its platform
capsule beside the snapshot before the first version-3 write. Empty package
manager caches and a disabled registry are part of the capsule test. If the
capsule is unavailable, migration remains blocked while text recall continues.

The v3 artifact owns rollback through `moe-memory rollback prepare --to
0.1.5`, which runs before the host installs the old plugin. The command verifies
the cached recovery capsule against the platform release catalog,
acquires the same cross-process lock, obtains exclusive database quiescence,
and works on a staged copy. The user must stop active host sessions first; the
command fails with process/lock diagnostics instead of forcing quiescence. It
restores the version-2 snapshot, then reconciles
all created, modified, and deleted transcript and journal sources without using
the old `copyIfNewer` shortcut. Changed rows are written as raw version-0 state,
their stale vectors are removed, and journal index state is reset.

The command unpacks the closed old runtime from the capsule into an isolated
recovery directory, runs its journal-index operation for every reconciled
journal root, then runs its exchange sync/migration against the staged database
and preserved legacy model cache without registry access. It requires every
created or modified journal and exchange row to reach version 2, plus database
integrity and complete vector checks. Immediately before the swap it writes a durable
rollback fence that every v3 writer checks; once fenced, the v3 runtime refuses
database writes until the old plugin is installed or `moe-memory rollback
abort` safely clears the preparation. Only then does prepare atomically swap
the staged database into the legacy path and retain the version-3 database
under a recoverable name. The user can then downgrade the host plugin. A
failure or crash before the fence leaves the active v3 database untouched;
after the fence, retry or abort resumes from durable metadata. The
implementation audits that every mutable row has a durable source before first
migration and blocks if it finds database-only state.

Artifact tests exercise two processes racing the first v3 write, a crash at
each prepare/swap boundary, created/modified/deleted sources, partial migration,
future-version rejection, and rollback through the exact previous released
tarball. The final old runtime must pass text recall and complete version-2
vector search offline. Because published 0.1.5 requires Node 24, this downgrade
path is supported only for users upgrading an existing 0.1.5 database on Node
24 and fails its preflight before touching state on Node 22. A fresh 0.2.0
installation on Node 22 has no supported code downgrade to 0.1.5. The old
runtime is never expected to understand version-3 rows; its
current stale-row predicate ignores them, which is why v3 must prepare rollback
before downgrade.

## Decisions and refutations

- **The installer is the root cause is REFUTED.** It is stale, but Codex never
  reaches it. The broken unit is the release artifact plus Codex manifest.
- **Claude success proves artifact completeness is REFUTED.** Claude's cache
  supplies dependencies that the artifact omits.
- **A postinstall hook is required is REFUTED.** Built-in SQLite, packaged
  native extensions, WASM inference, and bundled JavaScript remove that need.
- **The existing vectors can be mixed after the backend swap is REFUTED.** The
  new pipeline has the same dimension but measurably different values, so the
  embedding version must advance.
- **The Claude Agent SDK should be bundled is DECLINED.** The CLI preserves the
  required public behavior without adding a proprietary redistribution
  decision.
- **Codex lacks hooks and plugin MCP is REFUTED.** The current Codex plugin
  contract supports both; Moe's adapter encodes an obsolete limitation.

## Expected change surface

Implementation will primarily touch:

- `packages/memory/src` for SQLite, embeddings, model acquisition, summarizer,
  startup order, and diagnostics;
- `packages/memory/test` for unit, model, artifact, Claude, and Codex coverage;
- `packages/memory/package.json` and build configuration;
- `packages/memory/runtime-contract.json` and its mint-owned schema for runtime
  asset-selection and environment data;
- `packages/memory/mint/moe-memory.yaml` for runtime staging and Codex hook
  policy;
- `packages/mint/src` and tests for payload staging, package-manifest
  composition, and current Codex capabilities;
- `packages/memory/src/codex-support.ts`, doctor, and E2E setup for the stable
  Codex plugin/hook floor;
- `scripts/mint-plugins.mjs`, `turbo.json`, the root package scripts,
  `.github/workflows/ci.yml`, and the publish workflow for build-before-mint and
  exact-tarball publication;
- `moe-platform.yaml` for the shared public-plugin registry and artifact source
  roots;
- `pnpm-workspace.yaml` and the lockfile for direct pins, all target
  architectures, and removal of stale native build approvals;
- `.gitignore` for narrow generated-runtime exceptions and cleanup of its stale
  attribution comment;
- `NOTICE`, memory mint `imported_works`, and provenance checks for
  redistributed inputs;
- `bin/moe-install` and its tests for the independent stale-name cleanup;
- generated `plugins/*`, produced only by `pnpm mint`, because the explicit
  harness hook/MCP topology changes each affected artifact;
- memory's public API migration guide and native-asset build/inspection scripts;
- recovery-capsule manifests, platform payloads, and offline rollback fixtures
  for the four supported 0.1.5 macOS/Linux targets; Windows remains native-asset
  smoke only until a Windows quiescence/rollback contract exists;
- `ARCHITECTURE.md` after the new distribution is true on disk.

The implementation plan should divide these changes by dependency boundary,
not by file count: runtime portability, artifact composition, harness wiring,
and release proof.
