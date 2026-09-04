# Jig Tier 2/3 — Design Addendum

This addendum specifies six new commands for `@bubstack/moe-jig`: three Tier 2
commands that close the review-fix and iterative-development bootstrapping gaps,
and three Tier 3 commands that cover domain-modeling scaffolding, ADR creation,
and progress-file generation. Together they eliminate the remaining cases where
skill prose tells a model "write this file in this format" and the model drifts
from the contract. Each command follows the same mechanical pattern established
by Tier 1 (`worktreeCreate`, `planInit`, `specInit`): validate inputs, produce
exactly one side effect, print the resulting path or SHA to stdout, throw on
failure.

---

## Tier 2

### `moe jig review stamp`

#### Command signature

```
moe jig review stamp <CR-ID> <fixing-sha> [--cwd <path>]
```

| Positional | Required | Description |
|---|---|---|
| `<CR-ID>` | yes | Code-review finding identifier. Must match the regex `^CR-\d{3}$` (e.g. `CR-012`). |
| `<fixing-sha>` | yes | The SHA (full or abbreviated) of the commit that addressed the finding. Resolved to a full SHA internally via `git rev-parse`. |

| Flag | Default | Description |
|---|---|---|
| `--cwd <path>` | `process.cwd()` | Override the working directory for git operations. Used by tests; not expected in normal use. |

#### Behavior

Step-by-step internal logic:

1. **Validate CR-ID format.** If `<CR-ID>` does not match `^CR-\d{3}$`, throw with the error message below and exit 1.
2. **Resolve the repository root.** Call `primaryRoot(cwd)` (the same helper used by `worktreeCreate`) to find the primary checkout, supporting execution from within a linked worktree.
3. **Resolve the fixing SHA.** Run `git -C <root> rev-parse --verify <fixing-sha>^{commit}`. If this fails (the ref does not exist or is not a commit), throw with the error message below and exit 1.
4. **Verify the fixing SHA is an ancestor of HEAD.** Run `git -C <root> merge-base --is-ancestor <resolved-sha> HEAD`. If this exits non-zero (the commit is not reachable from HEAD), throw with the error message below and exit 1. This prevents stamping a commit that has not been merged or cherry-picked into the current branch.
5. **Check for a clean working tree.** Run `git -C <root> diff-index --quiet HEAD --`. If this exits non-zero (there are uncommitted changes), throw with the error message below and exit 1. The stamp must be a clean, empty commit that contains nothing but the message.
6. **Create the stamp commit.** Run `git -C <root> commit --allow-empty -m <message>` where the message is:

```
fix(review): <CR-ID> — addressed by <full-sha>
```

The em dash is literal U+2014. The full SHA is the resolved 40-character hex string from step 3.

7. **Print the stamp SHA to stdout.** Run `git -C <root> rev-parse HEAD` and print the result. This is the only stdout output on success.

#### Validation

| Condition | Error message (stderr) | Exit code |
|---|---|---|
| CR-ID does not match `^CR-\d{3}$` | `Invalid CR-ID "${crId}". Expected format: CR-### (e.g. CR-012).` | 1 |
| `<fixing-sha>` does not resolve to a commit | `"${fixingSha}" does not resolve to a commit in this repository.` | 1 |
| Fixing SHA is not an ancestor of HEAD | `"${fixingSha}" is not reachable from HEAD. The fix must be on the current branch before stamping.` | 1 |
| Working tree has uncommitted changes | `Working tree is dirty. Commit or stash changes before creating a stamp.` | 1 |

#### Output

**Success (stdout):** The 40-character SHA of the newly created stamp commit, followed by a newline. Nothing else.

**Success (stderr):** Nothing.

**Failure (stderr):** The error message from the validation table above. Nothing on stdout.

#### Exit codes

| Code | Meaning |
|---|---|
| 0 | Stamp commit created successfully. |
| 1 | Validation failure (bad CR-ID, unresolvable SHA, SHA not ancestor, dirty tree) or unexpected git error. |

#### Source file

