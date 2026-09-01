> **Superseded 2026-09-01.** Every branch this document names has been merged and
> deleted. It is kept as a point-in-time record of that run, so its "Ready to
> merge" and "Iterate" sections describe branches that no longer exist — do not
> try to check them out. For final state see `.planning/backlog/WAVES.md`.

## Base
Base: main@98019e9ee796c8b01d34eb68fa7b99558e79da43 — planned 1 ready items, 0 in-branch, 0 merged.

## Ready to execute

### contributing-flow-docs

Summary: Land a three-file onboarding set — `CONTRIBUTING.md` (human narrative), `AGENTS.md` (harness-neutral rules), and a two-line `CLAUDE.md` that imports it — plus a link row in `README.md`, so the actual Moe contributor flow is written down where humans and agent harnesses both find it at session start.

Approach: Execute option 3 in a single pass — both `DO-NOW-1` and `DO-NOW-3` have already merged, so the two-pass split the backlog assumed is moot. Write `CONTRIBUTING.md` with four sections (Setup, Inner loop, Repo law, Import contract) naming every root script and enumerating the invisible conventions; write `AGENTS.md` as the same rules stripped to imperatives, under 200 lines; write a two-line `CLAUDE.md` that imports `AGENTS.md`; add a link row to `README.md`'s status/links table under `## Status`. Then run every fenced command against a fresh clone in the scratchpad and paste real exit codes; do not touch `.gitignore`, MR templates, `CODEOWNERS`, or git-hooks — those sit outside this doc's Scope.

Files (write):
- /Users/zakkeown/Code/tools/moe/CONTRIBUTING.md
- /Users/zakkeown/Code/tools/moe/AGENTS.md
- /Users/zakkeown/Code/tools/moe/CLAUDE.md
- /Users/zakkeown/Code/tools/moe/README.md

Contended files:
- /Users/zakkeown/Code/tools/moe/README.md — Unguarded prose per WAVES.md 'Unguarded but inconsequential' table. No test asserts anything about its contents; the one silent failure mode is a stale line-numbered citation surviving a merge — mitigation is the cite-by-name rule from WAVES.md, not serialisation. Not contended with any Wave 4 item (there are no others).

Gates:
```bash
git ls-files CONTRIBUTING.md AGENTS.md CLAUDE.md | wc -l  # expect 3
pnpm install --frozen-lockfile
pnpm check
pnpm mint:check
pnpm tab:test
pnpm tab:test:bindings
pnpm proof:test
node -e 'const s=Object.keys(require("./package.json").scripts);const md=require("fs").readFileSync("CONTRIBUTING.md","utf8");const missing=[...md.matchAll(/pnpm ([a-z:-]+)/g)].map(m=>m[1]).filter(x=>!s.includes(x)&&!x.startsWith("--"));if(missing.length){console.error("stale pnpm script names in CONTRIBUTING.md:",missing);process.exit(1)}'
grep -q '@AGENTS.md' CLAUDE.md  # AGENTS.md is imported, not duplicated
wc -l AGENTS.md  # under 200 lines per Claude Code memory-file guidance
In a Claude Code session at the repo root, `/context` lists CLAUDE.md under Memory files
```

Drift:
- `mint` | `echo … && exit 1` (`package.json:16`) → `package.json:16` is now `"mint": "turbo run mint:generate"`. DO-NOW-3 landed. Root also carries `mint:check`, `mint:generate`, and `provenance` scripts not in the doc's inventory.
- `/plugins/` is gitignored (`.gitignore:18`) and absent → `/plugins/` is deliberately TRACKED. `.gitignore:17-23` is a NOTE explaining why. All six plugin directories exist under `/plugins/`.
- `.claude-plugin/marketplace.json` already points six plugins at paths that do not resolve → All six referenced plugin directories exist; the marketplace resolves.
- `.gitignore:27` ignores all of `.claude/` → The `.claude/` ignore line is `.gitignore:32`; line 27 is `.env`.
- `.gitignore:25-26` names the `git add -A` safety explicitly → The `git add -A` safety comment is at `.gitignore:30-31`.
- `ARCHITECTURE.md:230` — cargo PATH export → That export sits at `ARCHITECTURE.md:332`; every sibling citation `:196` / `:202-213` / `:232-234` / `:238-244` is off by ~90-100 lines.
- `PARITY.md:178-182` — `pnpm tab:test:bindings` verifies the C ABI rename → Now at `PARITY.md:265-268`; related `:188-200` and `:222-229` citations are at `:274-283` and roughly `:310-316`.
- `packages/core`, `packages/memory`, `packages/flight` on `main` are stubs → All three are merged on main; per-file line citations in `packages/core/README.md` are stale (the 'conflict with every other concurrent import' quote now lives at `:776`).
- `.gitlab-ci.yml:47-50` runs `pnpm build` as its own stage → Still correct, but three new jobs (`plugins`, `provenance`, provenance self-test) exist and CONTRIBUTING should describe them.
- `README.md:39-42` — `/plugins/` is generated, never hand-edited → `README.md:39-42` is now the `@bubstack` scope note; the 'never hand-edit' rule sits in the two-rules block at `README.md:58-65`.
- 'Every DO-NOW is done … nothing is gated any more' → Consistent with the tree; the backlog item's `depends_on` and 'two passes' Effort table are moot. Do the doc in one pass.

Lens verdicts: correctness: risky · integration-risk: safe

Open concerns:
- (correctness, medium) Windows/WSL2 audience is missing from Setup. Recent commit 2db1f05 establishes ~50% of contributors are on Windows and ARCHITECTURE.md §6 has a dedicated 'Windows: WSL2' subsection; the plan enumerates only the macOS cargo PATH fix. Add a Windows/WSL2 subsection derived from ARCHITECTURE.md §6 (run-hook.cmd's diagnostic, `.gitattributes` LF pin, WSL2 tmux availability).
- (correctness, medium) `wc -l AGENTS.md  # under 200 lines` is informational only — `wc -l` always exits 0. Replace with `test $(wc -l < AGENTS.md) -lt 200` (or an `awk` equivalent) so exceeding the budget fails the gate.
- (integration-risk, medium) The `node -e` stale-script scanner regex `/pnpm ([a-z:-]+)/g` will capture `run` from `pnpm --filter … run test` prose; `run` isn't in `scripts` keys, so the gate false-positives. Extend the exclusion list with `['run','install','add','remove','exec','dlx','create','why']` or narrow the regex.

## Blocked

_None._

## In-branch (skipped)

_None._

## Merged (skipped)

_None._

## Integration reminders
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
