# Skill Runtime Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test the single Mint validator that defines admissible shipped skill backend code without activating it against the still-polyglot repository.

**Architecture:** A pure `skill-runtime.ts` module validates the complete declared skill source set collected by Mint before developer-harness filtering. It parses ESM with Acorn, returns every stable diagnostic, and exposes an assertion adapter for Mint's existing error boundary; assembly activation waits until the final plan, after all source migrations pass the pure validator.

**Tech Stack:** TypeScript 5.9, Node 24 standard library, Acorn 8, Vitest, existing Mint diagnostics and artifact-path types

**Spec:** `docs/moe/specs/2026-09-03-skill-backend-runtime-standard-design.md`

## Global Constraints

- Production skill backend code is Node 24 ESM `.mjs` under `skills/<skill>/scripts/**`.
- Skill-local code imports only relative `.mjs` modules and `node:` built-ins.
- Production helpers have no shebang or executable bit and are invoked with explicit `node`.
- `examples/**`, package test/fixture trees, `hooks/**`, package `src/**`, and `dist/**` are outside the contract.
- The validator must report all findings in deterministic path/code/message order and must see test-like filenames before Mint filters unlinked developer harnesses.
- `/plugins/` is generated and must not be edited by hand.
- This plan must not activate repository-wide validation; the current source tree remains intentionally nonconforming until Plans 2–4 complete.

## Open Decisions

None. The approved spec resolves language, location, dependency, invocation, authority, and migration policy.

## Not Yet Specified

None.

## Out of Scope

- Migrating any Core, Crew, or Glass helper; Plans 2–4 own those changes.
- Calling the validator from artifact assembly or the live-repository test; Plan 5 activates both gates atomically.
- Adding a Jig command; Mint remains the sole authority.

---

### Task 1: Define deterministic skill-tree classification

**Files:**
- Create: `packages/mint/src/skill-runtime.ts`
- Create: `packages/mint/test/skill-runtime.test.ts`
- Modify: `packages/mint/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ArtifactPath`, `compareArtifactPaths`, `MintDiagnostic`, and `MintError` from Mint.
- Produces: `SkillRuntimeFile`, `ValidateSkillRuntimeInput`, `SkillRuntimeReport`, `validateSkillRuntime(input)`, and `assertValidSkillRuntime(input)`.

- [ ] **Step 1: Add the parser as a direct dependency**

Run:

```bash
pnpm --filter @bubstack/moe-mint add acorn@^8.18.0
```

Expected: `packages/mint/package.json` declares `acorn` under `dependencies`; the existing lockfile entry becomes a direct Mint edge.

- [ ] **Step 2: Write failing classification tests**

Create `packages/mint/test/skill-runtime.test.ts` with an in-memory file builder and table-driven cases. The core fixture must use this exact shape:

