# docs-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/docs-update` skill in `packages/core/skills/docs-update/` that generates or updates project documentation verified against the actual codebase, with a `--verify-only` audit mode.

**Architecture:** One coordinator SKILL.md dispatches one `general-purpose` subagent per doc type. Each agent reads its doc-type template from `doc-types/<type>.md`, explores the project's code, and writes (or audits) one documentation file. A `docs-verify-report.mjs` script merges per-agent verify findings into a `DOCS-VERIFY-REPORT.md` whose shape is compatible with `fixing-a-code-review`.

**Tech Stack:** SKILL.md (markdown), doc-type templates (markdown), Node.js script (ESM, no dependencies beyond `node:*`).

**Spec:** `docs/moe/specs/2026-09-02-docs-update-design.md`

## Global Constraints

- Node >= 24 (repo floor).
- No external dependencies — `scripts/` uses only `node:*` modules.
- Tools: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `Agent` only. No MCP, no browser, no tmux.
- The skill frontmatter `name:` must equal its directory name (`docs-update`).
- Skill directory name must appear in `skill-tiers.yaml` under `authored:`.
- The metadata test in `packages/core/test/metadata.test.ts` must pass — it enforces: every skill on disk in exactly one of the two maps, frontmatter name equals directory name, no plugin-qualified cross-references, every REQUIRED marker names a skill that exists.
- No backticked cross-references may use the `superpowers:<skill>` namespace — bare names only.
- All markdown links inside owned files must resolve to files that exist.
- `pnpm check` must pass (lint, typecheck, test).

## Open Decisions

*None. The spec resolves every design question. Section-level markers for mixed docs are explicitly deferred to a future iteration per spec §8.*

## Not Yet Specified

- Template tuning. The five doc-type templates will need iteration after testing against real projects. This plan writes the initial templates; quality tuning is a separate effort.
- `fixing-a-code-review` compatibility. The verify report's frontmatter shape is designed to match, but the actual `stamp-disposition.mjs` script parses `CR-###` IDs. `DV-###` IDs may need a one-line regex change in that script, or the docs-verify-report may need its own disposition workflow. Deferred until verify mode is testable.

## Out of Scope

- Section-level markers (`<!-- moe:docs-update:section -->`). Spec §8 defers this to V2.
- Static site generation (Docusaurus, MkDocs). Spec §7 rules it out.
- Changelog full-regeneration. Spec §1 says update-only.
- `mint` changes. The `doc-types/` subdirectory ships automatically inside the skill directory — `readSkills()` walks the whole tree and `NON_SKILL_ENTRIES` only excludes `_shared`.

---

### Task 1: Register the skill in `skill-tiers.yaml` and create the skeleton

**Files:**
- Modify: `packages/core/skill-tiers.yaml` — add `docs-update` under `authored:`
- Create: `packages/core/skills/docs-update/SKILL.md` — empty placeholder with valid frontmatter
- Create: `packages/core/skills/docs-update/doc-types/.gitkeep` — ensure directory exists

**Interfaces:**
- Consumes: `None`
- Produces: The `docs-update` skill directory with valid frontmatter, passing `metadata.test.ts`

- [ ] **Step 1: Add `docs-update` to `skill-tiers.yaml` under `authored:`**

Add this entry after `fixing-a-code-review:` in the `authored:` section of `packages/core/skill-tiers.yaml`:

```yaml
  docs-update:
    from: moe
    why: >-
      Subagent-driven documentation generation and verification against the
      codebase. Dispatches one agent per doc type; each reads code before
      writing prose. Invoked deliberately with /docs-update.
```

- [ ] **Step 2: Create the SKILL.md skeleton**

Create `packages/core/skills/docs-update/SKILL.md` with valid frontmatter and a one-line body:

```markdown
---
name: docs-update
description: >-
  Generate or update project documentation verified against the codebase —
  use when docs are missing, stale, or need an accuracy audit
argument-hint: "[--only readme,api,...] [--force] [--verify-only]"
---

# docs-update

Placeholder — full skill body lands in Task 2.
```

- [ ] **Step 3: Create the `doc-types/` directory**

```bash
mkdir -p packages/core/skills/docs-update/doc-types
touch packages/core/skills/docs-update/doc-types/.gitkeep
mkdir -p packages/core/skills/docs-update/scripts
```

- [ ] **Step 4: Run the metadata test to verify registration**

```bash
pnpm --filter @bubstack/moe-core test -- --reporter verbose 2>&1 | grep -E "(metadata|PASS|FAIL)"
```

