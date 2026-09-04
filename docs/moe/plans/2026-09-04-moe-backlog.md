# Moe Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `moe jig backlog` command tree backed by a durable, git-tracked `.moe/backlog/` store so deferrals survive worktree teardown and carry-over is distinguished from real blocks.

**Architecture:** One new module `packages/jig/src/backlog.ts` holds pure helpers (frontmatter parse/serialize, id allocation, reason routing, transition legality) and thin IO handlers that resolve the store against the current worktree's top-level. The CLI wires a `backlog` command group beside `worktree`/`plan`. `fixing-a-code-review` becomes the first producer, promoting `deferred`/`skipped` findings into backlog items.

**Tech Stack:** TypeScript ESM (Node ≥ 24), `commander` (already a jig dep), `vitest`. No new dependency.

**Spec:** `docs/moe/specs/2026-09-04-moe-backlog-design.md`

## Global Constraints

- **Node ≥ 24, ESM.** TS relative imports carry `.js` extensions (`./util.js`), matching every other jig module.
- **No new dependency.** jig stays L0 with no cross-package imports; production deps remain `commander` + `node:` built-ins only. Adding a dependency would need a tsconfig/`package.json` change this plan does not make.
- **Store resolves to the worktree top-level.** The store path is `join(git rev-parse --show-toplevel, ".moe", "backlog")` — never the primary checkout root. This is what lets a deferral commit to the working branch and merge home.
- **`.moe/backlog/` must stay tracked.** It is not in `.gitignore` today; a test guards that a blanket `.moe/` rule never silently re-ignores it.
- **Skill edits touch source, not `/plugins/`.** The `fixing-a-code-review` source is `packages/core/skills/fixing-a-code-review/`. After editing, run `pnpm mint` and `pnpm mint:check` — never hand-edit `/plugins/`.
- **Handler shape.** Every IO handler takes an options object carrying an optional `cwd` (test seam), returns the absolute path (or a small result object), and `throw new Error(...)` on refusal — matching `scaffold.ts`/`worktree.ts`.
- **Gate before MR:** `pnpm --filter @bubstack/moe-jig test`, then `pnpm check` and (for Task 8) `pnpm mint:check`.

## Open Decisions

- **D1 — Disposition ↔ backlog coupling** · `conversation` · HITL
  - **Question:** When `fixing-a-code-review` promotes a `deferred`/`skipped` finding, does `stamp-disposition.mjs` stay untouched (the agent records the `BL-####` in the disposition `Note` by hand/prose), or does the stamp script gain a `--backlog BL-###` argument it validates and writes?
  - **Options:** [a] prose-only workflow in `SKILL.md`, stamp script unchanged / [b] extend `stamp-disposition.mjs` with a validated `--backlog` field
  - **Recommendation:** [a], because it keeps a load-bearing, well-tested script stable while the backlog proves itself; the tighter coupling in [b] is a natural v1.5 follow-up once the workflow is exercised.
  - **Blocked by:** —
  - **Blocks:** Task 8
  - **Resolution:** Resolved 2026-09-04 → [a] prose-only; `stamp-disposition.mjs` unchanged.

- **D2 — Frontmatter representation** · `conversation` · HITL
  - **Question:** The approved spec's schema example shows nested `provenance:` and `links:` maps. Implement nested maps (a schema-specific parser) or flatten to single-level keys (`filed_by`, `filed_sha`, `blocked_by`, `blocks`, `tags`, …) parsed by a dependency-free line reader?
  - **Options:** [a] flat single-level keys / [b] nested maps as the spec example shows
  - **Recommendation:** [a], because jig ships no YAML dependency and the schema is fixed and small; flat keys are trivially and robustly parseable with the same line-reader idiom `stamp-disposition.mjs` already uses. If chosen, update the spec's schema example to match. [b] is achievable but buys a fussier, more fragile hand-rolled parser for readability that `show` already provides.
  - **Blocked by:** —
  - **Blocks:** Task 2
  - **Resolution:** Resolved 2026-09-04 → [a] flat keys; spec schema example updated to match.

> **Both decisions resolved as recommended (D1→[a], D2→[a]) on 2026-09-04** — the task code below stands as written; no changes needed.

## Not Yet Specified

- **Provenance actor identity across harnesses.** v1 records `filed_by`/`moved_by`/`claimed_by` from an explicit `--by <id>` flag defaulting to `manual`. A harness-derived default (which agent/session filed it, without a flag) is real but cannot be phrased sharply until the harnesses expose a stable id; it graduates into a decision then.

## Out of Scope

- **Machine-falsifiable blocker checks** (jig running `which python` to verify a `no-runtime` claim) — v1 records the claim with provenance; proving it is v1.5.
- **A driver skill** (`moe-resume` consuming carry-over items, "work the next actionable item") — separate backlog work; v1 exposes `list`/`show`/`resume` and the `Resume` block.
- **Multi-producer ingestion** (`reviewing-a-codebase`, hardener, brainstorming out-of-scope) — v1 wires only `fixing-a-code-review`.
- **TUI/web view** — `list`/`show`/`triage` are CLI-only.
- **Cross-repo backlogs** — the store is scoped to the repo it runs in.

---

### Task 1: util helpers — `worktreeRoot` and `slugify`

