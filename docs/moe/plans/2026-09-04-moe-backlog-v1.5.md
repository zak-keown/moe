# Moe Backlog v1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backlog ids collision-free across worktrees, give the promised `needs-triage → open` transition a verb, and move decline notes out of the `Resume` block.

**Architecture:** Three self-contained edits to `packages/jig/src/backlog.ts` and its two test files, plus one new `cli.ts` subcommand. Random `BL-<hex>` ids replace `max+1` allocation (the cross-worktree collision that would misroute `moe-resume`); a new `accept` verb effects `needs-triage → open`; `backlogDecline` writes a `## Disposition` block instead of reusing `writeResume`. No skill, plugin, or mint surface is touched.

**Tech Stack:** TypeScript ESM (Node ≥ 24), `commander`, `node:` built-ins only, `vitest`, `biome`. Package: `@bubstack/moe-jig` (L0 — no cross-package imports).

**Spec:** `docs/moe/specs/2026-09-04-moe-backlog-design.md` — the "v1.5 addendum (2026-09-04)" section is what this plan implements. Read it and the sections it back-references (`Statuses and transitions`, `Why the store resolves to the current worktree`) before starting.

## Global Constraints

Every task's requirements implicitly include this section. Copied from the spec and `AGENTS.md`:

- **jig stays L0 and dependency-free.** `node:` built-ins + `commander` only. No new package dependency. `node:crypto`'s `randomBytes` is a built-in and is allowed.
- **TypeScript ESM with `.js` import extensions** on every relative import (e.g. `from "./util.js"`), matching the rest of `src/`.
- **`tsconfig.base.json` sets `exactOptionalPropertyTypes: true` and `noUncheckedIndexedAccess: true`.** New code must satisfy both: never assign `undefined` to a non-`| undefined` field, and coalesce every indexed/regex-group access (`m[1] ?? ""`). Run `pnpm --filter @bubstack/moe-jig typecheck` in every task — a green `vitest` run does **not** prove types.
- **Run biome before every commit:** `pnpm --filter @bubstack/moe-jig exec biome format --write .` then `pnpm --filter @bubstack/moe-jig exec biome check .`. The formatter is a CI gate error, not a warning — a `vitest`+`typecheck`-green task with unformatted code turns CI red. This is the single most common miss.
- **Ids are `^BL-[0-9a-f]{10}$`** (5 random bytes, hex). Filenames are `<id>-<slug>.md`. Lookups key off the frontmatter `id`, never the filename.
- **Commit message trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DdxvHaMTqVcCEt21YmJc3P
  ```
- **No `/plugins/` edit, no `pnpm mint`.** This plan is pure `packages/jig/**`. If you find yourself editing a skill or a generated manifest, stop — you are out of scope.

## Open Decisions

None. All four decisions (id scheme, `accept` verb, decline heading, artifact weight) were resolved with the human partner on 2026-09-04 and are recorded in the spec's v1.5 addendum. This plan is runnable as written.

## Out of Scope

- **The `moe-resume` driver skill** — the consumer these unique ids unblock. Separate work; do not build it here. (Spec "Still out of scope".)
- **Machine-falsifiable blocker checks, multi-producer ingestion, TUI/web, cross-repo store** — unchanged v1.5+ deferrals.
- **Sub-day ordering of `list`.** `created` has day granularity (`today()` is `YYYY-MM-DD`); items filed the same day fall back to `id` order. Acceptable — `list` is a working view, not an audit log. Do not widen `today()`'s format.
- **A CLI surface for `accept` beyond `moe jig backlog accept <id> [--by]`** — no batch, no `--reason`. Accept is the plain triage-in verb.

---

### Task 1: Collision-free random ids + created-ordered listing

This is the heaviest task: the source change is small, but it invalidates the sequential-id assumption baked into ~18 existing tests, and fixing that cascade is the bulk of the work. The task's deliverable is atomic — the id scheme is random **and** the entire jig suite is green — so it is one commit, not two. A red intermediate is not a task boundary.

**Files:**
- Modify: `packages/jig/src/backlog.ts` — `allocateId` (line 113), `backlogAdd` filename (line 188), `loadAll` sort (line 330), add a `node:crypto` import.
- Modify: `packages/jig/test/backlog.test.ts` — rewrite the id-allocation test, add an `idOf` helper + the cross-worktree regression test, refactor every hardcoded-id site.
- Modify: `packages/jig/test/cli.test.ts` — id regex + two hardcoded-`BL-0001` sites + one filename assertion.

**Interfaces:**
- Consumes: `parseItem`, `slugify`, `today`, `worktreeRoot` (existing, unchanged).
- Produces: `allocateId(existing: string[]): { id: string }` — **signature change**, drops the `num` field. Random `^BL-[0-9a-f]{10}$` ids. `<id>-<slug>.md` filenames. `loadAll` ordered by `created` then `id`. Test helper `idOf(path: string): string` in `backlog.test.ts` (consumed by Tasks 2 and 3).

- [ ] **Step 1: Add the `idOf` test helper**

In `backlog.test.ts`, beside `makeRepo` (after line 58), add a frontmatter-scraping helper so tests stop depending on specific id values. It uses only `readFileSync` (already imported) — no dynamic import needed:

```ts
function idOf(path: string): string {
  const m = /^id:\s*(BL-\S+)\s*$/m.exec(readFileSync(path, "utf-8"));
  if (!m) throw new Error(`no id in ${path}`);
  return m[1] ?? "";
}
```

- [ ] **Step 2: Rewrite the id-allocation unit test**

Replace the entire `it("allocates the next zero-padded id, ignoring gaps", …)` (lines 39–43) with the new contract:

```ts
it("allocates a unique, well-formed random id that avoids local collisions", async () => {
  const { allocateId } = await import("../src/backlog.js");
  const a = allocateId([]);
  expect(a.id).toMatch(/^BL-[0-9a-f]{10}$/);
  // 50 draws are all distinct — a smoke test for an obviously-broken generator.
  const ids = new Set(Array.from({ length: 50 }, () => allocateId([]).id));
  expect(ids.size).toBe(50);
  // never returns an id already present in the store (filenames are `<id>-<slug>.md`).
  const c = allocateId([`${a.id}-x.md`]);
  expect(c.id).not.toBe(a.id);
});
```

Note: the collision-*regeneration* branch cannot be exercised deterministically without injecting the RNG, which is not worth the surface. It is a defensive guard over a 2^-40 event; the "distinct draws" and "avoids a seeded existing id" assertions above are the coverage. Do not add an RNG seam.

- [ ] **Step 3: Add the cross-worktree regression test (the headline)**

In `describe("backlogAdd", …)`, after the "survives worktree teardown" test (after line 107), add the test that proves the fix — the old `max+1` code gave both items `BL-0001`:

```ts
it("two items filed in separate worktrees get distinct ids and both survive merge", async () => {
  const { backlogAdd, backlogList } = await import("../src/backlog.js");
  const wtA = join(repo, ".moe", "worktrees", "a");
  const wtB = join(repo, ".moe", "worktrees", "b");
  gitIn(repo, "worktree", "add", "-b", "a", wtA, "main");
  gitIn(repo, "worktree", "add", "-b", "b", wtB, "main");
  const idA = idOf(backlogAdd("work in a", { cwd: wtA }));
  const idB = idOf(backlogAdd("work in b", { cwd: wtB }));
  expect(idA).not.toBe(idB); // regression: local max+1 gave both BL-0001
  for (const [wt, branch] of [
    [wtA, "a"],
    [wtB, "b"],
  ] as const) {
    gitIn(wt, "add", ".moe/backlog");
    gitIn(wt, "commit", "-m", `backlog ${branch}`);
    gitIn(repo, "merge", "--no-ff", branch, "-m", `merge ${branch}`);
  }
  expect(
    backlogList({ cwd: repo })
      .map((i) => i.id)
      .sort(),
  ).toEqual([idA, idB].sort());
});
```

- [ ] **Step 4: Run the new tests — verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts`
Expected: FAIL — `allocateId` still returns `{ num, id }` sequential; the cross-worktree test sees two `BL-0001`s.

- [ ] **Step 5: Implement the source change**

In `backlog.ts`:

Add the import at the top (join the existing `node:` imports):

```ts
import { randomBytes } from "node:crypto";
```

Replace `allocateId` (lines 113–121) entirely:

```ts
export function allocateId(existing: string[]): { id: string } {
  const used = new Set<string>();
  for (const name of existing) {
    const m = /^(BL-[0-9a-f]+)-/.exec(name);
    if (m?.[1]) used.add(m[1]);
  }
  let id = `BL-${randomBytes(5).toString("hex")}`;
  while (used.has(id)) id = `BL-${randomBytes(5).toString("hex")}`;
  return { id };
}
```

In `backlogAdd`, replace the destructure + filepath lines (currently line 171 `const { num, id } = allocateId(existing);` and line 188 `const filepath = join(dir, \`${String(num).padStart(4, "0")}-${slug}.md\`);`):

```ts
  const { id } = allocateId(existing);
```
```ts
  const filepath = join(dir, `${id}-${slug}.md`);
```

Replace `loadAll`'s body (lines 330–333) so ordering no longer rides on the filename:

```ts
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseItem(readFileSync(join(dir, f), "utf-8")))
    .sort((a, b) =>
      a.created === b.created ? a.id.localeCompare(b.id) : a.created.localeCompare(b.created),
    );
```

- [ ] **Step 6: Fix the two id-shape assertions in `backlogAdd` tests**

In "creates an open item …" (lines 78–85): the filename and id are no longer literal. Change:
```ts
    expect(p).toBe(join(repo, ".moe", "backlog", "0001-tab-ffi-abi-drift.md"));
```
to
```ts
    expect(p).toMatch(/\/BL-[0-9a-f]{10}-tab-ffi-abi-drift\.md$/);
```
and in the `toMatchObject` drop the `id: "BL-0001",` line, then after it add:
```ts
    expect(item.id).toMatch(/^BL-[0-9a-f]{10}$/);
```

In "survives worktree teardown …" (lines 99–106): capture the id and build the expected filename from it. Replace the body from the `backlogAdd(...)` call onward:
```ts
    const id = idOf(backlogAdd("filed in worktree", { cwd: wt }));
    gitIn(wt, "add", ".moe/backlog");
    gitIn(wt, "commit", "-m", "backlog: item");
    gitIn(repo, "merge", "--no-ff", "feat", "-m", "merge feat");
    const filename = `${id}-filed-in-worktree.md`;
    expect(existsSync(join(repo, ".moe", "backlog", filename))).toBe(true);
    gitIn(repo, "worktree", "remove", "--force", wt);
    expect(existsSync(join(repo, ".moe", "backlog", filename))).toBe(true);
```

- [ ] **Step 7: Refactor every hardcoded-id site — capture instead of assume**

The transformation rule, applied identically everywhere: **wherever a test does `backlogAdd(<title>, …)` and later refers to that item by a literal `BL-000N`, bind the id (`const idN = idOf(backlogAdd(<title>, …));`) and use `idN` in place of the literal.** Where a test only reads an item back through the `backlogAdd` return path (`const p = backlogAdd(...)`) it is already id-agnostic — leave it.

Worked example — "resume: blocked → open, carry-over → in-progress" (lines 199–214) becomes:
```ts
  it("resume: blocked → open, carry-over → in-progress", async () => {
    const { backlogAdd, backlogDefer, backlogResume, parseItem } = await import(
      "../src/backlog.js"
    );
    const id1 = idOf(backlogAdd("b", { cwd: repo }));
    backlogDefer(id1, { reason: "no-runtime", cwd: repo });
    expect(
      parseItem(readFileSync(backlogResume(id1, { cwd: repo }).path, "utf-8")).status,
    ).toBe("open");

    const id2 = idOf(backlogAdd("c", { cwd: repo }));
    backlogDefer(id2, { reason: "budget", next: "step", cwd: repo });
    expect(
      parseItem(readFileSync(backlogResume(id2, { cwd: repo }).path, "utf-8")).status,
    ).toBe("in-progress");
  });
```

Worked example — a list-result assertion, "list AND-filters and hides terminal items by default" (lines 289–301):
```ts
  it("list AND-filters and hides terminal items by default", async () => {
    const { backlogAdd, backlogDone, backlogList } = await import("../src/backlog.js");
    const id1 = idOf(backlogAdd("keep me", { cwd: repo, severity: "high", tags: ["tab"] }));
    const id2 = idOf(backlogAdd("done one", { cwd: repo }));
    backlogDone(id2, { cwd: repo });
    expect(backlogList({ cwd: repo }).map((i) => i.id)).toEqual([id1]); // done hidden
    expect(backlogList({ cwd: repo, tag: "tab", severity: "high" }).map((i) => i.id)).toEqual([id1]);
    expect(backlogList({ cwd: repo, tag: "nope" })).toEqual([]);
    expect(backlogList({ cwd: repo, status: "done" }).map((i) => i.id)).toEqual([id2]);
  });
```

Apply the rule to **every** test below (checklist — none may be skipped; each currently uses a literal `BL-000N`):

- [ ] `routeReason + backlogDefer` → "a carry reason WITH a next step sets carry-over and writes Resume" (capture `id` for `"BL-0001"`)
- [ ] `routeReason + backlogDefer` → "a carry reason WITHOUT a next step is triaged, not carried"
- [ ] `routeReason + backlogDefer` → "an unrecognized reason is triaged and preserves the raw reason"
- [ ] `transitions` → "claim moves open → in-progress and records claimedBy"
- [ ] `transitions` → "resume: blocked → open, carry-over → in-progress" (id1 + id2 — worked above)
- [ ] `transitions` → "resume refuses a non-resumable state"
- [ ] `transitions` → "done is terminal; decline requires a decline reason" (id1 for "d", id2 for "e")
- [ ] `transitions` → "terminal states (done, declined) refuse defer/done/decline" (id1 "done item", id2 "declined item")
- [ ] `transitions` → "a needs-triage item can still be re-deferred" (one id, referenced twice)
- [ ] `transitions` → "done honors an explicit --commit over the current HEAD sha"
- [ ] `transitions` → "done without --commit stamps the current HEAD sha"
- [ ] `read surface` → "list AND-filters and hides terminal items by default" (worked above)
- [ ] `read surface` → "triage lists only needs-triage items"
- [ ] `read surface` → "show returns the full item text" (assert `toContain(\`id: ${id}\`)`)
- [ ] `read surface` → "AND-combines status filter with tag filter" (id1 "done foo", id2 "done bar")
- [ ] `read surface` → "AND-combines status filter with severity filter" (id1 "done high", id2 "done low")

Leave untouched (already id-agnostic): "a block reason sets blocked" (uses `parseItem(...).id`), "formatLine includes id, status, and title" (uses `item.id`), "round-trips serialize → parse" (literal `BL-0007` is test data, not an allocated id — keep it).

- [ ] **Step 8: Run the whole backlog suite — verify green**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts`
Expected: PASS. If a test still references a literal `BL-000N`, it will throw `<id> not found` — return to the checklist.

- [ ] **Step 9: Fix `cli.test.ts` — id regex, two captures, one filename assertion**

In "adds and defers an item end-to-end" (lines 55–75): change the id regex and the filename check.
```ts
      expect(
        readdirSync(join(repo, ".moe", "backlog")).some((f) =>
          /^BL-[0-9a-f]{10}-cli-item\.md$/.test(f),
        ),
      ).toBe(true);
      const idMatch = /\bBL-[0-9a-f]{10}\b/.exec(addOut);
```
(Replace the `existsSync(join(... "0001-cli-item.md"))` line with the `readdirSync(...).some(...)` block, and change `/\bBL-\d{4}\b/` to `/\bBL-[0-9a-f]{10}\b/`.) Add `readdirSync` to the `node:fs` import on line 2.

In "defer warns with a carry-over-specific message when a carry reason is missing --next" (lines 77–90) and "defer warns with the unrecognized-reason message …" (lines 92–105): both hardcode `"BL-0001"` after `backlogAdd`. Capture the printed id instead. For each, replace the `execFileSync(... "add" ...)` + hardcoded-`"BL-0001"` pair with:
```ts
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "no next item"], {
        cwd: repo,
        encoding: "utf-8",
      });
      const id = /\bBL-[0-9a-f]{10}\b/.exec(addOut)?.[0] ?? "";
      const { stderr } = runIn(repo, "backlog", "defer", id, "--reason", "budget");
```
(Use the matching title/reason from each existing test — `"no next item"`/`"budget"` for the carry test, `"mystery item"`/`"just because"` for the unrecognized test — and swap `"BL-0001"` for `id`.)

- [ ] **Step 10: Typecheck, format, lint, full jig suite — all green**

```bash
pnpm --filter @bubstack/moe-jig typecheck
pnpm --filter @bubstack/moe-jig exec biome format --write .
pnpm --filter @bubstack/moe-jig exec biome check .
pnpm --filter @bubstack/moe-jig test
```
Expected: typecheck clean, biome reports no errors, all jig tests pass.

- [ ] **Step 11: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts packages/jig/test/cli.test.ts
git commit -m "feat(jig): collision-free random backlog ids, created-ordered listing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DdxvHaMTqVcCEt21YmJc3P"
```

---

### Task 2: `accept` verb — the `needs-triage → open` transition

**Files:**
- Modify: `packages/jig/src/backlog.ts` — add `backlogAccept` (beside `backlogClaim`/`backlogResume`).
- Modify: `packages/jig/src/cli.ts` — add the `accept` subcommand + import.
- Modify: `packages/jig/test/backlog.test.ts` — two unit tests in `describe("transitions")`.
- Modify: `packages/jig/test/cli.test.ts` — one e2e test.

**Interfaces:**
- Consumes: `loadItem`, `persist`, `today` (existing); `idOf` test helper (Task 1); random-id reality (tests capture ids, never hardcode).
- Produces: `backlogAccept(id: string, opts?: { cwd?: string; by?: string }): string` returning the resolved path; CLI `moe jig backlog accept <id> [--by <id>]`.

- [ ] **Step 1: Write the failing unit tests**

In `describe("transitions", …)` add:

```ts
  it("accept moves needs-triage → open and records provenance", async () => {
    const { backlogAdd, backlogDefer, backlogAccept, parseItem } = await import(
      "../src/backlog.js"
    );
    const id = idOf(backlogAdd("triaged", { cwd: repo }));
    backlogDefer(id, { reason: "mystery", cwd: repo }); // unrecognized → needs-triage
    const item = parseItem(readFileSync(backlogAccept(id, { cwd: repo, by: "human" }), "utf-8"));
    expect(item.status).toBe("open");
    expect(item.movedBy).toBe("human");
  });

  it("accept refuses a non-triage state", async () => {
    const { backlogAdd, backlogAccept } = await import("../src/backlog.js");
    const id = idOf(backlogAdd("open item", { cwd: repo }));
    expect(() => backlogAccept(id, { cwd: repo })).toThrow(/cannot accept/);
  });
```

- [ ] **Step 2: Run — verify they fail**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts -t accept`
Expected: FAIL — `backlogAccept` is not exported.

- [ ] **Step 3: Implement `backlogAccept`**

In `backlog.ts`, after `backlogResume` (after line 287), add:

```ts
export function backlogAccept(id: string, opts: { cwd?: string; by?: string } = {}): string {
  const { dir, name, item } = loadItem(opts.cwd, id);
  if (item.status !== "needs-triage")
    throw new Error(`cannot accept ${id}: status is ${item.status} (only needs-triage)`);
  item.status = "open";
  item.movedBy = opts.by ?? "manual";
  return persist(dir, name, item, opts.cwd);
}
```

- [ ] **Step 4: Run — verify they pass**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts -t accept`
Expected: PASS.

- [ ] **Step 5: Wire the CLI subcommand**

In `cli.ts`, add `backlogAccept` to the import block from `./backlog.js` (keep it alphabetical — after `backlogAdd`). Then add the command after the `decline` block (after line 268), mirroring `claim`:

```ts
backlog
  .command("accept")
  .argument("<id>")
  .option("--by <id>", "actor id")
  .action((id: string, o: { by?: string }) =>
    console.log(backlogAccept(id, o.by !== undefined ? { by: o.by } : {})),
  );
```

- [ ] **Step 6: Write the failing CLI e2e test**

In `cli.test.ts`, inside `describe("moe-jig CLI", …)`, add:

```ts
  it("accepts a triaged item to open end-to-end", () => {
    const repo = makeRepo();
    try {
      const addOut = execFileSync(process.execPath, [CLI, "backlog", "add", "triage cli"], {
        cwd: repo,
        encoding: "utf-8",
      });
      const id = /\bBL-[0-9a-f]{10}\b/.exec(addOut)?.[0] ?? "";
      runIn(repo, "backlog", "defer", id, "--reason", "just because"); // → needs-triage
      const out = execFileSync(process.execPath, [CLI, "backlog", "accept", id], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(out).toContain(".moe/backlog");
      const show = execFileSync(process.execPath, [CLI, "backlog", "show", id], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(show).toContain("status: open");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 7: Typecheck, format, lint, full jig suite**

```bash
pnpm --filter @bubstack/moe-jig typecheck
pnpm --filter @bubstack/moe-jig exec biome format --write .
pnpm --filter @bubstack/moe-jig exec biome check .
pnpm --filter @bubstack/moe-jig test
```
Expected: all green (the CLI test needs the rebuilt `dist/` — `test` runs `build` first via turbo; if running `vitest` directly, `pnpm --filter @bubstack/moe-jig build` first).

- [ ] **Step 8: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/src/cli.ts packages/jig/test/backlog.test.ts packages/jig/test/cli.test.ts
git commit -m "feat(jig): add backlog accept verb for needs-triage → open

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DdxvHaMTqVcCEt21YmJc3P"
```

---

### Task 3: Decline notes under `## Disposition`, not `## Resume`

**Files:**
- Modify: `packages/jig/src/backlog.ts` — add `writeDisposition`, change `backlogDecline`'s body write.
- Modify: `packages/jig/test/backlog.test.ts` — one unit test in `describe("transitions")`.

**Interfaces:**
- Consumes: `backlogDecline`, `writeResume` (existing sibling pattern); `idOf` (Task 1).
- Produces: `writeDisposition(body: string, reason: string, note?: string): string` (module-internal, not exported); `backlogDecline` now writes `## Disposition`. No CLI change — `decline`'s wiring is unchanged.

- [ ] **Step 1: Write the failing test**

In `describe("transitions", …)` add:

```ts
  it("decline writes a Disposition block, never Resume", async () => {
    const { backlogAdd, backlogDecline } = await import("../src/backlog.js");
    const id = idOf(backlogAdd("nope", { cwd: repo }));
    const text = readFileSync(
      backlogDecline(id, { reason: "wont-fix", note: "superseded by X", cwd: repo }),
      "utf-8",
    );
    expect(text).toContain("## Disposition");
    expect(text).toContain("- declined: wont-fix");
    expect(text).toContain("- note: superseded by X");
    expect(text).not.toContain("## Resume");
  });
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts -t Disposition`
Expected: FAIL — the body contains `## Resume` (from `writeResume`), not `## Disposition`.

- [ ] **Step 3: Implement `writeDisposition` and rewire `backlogDecline`**

In `backlog.ts`, after `writeResume` (after line 225), add:

```ts
function writeDisposition(body: string, reason: string, note?: string): string {
  const lines = ["## Disposition", "", `- declined: ${reason}`];
  if (note) lines.push(`- note: ${note}`);
  const block = `${lines.join("\n")}\n`;
  if (/^## Disposition$/m.test(body)) return body.replace(/## Disposition[\s\S]*$/m, block);
  return `${body.replace(/\n*$/, "")}\n\n${block}`;
}
```

In `backlogDecline`, replace the note line (currently line 313 `if (opts.note) item.body = writeResume(item.body, { note: opts.note, next: "—" });`) with an unconditional Disposition write (the reason is always recorded; the note is optional):

```ts
  item.body = writeDisposition(item.body, opts.reason, opts.note);
```

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm --filter @bubstack/moe-jig test -- backlog.test.ts -t Disposition`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, lint, full jig suite**

```bash
pnpm --filter @bubstack/moe-jig typecheck
pnpm --filter @bubstack/moe-jig exec biome format --write .
pnpm --filter @bubstack/moe-jig exec biome check .
pnpm --filter @bubstack/moe-jig test
```
Expected: all green. (Confirm no other test asserted the old `## Resume`-on-decline behavior — none does; `backlogDecline` callers in the suite only check `status`.)

- [ ] **Step 6: Commit**

```bash
git add packages/jig/src/backlog.ts packages/jig/test/backlog.test.ts
git commit -m "fix(jig): decline notes land under Disposition, not Resume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DdxvHaMTqVcCEt21YmJc3P"
```

---

## Self-Review

**1. Spec coverage:**

| Spec (v1.5 addendum) section | Task |
|---|---|
| §1 random `BL-<10hex>` ids, regenerate on local collision | T1 (`allocateId`) |
| §1 `allocateId` returns `{ id }`, filename `<id>-<slug>.md` | T1 (`backlogAdd`) |
| §1 `loadAll` sorts by `created` | T1 (`loadAll`) |
| §1 breaking test rewrite + cross-worktree regression | T1 (Steps 2–3, 7) |
| §2 `accept` verb, `needs-triage → open`, guards input | T2 (`backlogAccept` + CLI) |
| §3 decline note under `## Disposition` | T3 (`writeDisposition`) |
| Testing additions (ids, accept, decline note) | T1 / T2 / T3 respectively |

No addendum requirement is unimplemented.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases". The only angle-bracket text is literal (`<id>`, `<slug>`, `<title>`, `<step>`) — CLI-argument and interface notation, not plan placeholders. The refactor in T1 Step 7 is enumerated by test name with a stated transformation rule and two fully-worked examples — a bounded checklist, not "similar to above".

**3. Type consistency:** `allocateId` returns `{ id: string }` in T1 and is consumed only inside `backlogAdd` (same task). `backlogAccept(id, { cwd?, by? }): string` matches the sibling signatures of `backlogClaim`/`backlogResume` and its CLI wiring in T2. `writeDisposition(body, reason, note?)` in T3 mirrors `writeResume`. `idOf(path): string` is defined in T1 and consumed by T2/T3 test steps. No name drift.

**4. Decision vs task:** Open Decisions is empty by design — all four decisions were resolved in the spec. No task encodes an unmade decision; no `Blocked by` lines exist because nothing is blocked.

**5. Execution metadata:** Every task has `Files:`, `Interfaces:`, `Consumes:`, and `Produces:`. T1 `Consumes: … (existing, unchanged)` and no cross-task producer; T2/T3 consume T1's `idOf` helper and random-id reality, stated explicitly.