Expected: all metadata tests pass, including "accounts for every skill on disk in exactly one of the two maps".

- [ ] **Step 5: Commit**

```bash
git add packages/core/skill-tiers.yaml packages/core/skills/docs-update/
git commit -m "feat(docs-update): register skill skeleton in skill-tiers.yaml"
```

---

### Task 2: Write the SKILL.md coordinator

**Blocked by:** Task 1

**Files:**
- Modify: `packages/core/skills/docs-update/SKILL.md`

**Interfaces:**
- Consumes: The registered skill directory from Task 1
- Produces: The complete SKILL.md that coordinators and executors read — flag parsing, relevance discovery, marker protocol, subagent dispatch instructions, verify-mode branching, and the final report assembly

- [ ] **Step 1: Write the full SKILL.md**

Replace the placeholder body of `packages/core/skills/docs-update/SKILL.md` with the full coordinator contract. The SKILL.md must cover, in order:

1. **Overview** — one paragraph: what the skill does, the core principle (subagent per doc type, each reads code).

2. **Flag handling** — parse `$ARGUMENTS` for `--only <types>`, `--force`, `--verify-only`. Rules:
   - A flag is active only when its literal token appears in `$ARGUMENTS`.
   - `--only` takes a comma-separated list from the valid set: `readme`, `architecture`, `api`, `contributing`, `changelog`. Unrecognized names fail with an error message listing the valid set.
   - `--force` + `--verify-only` together: `--force` wins.

3. **Relevance discovery** — the coordinator (not a subagent) globs and reads to decide which doc types apply:
   - `readme`, `contributing`: always relevant.
   - `architecture`: relevant when `packages/` exists, OR 10+ top-level directories contain source files.
   - `api`: relevant when grep finds HTTP route handlers (`app.get`, `app.post`, `router.`, `@Get`, `@Post`, `@Controller`), CLI command definitions (`commander`, `yargs`, `.command(`), or exported public API surface (`export function`, `export class`, `export const`, `module.exports`).
   - `changelog`: relevant only when a `CHANGELOG.md` already exists with date-formatted entries.
   - `--only` overrides discovery and forces the named types.

4. **The marker** — `<!-- moe:docs-update generated="YYYY-MM-DD" type="<type>" -->` as first line. Behavior matrix from the spec:
   - No existing doc → generate, add marker.
   - Existing + marker → regenerate, update date.
   - Existing + no marker → skip, report drift (unless `--force`).
   - `--force` → overwrite, add marker.

