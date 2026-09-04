# Harness Neutrality 1: Renderer and Adapter Correctness

**Goal:** Make every advertised adapter emit and consume one complete,
profile-correct skill tree while preserving assets, modes, and truthful support
reporting.

**Spec:** The user-supplied Harness-Neutrality Rescue Plan. It supersedes the
shared-Claude-baseline decision in
`docs/moe/specs/2026-09-02-native-renderers-design.md`.

## Global Constraints

- Never hand-edit `plugins/`; regenerate with `pnpm mint`.
- Snapshot source skills once, transform Markdown, and copy other regular files
  byte-for-byte with executable bits preserved.
- Reject symlinks, unsupported file types, traversal, conflicting output, and
  shared output directories with mismatched profiles.
- Shared output directories are valid only for identical profiles.
- Support claims are achieved delivery states, not static aspirations.

### Task 1: Complete binary-safe rendered skill trees

**Files:**
- `packages/mint/src/adapters/types.ts`
- `packages/mint/src/model.ts`
- `packages/mint/src/vocabulary.ts`
- `packages/mint/src/generate.ts`
- `packages/mint/src/files.ts`
- `packages/mint/test/vocabulary.test.ts`
- `packages/mint/test/generate.test.ts`
- `packages/mint/test/adapters/skills-output-dir.test.ts`

**Interfaces:**
- Replace optional `skillsOutputDir` with required `skillLayout: { outputDir, profile, mode }`.
- Make `GeneratedFile.content` byte-safe while preserving text convenience for manifests.
- Produce a deterministic full-tree snapshot and adapter-scoped transformed copies.

**Consumes:** Existing `HarnessAdapter`, `GeneratedFile`, `substituteAllSkills`,
`adjustedModel`, collision/stale-file writer behavior.

**Produces:** Complete per-profile trees; binary-safe comparison/hashing/writes;
mode preservation; validation for symlinks, traversal, unsupported nodes,
collisions, and incompatible shared layouts.

- [ ] Add failing closure, executable-mode, incompatible-profile, traversal,
      collision, reproducibility, and stale-file tests.
- [ ] Implement the required layout and full-tree renderer.
- [ ] Run the focused mint tests.

### Task 2: Bind adapters, bootstrap, and reporting to achieved delivery

**Files:**
- `packages/mint/src/adapters/*.ts`
- `packages/mint/src/bootstrap/node-package.ts`
- `packages/mint/src/bootstrap/shell-hook.ts`
- `packages/mint/src/docs-emit.ts`
- `packages/mint/src/matrix.ts`
- `packages/mint/src/generate.ts`
- `packages/mint/test/adapters/*.test.ts`
- `packages/mint/test/bootstrap*.test.ts`
- `packages/mint/test/docs-emit.test.ts`
- `packages/mint/test/generate.test.ts`
- `docs/moe/specs/2026-09-02-native-renderers-design.md`
- generated `plugins/**` via `pnpm mint`

**Interfaces:**
- Every adapter receives an adjusted model rooted at its actual emitted tree.
- `nodePackageManifest` receives OpenCode and Pi canonical skill directories.
- Skill delivery reports one of `rendered`, `shared-compatible`,
  `native-discovery`, or `unsupported`; `skills: full` requires closure success.

**Consumes:** Task 1 `skillLayout` and closure result; adapter emitters;
bootstrap/runtime loader builders; support matrix generation.

**Produces:** Claude/Copilot `.claude-plugin/skills`, Agent Plugins root `skills`,
native private trees for Cursor/Codex/Kimi/OpenCode/Pi, correct runtime loaders,
truthful bootstrap prose, updated design record, regenerated artifacts.

- [ ] Replace stale root-path expectations with adapter-native path assertions.
- [ ] Remove `SHARED_MANIFEST_ADAPTERS` and preserve only compatible shared files.
- [ ] Derive support claims after closure validation.
- [ ] Update the superseded design decision, regenerate, and run mint/core tests.