**File:** `packages/jig/src/review.ts` (new file, as anticipated by the design spec's package shape).

**Exported function signature:**

```typescript
export interface ReviewStampOpts {
  cwd?: string;
}

export function reviewStamp(crId: string, fixingSha: string, opts?: ReviewStampOpts): string
```

**Parameters:**
- `crId` — the CR-ID string (e.g. `"CR-012"`).
- `fixingSha` — the user-provided ref (abbreviated or full SHA).
- `opts` — optional. `cwd` overrides the working directory for git resolution. When omitted, defaults internally to `process.cwd()`.

**Returns:** The full 40-character SHA of the newly created stamp commit.

**Throws:** `Error` with the messages defined in the Validation table.

**Internal helpers reused from `worktree.ts`:** The function needs `gitIn(cwd, ...args)` and `primaryRoot(cwd)`. These are currently private to `worktree.ts`. Two options:

- **Option A (recommended):** Extract `gitIn` and `primaryRoot` into `util.ts` alongside `git()` and `resolvePrimaryRoot()`. The existing `resolvePrimaryRoot()` in util.ts takes no cwd argument; `primaryRoot(cwd)` in worktree.ts does. Consolidate to one function in util.ts that accepts `cwd` with a default of `process.cwd()`. Update worktree.ts to import from util.ts. This refactor is a prerequisite step in the implementation task.
- **Option B:** Duplicate `gitIn` and `primaryRoot` in review.ts. Avoid this; it contradicts the L0 package's single-source design.

#### CLI wiring

Add a `review` subcommand group to `cli.ts`, parallel to the existing `worktree`, `plan`, and `spec` groups:

```typescript
import { reviewStamp } from "./review.js";

const review = program
  .command("review")
  .description("Review-fix stamps and commit formatting");

review
  .command("stamp")
  .description("Create a stamp commit recording that a CR finding was addressed")
  .argument("<CR-ID>", "code-review finding ID (e.g. CR-012)")
  .argument("<fixing-sha>", "SHA of the commit that addressed the finding")
  .action((crId: string, fixingSha: string) => {
    const sha = reviewStamp(crId, fixingSha);
    console.log(sha);
  });
```

The `review` group is also the future home of `commit review-fix` (the other Tier 2 review command from the design spec).

#### Test cases

All tests go in `packages/jig/test/review.test.ts`. Tests use the existing `makeRepo()` helper pattern (temp git repo with `realpathSync`, cleaned up in `afterEach`).

1. **"creates a stamp commit with the correct message format"** — Create a repo, make a commit (the "fix"), call `reviewStamp("CR-001", <fixSha>)`. Verify the returned SHA exists. Run `git log -1 --format=%s` on the returned SHA and assert it equals `fix(review): CR-001 — addressed by <full-fix-sha>`. Verify the stamp commit has no file changes (empty commit).

2. **"rejects an invalid CR-ID"** — Call `reviewStamp("CR-1", <anySha>)` and assert it throws with the message containing `Invalid CR-ID`. Also test `reviewStamp("cr-001", ...)`, `reviewStamp("CR-0012", ...)`, and `reviewStamp("ISSUE-001", ...)`.

3. **"rejects a SHA that does not resolve to a commit"** — Call `reviewStamp("CR-001", "deadbeef1234567890")` in a valid repo and assert it throws with `does not resolve to a commit`.

4. **"rejects a SHA not reachable from HEAD"** — Create a repo with two branches. Make a commit on branch B. Switch back to branch A (without merging). Call `reviewStamp("CR-001", <branchBSha>)` and assert it throws with `not reachable from HEAD`.

5. **"rejects when the working tree is dirty"** — Create a repo, make a fix commit, then modify a tracked file without committing. Call `reviewStamp("CR-001", <fixSha>)` and assert it throws with `Working tree is dirty`.

#### Hook integration

**No new hook is needed.** The existing `jig-review-format-guard` hook (in `packages/core/hooks/jig-review-format-guard`) already validates the `fix(review): CR-### ...` commit message format. The stamp commit produced by this command will pass that hook because the message matches the required pattern.

The hook's error message currently says:

```
Use `moe jig commit review-fix <CR-ID> <title>` to format it correctly.
```

This references the `commit review-fix` command (a separate Tier 2 command that stages and commits with a fix(review) message). The stamp command is a different operation: it creates an empty commit recording that a finding was addressed, not the fix commit itself. The hook message does not need to mention `review stamp` because the stamp command is not a replacement for `commit review-fix` -- it is a companion.

**No skill text update is needed for this command alone.** The `receiving-code-review` and `fixing-a-code-review` skills should eventually reference `moe jig review stamp` as the way to produce stamp commits, but that update is bundled with the broader Tier 2 skill update (which also covers `commit review-fix` and `iterations init`). The command ships first; the skill references follow.

#### Edge cases

1. **Abbreviated SHAs.** The `<fixing-sha>` argument accepts abbreviated SHAs (e.g. `abc1234`). `git rev-parse --verify <sha>^{commit}` resolves them. If the abbreviation is ambiguous, git itself errors with "short SHA1 is ambiguous" and the command surfaces that error.

2. **Running from a linked worktree.** `primaryRoot(cwd)` resolves to the primary checkout via `--git-common-dir`. The stamp commit lands on whatever branch is checked out in `cwd` (which may be the worktree's branch, not `main`). This is correct: the stamp should land on the branch where the review fix was applied.

3. **The stamp must be a separate commit.** The command uses `--allow-empty` and never stages files. If someone runs this after making changes but before committing them, the dirty-tree check blocks it. The stamp is always an empty commit containing only the formatted message. This is the core invariant the command enforces.

4. **CR-ID is exactly 3 digits.** The regex `^CR-\d{3}$` enforces zero-padded three-digit IDs (CR-001 through CR-999). This matches the existing hook's validation regex. CR-000 is technically valid (the regex does not exclude it) and is accepted.

5. **`exactOptionalPropertyTypes: true` compliance.** The `ReviewStampOpts` interface uses `cwd?: string` (optional property). Under `exactOptionalPropertyTypes`, callers cannot pass `{ cwd: undefined }` -- they must either omit the key or pass a string. The implementation uses `opts?.cwd ?? process.cwd()` (optional chaining on the entire opts parameter, since the parameter itself is optional).

6. **`biome noNonNullAssertion` compliance.** No `!` postfix assertions. The implementation avoids them by using the pattern from worktree.ts: results of `gitIn()` are always strings (it trims `execFileSync` output), and array access uses explicit `undefined` checks or `for...of` loops.

7. **The `--allow-empty` flag.** Without it, `git commit` refuses to create a commit with no staged changes. The stamp commit is intentionally empty -- its purpose is purely the message, not any file changes.

8. **Re-stamping the same CR-ID.** Nothing prevents creating multiple stamp commits for the same CR-ID (e.g. if the first fix was reverted and re-done). Each stamp is an independent commit. This is intentional.

---

### `moe jig commit review-fix`

#### Command signature

```
moe jig commit review-fix <CR-ID> <title>
```

**Arguments:**

| Position | Name    | Required | Description |
|----------|---------|----------|-------------|
| 1        | `CR-ID` | Yes      | Code-review identifier. Must match the pattern `CR-` followed by exactly three digits (`CR-001` through `CR-999`). Leading zeros are valid. |
| 2        | `title` | Yes      | One-line description of the fix. Commander collects all remaining tokens into a single variadic string. No length limit enforced by jig; git itself will handle any extreme cases. |

**Flags:** None. No `--dry-run`, no `--amend`, no `--cwd`. The command does one thing. The `cwd` option exists on the exported function for testability but is not exposed as a CLI flag (same pattern as `worktreeRemove`).

**Examples:**

```
moe jig commit review-fix CR-012 handle nil pointer in parser
moe jig commit review-fix CR-001 remove dead import
```

#### Behavior -- step-by-step

1. **Validate CR-ID format.** Test `crId` against `/^CR-\d{3}$/`. Reject if it does not match.
2. **Validate title is non-empty.** After trimming, the title must have at least one character. Reject if empty.
3. **Resolve the working directory.** Use `opts.cwd ?? process.cwd()`. No need to resolve to the primary root -- `git commit` operates on the repo that owns the cwd, which is the correct behavior whether cwd is the main checkout or a worktree.
4. **Check for staged changes.** Run `git diff --cached --quiet` in the cwd. If it exits 0, nothing is staged -- reject. (Exit code 1 from `git diff --cached --quiet` means there *are* staged changes; that is the success path.)
5. **Build the commit message.** Construct: `fix(review): ${crId} — ${title}`. The separator is an em dash (`—`), matching the contract the `jig-review-format-guard` hook validates.
6. **Run the commit.** Execute `git commit -m <message>` using `execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf-8" })`. Argument array -- never shell interpolation.
7. **Read the new commit SHA.** Run `git rev-parse HEAD` in the same cwd.
8. **Print the SHA to stdout.** A single line: the 40-character hex SHA.

#### Validation

| Condition | Error message (to stderr) | Exit code |
|-----------|--------------------------|-----------|
| CR-ID does not match `/^CR-\d{3}$/` | `Invalid CR-ID "${crId}". Expected format: CR-### (e.g. CR-012).` | 1 |
| Title is empty (or all whitespace) | `Title is required. Usage: moe jig commit review-fix <CR-ID> <title>` | 1 |
| Nothing staged | `Nothing staged. Stage your changes with \`git add\` before running this command.` | 1 |

All three validations run before any git mutation. Order is: CR-ID, title, staging check.

#### Output

**Success (stdout):**
```
<40-char commit SHA>
```

One line, the full SHA. No prose, no decoration. Matches the pattern of `worktreeCreate` (prints the path) and `planInit` (prints the path). Callers can capture the SHA.

**Failure (stderr):**
The error message from the validation table, or git's own stderr if `git commit` fails for an unexpected reason (e.g., hook failure from a git-level hook, lock contention). The function throws an `Error`; the `cli.ts` catch block prints `err.message` to stderr.

#### Exit codes

| Code | Meaning |
|------|---------|
| 0    | Commit succeeded. SHA printed to stdout. |
| 1    | Validation failure (bad CR-ID, empty title, nothing staged) or unexpected git error. |

There is no exit code 2 from the command itself. Exit code 2 is reserved for hook blocking (the `jig-review-format-guard` hook uses it). Since this command produces correctly formatted messages, the hook will never fire on a jig-produced commit -- but that is because jig uses `execFileSync` (Node child_process), not the Bash tool, so the PreToolUse hook does not intercept it at all.

#### Source file

**File:** `packages/jig/src/review.ts` (same file as `reviewStamp`).

**Exported function signature:**

```typescript
export interface CommitReviewFixOpts {
  cwd?: string;
}

export function commitReviewFix(
  crId: string,
  title: string,
  opts?: CommitReviewFixOpts,
): string
```

**Parameters:**
- `crId` -- the raw CR-ID string (e.g. `"CR-012"`)
- `title` -- the fix description, already joined by Commander from variadic args
- `opts` -- optional; `cwd` defaults to `process.cwd()` when absent

**Returns:** The 40-character commit SHA as a string.

**Throws:** `Error` with the messages from the validation table on validation failure, or with git's error message on unexpected git failure.

**Internal helpers used:**
- `gitIn(cwd, ...args)` -- after the Option A refactor (see `review stamp` spec), imported from `util.ts`.

**CR-ID regex constant (module-level):**

```typescript
const CR_ID_PATTERN = /^CR-\d{3}$/;
```

This constant is shared between `reviewStamp` and `commitReviewFix` within the same module.

#### CLI wiring

Add a `commit` subcommand group to `cli.ts`, following the existing pattern of `wt`, `plan`, and `spec`:

```typescript
import { commitReviewFix } from "./review.js";

const commit = program
  .command("commit")
  .description("Structured commits with validated formats");

commit
  .command("review-fix")
  .description("Commit staged changes as a review fix: fix(review): CR-### — <title>")
  .argument("<cr-id>", "code-review identifier (CR-###)")
  .argument("<title...>", "one-line description of the fix")
  .action((crId: string, titleParts: string[]) => {
    const title = titleParts.join(" ");
    const sha = commitReviewFix(crId, title);
    console.log(sha);
  });
```

**Key detail:** The `<title...>` uses Commander's variadic argument syntax so that `moe jig commit review-fix CR-012 handle nil pointer in parser` captures `["handle", "nil", "pointer", "in", "parser"]` and the action joins them with spaces. This avoids requiring the user to quote the title.

#### Test cases

**Test file:** `packages/jig/test/review.test.ts` (shared with `reviewStamp` tests).

Tests use `makeRepo()` with `realpathSync()` (same helper as `worktree.test.ts`), staging files with `gitIn(repo, "add", ".")` before calling `commitReviewFix`.

1. **"commits with the correct message format when changes are staged"** -- Create a temp repo, touch and stage a file, call `commitReviewFix("CR-001", "fix the parser", { cwd: repo })`. Assert: returns a 40-char hex string. Run `gitIn(repo, "log", "-1", "--format=%s")` and assert it equals `fix(review): CR-001 — fix the parser`.

2. **"rejects an invalid CR-ID"** -- Call `commitReviewFix("CR-1", "title", { cwd: repo })`. Assert: throws with message matching `/Invalid CR-ID/`. Also test `"CR-0001"` (4 digits), `"cr-001"` (lowercase), and `"001"` (no prefix).

3. **"rejects an empty title"** -- Call `commitReviewFix("CR-001", "", { cwd: repo })`. Assert: throws with message matching `/Title is required/`. Also test `"   "` (whitespace-only).

4. **"refuses to commit when nothing is staged"** -- Create a temp repo with no staged changes (the initial commit already landed, working tree is clean). Call `commitReviewFix("CR-001", "fix something", { cwd: repo })`. Assert: throws with message matching `/Nothing staged/`.

5. **"works from inside a worktree"** -- Create a temp repo, create a worktree with `worktreeCreate`, touch and stage a file inside the worktree, call `commitReviewFix("CR-099", "worktree fix", { cwd: wtPath })`. Assert: returns a valid SHA. Run `gitIn(wtPath, "log", "-1", "--format=%s")` and assert it contains `CR-099`.

#### Hook integration

**No new hook needed.** The `jig-review-format-guard` hook (`packages/core/hooks/jig-review-format-guard`) already exists, is already wired into `hooks.json`, and already points models to this command in its BLOCKED message:

```
Use `moe jig commit review-fix <CR-ID> <title>` to format it correctly.
```

The hook blocks malformed `fix(review)` commits made through the Bash tool. This command does not go through the Bash tool (it uses `execFileSync` directly), so the hook is not in the execution path -- no circular dependency.

**No skill text update needed in this task.** The hook's BLOCKED message already names the command. Skill updates to reference `moe jig commit review-fix` in prose (e.g., in `fixing-a-code-review` or `receiving-code-review`) are a follow-up change, not a prerequisite for shipping the command. The hook is the enforcement layer; the skill is the guidance layer. The command working is sufficient for the hook's redirect to resolve.

#### Edge cases

1. **Title with special characters.** Titles like `handle "quoted" strings` or `fix the parser's edge case` are safe because `execFileSync` passes arguments as an array, not through a shell. No escaping needed.

2. **Em dash encoding.** The commit message uses the literal Unicode em dash (`—`). The `jig-review-format-guard` hook also accepts `--` (double hyphen) via its regex `(---|--)`, but jig always produces the em dash. This is intentional: jig is the canonical producer, the hook is lenient for manual commits that get the separator close enough.

3. **Multiple staged files.** The command commits whatever is staged. It does not `git add` anything itself. The user (or the model) stages files first, then calls the command. This matches the Unix philosophy of composing small tools.

4. **Concurrent commits / lock contention.** If another process holds the git lock, `git commit` will fail and `execFileSync` will throw. The error propagates to the CLI's catch block. No special handling needed.

5. **Detached HEAD.** `git commit` works on detached HEAD. The command does not check for it. The SHA is still valid.

6. **The `exactOptionalPropertyTypes` constraint.** The `CommitReviewFixOpts` interface uses `cwd?: string` (not `cwd?: string | undefined`). The implementation uses `opts?.cwd ?? process.cwd()` with optional chaining, not a non-null assertion, satisfying the biome `noNonNullAssertion` rule.

7. **CR-000.** The regex `/^CR-\d{3}$/` allows `CR-000`. This is intentional -- the format is structural, not semantic. If a review system never assigns ID 000, the command does not need to know that.

8. **Title that looks like a flag.** Commander's variadic argument `<title...>` consumes remaining tokens as positional arguments. `moe jig commit review-fix CR-001 --something` would have `--something` interpreted as a flag, not title text. Mitigation: Commander already handles this by parsing known flags first. Since `review-fix` declares no flags, unknown flags will cause a Commander error. This is acceptable -- the user can quote or escape if needed, and this is an unusual edge case. If it becomes a problem in practice, adding `--` passthrough support is a future enhancement, not a launch blocker.

---

### `moe jig iterations init`

#### Command signature

```
moe jig iterations init [--cwd <path>]
```

- No positional arguments. The scaffold is fixed -- there is no project name to customize.
- `--cwd <path>` (optional): Override the working directory. Defaults to `process.cwd()`. Used internally for testability (same pattern as `planInit` and `specInit`).
- No `--force` flag. If the directory already exists with content, the command refuses (see Validation).

#### Behavior

When invoked, the command executes these steps in order:

1. **Resolve the root directory.** Use `opts.cwd ?? process.cwd()` as the project root (same as `planInit`/`specInit` -- no git resolution needed, this is a docs-relative operation).
2. **Compute the target directory.** `join(root, "docs", "moe", "iterations")`.
3. **Check for existing state.** If `docs/moe/iterations/` already exists AND contains any `.md` file or a `requirements/` subdirectory, throw an error (see Validation). An empty directory is acceptable and is overwritten.
4. **Create the directory tree.** `mkdirSync(join(root, "docs", "moe", "iterations", "requirements"), { recursive: true })`. This creates both `docs/moe/iterations/` and `docs/moe/iterations/requirements/` in one call.
5. **Write skeleton files.** Write each of the four files below with their skeleton content. Use `writeFileSync` for each:

   | File | Path relative to root |
   |---|---|
   | Behavior scenarios | `docs/moe/iterations/behavior-scenarios.md` |
   | Behavior corpus | `docs/moe/iterations/behavior-corpus.md` |
   | Roadmap | `docs/moe/iterations/roadmap.md` |
   | Progress | `docs/moe/iterations/progress.md` |

6. **Print the directory path to stdout.** Print the absolute path to `docs/moe/iterations/` (the container directory, not individual files). This matches the pattern of `planInit`/`specInit` printing the created path.

##### Skeleton Contents

**`behavior-scenarios.md`:**
```markdown
# Behavior Scenarios

Reusable scenario cards with stable IDs. Each scenario describes an externally
observable behavior the product must exhibit.

<!-- Add scenarios as SCENARIO-NNNN cards during requirements extraction. -->
```

**`behavior-corpus.md`:**
```markdown
# Behavior Evidence Corpus

Execution index mapping scenarios to their evidence.

| Scenario ID | Seam | Cadence | Command | Status |
|---|---|---|---|---|
```

**`roadmap.md`:**
```markdown
# Iteration Roadmap

Ordered iteration plan produced by `scoping-the-simplest-core`.

## Iterations

<!-- ITER-0000 (walking skeleton) and follow-on iterations go here. -->
```

**`progress.md`:**
```markdown
# Progress

**Phase:** not started
**Task:** 0/0
**Iterations:** 0/0 done, 0 pending
**Sentinel corpus:** 0/0 passing
**Last event:** —
```

#### Validation

| Condition | Error message | Exit code |
|---|---|---|
| `docs/moe/iterations/` exists and contains any `.md` file or `requirements/` subdirectory | `docs/moe/iterations/ already has content — refusing to overwrite. Remove it first or resume with the existing state.` | 1 |

The error message is thrown as an `Error` (matching `planInit`/`specInit` pattern). The CLI `action` handler does not catch it; the top-level `main()` catch in `cli.ts` handles it by printing `err.message` to stderr and returning exit code 1.

No slug validation is needed (no positional argument). No git repo is required (this is a filesystem-only operation).

#### Output

**On success:**
- stdout: The absolute path to the created `docs/moe/iterations/` directory (single line, no trailing newline beyond what `console.log` adds).
- stderr: Nothing.

**On failure (directory has content):**
- stdout: Nothing.
- stderr: `docs/moe/iterations/ already has content — refusing to overwrite. Remove it first or resume with the existing state.`

#### Exit codes

| Code | Meaning |
|---|---|
| 0 | Scaffold created successfully |
| 1 | Validation failure (directory has content) or unexpected runtime error |

#### Source file

**File:** `packages/jig/src/scaffold.ts` (new file)

This matches the architecture diagram in the jig spec which lists `scaffold.ts` as the home for `iterations init`, `context init`, and `adr create`. Putting it in `plan.ts` would bloat a module whose pattern is "one skeleton template, one `Init` function." The scaffold module handles multi-file directory scaffolding, which is a different pattern.

**Exported function signature:**

```typescript
export function iterationsInit(opts?: { cwd?: string }): string
```

- **Parameters:** `opts` -- optional object with `cwd?: string`. Follows `exactOptionalPropertyTypes` -- the property is optional (may be absent), never explicitly `undefined`.
- **Returns:** `string` -- the absolute path to the created `docs/moe/iterations/` directory.
- **Throws:** `Error` if the directory already contains state files.

#### CLI wiring

Add a new subcommand group `iterations` to `cli.ts`, following the same structure as `plan` and `spec`:

```typescript
import { iterationsInit } from "./scaffold.js";

const iterations = program
  .command("iterations")
  .description("Scaffold and manage iteration state for iterative-development");

iterations
  .command("init")
  .description("Create docs/moe/iterations/ with the iterative-development directory structure")
  .action(() => {
    const path = iterationsInit();
    console.log(path);
  });
```

The `iterations` subcommand group is registered directly on `program` (not nested under another group), consistent with `plan` and `spec` being top-level subcommand groups.

#### Test cases

Test file: `packages/jig/test/scaffold.test.ts` (new file)

Tests use the same pattern as `plan.test.ts`: `mkdtempSync` for a temp directory, `beforeEach`/`afterEach` for setup/cleanup, dynamic `import()` for the module.

1. **"creates the full directory structure with all skeleton files"** -- Call `iterationsInit({ cwd: dir })`. Assert `docs/moe/iterations/requirements/` exists as a directory. Assert `behavior-scenarios.md`, `behavior-corpus.md`, `roadmap.md`, and `progress.md` all exist. Assert the return value matches `join(dir, "docs", "moe", "iterations")`.

2. **"writes correct skeleton content in behavior-scenarios.md"** -- Call `iterationsInit({ cwd: dir })`. Read `behavior-scenarios.md`. Assert it contains `# Behavior Scenarios` and `SCENARIO-NNNN`.

3. **"writes correct skeleton content in progress.md"** -- Call `iterationsInit({ cwd: dir })`. Read `progress.md`. Assert it contains `**Phase:** not started` and `**Iterations:** 0/0 done`.

4. **"refuses to overwrite when directory has existing content"** -- Call `iterationsInit({ cwd: dir })` once (succeeds). Call again. Assert it throws with `/already has content/`.

5. **"succeeds when docs/moe/iterations/ exists but is empty"** -- Create `docs/moe/iterations/` as an empty directory via `mkdirSync`. Call `iterationsInit({ cwd: dir })`. Assert it succeeds and all files are written.

#### Hook integration

**No new hook is needed.** There is no raw command to intercept. Unlike `git worktree add` (which models invoke directly and need to be blocked), there is no competing way to scaffold an iterations directory that a hook would need to redirect. Models either call `moe jig iterations init` or they create the files by hand -- and hand-creation is not harmful enough to warrant a hook (it just might get the structure wrong, which the skill can catch).

#### Edge cases

1. **Nested `docs/moe/` does not exist yet.** `mkdirSync` with `{ recursive: true }` handles this (same as `planInit`). No special handling needed.

2. **Running from a worktree.** The command uses `opts.cwd ?? process.cwd()` (not `resolvePrimaryRoot()`), so it writes relative to the current directory. This is correct -- iterations state lives in the worktree's own tree, not the primary checkout. This matches `planInit` and `specInit` behavior.

3. **Detecting "has content" accurately.** The check looks for any `.md` file OR a `requirements/` subdirectory in `docs/moe/iterations/`. It does NOT use `readdirSync` and check for non-empty (which would false-positive on `.DS_Store` or other OS junk files). Implementation: `existsSync(join(iterDir, "requirements"))` or `readdirSync(iterDir).some(f => f.endsWith(".md"))`.

4. **No date in filenames.** Unlike `planInit` (which produces `YYYY-MM-DD-<name>.md`), `iterationsInit` does not embed a date in any filename. The scaffolded files are living documents updated across the project lifetime, not point-in-time snapshots.

5. **`exactOptionalPropertyTypes` compliance.** The `opts` parameter defaults to `{}`. The `cwd` property is optional (may be absent). Never pass `{ cwd: undefined }` -- this violates the tsconfig constraint. The call site in `cli.ts` calls `iterationsInit()` with no argument (no cwd override from the CLI; Commander does not expose a `--cwd` flag, the option is for programmatic/test use only).

6. **The `--cwd` flag is not exposed on the CLI.** Consistent with `planInit` and `specInit`, the `cwd` option exists only on the function signature for test injection. The CLI action calls `iterationsInit()` with no arguments. If a future Tier 3 command needs cwd override from the CLI, it can be added then.

---

## Tier 3

### `moe jig context init`

#### Command signature

```
moe jig context init [name]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `name` | No | None | Context name used in the `# {name}` heading. When omitted, the heading is left as a placeholder `# {Context Name}`. |

**Flags:** None. The command takes no flags.

**Examples:**

```
moe jig context init
moe jig context init ordering
moe jig context init "Order Management"
```

#### Behavior

Step-by-step internal behavior:

1. Resolve the working root. Use `process.cwd()` (or `opts.cwd` when called programmatically, following the `planInit`/`specInit` pattern).
2. Compute the target path: `join(root, "CONTEXT.md")`. The file always goes at the root of the working directory (or the `cwd` option), per the domain-modeling skill's single-context rule.
3. Check whether `CONTEXT.md` already exists at that path. If it does, throw an error (see Validation below).
4. Determine the heading text. If `name` was provided, use it verbatim. If `name` was omitted, use the literal string `{Context Name}` as a placeholder.
5. Render the CONTEXT.md skeleton (see Output below) with the heading text substituted.
6. Write the file with `writeFileSync`.
7. Return the absolute path to the created file.

No git operations. No directory creation needed (the file goes at the root). No gitignore manipulation.

#### Validation

| Condition | Error message (exact) |
|---|---|
| `CONTEXT.md` already exists at the target path | `<absolute-path>/CONTEXT.md already exists — refusing to overwrite` |

The `name` argument is freeform text. No validation on its content -- it can contain spaces, hyphens, or any printable characters. An empty string `""` passed explicitly is treated as "no name" (uses the placeholder heading).

#### Output

**Skeleton written to `CONTEXT.md`:**

```md
# {heading}

{One or two sentence description of what this context is and why it exists.}

## Language

**Term**:
{Definition — one or two sentences. What it IS, not what it does.}
_Avoid_: {synonym1, synonym2}
```

Where `{heading}` is replaced by the `name` argument (or `{Context Name}` if omitted).

This skeleton matches the structure in `packages/core/skills/domain-modeling/CONTEXT-FORMAT.md`. It includes one example term entry as a template, not a real term. The placeholder text uses curly braces to make it obvious what needs replacing.

**stdout on success:** The absolute path to the created file (one line, no trailing newline beyond what `console.log` adds). This matches the pattern used by `planInit` and `specInit`.

**stderr on failure:** The error message from the thrown `Error`, printed by the CLI's catch handler in `cli.ts`.

#### Exit codes

| Code | Meaning |
|------|---------|
| 0 | File created successfully |
| 1 | File already exists, or any other runtime error (thrown Error caught by `main()` in cli.ts) |

#### Source file

**File:** `packages/jig/src/scaffold.ts` (shared with `iterationsInit` and `adrCreate`)

```typescript
export function contextInit(name?: string, opts?: { cwd?: string }): string
```

**Parameters:**
- `name` -- optional `string`. The context name for the heading. When `undefined` or empty string, the placeholder `{Context Name}` is used.
- `opts` -- optional object with optional `cwd: string`. Defaults to `process.cwd()` when not provided.

**Returns:** The absolute path to the created `CONTEXT.md` file.

**Throws:** `Error` with the message `<path> already exists — refusing to overwrite` when the file exists.

**Implementation notes:**
- Follow the same structural pattern as `planInit` in `src/plan.ts`: check existence with `existsSync`, write with `writeFileSync`, return the path.
- No `mkdirSync` needed -- the file goes directly at root, not in a subdirectory.
- The skeleton is a template string constant (like `PLAN_SKELETON` and `SPEC_SKELETON` in `plan.ts`), named `CONTEXT_SKELETON`.
- Since `name` is an optional parameter (not `name?: string | undefined`), respect `exactOptionalPropertyTypes`. The function signature uses `name?: string` which is correct -- callers omit it rather than passing `undefined`.
- No `!` postfix assertions (biome `noNonNullAssertion`).

#### CLI wiring

Add a new `context` subcommand group in `packages/jig/src/cli.ts`, following the pattern of `plan` and `spec`:

```typescript
import { contextInit } from "./scaffold.js";

const context = program
  .command("context")
  .description("Domain-modeling scaffolding");

context
  .command("init")
  .description("Create a CONTEXT.md with the domain-modeling skeleton")
  .argument("[name]", "context name for the heading (default: placeholder)")
  .action((name: string | undefined) => {
    const resolved = name && name.length > 0 ? name : undefined;
    const path = contextInit(resolved);
    console.log(path);
  });
```

The `[name]` argument uses square brackets (optional in Commander). Commander passes `undefined` when omitted. The action handler normalizes empty string to `undefined` before calling `contextInit`.

#### Test cases

All tests in `packages/jig/test/scaffold.test.ts`. Use the same temp-directory pattern as `test/plan.test.ts` (`mkdtempSync`, `beforeEach`/`afterEach` with `rmSync`).

1. **"creates CONTEXT.md at the root with a placeholder heading when no name is given"**
   - Call `contextInit(undefined, { cwd: dir })`.
   - Assert the returned path ends with `/CONTEXT.md`.
   - Assert `existsSync(path)` is true.
   - Assert the file content contains `# {Context Name}`.
   - Assert the file content contains `## Language`.

2. **"creates CONTEXT.md with the provided name in the heading"**
   - Call `contextInit("Ordering", { cwd: dir })`.
   - Assert the file content contains `# Ordering`.
   - Assert the file content does NOT contain `{Context Name}`.

3. **"refuses to overwrite an existing CONTEXT.md"**
   - Call `contextInit(undefined, { cwd: dir })` once.
   - Call it again and assert it throws with `/already exists/`.

4. **"writes skeleton matching the domain-modeling CONTEXT-FORMAT structure"**
   - Call `contextInit("Billing", { cwd: dir })`.
   - Assert the file content contains `## Language`.
   - Assert the file content contains `_Avoid_:`.
   - Assert the file content contains `**Term**:` (the template entry).

5. **"treats empty string name the same as omitted"**
   - Call `contextInit("", { cwd: dir })`.
   - Assert the file content contains `# {Context Name}`.

Additionally, update `packages/jig/test/cli.test.ts`:

6. **Update the existing "--help" test** to also assert `expect(out).toContain("context")`.

#### Hook integration

**No new hook needed.** There is no raw command to block -- `CONTEXT.md` creation is not something models do via a git command or a shell command that could be intercepted. Models just write files. The jig command provides the correct skeleton; there is no dangerous alternative to intercept.

#### Edge cases

1. **Multi-context repos.** The `context init` command always writes to `CONTEXT.md` at the working root. It does not create `CONTEXT-MAP.md` or write context files into subdirectories. The domain-modeling skill handles multi-context orchestration; `context init` is a single-context scaffold only. If `CONTEXT-MAP.md` already exists at the root, the command still writes `CONTEXT.md` at the root -- the multi-context layout is the skill's concern, not the jig's. This is a deliberate simplification for Tier 3.

2. **Worktree cwd.** When called from inside a worktree, `cwd` is the worktree's root, not the primary checkout's root. This is correct -- each worktree may have its own `CONTEXT.md`. The command does NOT resolve the primary root (unlike `worktreeCreate`). It writes relative to `cwd` only.

3. **No git requirement.** Unlike worktree commands, `context init` does not call any git operations. It works in non-git directories. This is intentional -- domain modeling applies to any project, not just git repos.

4. **File encoding.** Written as UTF-8 (Node's default for `writeFileSync` with string input). No BOM.

5. **Name with special characters.** Names like `"Order & Billing"` or `"Cafe System"` are written verbatim into the heading. The command does not slugify or sanitize the name -- it is a markdown heading, not a filename.

6. **Existing file at `CONTEXT.md` that is a directory.** `existsSync` returns true for directories too. If someone has a `CONTEXT.md/` directory, the overwrite guard catches it and refuses. The error message will say "already exists" which is accurate enough.

7. **The `exactOptionalPropertyTypes` constraint.** The `opts` parameter uses `{ cwd?: string }` -- never pass `{ cwd: undefined }`. The `name` parameter is a positional `string | undefined` from Commander, not an optional property, so the constraint does not apply to it directly. Inside the function, use `opts?.cwd ?? process.cwd()` (not `opts.cwd ?? ...` which would require a non-null assertion or a defined-check).

---

### `moe jig adr create`

#### Command signature

```
moe jig adr create <title> [--cwd <path>]
```

| Positional | Required | Description |
|---|---|---|
| `title` | Yes | Human-readable ADR title. Used in the filename slug and the document heading. Example: `"Use SQLite for local state"` |

| Flag | Required | Default | Description |
|---|---|---|---|
| `--cwd <path>` | No | `process.cwd()` | Root of the repository. Used in tests to point at a temp directory. Not advertised in `--help` (hidden option). |

The title is a free-form string. The command slugifies it for the filename (lowercase, spaces and non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens stripped).

#### Behavior

Step-by-step internal execution:

1. Resolve `root` as `opts.cwd ?? process.cwd()`.
2. Compute `adrDir` as `join(root, "docs", "adr")`.
3. Ensure `adrDir` exists (`mkdirSync(adrDir, { recursive: true })`).
4. Scan `adrDir` with `readdirSync` for files matching the pattern `^\d{4}-.*\.md$`.
5. Extract the numeric prefix from each matching filename. Parse as integer. Collect all numbers into an array.
6. Compute `nextNumber` as `Math.max(0, ...numbers) + 1`. If the directory is empty or has no matching files, `nextNumber` is `1`.
7. Slugify the title:
   - Convert to lowercase.
   - Replace any character that is not `a-z`, `0-9`, or `-` with `-`.
   - Collapse consecutive hyphens to a single hyphen.
   - Strip leading and trailing hyphens.
8. Format the filename as `NNNN-<slug>.md` where `NNNN` is `nextNumber` zero-padded to 4 digits.
9. Compute `filepath` as `join(adrDir, filename)`.
10. Check `existsSync(filepath)`. If true, throw with the "already exists" message (see Validation).
11. Write the ADR skeleton template (see below) to `filepath` using `writeFileSync`.
12. Return `filepath` (the absolute path to the created file).

**ADR skeleton template:**

```markdown
# NNNN. <title>

Date: YYYY-MM-DD

## Status

Proposed

## Context

## Decision

## Consequences
```

Where:
- `NNNN` is the zero-padded number (same as filename).
- `<title>` is the original (unslugified) title argument.
- `YYYY-MM-DD` is from `today()` (imported from `./util.js`).

#### Validation

| Condition | Error message (thrown as `Error`) |
|---|---|
| `title` is empty or whitespace-only | `"title is required — provide a short description of the decision"` |
| `title` slugifies to an empty string (e.g., all punctuation) | `"title must contain at least one alphanumeric character"` |
| Computed `filepath` already exists | `"<filepath> already exists — refusing to overwrite"` |

Commander enforces that `<title>` is provided (it is a required argument). If omitted, Commander prints its own usage error and `main()` returns exit code 1.

#### Output

**On success:**

Prints the absolute path of the created file to `stdout`, followed by a newline:

```
/absolute/path/to/docs/adr/0004-use-sqlite-for-local-state.md
```

Nothing is printed to `stderr` on success.

**On failure (validation errors):**

The error message is printed to `stderr` (by the `catch` block in `main()` in `cli.ts`). Nothing is printed to `stdout`.

#### Exit codes

| Code | Meaning |
|---|---|
| 0 | ADR file created successfully |
| 1 | Validation error (empty title, file exists, etc.) or unexpected error |

#### Source file

**File:** `packages/jig/src/scaffold.ts` (shared with `iterationsInit` and `contextInit`)

**Exported function signature:**

```typescript
export interface AdrCreateOpts {
  cwd?: string;
}

export function adrCreate(title: string, opts?: AdrCreateOpts): string
```

Parameters:
- `title: string` -- the human-readable ADR title.
- `opts?: AdrCreateOpts` -- optional bag. `cwd` overrides `process.cwd()`.

Returns: the absolute path to the created ADR file.

Throws: `Error` on validation failure.

**Internal helper (not exported):**

```typescript
function slugify(text: string): string
```

Kept module-private. Converts title to a filename-safe slug.

**Import from `./util.js`:** `today()` for the date stamp in the ADR body.

#### CLI wiring

In `packages/jig/src/cli.ts`, add a new subcommand group `adr` under `program`:

```typescript
import { adrCreate } from "./scaffold.js";

const adr = program
  .command("adr")
  .description("Architecture Decision Records");

adr
  .command("create")
  .description("Create the next-numbered ADR in docs/adr/")
  .argument("<title>", "short description of the decision")
  .action((title: string) => {
    const path = adrCreate(title);
    console.log(path);
  });
```

This follows the same pattern as the existing `worktree`, `plan`, and `spec` subcommand groups in `cli.ts`. The `--cwd` option is not wired into the CLI (it is a test-only parameter passed programmatically); the CLI action calls `adrCreate(title)` without `opts`, which defaults `cwd` to `process.cwd()`.

#### Test cases

All tests go in `packages/jig/test/scaffold.test.ts`. They use a temp directory (not a git repo -- `adrCreate` does not call git) created with `mkdtempSync` and cleaned up with `rmSync` in `afterEach`.

1. **"creates the first ADR as 0001 when docs/adr/ is empty"** -- Call `adrCreate("Use SQLite for local state", { cwd: dir })`. Assert the returned path ends with `docs/adr/0001-use-sqlite-for-local-state.md`. Assert `existsSync` returns true.

2. **"auto-detects the next number from existing ADR files"** -- Pre-create `docs/adr/0001-first.md` and `docs/adr/0003-third.md` (with any content) in the temp directory. Call `adrCreate("fourth decision", { cwd: dir })`. Assert the returned path ends with `0004-fourth-decision.md` (next after the highest existing, not gap-filling).

3. **"writes the ADR skeleton with correct number, title, and date"** -- Call `adrCreate("Adopt TypeScript", { cwd: dir })`. Read the file. Assert it contains `# 0001. Adopt TypeScript`, a `Date:` line matching `\d{4}-\d{2}-\d{2}`, `## Status`, `Proposed`, `## Context`, `## Decision`, `## Consequences`.

4. **"rejects an empty title"** -- Call `adrCreate("   ", { cwd: dir })`. Assert it throws with a message matching `/title is required/`.

5. **"slugifies titles with special characters and whitespace"** -- Call `adrCreate("Use C++ & Rust!  For Speed", { cwd: dir })`. Assert the filename slug portion is `use-c-rust-for-speed`.

#### Hook integration

**No new hook is needed.** There is no raw command that models use to create ADRs that needs blocking. ADRs are currently created by hand-writing files; there is no `git adr` or similar command to intercept. The jig command replaces prose instructions ("create a file in docs/adr/ with the next number") with a deterministic CLI call.

#### Edge cases

1. **No `docs/adr/` directory yet.** The command creates it with `mkdirSync(adrDir, { recursive: true })`. First ADR is numbered `0001`.

2. **Gaps in numbering.** If ADRs `0001`, `0003`, `0005` exist, the next is `0006` (max + 1), not `0002` (gap-fill). This matches standard ADR tooling behavior -- numbers are append-only, gaps are historical record.

3. **Non-ADR files in `docs/adr/`.** Files that do not match `^\d{4}-.*\.md$` (e.g., `README.md`, `.gitkeep`, `template.md`) are ignored by the scan.

4. **Number overflow.** Zero-padding is 4 digits. ADR `9999` is followed by `10000` (5 digits, no zero-padding truncation). `String(10000).padStart(4, "0")` produces `"10000"`, which is correct. No artificial cap.

5. **Title with only hyphens or punctuation.** `adrCreate("---!!!", { cwd: dir })` slugifies to an empty string after stripping. This is caught by validation: `"title must contain at least one alphanumeric character"`.

6. **Concurrent calls.** Two calls to `adrCreate` at the same moment could race on `readdirSync` and compute the same next number. The `existsSync` guard catches this -- the second call throws "already exists." This is acceptable for a CLI tool; distributed coordination is out of scope.

7. **`exactOptionalPropertyTypes` compliance.** The `AdrCreateOpts` interface uses `cwd?: string` (optional property, never explicitly set to `undefined`). The function signature uses `opts?: AdrCreateOpts` (the parameter itself is optional). This complies with the tsconfig constraint.

8. **`biome noNonNullAssertion` compliance.** The scan loop uses `parseInt(match[0], 10)` only after a successful regex match -- no `!` postfix. Array access from `readdirSync` is safe because it returns concrete strings. Use a guard like `const m = filename.match(...)` followed by `if (m !== null)` rather than `m!`.

---

### `moe jig progress update`

#### Command signature

```
moe jig progress update --phase <phase> --task <task> [--iterations <done/total>] [--sentinel <pass/total>] [--event <text>] [--cwd <path>]
```

| Flag | Required | Type | Default | Description |
|---|---|---|---|---|
| `--phase` | Yes | string | (none) | Current phase label, e.g. `"implementing ITER-0003"`, `"auditing ITER-0003"`, `"scoping ITER-0004"` |
| `--task` | Yes | string | (none) | Current task description, e.g. `"4/7 (CleanupPipeline integration)"` |
| `--iterations` | No | string | (none) | Iteration counts as `done/total`, e.g. `"3/18"`. If omitted, line is absent from output. |
| `--sentinel` | No | string | (none) | Sentinel corpus status as `pass/total`, e.g. `"10/10"`. If omitted, line is absent from output. |
| `--event` | No | string | (none) | Free-text description of the last event, e.g. `"Task 3 committed"`. If omitted, line is absent from output. |
| `--cwd` | No | string | `process.cwd()` | Working directory for resolving the project root (follows the same convention as `planInit`). |

#### Behavior

Step-by-step:

1. Resolve `cwd` (from `--cwd` or `process.cwd()`).
2. Compute the target path: `join(cwd, "docs", "moe", "iterations", "progress.md")`.
3. Validate all required flags are present (`--phase`, `--task`). If missing, throw with an actionable message.
4. Validate `--iterations` format if provided: must match the regex `^\d+\/\d+$`. Reject otherwise.
5. Validate `--sentinel` format if provided: must match the regex `^\d+\/\d+$`. Reject otherwise.
6. Build the progress file content as a string (see exact format below).
7. Ensure the parent directory `docs/moe/iterations/` exists (`mkdirSync` with `{ recursive: true }`).
8. **Overwrite** the file with `writeFileSync` (truncating write, not append). This is the entire point of the command: models append or mangle this file; the jig produces the correct format every time.
9. Print the absolute path to stdout.

#### Validation

| Condition | Error message |
|---|---|
| `--phase` missing | `"--phase is required (e.g. --phase 'implementing ITER-0003')"` |
| `--task` missing | `"--task is required (e.g. --task '4/7 (CleanupPipeline integration)')"` |
| `--iterations` present but not `N/N` format | `"--iterations must be in done/total format (e.g. '3/18'), got: <value>"` |
| `--sentinel` present but not `N/N` format | `"--sentinel must be in pass/total format (e.g. '10/10'), got: <value>"` |

All validation errors throw an `Error` from the library function. Commander surfaces them via the `catch` block in `main()` and exits non-zero.

#### Output

**File content written to `docs/moe/iterations/progress.md`** (exact format):

```markdown
# Progress

**Phase:** <phase>
**Task:** <task>
**Iterations:** <done>/<total> done, <remaining> pending
**Sentinel corpus:** <pass>/<total> passing
**Last event:** <ISO-8601-timestamp> — <event>
```

Rules:
- The `**Iterations:**` line is only present when `--iterations` is provided. When present, the command computes `remaining = total - done` and formats as `"3/18 done, 15 pending"`.
- The `**Sentinel corpus:**` line is only present when `--sentinel` is provided. Formatted as `"10/10 passing"`.
- The `**Last event:**` line is only present when `--event` is provided. The timestamp is `new Date().toISOString()` (UTC ISO-8601 to second precision, e.g. `2026-09-03T14:23:00.000Z`).
- The file always starts with `# Progress\n\n` and the `**Phase:**` and `**Task:**` lines.
- A trailing newline terminates the file.

**stdout on success:** the absolute path to the written file (one line).

**stderr on failure:** the error message from validation (one line), then Commander exits non-zero.

#### Exit codes

| Code | Meaning |
|---|---|
| 0 | File written successfully |
| 1 | Validation error (bad format, missing required flag), filesystem error, or unexpected exception |

#### Source file

**File:** `packages/jig/src/progress.ts` (new file)

This is a new module, not added to `plan.ts` or `scaffold.ts`. The progress command has no relationship to plan/spec init (those are one-shot scaffolding; this is a repeated overwrite). A dedicated module keeps the surface small and testable.

**Exported function signature:**

```typescript
export interface ProgressUpdateOpts {
  phase: string;
  task: string;
  iterations?: string;
  sentinel?: string;
  event?: string;
  cwd?: string;
}

export function progressUpdate(opts: ProgressUpdateOpts): string;
```

- **Parameters:** `opts` — all CLI flags mapped to properties. `phase` and `task` are required. The rest are optional (and because of `exactOptionalPropertyTypes: true`, they are simply omitted from the object, never set to `undefined`).
- **Returns:** The absolute path to the written `progress.md` file.
- **Throws:** `Error` on validation failure.

**Internal helper (not exported):**

```typescript
function validateFraction(value: string, flagName: string): { done: number; total: number };
```

Parses a `"N/N"` string, validates format, returns the parsed integers. Throws with the message from the validation table if invalid.

#### CLI wiring

In `packages/jig/src/cli.ts`:

1. Import: `import { progressUpdate } from "./progress.js";`
2. Add a new top-level subcommand group `progress` under `program`:

```typescript
const progress = program
  .command("progress")
  .description("Update the iterative-development progress snapshot");

progress
  .command("update")
  .description("Overwrite docs/moe/iterations/progress.md with current state")
  .requiredOption("--phase <phase>", "current phase (e.g. 'implementing ITER-0003')")
  .requiredOption("--task <task>", "current task (e.g. '4/7 (CleanupPipeline integration)')")
  .option("--iterations <done/total>", "iteration counts as done/total (e.g. '3/18')")
  .option("--sentinel <pass/total>", "sentinel corpus status as pass/total (e.g. '10/10')")
  .option("--event <text>", "last event description (e.g. 'Task 3 committed')")
  .action((opts: { phase: string; task: string; iterations?: string; sentinel?: string; event?: string }) => {
    const path = progressUpdate(opts);
    console.log(path);
  });
```

The `requiredOption` calls make Commander handle the "missing flag" case before `progressUpdate` is invoked. The library function still validates defensively.

#### Test cases

Test file: `packages/jig/test/progress.test.ts` (new file)

1. **"writes a progress file with all fields populated"** — Call `progressUpdate({ phase: "implementing ITER-0003", task: "4/7 (CleanupPipeline integration)", iterations: "3/18", sentinel: "10/10", event: "Task 3 committed", cwd: dir })`. Assert the file exists at `docs/moe/iterations/progress.md` under the temp dir. Assert content contains `**Phase:** implementing ITER-0003`, `**Task:** 4/7`, `**Iterations:** 3/18 done, 15 pending`, `**Sentinel corpus:** 10/10 passing`, and a `**Last event:**` line containing `Task 3 committed`. Assert the file starts with `# Progress`.

2. **"overwrites (not appends) on repeated calls"** — Call `progressUpdate` twice with different phases. Read the file. Assert it contains only the second phase, not the first. Assert the file contains exactly one `# Progress` heading.

3. **"omits optional lines when flags are absent"** — Call `progressUpdate({ phase: "scoping ITER-0001", task: "1/3 (skeleton)", cwd: dir })` with no `iterations`, `sentinel`, or `event`. Assert the file does NOT contain `**Iterations:**`, `**Sentinel corpus:**`, or `**Last event:**`.

4. **"rejects malformed --iterations format"** — Call `progressUpdate({ phase: "x", task: "y", iterations: "three of five", cwd: dir })`. Assert it throws with a message matching `--iterations must be in done/total format`.

5. **"creates the iterations directory if it does not exist"** — Call `progressUpdate` on a fresh temp dir with no `docs/moe/iterations/`. Assert the file is created (the directory was made automatically).

#### Hook integration

**No new PreToolUse hook is needed.** The progress file is not something models create with a raw command that should be blocked. The drift problem is not that models use the wrong tool (like `git worktree add` vs. `moe jig worktree create`) but that they use the right tool (Write/Edit) with the wrong format (append instead of overwrite, wrong markdown structure). A hook cannot distinguish a correct Write to `progress.md` from an incorrect one without parsing the content, which is fragile and out of scope for bash hooks.

#### Edge cases

1. **Concurrent writes from parallel workers.** The iterative-development orchestrator is single-threaded per project workspace. Two workers should never write progress.md for the same project simultaneously. If they do, the last write wins (truncating overwrite). This is acceptable: the file is a status snapshot, not an append log. No locking is needed.

2. **The `docs/moe/iterations/` directory does not exist yet.** The command creates it with `mkdirSync({ recursive: true })`. This means `progress update` can be called before `iterations init` (Tier 2) has run. This is intentional: the progress file is the lightest artifact in the iterations directory and should not require a full scaffold.

3. **Phase and task values containing shell metacharacters.** Commander handles quoting on the CLI side. The library function receives plain strings. The file content is markdown, so no escaping is needed — markdown does not execute embedded content. Values containing `"` or `\n` will render literally in the markdown, which is correct.

4. **The `--iterations` values where `done > total`.** The command does not reject this (e.g. `"20/18"` is accepted). The `remaining` calculation would produce a negative number. This is tolerable: the caller may have legitimate reasons (e.g. stretch stories added mid-project). Rejecting it would add a validation rule that the caller has to reason about. The format validation (`N/N`) is sufficient.

5. **Timestamp precision.** `new Date().toISOString()` produces millisecond precision (e.g. `2026-09-03T14:23:00.123Z`). The skill example shows second precision. The command uses whatever `toISOString()` produces. This is a cosmetic difference; no consumer parses the timestamp programmatically.

6. **The `exactOptionalPropertyTypes` constraint.** The `ProgressUpdateOpts` interface uses optional properties (`iterations?: string`) without explicit `undefined`. Commander's parsed options object will simply not have the keys when the flags are absent, which is exactly what `exactOptionalPropertyTypes` requires. The implementation checks `opts.iterations !== undefined` rather than `"iterations" in opts` for clarity, but either works because the property is never explicitly set to `undefined`.

7. **File encoding.** `writeFileSync` uses UTF-8 by default (the `encoding` parameter defaults to `'utf8'` for string data). The progress file is ASCII-safe, so encoding is not a concern in practice, but the implementation should pass `"utf-8"` explicitly for consistency with the other jig modules.

---

## Shared patterns

### CR-ID validation

Both `reviewStamp` and `commitReviewFix` validate CR-IDs against the same
pattern `^CR-\d{3}$` and produce the same error message. Extract a shared
constant and validation helper:

```typescript
// review.ts (module-level)
const CR_ID_PATTERN = /^CR-\d{3}$/;

function validateCrId(crId: string): void {
  if (!CR_ID_PATTERN.test(crId)) {
    throw new Error(
      `Invalid CR-ID "${crId}". Expected format: CR-### (e.g. CR-012).`,
    );
  }
}
```

Both exported functions call `validateCrId(crId)` as their first step. The
pattern and message are defined once, not twice.

### `gitIn` and `primaryRoot` consolidation

The `worktree.ts` module defines private `gitIn(cwd, ...args)` and
`primaryRoot(cwd)` helpers. The `review.ts` module needs both for `reviewStamp`.
Rather than duplicating them, consolidate into `util.ts`:

```typescript
// util.ts — new exports
export function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