5. **Subagent dispatch** — one `general-purpose` agent per relevant doc type, dispatched in parallel (multiple Agent calls in one response). If parallel dispatch is unavailable, dispatch serially in type order. Each agent receives:
   - The doc-type template content (read from `doc-types/<type>.md` relative to `SKILL.md`'s directory).
   - The project root.
   - The existing doc content (if any).
   - The marker state (present, absent, or force).
   - Explicit instructions: read files before citing, grep for symbols before documenting, never invent, invoke `writing-clearly-and-concisely`.
   - In verify mode: produce findings as structured YAML, do not write files.

6. **Verify mode** — when `--verify-only`:
   - Each agent reads its doc and the codebase, produces findings (stale_reference, missing_coverage, factual_error) with severity (high, medium, low; never critical).
   - Coordinator collects findings, runs `docs-verify-report.mjs` to merge into `DOCS-VERIFY-REPORT.md`.
   - Types with no existing doc are skipped and listed as "no doc to verify."

7. **Final report** — after all agents complete, summarize: which docs were generated/updated/skipped, drift findings for unmarked docs, any errors.

8. **Red flags** — the patterns that mean something went wrong.

- [ ] **Step 2: Verify no plugin-qualified cross-references**

```bash
grep -n 'superpowers:' packages/core/skills/docs-update/SKILL.md
```

Expected: no output.

- [ ] **Step 3: Verify all REQUIRED markers name existing skills**

```bash
grep 'REQUIRED' packages/core/skills/docs-update/SKILL.md
```

Check each backticked skill name against the skill directory.

- [ ] **Step 4: Run the metadata test**

```bash
pnpm --filter @bubstack/moe-core test -- --reporter verbose 2>&1 | grep -E "(metadata|PASS|FAIL)"
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/docs-update/SKILL.md
git commit -m "feat(docs-update): write SKILL.md coordinator contract"
```

---

### Task 3: Write the five doc-type templates

**Blocked by:** Task 1

**Files:**
- Create: `packages/core/skills/docs-update/doc-types/readme.md`
- Create: `packages/core/skills/docs-update/doc-types/architecture.md`
- Create: `packages/core/skills/docs-update/doc-types/api.md`
- Create: `packages/core/skills/docs-update/doc-types/contributing.md`
- Create: `packages/core/skills/docs-update/doc-types/changelog.md`
- Remove: `packages/core/skills/docs-update/doc-types/.gitkeep` (no longer needed once real files exist)

**Interfaces:**
- Consumes: `None`
- Produces: Five template files, each a self-contained prompt for a subagent that will generate or verify one doc type. Referenced by SKILL.md as `doc-types/<type>.md`.

Each template is a prompt document — not a document template. It tells the subagent what to look for in the codebase, what sections to write, what to verify, and how to structure the output. The subagent reads this template and then explores the project independently.

- [ ] **Step 1: Write `doc-types/readme.md`**

```markdown
# readme — doc-type template

You are generating or verifying a project's `README.md`.

## What to read

- `package.json`, `Cargo.toml`, `pyproject.toml`, or `go.mod` — project name,
  version, description, scripts/commands, dependencies, engine requirements.
- The project's entrypoint files — `index.ts`, `main.py`, `main.go`, `src/lib.rs`.
- `LICENSE` or `LICENSE-MIT` — license type.
- Existing `README.md` — if present, compare against code.
- `.env.example` or `.env.template` — environment variables.
- CI config (`.github/workflows/`, `.gitlab-ci.yml`) — badges, build status.

## Sections to write (in order)

1. **Title and description** — project name from the manifest, one-sentence
   description. No marketing language.
2. **Prerequisites** — runtime versions, system dependencies. Copy exact
   version constraints from the manifest.
3. **Installation** — the actual install command from the manifest. If there is
   a `postinstall` or setup script, mention it.
4. **Usage** — the primary command or API call. Pull from `scripts` in the
   manifest, or from the entrypoint's exported interface.
5. **Configuration** — environment variables or config files, only if they
   exist. Do not invent config the project does not use.
6. **Development** — how to run tests, lint, build. Copy the exact script
   names from the manifest.
7. **License** — the license type from the LICENSE file.

## Rules

- Every file path you mention must exist — `ls` or `glob` it first.
- Every command you document must appear in a manifest or script — `grep` first.
- Every function signature you cite must match the source — `read` the file.
- Do not add badges, shields, or external service links unless they already
  exist in CI config.
- Invoke `writing-clearly-and-concisely` before finalizing prose.

## Verify mode

When verifying rather than generating, check each section against the codebase
and report findings as:

```yaml
- id: <assigned by coordinator>
  type: stale_reference | missing_coverage | factual_error
  file: README.md
  anchor: "<quoted text from the doc>"
  actual: "<what the code actually says>"
  severity: high | medium | low
```

Severity guide:
- **high** — a command or path that would fail if followed
- **medium** — a missing major feature or component
- **low** — a minor version mismatch or cosmetic inaccuracy
```

- [ ] **Step 2: Write `doc-types/architecture.md`**

The architecture template instructs the agent to:
- Read the top-level directory structure, package manifests, and dependency graphs.
- Identify components/packages and their responsibilities.
- Trace dependency edges (imports, `package.json` dependencies, workspace references).
- Document the build and deployment topology if present.
- Sections: Overview, Repository shape (directory tree), Components (table of name/responsibility/distribution), Dependency topology (text diagram), Build pipeline.
- Same rules and verify-mode format as readme.

- [ ] **Step 3: Write `doc-types/api.md`**

The API template instructs the agent to:
- Grep for route handlers, CLI commands, exported public functions/classes.
- Read each handler/export to extract the actual signature, parameters, return types.
- Group by module or route prefix.
- Sections: Overview, Endpoints/Commands/Exports (grouped), Authentication (if present), Error responses (if present).
- For libraries: document the public API surface (`export function`, `export class`).
- Same rules and verify-mode format as readme.

- [ ] **Step 4: Write `doc-types/contributing.md`**

The contributing template instructs the agent to:
- Read manifest for scripts, engine requirements, package manager.
- Read CI config for the gate (what CI runs).
- Read existing tests to identify the test framework and patterns.
- Check for linter/formatter config (biome, eslint, prettier).
- Sections: Prerequisites (exact versions), Setup, Development workflow (lint/test/build commands), Testing (framework, how to run, how to add), Pull request process (if CI config reveals it).
- Same rules and verify-mode format as readme.

- [ ] **Step 5: Write `doc-types/changelog.md`**

The changelog template instructs the agent to:
- Read the existing `CHANGELOG.md` to find the date of the last entry.
- Run `git log --oneline --since="<last date>"` to collect commits since then.
- Group by conventional-commit type (feat, fix, chore, etc.) if the project uses it.
- Append new entries above the existing ones, preserving the existing format.
- **Never regenerate the full changelog** — update mode only.
- In verify mode: check that documented changes match actual git history.

- [ ] **Step 6: Remove `.gitkeep`**

```bash
rm packages/core/skills/docs-update/doc-types/.gitkeep
```

- [ ] **Step 7: Run the metadata test**

```bash
pnpm --filter @bubstack/moe-core test -- --reporter verbose 2>&1 | grep -E "(metadata|PASS|FAIL)"
```

Expected: all pass. The templates are non-SKILL.md markdown files inside a skill directory — they ship automatically.

- [ ] **Step 8: Commit**

```bash
git add packages/core/skills/docs-update/doc-types/
git commit -m "feat(docs-update): write five doc-type templates"
```

---

### Task 4: Write `docs-verify-report.mjs`

**Blocked by:** Task 1

**Files:**
- Create: `packages/core/skills/docs-update/scripts/docs-verify-report.mjs`

**Interfaces:**
- Consumes: Per-agent verify findings as JSON files in a staging directory, one per doc type. Each file is an array of `{ type, file, anchor, actual, severity }` objects.
- Produces: `DOCS-VERIFY-REPORT.md` at the project root, with frontmatter compatible with `fixing-a-code-review`'s `stamp-disposition.mjs` parsing (same `report:`, `generated:`, `base_sha:`, `findings:`, `status:` keys; `DV-###` IDs in `###` headings).

- [ ] **Step 1: Write the failing test**

Create `packages/core/skills/docs-update/scripts/docs-verify-report.test.mjs` (a co-located test that `vitest` discovers):

```javascript
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = new URL("./docs-verify-report.mjs", import.meta.url).pathname;

describe("docs-verify-report", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dv-"));
    execFileSync("git", ["init"], { cwd: tmp });
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tmp });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("merges two doc-type findings into one report with DV-### IDs", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      join(staging, "readme.json"),
      JSON.stringify([
        { type: "stale_reference", file: "README.md", anchor: "Run `npm start`", actual: "package.json has pnpm dev", severity: "high" },
      ]),
    );
    writeFileSync(
      join(staging, "contributing.json"),
      JSON.stringify([
        { type: "factual_error", file: "CONTRIBUTING.md", anchor: "Node 18+", actual: "engines requires >=20", severity: "high" },
        { type: "missing_coverage", file: "CONTRIBUTING.md", anchor: "(absent)", actual: "No lint section", severity: "medium" },
      ]),
    );

    execFileSync("node", [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"], { cwd: tmp });

    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    expect(report).toContain("report: docs-verify");
    expect(report).toContain("### DV-001:");
    expect(report).toContain("### DV-002:");
    expect(report).toContain("### DV-003:");
    expect(report).toContain("**Severity:** high");
    expect(report).toContain("**Severity:** medium");
    expect(report).toMatch(/findings:.*high: 2/);
    expect(report).toMatch(/findings:.*medium: 1/);
    expect(report).toMatch(/status: issues_found/);
  });

  it("produces a clean report when no findings exist", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "readme.json"), JSON.stringify([]));

    execFileSync("node", [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"], { cwd: tmp });

    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    expect(report).toContain("status: clean");
    expect(report).toMatch(/findings:.*total: 0/);
  });

  it("assigns IDs in severity order: high before medium before low", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      join(staging, "readme.json"),
      JSON.stringify([
        { type: "missing_coverage", file: "README.md", anchor: "(absent)", actual: "missing", severity: "low" },
        { type: "stale_reference", file: "README.md", anchor: "old path", actual: "moved", severity: "high" },
        { type: "factual_error", file: "README.md", anchor: "wrong ver", actual: "v2", severity: "medium" },
      ]),
    );

    execFileSync("node", [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"], { cwd: tmp });

    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    const ids = [...report.matchAll(/### (DV-\d+):.*\n[\s\S]*?\*\*Severity:\*\*\s*(\w+)/g)];
    expect(ids.map((m) => [m[1], m[2]])).toEqual([
      ["DV-001", "high"],
      ["DV-002", "medium"],
      ["DV-003", "low"],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @bubstack/moe-core test -- docs-verify-report.test 2>&1 | tail -20
```

Expected: FAIL — `docs-verify-report.mjs` does not exist yet.

- [ ] **Step 3: Write the script**

Create `packages/core/skills/docs-update/scripts/docs-verify-report.mjs`:

```javascript
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const cwd = process.cwd();
const staging = arg("staging", ".moe/docs-verify");
const out = arg("out", "DOCS-VERIFY-REPORT.md");

const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd,
  encoding: "utf8",
}).trim();

const today = new Date().toISOString().slice(0, 10);

const allFindings = [];
const docTypes = [];

for (const f of readdirSync(staging).filter((n) => n.endsWith(".json")).sort()) {
  const type = f.replace(/\.json$/, "");
  docTypes.push(type);
  const items = JSON.parse(readFileSync(join(staging, f), "utf8"));
  for (const item of items) {
    allFindings.push({ ...item, docType: type });
  }
}

allFindings.sort((a, b) => (RANK[a.severity] ?? 99) - (RANK[b.severity] ?? 99));

let id = 1;
for (const f of allFindings) {
  f.id = `DV-${String(id++).padStart(3, "0")}`;
}

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of allFindings) {
  if (f.severity in counts) counts[f.severity]++;
}
const total = allFindings.length;
const status = total > 0 ? "issues_found" : "clean";

const lines = [];
lines.push("---");
lines.push("report: docs-verify");
lines.push(`generated: ${today}`);
lines.push(`base_sha: ${sha}`);
lines.push(`doc_types_checked: [${docTypes.join(", ")}]`);
lines.push(
  `findings: { critical: ${counts.critical}, high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, total: ${total} }`,
);
lines.push(`status: ${status}`);
lines.push("---");
lines.push("");

const project = cwd.split("/").pop();
lines.push(`# Documentation Verification — ${project}`);
lines.push("");
lines.push("## Coverage");
lines.push(`Checked ${docTypes.length} doc type(s): ${docTypes.join(", ")}.`);
lines.push("");

for (const sev of ["critical", "high", "medium", "low"]) {
  const group = allFindings.filter((f) => f.severity === sev);
  if (group.length === 0 && sev === "critical") continue;
  lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)}`);
  if (group.length === 0) {
    lines.push("No findings.");
    lines.push("");
    continue;
  }
  for (const f of group) {
    lines.push(`### ${f.id}: ${f.actual.slice(0, 60)}`);
    lines.push(`**File:** \`${f.file}\``);
    lines.push(`**Anchor:** \`${f.anchor}\``);
    lines.push(`**Severity:** ${f.severity}`);
    lines.push(`**Type:** ${f.type}`);
    lines.push(f.actual);
    lines.push("");
  }
}

