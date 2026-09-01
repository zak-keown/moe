# Codebase review — adequate verification gate — 2026-09-01

## Deployment decision

Adequate for the current march to deployment, by Zak's explicit decision. This
is not a claim that the full `--verify` set completed.

## Live review run

- Recorded base: `9fc0325697243cf2bd96e9c15bb2822ca01e8d16`
- Depth: `shallow`
- Reviewers: 19 independent shard agents, continuously bounded at 8 concurrent
- Selected denominator: 407 files
- Opened: 407 of 407 selected files
- Raw merge: 100 findings — 6 critical, 30 high, 54 medium, 10 low
- Raw report state: `verified: false`

The raw pre-repair report and all shard inputs/reports remain available in the
self-ignoring `.moe/review-shards/` workspace. They are runtime evidence rather
than source and were not deleted.

## Adequate-verification wave

One independent `verify-finding` challenger was dispatched for each of the
first eight serious IDs. All eight attempted refutation against the recorded
base; all eight returned `confirmed`:

| Finding | Result |
|---|---|
| `CR-001` — Effective config API exposes credentials embedded in proxy URLs | confirmed |
| `CR-002` — Fanout uses an untrusted model-generated card ID as a write path | confirmed |
| `CR-003` — The daemon exposes an unauthenticated agent-control API on all interfaces | confirmed |
| `CR-004` — Failed credential lookups bypass transcript redaction | confirmed |
| `CR-005` — Repository-controlled output symlinks can redirect scope writes outside the checkout | confirmed |
| `CR-006` — Tracked source symlinks can make a review exfiltrate files outside the repository | confirmed |
| `CR-007` — Installed tmux is reported as missing | confirmed |
| `CR-008` — Missing uv falls through to executing the proof directory with Node | confirmed |

The remaining 28 critical/high findings, `CR-009` through `CR-036`, are
explicitly unverified. No report or ledger says otherwise.

## Orchestration defects exposed and repaired

The live run found defects in the review workflow itself. The repaired contract
now:

- stores restartable shard work under self-ignoring `.moe/review-shards/`;
- refuses dirty tracked source before scoping or merging;
- records a full base SHA and requires every shard to report the same SHA and
  exact opened-file count;
- excludes generated `/plugins/` mirrors and tracked source symlinks;
- refuses symlinked output paths and uses no-follow writes for shard artifacts;
- rejects fieldless finding headings rather than silently omitting them;
- requires path plus stable symbol/test/quoted anchors, never line numbers;
- rejects a bare `--verified` assertion; only a complete, base-matched
  challenger ledger can produce `verified: true`;
- validates confirmation, demotion, refutation, and unproven verdicts while
  preserving stable finding IDs.

The focused "codebase review scripts behavior" suite now passes 36 cases.

## Deferred completion

A later review must start from a clean post-repair commit, rerun all shards with
the new provenance/anchor contract, challenge every critical/high finding, and
feed the complete verdict ledger back into `review-merge`. That event remains
open; this adequate gate does not counterfeit it.