**Files:**
- Modify: `packages/jig/src/util.ts`
- Test: `packages/jig/test/util.test.ts` (create)

**Interfaces:**
- Consumes: `None`
- Produces: `worktreeRoot(cwd?: string): string`, `slugify(text: string): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/jig/test/util.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function gitIn(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
}

describe("worktreeRoot", () => {
  let repo: string;
  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "jig-util-")));
    gitIn(repo, "init", "--initial-branch", "main");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("returns the repo top-level from a nested subdirectory", async () => {
    const { worktreeRoot } = await import("../src/util.js");
    execFileSync("mkdir", ["-p", join(repo, "a", "b")]);
    expect(worktreeRoot(join(repo, "a", "b"))).toBe(repo);
  });
});

describe("slugify", () => {
  it("lowercases, strips specials, collapses dashes", async () => {
    const { slugify } = await import("../src/util.js");
    expect(slugify("Use C++ & Rust!  For Speed")).toBe("use-c-rust-for-speed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- util`
Expected: FAIL — `worktreeRoot`/`slugify` are not exported from `util.js`.

- [ ] **Step 3: Add the helpers**

Append to `packages/jig/src/util.ts`:

```ts
export function worktreeRoot(cwd: string = process.cwd()): string {
  return gitIn(cwd, "rev-parse", "--show-toplevel");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- util`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/util.ts packages/jig/test/util.test.ts
