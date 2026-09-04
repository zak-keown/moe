# jig backlog transition hygiene

Backlog: BL-2064cbd0a5, BL-9611e6525d — size **S**

Two related state-hygiene defects in `packages/jig/src/backlog.ts`. Both are
cosmetic (frontmatter `status` stays authoritative and all lookups key off it),
both confirmed against current `main` (merge `f27827aa`, "moe backlog v1.5"). One
library file changes; no `SKILL.md`, hook, manifest, or `/plugins/` output is
touched, so `pnpm mint` is **not** implicated. `@bubstack/moe-jig` ships no mint
plugin.

## Problem

### (a) BL-2064cbd0a5 — decline leaves a stale `## Resume` block

`writeDisposition` appends a `## Disposition` block but never removes a
pre-existing `## Resume` block:

```ts
function writeDisposition(body: string, reason: string, note?: string): string {
  const lines = ["## Disposition", "", `- declined: ${reason}`];
  if (note) lines.push(`- note: ${note}`);
  const block = `${lines.join("\n")}\n`;
  if (/^## Disposition$/m.test(body)) return body.replace(/## Disposition[\s\S]*$/m, block);
  return `${body.replace(/\n*$/, "")}\n\n${block}`;
}
```

`backlogDefer` writes a `## Resume` block for both the `carry-over` and
`blocked` targets:

```ts
if (target === "carry-over" || target === "blocked") item.body = writeResume(item.body, opts);
```

`backlogDecline` is reachable from those states — its terminal guard only
rejects `done`/`declined` (`if (item.status === "done" || item.status === "declined")`),
so a `blocked → decline` or `carry-over → decline` path (e.g. an
`upstream-decision` block later ruled `wont-fix`) produces a terminal `declined`
record that still carries a `## Resume` thread inviting resumption — precisely
what the v1.5 Disposition change set out to prevent.

The existing test "decline writes a Disposition block, never Resume"
(`packages/jig/test/backlog.test.ts`) declines a **freshly-added** item that
never had a Resume block, so it does not exercise this path and stays green.

### (b) BL-9611e6525d — transitions never clear stale `reason` / `claimedBy`

No transition clears a field that its destination state has made meaningless:

- `backlogAccept` (`needs-triage → open`) leaves `item.reason` intact. After an
  unrecognized-reason defer routes an item to `needs-triage` and a human accepts
  it, the `open` item still shows e.g. `reason: mystery`. The finding names this
  case directly.
- `backlogResume` (`blocked → open`, `carry-over → in-progress`) leaves the
  deferral `reason` (`no-runtime`, `budget`, …) in the frontmatter of an item
  that is now active again.
- `backlogDefer`, `backlogDone`, `backlogDecline` never clear `claimedBy`, so an
  item claimed while `in-progress` keeps advertising a claimant after it leaves
  active work (`blocked`, `needs-triage`, `done`).

`reason` and `claimedBy` are both **state-scoped**: `reason` explains *why* an
item is parked or dispositioned, `claimedBy` records who is *actively* on it.
Neither is normalized when the state changes. The current write path is
`persist()` for claim/resume/accept/done/decline, and an inline `writeFileSync`
for defer — there is no single point where normalization could live today.

## Change

One coherent policy, one helper, one call site.

**Policy.** After any transition, a state-scoped field survives only in the
states where it still means something:

- `reason` is kept only when the destination status is one of
  `blocked`, `carry-over`, `needs-triage`, `declined`; cleared otherwise
  (`open`, `in-progress`, `done`). This matches the schema note (reason is
  "required unless status ∈ {open, in-progress, done}") — those three states are
  exactly the ones where it is now forced empty.
- `claimedBy` is kept only when the destination status is `in-progress`; cleared
  otherwise.

**1. Add a normalization helper** (new symbol, place it just above `persist`):

```ts
const REASON_STATES: BacklogStatus[] = ["blocked", "carry-over", "needs-triage", "declined"];

function normalizeStateFields(item: BacklogItem): void {
  if (!REASON_STATES.includes(item.status)) item.reason = undefined;
  if (item.status !== "in-progress") item.claimedBy = undefined;
}
```

**2. Call it from `persist`** so every transition routed through `persist`
inherits the policy — add the call after `updated`/`movedSha` are stamped and
before `serializeItem`:

