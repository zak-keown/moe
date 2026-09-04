# Fixture: goal-backward verification

A concrete scenario for the section of the same name in `../SKILL.md`. The
failure mode this fixture demonstrates is the one a green test suite cannot
see: every step of the plan passed its own tests, no step's evidence was
the goal, and the finished stack does not do the thing.

## Situation

The user asked for one thing: **"Add an Export CSV button that downloads
today's rows."**

The plan has four steps:

1. Add a `/export` API endpoint that returns a CSV of today's rows.
2. Add an `<button>Export CSV</button>` to the toolbar.
3. Wire the button's click handler to `fetch('/export')`.
4. Trigger a download from the returned blob.

## The local-checks-only walk (the failure)

Step 1 lands. Unit test: `GET /export` returns HTTP 200 and a CSV body
with today's rows. Green.

Step 2 lands. Snapshot test: toolbar renders with the new button. Green.

Step 3 lands. Unit test: clicking the button calls `fetch('/export')`.
Green. Component test spies on `fetch` and asserts one call.

Step 4 lands. Unit test: the download helper is called with a blob.
Green.

Every step's own test passes. Suite is 100% green. Assistant says
"tests pass, export button is working" and moves on.

**The user opens the page, clicks Export, and nothing downloads.** The
blob URL was constructed but never anchored to a synthetic `<a>` and
`click()`ed — the download helper was a stub the tests injected, and
the real one was never wired in.

Every local check told the truth. None of them was aimed at the goal.

## The goal-backward walk (the fix)

Step 0, before any of the above:

- **Goal sentence:** "Clicking Export in the running app downloads a
  CSV file with today's rows."
- **Goal observation:** A file appears in the browser's Downloads folder
  after the click, and opening it shows today's rows.
- **Goal command:** Start the app; click the button; check Downloads.
  If that isn't automatable yet, an end-to-end test that drives a real
  browser and asserts on the download event is the substitute.

Now every step of the plan carries two kinds of evidence: the unit-level
check that catches regressions in the piece it just built, and — reserved
for the last step or the review — the goal observation that proves the
sentence.

The four unit tests still run and still matter. They catch the
regressions the goal observation cannot see (a change six months from now
that breaks the CSV format silently). But nobody would have said "tests
pass, export button is working" without the download actually happening.

## What this fixture is for

`SKILL.md`'s "Goal-Backward Verification" section names three failure
modes; this file is the smallest concrete scenario where all three land
in one story:

1. **Proxy evidence.** "fetch was called" was measured; "file was
   downloaded" was the goal.
2. **Component-level completeness.** Every component's test passed and
   the stack still failed, because integration lived only in the wiring
   the tests stubbed away.
3. **Assistant-visible pattern.** A completion claim ("tests pass,
   feature working") that no evidence in the conversation actually
   supports. This is what `hooks/moe-completion-evidence` writes into
   `.audit/<session>-<turn>.json` and warns about — the assistant
   claiming completion while nothing in the transcript ran a command
   that could produce the goal observation.