export function primaryRoot(cwd: string): string {
  const commonDir = gitIn(cwd, "rev-parse", "--git-common-dir");
  const resolved = resolve(cwd, commonDir, "..");
  return gitIn(resolved, "rev-parse", "--show-toplevel");
}
```

Update `worktree.ts` to import `gitIn` and `primaryRoot` from `./util.js`
instead of defining them locally. The existing `git()` (no cwd) and
`resolvePrimaryRoot()` (no cwd) remain for backward compat but could be
deprecated in a follow-up.

This refactor is a **prerequisite task** -- it must land before `review.ts` is
written, so that both `worktree.ts` and `review.ts` share the same helpers.

### `exactOptionalPropertyTypes` pattern

Every opts interface in the new code uses `cwd?: string` (never
`cwd?: string | undefined`). Implementations use `opts?.cwd ?? process.cwd()`
with optional chaining on the opts parameter itself (which may also be
`undefined` when the entire parameter is optional). Never pass
`{ cwd: undefined }` in tests or call sites. This pattern is already
established in `worktree.ts` and `plan.ts`; the new modules follow it.

### Test helper patterns

Two test patterns are needed:

1. **Temp git repo** (for `review.test.ts`) -- matches the existing pattern in
   `worktree.test.ts`: `mkdtempSync`, `realpathSync`, `gitIn` to init and make
   commits, `afterEach` with `rmSync`. The `makeRepo()` helper can be extracted
   if both test files need it, but keeping it inline in each test file is also
   acceptable (the existing `worktree.test.ts` does not export one).

2. **Temp directory** (for `scaffold.test.ts` and `progress.test.ts`) -- matches
   the existing pattern in `plan.test.ts`: `mkdtempSync`, `afterEach` with
   `rmSync`. No git init needed since these commands do not call git.

### `today()` reuse

The `adrCreate` command needs the `today()` helper from `util.ts` to stamp the
ADR date. This is already exported and used by `planInit`. No changes needed.

### New source files

| File | Contents | Tier |
|---|---|---|
| `packages/jig/src/review.ts` | `reviewStamp`, `commitReviewFix`, shared `CR_ID_PATTERN` and `validateCrId` | 2 |
| `packages/jig/src/scaffold.ts` | `iterationsInit`, `contextInit`, `adrCreate`, private `slugify` | 2 + 3 |
| `packages/jig/src/progress.ts` | `progressUpdate`, private `validateFraction` | 3 |

### New test files

| File | Covers |
|---|---|
| `packages/jig/test/review.test.ts` | `reviewStamp`, `commitReviewFix` |
| `packages/jig/test/scaffold.test.ts` | `iterationsInit`, `contextInit`, `adrCreate` |
| `packages/jig/test/progress.test.ts` | `progressUpdate` |

### CLI subcommand groups added to `cli.ts`

| Group | Commands | Import from |
|---|---|---|
| `review` | `stamp` | `./review.js` |
| `commit` | `review-fix` | `./review.js` |
| `iterations` | `init` | `./scaffold.js` |
| `context` | `init` | `./scaffold.js` |
| `adr` | `create` | `./scaffold.js` |
| `progress` | `update` | `./progress.js` |

---

## Implementation order

### Phase 0: Prerequisite refactor

**Task: Extract `gitIn` and `primaryRoot` into `util.ts`.**

Move the private `gitIn(cwd, ...args)` and `primaryRoot(cwd)` from
`worktree.ts` into `util.ts` as public exports. Update `worktree.ts` to import
from `./util.js`. Run `pnpm check` to confirm nothing breaks.

This must land before any Tier 2 review command, because `reviewStamp` imports
these helpers from `util.ts`.

### Phase 1: Tier 2 commands

Build these in order:

1. **`review.ts` + `reviewStamp`** -- Depends on Phase 0 (uses `gitIn`,
   `primaryRoot`). No other internal dependencies. Add the `review` CLI group
   and `stamp` subcommand to `cli.ts`.

2. **`commitReviewFix`** -- Same file as `reviewStamp`. Shares `CR_ID_PATTERN`.
   Add the `commit` CLI group and `review-fix` subcommand. Can be implemented
   immediately after (or alongside) `reviewStamp` since they share a module.

3. **`scaffold.ts` + `iterationsInit`** -- No dependency on `review.ts`. Pure
   filesystem operation. Add the `iterations` CLI group and `init` subcommand.
   Creates the `scaffold.ts` module that Tier 3 commands will also use.

**Why this order:** `reviewStamp` and `commitReviewFix` are the most constrained
(they interact with git and must match the hook's format contract). Getting them
right first validates the `util.ts` refactor. `iterationsInit` is simpler (pure
filesystem) and creates the file that Tier 3 scaffold commands will join.

### Phase 2: Tier 3 commands

Build these in any order (no inter-dependencies), but a natural sequence is:

4. **`contextInit`** -- Added to the existing `scaffold.ts`. Simplest of the
   three: one file, no numbering, no directory scan.

5. **`adrCreate`** -- Added to `scaffold.ts`. Uses `today()` from util, adds
   `slugify` helper and directory scanning. Slightly more complex than
   `contextInit`.

6. **`progressUpdate`** -- New file `progress.ts`. Different pattern
   (overwrite vs. create-once). Independent module.

**Why this order:** `contextInit` is trivial and validates the `scaffold.ts`
multi-function pattern. `adrCreate` adds the slugify and auto-numbering
complexity. `progressUpdate` is a standalone module with no shared-file
coordination, so it can slot in anywhere.

### Phase 3: Test and CLI wiring

Tests can be written alongside each command (TDD or immediately after). The
`cli.test.ts` file needs one update: assert that `--help` output includes all
six new subcommand groups (`review`, `commit`, `iterations`, `context`, `adr`,
`progress`).

### Gate

Run `pnpm check` and `pnpm mint:check` before any MR. The new commands do not
affect mint output (no new hooks or marketplace entries), but `mint:check`
confirms nothing was accidentally modified.

---

## Skill text updates

Each skill listed below should receive a one-line pointer to the relevant jig
command. These updates follow the same pattern established during Tier 1: the
command ships first, the skill reference follows. All updates are
documentation-only changes (no code, no hook, no test).

| Skill | File | Update |
|---|---|---|
| `fixing-a-code-review` | `packages/core/skills/fixing-a-code-review/SKILL.md` | Add a line in the "Per finding" loop section: "Create the stamp commit with `moe jig review stamp <CR-ID> <fixing-sha>`. The command validates the CR-ID format, confirms the fixing commit is on the current branch, and produces the correctly formatted empty commit." |
| `receiving-code-review` | `packages/core/skills/receiving-code-review/SKILL.md` | Add a line referencing `moe jig review stamp` as the canonical way to produce stamp commits. Add a note that `moe jig commit review-fix <CR-ID> <title>` is available for committing staged review fixes with the correct message format. |
| `iterative-development` | `packages/core/skills/iterative-development/SKILL.md` | **Bootstrap section:** Add "If no state exists, call `moe jig iterations init` to scaffold the directory, then proceed with requirements extraction." **Progress section (lines 146-158):** Replace the prose "Write `docs/moe/iterations/progress.md`" with "Call `moe jig progress update` at each phase transition" plus a usage example, retaining the "overwrite, not append" guidance and adding a fallback note: "If `moe-jig` is not on PATH, write the file manually using the exact format above." |
| `running-an-iteration` | `packages/core/skills/running-an-iteration/SKILL.md` | Add a note in the task-completion section: "After each task commit, update the progress snapshot with `moe jig progress update --phase ... --task ... --iterations ... --event ...`" |
| `domain-modeling` | `packages/core/skills/domain-modeling/SKILL.md` | In the "File structure" or "During the session" section, add: "To scaffold a new `CONTEXT.md`, run `moe jig context init [name]`. The command writes the correct skeleton; you fill in terms as they crystallise." In the ADR-related prose (near line 40), add: "Call `moe jig adr create <title>` to create the next-numbered ADR." |
| `improve-codebase-architecture` | `packages/core/skills/improve-codebase-architecture/SKILL.md` | Near line 73 where it says "Create the file lazily if it doesn't exist," add: "Use `moe jig context init [name]` to create it with the correct skeleton." |
| `scoping-the-simplest-core` | `packages/core/skills/scoping-the-simplest-core/SKILL.md` | If the skill references creating the iterations directory or roadmap, add: "Call `moe jig iterations init` to scaffold the directory structure." |
| `auditing-progress` | `packages/core/skills/auditing-progress/SKILL.md` | If the skill reads or validates `progress.md`, add a note: "The canonical producer is `moe jig progress update`. If the file format looks wrong, re-run the jig command rather than patching by hand." |

**Multi-harness fallback pattern:** Every skill update that references a jig
command should include the fallback note: "If `moe-jig` is not on PATH, write
the file manually using the exact format above." This ensures non-Claude-Code
harnesses (which may not have jig installed) can still follow the skill by
writing files directly. The jig is the recommended path; prose is the degraded
fallback.