```ts
function persist(dir: string, name: string, item: BacklogItem, cwd?: string, sha?: string): string {
  item.updated = today();
  item.movedSha = sha ?? safeSha(cwd) ?? item.movedSha;
  normalizeStateFields(item);
  const path = join(dir, name);
  writeFileSync(path, serializeItem(item), "utf-8");
  return resolve(path);
}
```

**3. Route `backlogDefer` through `persist`** so it shares the single
normalization point (it currently writes inline). Replace defer's tail — the
`item.updated`/`item.movedSha`/`writeFileSync` trio — keeping `movedBy` and the
`writeResume` call before `persist` (Resume must be written into `item.body`
before serialization, and defer's targets are all in `REASON_STATES` so their
`reason` is preserved while a stale `claimedBy` is cleared):

```ts
  item.status = target;
  item.reason = opts.reason;
  item.movedBy = opts.by ?? "manual";
  if (target === "carry-over" || target === "blocked") item.body = writeResume(item.body, opts);
  const path = persist(dir, name, item, opts.cwd);
  return { path, status: target, triaged: target === "needs-triage" };
```

This is behavior-preserving for defer's timestamp/sha: `persist` sets
`updated = today()` and `movedSha = safeSha(cwd) ?? item.movedSha` — identical to
the removed inline lines (defer passes no explicit sha).

Per-transition outcome under the policy:

| transition | destination | reason | claimedBy |
|---|---|---|---|
| `backlogClaim` | in-progress | cleared (n/a — source is open/in-progress) | set/kept |
| `backlogResume` blocked→open | open | **cleared** | cleared |
| `backlogResume` carry-over→in-progress | in-progress | **cleared** | kept |
| `backlogAccept` needs-triage→open | open | **cleared** | cleared |
| `backlogDefer` | blocked/carry-over/needs-triage | kept (just set) | **cleared** |
| `backlogDone` | done | **cleared** | **cleared** |
| `backlogDecline` | declined | kept (the decline reason) | **cleared** |

**4. Strip a stale `## Resume` block in `writeDisposition`** (fixes (a)). Remove
any Resume block before composing the Disposition block. Resume is only ever
appended at end-of-body (by `writeResume`), so a to-end strip is safe:

```ts
function writeDisposition(body: string, reason: string, note?: string): string {
  const cleaned = body.replace(/\n*## Resume[\s\S]*$/m, "");
  const lines = ["## Disposition", "", `- declined: ${reason}`];
  if (note) lines.push(`- note: ${note}`);
  const block = `${lines.join("\n")}\n`;
  if (/^## Disposition$/m.test(cleaned)) return cleaned.replace(/## Disposition[\s\S]*$/m, block);
  return `${cleaned.replace(/\n*$/, "")}\n\n${block}`;
}
```

The `\n*` prefix consumes the blank line(s) separating the prior block from
`## Resume`; `[\s\S]*$` is greedy to end-of-string.

Note the two parts are independent edits but ship together: after part 3,
`backlogDecline` (which calls `persist`) additionally clears a stale
`claimedBy` on the declined record — a coincidental win, not a substitute for
the Resume strip in part 4.

## Files touched

- `packages/jig/src/backlog.ts` (source) — add `REASON_STATES` +
  `normalizeStateFields`; call it in `persist`; route `backlogDefer` through
  `persist`; strip `## Resume` in `writeDisposition`.
- `packages/jig/test/backlog.test.ts` (source, test) — add the cases below.

No generated files. No `SKILL.md` / hook / manifest changes; `pnpm mint` does
**not** re-run and `/plugins/` is not regenerated. `@bubstack/moe-jig` produces
no mint plugin, so `pnpm mint:check` is unaffected. `NOTICE` / `pnpm provenance`
unaffected (no imported-work metadata changes).

## Acceptance

- `pnpm --filter @bubstack/moe-jig test` and `pnpm check` (lint + turbo
  typecheck + test) pass. `pnpm check` is the sufficient gate; `pnpm mint:check`
  and `pnpm provenance` are not affected but remain green.
- A `carry-over → decline` and a `blocked → decline` record contain
  `## Disposition` and do **not** contain `## Resume`.
- After `backlogAccept` on a `needs-triage` item, the item's `reason` is empty.
- After `backlogResume` from `blocked` and from `carry-over`, `reason` is empty.
- After `backlogDefer` of a previously-claimed item, `claimedBy` is empty.
- After `backlogDone` / `backlogDecline` of a previously-claimed item,
  `claimedBy` is empty; `backlogDecline` still records the decline `reason`.