writeFileSync(join(cwd, out), lines.join("\n"));
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @bubstack/moe-core test -- docs-verify-report.test 2>&1 | tail -20
```

Expected: all three tests PASS.

- [ ] **Step 5: Run the full suite to check for regressions**

```bash
pnpm --filter @bubstack/moe-core test -- --reporter verbose 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/skills/docs-update/scripts/
git commit -m "feat(docs-update): add docs-verify-report.mjs with tests"
```

---

### Task 5: Integration — run `pnpm check` and `pnpm mint:check`

**Blocked by:** Task 2, Task 3, Task 4

**Files:**
- Possibly modify: `packages/core/skills/docs-update/SKILL.md` — fix any issues found
- Possibly modify: `packages/core/skills/docs-update/doc-types/*.md` — fix any issues found

**Interfaces:**
- Consumes: All files from Tasks 1–4
- Produces: A passing `pnpm check` and `pnpm mint:check`, confirming the skill is shippable

- [ ] **Step 1: Run `pnpm check`**

```bash
pnpm check
```

Expected: lint, typecheck, and test all pass.

- [ ] **Step 2: Run `pnpm mint:check`**

```bash
pnpm mint:check
```

Expected: `plugins/` is byte-identical after regeneration. The new skill directory should appear in the generated plugin.

- [ ] **Step 3: Fix any failures**

If lint, typecheck, test, or mint:check fails, fix the issue and re-run.

- [ ] **Step 4: Verify the skill appears in the generated plugin**

```bash
ls plugins/moe/skills/docs-update/
```

Expected: `SKILL.md`, `doc-types/`, `scripts/` all present.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(docs-update): address lint/test/mint issues"
```

Only commit if there were fixes. Skip if Step 1 and 2 passed clean.