```typescript
const file = (path: string, content: string, executable = false): SkillRuntimeFile => ({
  path: artifactPath(path),
  content: Buffer.from(content),
  executable,
});

const valid = [
  file("skills/demo/SKILL.md", 'Run `node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs"`.\n'),
  file("skills/demo/scripts/main.mjs", 'import { value } from "./lib.mjs";\nconsole.log(value);\n'),
  file("skills/demo/scripts/lib.mjs", 'import { readFile } from "node:fs/promises";\nexport const value = typeof readFile;\n'),
  file("skills/demo/scripts/prompt.md", "# Prompt\n"),
  file("skills/demo/examples/example.py", "print('example')\n"),
];
```

Assert acceptance of `valid`. Add table rows expecting `SKILL_RUNTIME_LOCATION` or `SKILL_RUNTIME_LANGUAGE` for `.py`, `.sh`, `.bash`, `.cjs`, `.js`, `.ts`, `.cmd`, and extensionless code; assert all `examples/**` content is structurally excluded, regardless of mode. Add separate non-example cases for `SKILL_RUNTIME_EXECUTABLE` and `SKILL_RUNTIME_SHEBANG`, including `scripts/test-unlinked.js` to prove a test-like filename cannot escape validation.

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
```

Expected: FAIL because `../src/skill-runtime.js` does not exist.

- [ ] **Step 4: Implement classification and stable reporting**

Implement these exported contracts in `packages/mint/src/skill-runtime.ts`:

```typescript
export interface SkillRuntimeFile {
  readonly path: ArtifactPath;
  readonly content: Uint8Array;
  readonly executable: boolean;
}

export interface ValidateSkillRuntimeInput {
  readonly plugin: string;
  readonly source: string;
  readonly skillsRoot: string;
  readonly files: readonly SkillRuntimeFile[];
}

export interface SkillRuntimeReport {
  readonly skills: number;
  readonly modules: number;
  readonly diagnostics: readonly MintDiagnostic[];
  readonly ok: boolean;
}
```

Recognize a skill only from `<skillsRoot>/<one-directory>/SKILL.md`. Within that root, exclude `examples/**`; treat known code extensions, extensionless files under `scripts/`, executable files, and `#!` content as code. Emit location/language/mode diagnostics without throwing, sort with `compareArtifactPaths`, and derive `ok` from an empty diagnostic list.

- [ ] **Step 5: Run classification tests and typecheck**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
pnpm --filter @bubstack/moe-mint typecheck
```

Expected: classification cases pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/mint/src/skill-runtime.ts packages/mint/test/skill-runtime.test.ts packages/mint/package.json pnpm-lock.yaml
git commit -m "feat(mint): define skill runtime validator"
```

---

### Task 2: Parse imports and reject shell execution

**Files:**
- Modify: `packages/mint/src/skill-runtime.ts`
- Modify: `packages/mint/test/skill-runtime.test.ts`

**Interfaces:**
- Consumes: `validateSkillRuntime(input)` and the recognized skill/script roots from Task 1.
- Produces: import diagnostics `SKILL_RUNTIME_SYNTAX`, `SKILL_RUNTIME_IMPORT`, `SKILL_RUNTIME_DYNAMIC_IMPORT`, `SKILL_RUNTIME_COMMONJS`, and `SKILL_RUNTIME_SHELL_EXEC`.

- [ ] **Step 1: Add failing import-policy tests**

Add table-driven cases for:

```typescript
[
  ['import fs from "fs";', "SKILL_RUNTIME_IMPORT"],
  ['import value from "left-pad";', "SKILL_RUNTIME_IMPORT"],
  ['import value from "/tmp/value.mjs";', "SKILL_RUNTIME_IMPORT"],
  ['import value from "../other/scripts/value.mjs";', "SKILL_RUNTIME_IMPORT"],
  ['import("./" + name);', "SKILL_RUNTIME_DYNAMIC_IMPORT"],
  ['const value = require("./value.cjs");', "SKILL_RUNTIME_COMMONJS"],
  ['import { execSync } from "node:child_process";', "SKILL_RUNTIME_SHELL_EXEC"],
  ['import { spawn } from "node:child_process"; spawn("tool", [], { shell: true });', "SKILL_RUNTIME_SHELL_EXEC"],
  ['import { spawnSync } from "node:child_process"; spawnSync("tool", [], { shell: true });', "SKILL_RUNTIME_SHELL_EXEC"],
]
```

Also assert missing relative modules, relative modules without `.mjs`, false `node:` built-ins, and malformed syntax are rejected, while literal dynamic imports and re-exports of valid same-skill `.mjs` modules pass.

- [ ] **Step 2: Run the focused test to verify the new cases fail**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
```

Expected: FAIL because import and syntax diagnostics are absent.

- [ ] **Step 3: Implement Acorn AST inspection**

Parse each `.mjs` with:

```typescript
parse(source, {
  ecmaVersion: "latest",
  sourceType: "module",
  allowHashBang: true,
});
```

Walk `ImportDeclaration`, re-export sources, `ImportExpression`, object expressions, and call/member expressions. Accept only confirmed `node:` built-ins or normalized relative `.mjs` paths that stay within the owning `scripts/` root and exist in the provided file set. Reject computed imports, `require`, `exec`/`execSync`, and statically identifiable `spawn`/`spawnSync` calls whose options set `shell: true`; continue with other modules after a syntax error so one bad file cannot hide later violations.

- [ ] **Step 4: Prove deterministic multi-diagnostic behavior**

Add a test that reverses the same input array and expects identical diagnostics:

```typescript
expect(validateSkillRuntime(input(files)).diagnostics).toEqual(
  validateSkillRuntime(input([...files].reverse())).diagnostics,
);
```

Assert the returned list includes every offending file rather than only the first.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
pnpm --filter @bubstack/moe-mint typecheck
```

Expected: all import-policy and ordering tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/mint/src/skill-runtime.ts packages/mint/test/skill-runtime.test.ts
git commit -m "feat(mint): enforce portable skill imports"
```

---

### Task 3: Validate documented invocations and Mint error adaptation

**Files:**
- Modify: `packages/mint/src/skill-runtime.ts`
- Modify: `packages/mint/test/skill-runtime.test.ts`

**Interfaces:**
- Consumes: complete file classification/import report from Tasks 1–2.
- Produces: `SKILL_RUNTIME_REFERENCE`, `SKILL_RUNTIME_INVOCATION`, and `SkillRuntimeError extends MintError` carrying all diagnostics.

- [ ] **Step 1: Add failing Markdown invocation tests**

Cover fenced and inline code in every shipped Markdown file under a skill. These command-shaped cases must fail:

```markdown
`${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs`
`python3 "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.py"`
`node ./scripts/main.mjs`
`node "$SKILL/main.mjs"`
`node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/missing.mjs"`
```

The explicit plugin-rooted `node` command from Task 1 must pass. Prose/table mentions such as ``scripts/main.mjs`` are not invocations and must not trigger.

- [ ] **Step 2: Run the focused test to verify the new cases fail**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
```

Expected: FAIL because invocation diagnostics are absent.

- [ ] **Step 3: Implement Markdown code-fragment inspection**

Add a deterministic fence/inline-code scanner. Treat non-comment lines in shell/console fences as commands when they mention an owned script basename, `/scripts/`, or a legacy backend suffix. Treat inline spans as command candidates when they begin with `node`, `python`, `python3`, `bash`, `sh`, a root/alias variable, `./`, or `/` and mention backend code. This catches direct paths, legacy interpreters, cwd-relative calls, and aliases rather than looking only for already-canonical literals. Reject every noncanonical candidate directly; for canonical candidates, resolve the referenced source path and require an existing `.mjs` file. The only accepted form is:

```text
node [optional quote]${CLAUDE_PLUGIN_ROOT}/<skills-root>/<skill>/scripts/<path>.mjs[matching optional quote]
```

Do not require library modules to appear in Markdown and do not interpret ordinary prose/table mentions such as an isolated `scripts/lib.mjs` as commands.

- [ ] **Step 4: Implement the assertion adapter**

Add `SkillRuntimeError extends MintError` and:

```typescript
export function assertValidSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const report = validateSkillRuntime(input);
  if (!report.ok) throw new SkillRuntimeError(input, report.diagnostics);
  return report;
}
```

The aggregate error code is `SKILL_RUNTIME_INVALID`; its message gives the count, its path is the first diagnostic path, its action says to use dependency-free Node 24 ESM under the owning `scripts/`, and its public `diagnostics` property preserves the sorted list.

- [ ] **Step 5: Run the complete plan gate**

Run:

```bash
pnpm --filter @bubstack/moe-mint exec vitest run test/skill-runtime.test.ts
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint lint
```

Expected: all validator tests pass; typecheck and lint exit 0. No production assembly path imports `assertValidSkillRuntime` yet.

- [ ] **Step 6: Commit**

```bash
git add packages/mint/src/skill-runtime.ts packages/mint/test/skill-runtime.test.ts
git commit -m "feat(mint): validate skill helper invocations"
```