git commit -m "feat(jig): add worktreeRoot and slugify util helpers"
```

---

### Task 2: backlog item model — types, frontmatter parse/serialize, id allocation

**Blocked by:** D2

**Files:**
- Create: `packages/jig/src/backlog.ts`
- Test: `packages/jig/test/backlog.test.ts` (create)

**Interfaces:**
- Consumes: `None`
- Produces: types `BacklogStatus`, `Severity`, `BacklogItem`; `parseItem(text: string): BacklogItem`; `serializeItem(item: BacklogItem): string`; `allocateId(existing: string[]): { num: number; id: string }`

- [ ] **Step 1: Write the failing tests**

Create `packages/jig/test/backlog.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("item model", () => {
  it("round-trips serialize → parse", async () => {
    const { serializeItem, parseItem } = await import("../src/backlog.js");
    const item = {
      id: "BL-0007", title: "tab FFI ABI drift", status: "carry-over" as const,
      reason: "budget", severity: "high" as const, source: "code-review:CR-012",
      created: "2026-09-04", updated: "2026-09-04",
      filedBy: "wave3", filedSha: "a1b2c3d",
      blockedBy: ["BL-0003"], blocks: [], tags: ["tab", "ffi"],
      body: "## Context\n\nwhy\n\n## Resume\n\n- next: bindings\n",
    };
    const back = parseItem(serializeItem(item));
    expect(back.id).toBe("BL-0007");
    expect(back.status).toBe("carry-over");
    expect(back.blockedBy).toEqual(["BL-0003"]);
    expect(back.tags).toEqual(["tab", "ffi"]);
    expect(back.body).toContain("## Resume");
  });

  it("throws on text with no frontmatter", async () => {
    const { parseItem } = await import("../src/backlog.js");
    expect(() => parseItem("no frontmatter here")).toThrow(/frontmatter/);
  });

  it("allocates the next zero-padded id, ignoring gaps", async () => {
    const { allocateId } = await import("../src/backlog.js");
    expect(allocateId(["0001-a.md", "0003-c.md"])).toEqual({ num: 4, id: "BL-0004" });
    expect(allocateId([])).toEqual({ num: 1, id: "BL-0001" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: FAIL — `../src/backlog.js` does not exist.

- [ ] **Step 3: Create the model**

Create `packages/jig/src/backlog.ts`:

```ts
export type BacklogStatus =
  | "open" | "in-progress" | "blocked" | "carry-over"
  | "done" | "declined" | "needs-triage";

export type Severity = "low" | "medium" | "high" | "critical";

export interface BacklogItem {
  id: string;
  title: string;
  status: BacklogStatus;
  reason?: string;
  severity: Severity;
  source: string;
  claimedBy?: string;
  created: string;
  updated: string;
  filedBy?: string;
  filedSha?: string;
  movedBy?: string;
  movedSha?: string;
  blockedBy: string[];
  blocks: string[];
  parent?: string;
  ref?: string;
  tags: string[];
  body: string;
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseItem(text: string): BacklogItem {
  const m = FM.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("backlog item has no frontmatter");
  const fm = new Map<string, string>();
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i !== -1) fm.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const list = (k: string) => {
    const v = fm.get(k) ?? "";
    return v.length ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
  };
  const req = (k: string) => {
    const v = fm.get(k);
    if (!v) throw new Error(`backlog item missing ${k}`);
    return v;
  };
  return {
    id: req("id"), title: req("title"), status: req("status") as BacklogStatus,
    reason: fm.get("reason") || undefined,
    severity: (fm.get("severity") || "medium") as Severity,
    source: fm.get("source") || "manual",
    claimedBy: fm.get("claimed_by") || undefined,
    created: req("created"), updated: req("updated"),
    filedBy: fm.get("filed_by") || undefined, filedSha: fm.get("filed_sha") || undefined,
    movedBy: fm.get("moved_by") || undefined, movedSha: fm.get("moved_sha") || undefined,
    blockedBy: list("blocked_by"), blocks: list("blocks"),
    parent: fm.get("parent") || undefined, ref: fm.get("ref") || undefined,
    tags: list("tags"),
    body: m[2].replace(/^\n+/, ""),
  };
}

export function serializeItem(item: BacklogItem): string {
  return [
    "---",
    `id: ${item.id}`,
    `title: ${item.title}`,
    `status: ${item.status}`,
    `reason: ${item.reason ?? ""}`,
    `severity: ${item.severity}`,
    `source: ${item.source}`,
    `claimed_by: ${item.claimedBy ?? ""}`,
    `created: ${item.created}`,
    `updated: ${item.updated}`,
    `filed_by: ${item.filedBy ?? ""}`,
    `filed_sha: ${item.filedSha ?? ""}`,
    `moved_by: ${item.movedBy ?? ""}`,
    `moved_sha: ${item.movedSha ?? ""}`,
    `blocked_by: ${item.blockedBy.join(", ")}`,
    `blocks: ${item.blocks.join(", ")}`,
    `parent: ${item.parent ?? ""}`,
    `ref: ${item.ref ?? ""}`,
    `tags: ${item.tags.join(", ")}`,
    "---",
    "",
    item.body.replace(/\n*$/, ""),
    "",
  ].join("\n");
}

export function allocateId(existing: string[]): { num: number; id: string } {
  let max = 0;
  for (const name of existing) {
    const m = /^(\d{4})-.*\.md$/.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  const num = max + 1;
  return { num, id: `BL-${String(num).padStart(4, "0")}` };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "feat(jig): backlog item model — parse, serialize, id allocation"
```

---

### Task 3: `backlogAdd` + durability (worktree → merge) regression test

**Files:**
- Modify: `packages/jig/src/backlog.ts`
- Test: `packages/jig/test/backlog.test.ts`

**Interfaces:**
- Consumes: `worktreeRoot`, `slugify` (Task 1); `BacklogItem`, `serializeItem`, `parseItem`, `allocateId` (Task 2)
- Produces: `backlogAdd(title: string, opts?: AddOpts): string` where `AddOpts = { cwd?: string; source?: string; severity?: Severity; tags?: string[]; by?: string }`; internal `backlogDir(cwd?)`, `loadItem(cwd, id)`, `safeSha(cwd)`

- [ ] **Step 1: Write the failing tests**

Add to `packages/jig/test/backlog.test.ts`. Reuse the `makeRepo()` idiom from `worktree.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function gitIn(dir: string, ...a: string[]): string {
  return execFileSync("git", a, { cwd: dir, encoding: "utf-8" }).trim();
}
function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "jig-bl-")));
  gitIn(dir, "init", "--initial-branch", "main");
  gitIn(dir, "config", "user.email", "t@t.com");
  gitIn(dir, "config", "user.name", "T");
  execFileSync("touch", ["seed.txt"], { cwd: dir });
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-m", "init");
  return dir;
}

describe("backlogAdd", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("creates an open item under .moe/backlog/ with correct id and fields", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    const { parseItem } = await import("../src/backlog.js");
    const p = backlogAdd("Tab FFI ABI drift", { cwd: repo, source: "code-review:CR-012", severity: "high", tags: ["tab"] });
    expect(p).toBe(join(repo, ".moe", "backlog", "0001-tab-ffi-abi-drift.md"));
    const item = parseItem(readFileSync(p, "utf-8"));
    expect(item).toMatchObject({ id: "BL-0001", status: "open", severity: "high", source: "code-review:CR-012" });
    expect(item.tags).toEqual(["tab"]);
  });

  it("refuses a second open item with the same slug", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    backlogAdd("dup title", { cwd: repo });
    expect(() => backlogAdd("dup title", { cwd: repo })).toThrow(/already exists/);
  });

  it("survives worktree teardown: an item filed in a linked worktree merges home", async () => {
    const { backlogAdd } = await import("../src/backlog.js");
    const wt = join(repo, ".moe", "worktrees", "feat");
    gitIn(repo, "worktree", "add", "-b", "feat", wt, "main");
    backlogAdd("filed in worktree", { cwd: wt });
    gitIn(wt, "add", ".moe/backlog");
    gitIn(wt, "commit", "-m", "backlog: item");
    gitIn(repo, "merge", "--no-ff", "feat", "-m", "merge feat");
    // The item is present at the primary checkout after merge:
    expect(existsSync(join(repo, ".moe", "backlog", "0001-filed-in-worktree.md"))).toBe(true);
    gitIn(repo, "worktree", "remove", "--force", wt);
    expect(existsSync(join(repo, ".moe", "backlog", "0001-filed-in-worktree.md"))).toBe(true);
  });

  it("the real repo does not gitignore .moe/backlog/", () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    let code = 0;
    try { execFileSync("git", ["check-ignore", ".moe/backlog/probe.md"], { cwd: repoRoot }); }
    catch (e: unknown) { code = (e as { status?: number }).status ?? 0; }
    expect(code).toBe(1); // 1 = not ignored
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: FAIL — `backlogAdd` is not exported.

- [ ] **Step 3: Implement `backlogAdd` and store helpers**

Add to `packages/jig/src/backlog.ts` (imports at top of file):

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { git, slugify, today, worktreeRoot } from "./util.js";

export function backlogDir(cwd?: string): string {
  return join(worktreeRoot(cwd), ".moe", "backlog");
}

function safeSha(cwd?: string): string | undefined {
  try { return git("-C", worktreeRoot(cwd), "rev-parse", "--short", "HEAD"); }
  catch { return undefined; }
}

export function loadItem(cwd: string | undefined, id: string): { dir: string; name: string; item: BacklogItem } {
  const dir = backlogDir(cwd);
  if (!existsSync(dir)) throw new Error(`no backlog at ${dir}`);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const item = parseItem(readFileSync(join(dir, name), "utf-8"));
    if (item.id === id) return { dir, name, item };
  }
  throw new Error(`${id} not found in ${dir}`);
}

export interface AddOpts {
  cwd?: string; source?: string; severity?: Severity; tags?: string[]; by?: string;
}

export function backlogAdd(title: string, opts: AddOpts = {}): string {
  if (!title.trim()) throw new Error("title is required");
  const dir = backlogDir(opts.cwd);
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const slug = slugify(title);
  if (!slug) throw new Error("title must contain at least one alphanumeric character");
  for (const name of existing) {
    if (name.endsWith(`-${slug}.md`)) {
      const item = parseItem(readFileSync(join(dir, name), "utf-8"));
      if (item.status === "open") throw new Error(`an open item with slug "${slug}" already exists: ${item.id}`);
    }
  }
  const { num, id } = allocateId(existing);
  const now = today();
  const item: BacklogItem = {
    id, title: title.trim(), status: "open",
    severity: opts.severity ?? "medium", source: opts.source ?? "manual",
    created: now, updated: now, filedBy: opts.by ?? "manual", filedSha: safeSha(opts.cwd),
    blockedBy: [], blocks: [], tags: opts.tags ?? [],
    body: '## Context\n\n<why this exists and what "done" looks like>\n',
  };
  const filepath = join(dir, `${String(num).padStart(4, "0")}-${slug}.md`);
  writeFileSync(filepath, serializeItem(item), "utf-8");
  return resolve(filepath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: PASS (all four cases, including the merge-home durability test).

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "feat(jig): backlog add with durable worktree-rooted store"
```

---

### Task 4: reason routing + `backlogDefer`

**Files:**
- Modify: `packages/jig/src/backlog.ts`
- Test: `packages/jig/test/backlog.test.ts`

**Interfaces:**
- Consumes: `loadItem`, `safeSha` (Task 3); `serializeItem`, `today` (Task 2/1)
- Produces: `BLOCK_REASONS`, `CARRY_REASONS`, `DECLINE_REASONS`; `routeReason(reason: string): BacklogStatus`; `backlogDefer(id: string, opts: DeferOpts): { path: string; status: BacklogStatus; triaged: boolean }` where `DeferOpts = { reason: string; note?: string; next?: string; branch?: string; cwd?: string; by?: string }`

- [ ] **Step 1: Write the failing tests**

Add to `backlog.test.ts` (inside a `describe("backlogDefer")` using `makeRepo()`):

```ts
describe("routeReason + backlogDefer", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("routes reasons to states", async () => {
    const { routeReason } = await import("../src/backlog.js");
    expect(routeReason("no-runtime")).toBe("blocked");
    expect(routeReason("budget")).toBe("carry-over");
    expect(routeReason("i-was-low-on-context")).toBe("needs-triage");
  });

  it("a block reason sets blocked", async () => {
    const { backlogAdd, backlogDefer, parseItem } = await import("../src/backlog.js");
    const p = backlogAdd("needs a runtime", { cwd: repo });
    const r = backlogDefer(parseItem(readFileSync(p, "utf-8")).id, { reason: "no-runtime", note: "no python", cwd: repo });
    expect(r.status).toBe("blocked");
    expect(readFileSync(r.path, "utf-8")).toContain("status: blocked");
  });

  it("a carry reason WITH a next step sets carry-over and writes Resume", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("half done", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "budget", next: "wire the last binding", branch: "feat@abc", cwd: repo });
    expect(r.status).toBe("carry-over");
    const text = readFileSync(r.path, "utf-8");
    expect(text).toContain("## Resume");
    expect(text).toContain("- next: wire the last binding");
  });

  it("a carry reason WITHOUT a next step is triaged, not carried", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("no thread", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "budget", cwd: repo });
    expect(r.status).toBe("needs-triage");
    expect(r.triaged).toBe(true);
  });

  it("an unrecognized reason is triaged and preserves the raw reason", async () => {
    const { backlogAdd, backlogDefer } = await import("../src/backlog.js");
    backlogAdd("odd", { cwd: repo });
    const r = backlogDefer("BL-0001", { reason: "just because", cwd: repo });
    expect(r.status).toBe("needs-triage");
    expect(readFileSync(r.path, "utf-8")).toContain("reason: just because");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: FAIL — `routeReason`/`backlogDefer` not exported.

- [ ] **Step 3: Implement routing and defer**

Add to `packages/jig/src/backlog.ts`:

```ts
export const BLOCK_REASONS = ["no-runtime", "upstream-decision", "depends-on", "needs-human", "external-service"] as const;
export const CARRY_REASONS = ["budget", "scope-split"] as const;
export const DECLINE_REASONS = ["wont-fix", "out-of-scope", "duplicate", "not-reproducible"] as const;

export function routeReason(reason: string): BacklogStatus {
  if ((BLOCK_REASONS as readonly string[]).includes(reason)) return "blocked";
  if ((CARRY_REASONS as readonly string[]).includes(reason)) return "carry-over";
  return "needs-triage";
}

function writeResume(body: string, opts: { note?: string; next?: string; branch?: string }): string {
  const lines = ["## Resume", ""];
  if (opts.note) lines.push(`- done: ${opts.note}`);
  lines.push(`- next: ${opts.next ?? "—"}`);
  if (opts.branch) lines.push(`- branch: ${opts.branch}`);
  const block = `${lines.join("\n")}\n`;
  if (/^## Resume$/m.test(body)) return body.replace(/## Resume[\s\S]*$/m, block);
  return `${body.replace(/\n*$/, "")}\n\n${block}`;
}

export interface DeferOpts {
  reason: string; note?: string; next?: string; branch?: string; cwd?: string; by?: string;
}

export function backlogDefer(id: string, opts: DeferOpts): { path: string; status: BacklogStatus; triaged: boolean } {
  const { dir, name, item } = loadItem(opts.cwd, id);
  let target = routeReason(opts.reason);
  if (target === "carry-over" && !opts.next?.trim()) target = "needs-triage";
  item.status = target;
  item.reason = opts.reason;
  item.updated = today();
  item.movedBy = opts.by ?? "manual";
  item.movedSha = safeSha(opts.cwd) ?? item.movedSha;
  if (target === "carry-over" || target === "blocked") item.body = writeResume(item.body, opts);
  const path = join(dir, name);
  writeFileSync(path, serializeItem(item), "utf-8");
  return { path: resolve(path), status: target, triaged: target === "needs-triage" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "feat(jig): backlog defer with reason routing and carry-over enforcement"
```

---

### Task 5: remaining transitions — `backlogClaim`, `backlogResume`, `backlogDone`, `backlogDecline`

**Files:**
- Modify: `packages/jig/src/backlog.ts`
- Test: `packages/jig/test/backlog.test.ts`

**Interfaces:**
- Consumes: `loadItem`, `safeSha` (Task 3); `serializeItem`, `today`, `DECLINE_REASONS` (Task 2/4)
- Produces: `backlogClaim(id, opts?)`, `backlogResume(id, opts?): { path; resume }`, `backlogDone(id, opts?)`, `backlogDecline(id, opts): string` (option shapes below)

- [ ] **Step 1: Write the failing tests**

```ts
describe("transitions", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("claim moves open → in-progress and records claimedBy", async () => {
    const { backlogAdd, backlogClaim, parseItem } = await import("../src/backlog.js");
    backlogAdd("x", { cwd: repo });
    const p = backlogClaim("BL-0001", { cwd: repo, by: "agent-7" });
    const item = parseItem(readFileSync(p, "utf-8"));
    expect(item.status).toBe("in-progress");
    expect(item.claimedBy).toBe("agent-7");
  });

  it("resume: blocked → open, carry-over → in-progress", async () => {
    const { backlogAdd, backlogDefer, backlogResume, parseItem } = await import("../src/backlog.js");
    backlogAdd("b", { cwd: repo });
    backlogDefer("BL-0001", { reason: "no-runtime", cwd: repo });
    expect(parseItem(readFileSync(backlogResume("BL-0001", { cwd: repo }).path, "utf-8")).status).toBe("open");

    backlogAdd("c", { cwd: repo });
    backlogDefer("BL-0002", { reason: "budget", next: "step", cwd: repo });
    expect(parseItem(readFileSync(backlogResume("BL-0002", { cwd: repo }).path, "utf-8")).status).toBe("in-progress");
  });

  it("resume refuses a non-resumable state", async () => {
    const { backlogAdd, backlogResume } = await import("../src/backlog.js");
    backlogAdd("open item", { cwd: repo });
    expect(() => backlogResume("BL-0001", { cwd: repo })).toThrow(/cannot resume/);
  });

  it("done is terminal; decline requires a decline reason", async () => {
    const { backlogAdd, backlogDone, backlogDecline, parseItem } = await import("../src/backlog.js");
    backlogAdd("d", { cwd: repo });
    const donePath = backlogDone("BL-0001", { cwd: repo, commit: "abc1234" });
    expect(parseItem(readFileSync(donePath, "utf-8")).status).toBe("done");
    backlogAdd("e", { cwd: repo });
    expect(() => backlogDecline("BL-0002", { reason: "nope", cwd: repo })).toThrow(/decline reason/);
    const p = backlogDecline("BL-0002", { reason: "wont-fix", cwd: repo });
    expect(parseItem(readFileSync(p, "utf-8")).status).toBe("declined");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: FAIL — the four handlers are not exported.

- [ ] **Step 3: Implement the transitions**

Add to `packages/jig/src/backlog.ts`:

```ts
function persist(dir: string, name: string, item: BacklogItem, cwd?: string): string {
  item.updated = today();
  item.movedSha = safeSha(cwd) ?? item.movedSha;
  const path = join(dir, name);
  writeFileSync(path, serializeItem(item), "utf-8");
  return resolve(path);
}

export function backlogClaim(id: string, opts: { cwd?: string; by?: string } = {}): string {
  const { dir, name, item } = loadItem(opts.cwd, id);
  if (item.status !== "open" && item.status !== "in-progress")
    throw new Error(`cannot claim ${id}: status is ${item.status}`);
  item.status = "in-progress";
  item.claimedBy = opts.by ?? "manual";
  item.movedBy = opts.by ?? "manual";
  return persist(dir, name, item, opts.cwd);
}

export function backlogResume(id: string, opts: { cwd?: string; by?: string } = {}): { path: string; resume: string } {
  const { dir, name, item } = loadItem(opts.cwd, id);
  if (item.status === "blocked") item.status = "open";
  else if (item.status === "carry-over") item.status = "in-progress";
  else throw new Error(`cannot resume ${id}: status is ${item.status} (only blocked or carry-over)`);
  item.movedBy = opts.by ?? "manual";
  const path = persist(dir, name, item, opts.cwd);
  const rm = /## Resume[\s\S]*$/m.exec(item.body);
  return { path, resume: rm ? rm[0] : "" };
}

export function backlogDone(id: string, opts: { cwd?: string; commit?: string; by?: string } = {}): string {
  const { dir, name, item } = loadItem(opts.cwd, id);
  item.status = "done";
  item.movedBy = opts.by ?? "manual";
  if (opts.commit) item.movedSha = opts.commit;
  return persist(dir, name, item, opts.cwd);
}

export function backlogDecline(id: string, opts: { reason: string; note?: string; cwd?: string; by?: string }): string {
  if (!(DECLINE_REASONS as readonly string[]).includes(opts.reason))
    throw new Error(`decline reason must be one of ${DECLINE_REASONS.join(", ")}`);
  const { dir, name, item } = loadItem(opts.cwd, id);
  item.status = "declined";
  item.reason = opts.reason;
  item.movedBy = opts.by ?? "manual";
  if (opts.note) item.body = writeResume(item.body, { note: opts.note, next: "—" });
  return persist(dir, name, item, opts.cwd);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "feat(jig): backlog claim, resume, done, decline transitions"
```

---

### Task 6: read surface — `backlogList`, `backlogShow`, `backlogTriage`

**Files:**
- Modify: `packages/jig/src/backlog.ts`
- Test: `packages/jig/test/backlog.test.ts`

**Interfaces:**
- Consumes: `backlogDir`, `loadItem` (Task 3); `parseItem`, `BacklogItem` (Task 2)
- Produces: `backlogList(opts?: ListOpts): BacklogItem[]`, `backlogShow(id: string, opts?: { cwd?: string }): string`, `backlogTriage(opts?: { cwd?: string }): BacklogItem[]`, `formatLine(item: BacklogItem): string`; `ListOpts = { cwd?: string; status?: BacklogStatus; source?: string; severity?: Severity; tag?: string }`

- [ ] **Step 1: Write the failing tests**

```ts
describe("read surface", () => {
  let repo: string;
  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it("list AND-filters and hides terminal items by default", async () => {
    const { backlogAdd, backlogDone, backlogList } = await import("../src/backlog.js");
    backlogAdd("keep me", { cwd: repo, severity: "high", tags: ["tab"] });
    backlogAdd("done one", { cwd: repo });
    backlogDone("BL-0002", { cwd: repo });
    const open = backlogList({ cwd: repo });
    expect(open.map((i) => i.id)).toEqual(["BL-0001"]); // done hidden
    expect(backlogList({ cwd: repo, tag: "tab", severity: "high" }).map((i) => i.id)).toEqual(["BL-0001"]);
    expect(backlogList({ cwd: repo, tag: "nope" })).toEqual([]);
    expect(backlogList({ cwd: repo, status: "done" }).map((i) => i.id)).toEqual(["BL-0002"]);
  });

  it("triage lists only needs-triage items", async () => {
    const { backlogAdd, backlogDefer, backlogTriage } = await import("../src/backlog.js");
    backlogAdd("triage me", { cwd: repo });
    backlogDefer("BL-0001", { reason: "mystery", cwd: repo });
    backlogAdd("fine", { cwd: repo });
    expect(backlogTriage({ cwd: repo }).map((i) => i.id)).toEqual(["BL-0001"]);
  });

  it("show returns the full item text", async () => {
    const { backlogAdd, backlogShow } = await import("../src/backlog.js");
    backlogAdd("show me", { cwd: repo });
    expect(backlogShow("BL-0001", { cwd: repo })).toContain("id: BL-0001");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: FAIL — read handlers not exported.

- [ ] **Step 3: Implement the read surface**

Add to `packages/jig/src/backlog.ts`:

```ts
const TERMINAL: BacklogStatus[] = ["done", "declined"];

export interface ListOpts {
  cwd?: string; status?: BacklogStatus; source?: string; severity?: Severity; tag?: string;
}

function loadAll(cwd?: string): BacklogItem[] {
  const dir = backlogDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseItem(readFileSync(join(dir, f), "utf-8")));
}

export function backlogList(opts: ListOpts = {}): BacklogItem[] {
  return loadAll(opts.cwd).filter((i) => {
    if (opts.status) return i.status === opts.status;
    if (TERMINAL.includes(i.status)) return false;
    if (opts.source && i.source !== opts.source) return false;
    if (opts.severity && i.severity !== opts.severity) return false;
    if (opts.tag && !i.tags.includes(opts.tag)) return false;
    return true;
  });
}

export function backlogTriage(opts: { cwd?: string } = {}): BacklogItem[] {
  return loadAll(opts.cwd).filter((i) => i.status === "needs-triage");
}

export function backlogShow(id: string, opts: { cwd?: string } = {}): string {
  const { dir, name } = loadItem(opts.cwd, id);
  return readFileSync(join(dir, name), "utf-8");
}

export function formatLine(item: BacklogItem): string {
  return `${item.id}  ${item.status.padEnd(12)}  ${item.severity.padEnd(8)}  ${item.title}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "feat(jig): backlog list, show, triage read surface"
```

---

### Task 7: CLI wiring — the `moe jig backlog` command tree

**Files:**
- Modify: `packages/jig/src/cli.ts`
- Test: `packages/jig/test/cli.test.ts`

**Interfaces:**
- Consumes: every `backlog*` handler + `formatLine` (Tasks 3–6)
- Produces: `None` (CLI surface; no importable interface)

- [ ] **Step 1: Write the failing tests**

Add to `packages/jig/test/cli.test.ts`. The file already imports `execFileSync`, `join`, and the vitest globals; **merge** these additional imports rather than duplicating them:

```ts
// add to the existing import lines:
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
```

Then extend the `--help` case and add an end-to-end run against the built CLI in a temp repo:

```ts
it("lists backlog in --help", () => {
  expect(run("--help")).toContain("backlog");
});

it("adds and defers an item end-to-end", () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "jig-cli-bl-")));
  execFileSync("git", ["init", "--initial-branch", "main"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "T"], { cwd: repo });
  execFileSync("touch", ["seed.txt"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo });
  try {
    execFileSync(process.execPath, [CLI, "backlog", "add", "cli item"], { cwd: repo, encoding: "utf-8" });
    expect(existsSync(join(repo, ".moe", "backlog", "0001-cli-item.md"))).toBe(true);
    const out = execFileSync(process.execPath, [CLI, "backlog", "defer", "BL-0001", "--reason", "no-runtime", "--note", "no py"], { cwd: repo, encoding: "utf-8" });
    expect(out).toContain("blocked");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-jig build && pnpm --filter @bubstack/moe-jig test -- cli`
Expected: FAIL — no `backlog` command; the `add` subprocess errors.

- [ ] **Step 3: Wire the command tree**

Add to `packages/jig/src/cli.ts` — import the handlers and register the group before the `discoverExtensionCommands()` line:

```ts
import {
  backlogAdd, backlogClaim, backlogDecline, backlogDefer, backlogDone,
  backlogList, backlogResume, backlogShow, backlogTriage, formatLine,
} from "./backlog.js";

const backlog = program.command("backlog")
  .description("Durable deferral and work tracking in .moe/backlog/");

backlog.command("add")
  .argument("<title...>", "one-line title")
  .option("--source <s>", "provenance of the item (e.g. code-review:CR-012)")
  .option("--severity <s>", "low | medium | high | critical")
  .option("--tag <t...>", "tags")
  .option("--by <id>", "actor id for provenance")
  .action((parts: string[], o: { source?: string; severity?: Severity; tag?: string[]; by?: string }) => {
    console.log(backlogAdd(parts.join(" "), { source: o.source, severity: o.severity, tags: o.tag, by: o.by }));
  });

backlog.command("claim")
  .argument("<id>")
  .option("--by <id>", "actor id")
  .action((id: string, o: { by?: string }) => console.log(backlogClaim(id, { by: o.by })));

backlog.command("defer")
  .argument("<id>")
  .requiredOption("--reason <r>", "deferral reason (routes to blocked / carry-over / needs-triage)")
  .option("--note <n>", "what got done so far")
  .option("--next <step>", "the next concrete step (required for carry-over)")
  .option("--branch <ref>", "working branch@sha")
  .option("--by <id>", "actor id")
  .action((id: string, o: { reason: string; note?: string; next?: string; branch?: string; by?: string }) => {
    const r = backlogDefer(id, o);
    console.log(`${id} → ${r.status}`);
    if (r.triaged) console.error(`WARNING: reason "${o.reason}" is not a recognized deferral reason — filed as needs-triage. A human must adjudicate via 'moe jig backlog triage'.`);
  });

backlog.command("resume")
  .argument("<id>")
  .option("--by <id>", "actor id")
  .action((id: string, o: { by?: string }) => {
    const r = backlogResume(id, { by: o.by });
    console.log(r.path);
    if (r.resume) console.log(`\n${r.resume}`);
  });

backlog.command("done")
  .argument("<id>")
  .option("--commit <sha>", "resolving commit")
  .option("--by <id>", "actor id")
  .action((id: string, o: { commit?: string; by?: string }) => console.log(backlogDone(id, o)));

backlog.command("decline")
  .argument("<id>")
  .requiredOption("--reason <r>", "wont-fix | out-of-scope | duplicate | not-reproducible")
  .option("--note <n>")
  .option("--by <id>")
  .action((id: string, o: { reason: string; note?: string; by?: string }) => console.log(backlogDecline(id, o)));

backlog.command("list")
  .option("--status <s>").option("--source <s>").option("--severity <s>").option("--tag <t>")
  .action((o: { status?: BacklogStatus; source?: string; severity?: Severity; tag?: string }) => {
    for (const item of backlogList(o)) console.log(formatLine(item));
  });

backlog.command("show").argument("<id>").action((id: string) => console.log(backlogShow(id)));

backlog.command("triage").action(() => {
  for (const item of backlogTriage()) console.log(formatLine(item));
});
```

> `Severity` is imported for the option typings: add `Severity` to the `./backlog.js` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-jig build && pnpm --filter @bubstack/moe-jig test -- cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jig/src/cli.ts packages/jig/test/cli.test.ts
git commit -m "feat(jig): wire the moe jig backlog command tree"
```

---

### Task 8: first producer — promote code-review deferrals into the backlog

**Blocked by:** D1

**Files:**
- Modify: `packages/core/skills/fixing-a-code-review/SKILL.md`
- Verify: `/plugins/` regenerated by `pnpm mint` (never hand-edited)

**Interfaces:**
- Consumes: the `moe jig backlog` CLI (Task 7) as documented commands
- Produces: `None`

- [ ] **Step 1: Update the disposition contract prose (D1 → recommended option [a])**

In `packages/core/skills/fixing-a-code-review/SKILL.md`, in "The disposition contract", add after the disposition table:

> **Deferred and skipped findings are promoted to the durable backlog.** A finding you will not fix this session no longer lives only in this report — that report ends with the review cycle. Promote it:
>
> ```bash
> moe jig backlog add "<finding title>" --source code-review:<CR-ID> --severity <sev>
> moe jig backlog defer <BL-ID> --reason <reason> --note "<why>" [--next "<step>"]
> ```
>
> Record the returned `BL-####` in the disposition `Note`. The reason must be a recognized deferral reason (`no-runtime`, `upstream-decision`, `depends-on`, `needs-human`, `external-service` for blocks; `budget`, `scope-split` for carry-over). An unrecognized reason files the item as `needs-triage` for a human — do not invent a reason to avoid that. If `moe-jig` is not on PATH, create the item file by hand under `.moe/backlog/` using the schema in the backlog spec.

Add to "Red flags": `- A deferred or skipped finding with no BL-#### in its Note`.

- [ ] **Step 2: Regenerate the plugins tree**

Run: `pnpm mint`
Expected: `/plugins/moe/skills/fixing-a-code-review/SKILL.md` updated to match source.

- [ ] **Step 3: Verify the generated tree is exact and skills still validate**

Run: `pnpm mint:check`
Expected: PASS — `/plugins/` is byte-identical to a fresh mint (no hand-edits).

Run: `pnpm --filter @bubstack/moe-mint test`
Expected: PASS — "every registered plugin passes skill runtime validation with zero diagnostics" (the guarded runtime test).

- [ ] **Step 4: Commit**

```bash
git add packages/core/skills/fixing-a-code-review/SKILL.md plugins/
git commit -m "feat(review): promote deferred and skipped findings into the backlog"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| Store shape `.moe/backlog/NNNN-slug.md`, tracked, worktree-rooted | T1 (`worktreeRoot`), T3 (`backlogAdd`, durability test) |
| Item schema / frontmatter | T2 (parse/serialize) — shape decided by **D2** |
| Statuses + transitions (incl. resume asymmetry) | T4 (defer), T5 (claim/resume/done/decline) |
| `open → in-progress` ("claim / start") | T5 (`backlogClaim`) — realizes the transition the command surface omitted |
| Reason enums + `needs-triage` routing | T4 (`routeReason`, `BLOCK/CARRY/DECLINE_REASONS`) |
| `defer` routing verb | T4 (`backlogDefer`), T7 (CLI) |
| Carry-over requires `next` | T4 (empty `--next` → `needs-triage`) |
| Headless-safe (exit 0, loud warning) | T7 (defer action warns on stderr, no non-zero exit) |
| `list`/`show`/`triage` | T6 |
| Code-review promotion (first producer) | T8 — coupling decided by **D1** |
| `.moe/backlog/` stays un-ignored | T3 (gitignore guard test) |

No spec section is unimplemented. The two under-specified points are raised as **D1** and **D2**, not invented in a step.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N". The only angle-bracket text is literal file content written into skeletons/prose (`<why this exists…>`, `<CR-ID>`), not plan placeholders.

**3. Type consistency:** `BacklogItem`, `BacklogStatus`, `Severity` defined once in T2 and imported thereafter. Handler names are stable across their definition, the CLI wiring (T7), and the self-review table: `backlogAdd/Claim/Defer/Resume/Done/Decline/List/Show/Triage`, `routeReason`, `formatLine`, `loadItem`, `backlogDir`. `worktreeRoot`/`slugify` defined in T1 and consumed in T2/T3.

**4. Decision vs task:** Two gaps were genuine decisions, not missing tasks — **D1** (stamp coupling) blocks T8, **D2** (frontmatter shape) blocks T2. Both `Blocked by` ids exist; both `Blocks` name real tasks. Every task's `Blocked by` line (T2→D2, T8→D1) names a decision that exists.

**5. Execution metadata:** Every task has `Files:`, `Interfaces:`, `Consumes:`, and `Produces:` (with `None` where an edge is absent — T1 consumes, T7/T8 produce).

## A note on runnability

This plan is **runnable**: D1 and D2 are both resolved (as recommended, 2026-09-04). The task code stands as written.
