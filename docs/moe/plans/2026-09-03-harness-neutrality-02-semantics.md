# Harness Neutrality 2: Semantic Vocabulary and Core Migration

**Goal:** Replace plugin-root and vendor-model assumptions in generic skills
with closed semantic resource and model-role expressions.

**Spec:** The user-supplied Harness-Neutrality Rescue Plan.

## Global Constraints

- Resource paths are plugin-root-relative POSIX paths and must resolve to a
  regular, non-symlink file inside the generated artifact.
- Generated links are relative to the current generated Markdown document.
- `{model-fast}`, `{model-deep}`, and `{model-default}` use ordinary closed
  vocabulary coverage.
- Dedicated Claude authoring/documentation material remains intentionally
  Claude-specific; generic operational content does not.
- No semantic expression survives generation.

### Task 1: Add semantic resource and model-role rendering

**Files:**
- `packages/mint/src/vocabulary.ts`
- `packages/mint/src/model.ts`
- `packages/mint/src/generate.ts`
- `packages/mint/test/vocabulary.test.ts`
- `packages/mint/test/generate.test.ts`
- `packages/mint/test/adapters/*.test.ts`

**Interfaces:**
- Parse `{resource:skills/path/to/file}` separately from ordinary tokens.
- Render validated adapter-tree targets as document-relative Markdown links.
- Add closed mappings for `model-fast`, `model-deep`, and `model-default`.

**Consumes:** Plan 1 adapter layouts and full-tree closure; existing vocabulary
coverage/unknown/survivor checks.

**Produces:** Strict resource validation/remapping, model role substitution, and
per-profile resource-closure tests including invocation from a project cwd.

- [ ] Add failing absolute/traversal/missing/directory/symlink resource tests.
- [ ] Implement resource link rendering and model role coverage.
- [ ] Prove no expression survives and helpers resolve from generated links.

### Task 2: Migrate generic core content and bootstrap guidance

**Files:**
- `packages/core/mint/moe-vocab.yaml`
- `packages/core/mint/moe.yaml`
- `packages/core/skills/**/*.md` excluding explicit Claude-only allowlists
- `packages/core/test/metadata.test.ts`
- additional focused core residue/resource tests as needed
- `packages/mint/src/bootstrap/*.ts`
- `packages/mint/src/docs-emit.ts`
- generated `plugins/moe/**` via `pnpm mint`

**Interfaces:**
- Generic instructions invoke linked resources relative to their loaded
  `SKILL.md` and use semantic model roles.
- Bootstrap guidance distinguishes active injection, native discovery, and no
  bootstrap.
- Copilot shares Claude content only where verified compatible; Agent Plugins
  mappings may differ from Claude mappings.

**Consumes:** Task 1 semantic expressions; Plan 1 delivery states; existing
action/block vocabulary.

**Produces:** Generic source and generated trees without unallowlisted
`${CLAUDE_PLUGIN_ROOT}`, `AskUserQuestion`, `TaskCreate`, `haiku`, or `opus`;
truthful trigger/bootstrap language; regenerated artifacts.

- [ ] Replace plugin-root paths and concrete generic model aliases.
- [ ] Expand behavioral blocks where semantics differ.
- [ ] Remove the Agent Plugins equals Claude mapping constraint.
- [ ] Add residue allowlist enforcement and per-profile closure tests.
- [ ] Regenerate and run core/mint gates.