- No regression: the existing "decline writes a Disposition block, never Resume"
  and "resume: blocked → open, carry-over → in-progress" cases stay green.

## Test plan

All new cases go in `packages/jig/test/backlog.test.ts`, in the existing
`describe("transitions", …)` block (which already has the `makeRepo` /
`idOf` fixtures and imports functions dynamically from `../src/backlog.js`).

1. **`decline strips a stale Resume block (carry-over → decline)`** — add,
   `backlogDefer({ reason: "budget", next: "later", cwd })` (→ carry-over, writes
   Resume; assert the on-disk text contains `## Resume`), then `backlogDecline({
   reason: "wont-fix", cwd })`; assert the resulting text contains
   `## Disposition` and `- declined: wont-fix` and **not** `## Resume`.
2. **`decline strips a stale Resume block (blocked → decline)`** — same shape
   with `backlogDefer({ reason: "no-runtime", cwd })` (→ blocked, writes Resume),
   then decline; assert no `## Resume`, `## Disposition` present.
3. **`accept clears a stale reason`** — add, `backlogDefer({ reason: "mystery",
   cwd })` (→ needs-triage, `reason: mystery`), `backlogAccept`; parse and assert
   `item.status === "open"` and `item.reason` is `undefined` (and the raw text
   does not contain `reason: mystery`).
4. **`resume clears the deferral reason`** — two sub-checks in one case:
   blocked→open (`reason: no-runtime` → empty) and carry-over→in-progress
   (`reason: budget` → empty); assert `item.reason` undefined after each resume.
5. **`defer clears a stale claimedBy`** — add, `backlogClaim({ by: "agent-7" })`
   (in-progress, `claimedBy: agent-7`), `backlogDefer({ reason: "no-runtime" })`
   (→ blocked); assert parsed `item.claimedBy` is `undefined`.
6. **`done and decline clear a stale claimedBy`** — claim, then `backlogDone`;
   assert `claimedBy` undefined. Separately claim, then `backlogDecline({ reason:
   "wont-fix" })`; assert `claimedBy` undefined **and** `item.reason === "wont-fix"`
   (decline reason survives).

Assert on the parsed `BacklogItem` via `parseItem(readFileSync(path,"utf-8"))`
for field emptiness, and on raw file text for the `## Resume` / `## Disposition`
markers, matching the style of the existing decline/resume cases.

## Sequencing & dependencies

- **Independent of the packaging republish** (BL-d932811282 / release-execute):
  jig ships no mint plugin and no `/plugins/` artifact, so this cannot affect
  tarball/manifest/license contents and needs no ordering against the republish.
- The two backlog items are a single edit to one file and one test file — do
  them together in one branch; do not split. Part 3 (routing defer through
  `persist`) is a prerequisite for the defer `claimedBy` clear in part 2/5.
- No dependency on any other 0.2.1 spec. Can run fully in parallel with the rest
  of the patch cluster.

## Risks

- **Regex over-reach in the Resume strip.** `/\n*## Resume[\s\S]*$/m` deletes to
  end-of-body. Safe today because `writeResume` only ever appends Resume last and
  no block follows it; if a future change places content after `## Resume`, this
  strip would eat it. Mitigation: the appended-last invariant is asserted by
  `writeResume` itself; note it in a code comment.
- **Routing defer through `persist` changes the write path.** Confirmed
  behavior-preserving for `updated`/`movedSha` (defer passes no explicit sha, so
  `sha ?? safeSha(cwd)` reduces to `safeSha(cwd)`). The `writeResume` call must
  remain **before** the `persist` call. The existing defer tests
  ("a block reason sets blocked", "a carry reason WITH a next step … writes
  Resume", "… WITHOUT a next step is triaged", "unrecognized reason … preserves
  the raw reason") guard this and must stay green.
- **`claimedBy` on carry-over→in-progress is intentionally kept.** A worker who
  carried an item over resumes it; keeping the claimant is the deliberate policy
  choice, not an oversight. Documented in the table so a reviewer does not "fix"
  it.
- Low blast radius overall: `backlog.ts` has no source consumers of `reason`/
  `claimedBy`/`writeDisposition` outside itself (`cli.ts` only calls the
  transition functions), so no downstream code depends on the pre-change field
  retention.
