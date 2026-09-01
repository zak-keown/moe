---
slug: native-renderers
title: Native Renderers For Human-Facing Skill Output
idea: |
  - Native renderers - Have skills use the actual harness tooling where available, rather than pure text; include Claude's artifact-design skill if present
status: done
size: L
estimate: 7-10 h
depends_on: [DO-NOW-1, DO-NOW-2, DO-NOW-3]
blocks: []
conflicts_with: [moe-tone-and-branding, runtime-pruning, tiered-workflow-naming, gsd-core-skill-import, tc-standards-conformance]
touches: [packages/core/skills/brainstorming/, packages/core/skills/writing-plans/SKILL.md, packages/core/skills/finding-duplicate-functions/SKILL.md, packages/core/skills/using-moe/SKILL.md, packages/core/skills/using-moe/references/, packages/core/skills/_shared/, packages/core/test/metadata.test.ts]
decision_needed: no
---

# Native Renderers For Human-Facing Skill Output

## Acceptance update (2026-09-01)

The complete companion suite passes 130 checks across WebSocket framing,
reconnection, browser launch routing, authentication, file serving, event
persistence, lifecycle, and Windows-like shell start/stop behavior. Zak then
reviewed live companion output for `brainstorming`, `writing-plans`, and
`finding-duplicate-functions`; all three recorded an explicit pass click. A
Claude Code probe with `CLAUDE_CODE_DISABLE_ARTIFACT=1` chose rung 2 instead of
stalling and kept artifact sharing private. The run exposed two instruction
defects—a Codex launch that relied on `CODEX_CI` surviving escalation and a
malformed Copilot command—both repaired and guarded by the "keeps persistent
harness launch recipes executable" test. The full record is in
`.planning/backlog-acceptance-2026-09-01.md`.

## The idea

> Native renderers - Have skills use the actual harness tooling where available, rather than pure text; include Claude's artifact-design skill if present

Three Moe core skills end by handing a human a markdown file to read. Moe already
owns a better renderer for two of them — the brainstorming browser companion — and
Claude Code can additionally publish an org-private page at a URL. This item
generalises the renderer Moe has, adds the URL rung beside it, and makes every
rung degrade cleanly. It does **not** build a new server; the server exists.

## Debate-review decisions (2026-08-31)

- **One wave collision to note.** Step 5 mirrors the `MOE_LATTE_ENABLED` pattern
  — a `MOE_*` env var, default-off, asserted in `metadata.test.ts`.
  `verification-split-and-firing-rate` Part A does the same for its hook, and
  both items extend `metadata.test.ts`. Same file, so they cannot share a wave;
  no design conflict.
- Nothing else in this item changes.

## Why it matters

Moe's skills are already Claude-native, not lowest-common-denominator. Two
mechanisms ship today:

1. `packages/core/skills/using-moe/SKILL.md:58-68` — a "Platform Adaptation"
   section routing seven non-Claude harnesses to translation files under
   `references/`: Kimi maps `TodoWrite` → `TodoList`
   (`references/kimi-tools.md:15-24`), Antigravity turns a todo list into a
   `write_to_file` task artifact (`references/antigravity-tools.md:8-20`), Pi
   falls back to `TODO.md` (`references/pi-tools.md:16`). There is deliberately
   **no `claude-code-tools.md`** — Claude Code is the baseline dialect and the
   others translate away from it.
2. `packages/core/skills/brainstorming/visual-companion.md` (299 lines) plus
   `brainstorming/scripts/server.cjs` — a zero-dependency local HTTP + WebSocket
   server that serves HTML screens to the user's browser and records their clicks
   to `$STATE_DIR/events`.

So the gap is narrow: that vocabulary stops at `TodoWrite` / `AskUserQuestion` /
`Task` and never learned the Artifact tool, and the one rich renderer Moe owns is
locked inside a single skill. For ~20 people in one company the payoff of adding
the URL rung is distribution Moe cannot otherwise build: an artifact is "visible
only to authenticated members of the publishing organization" unless explicitly
shared, public sharing is off by default on Team and Enterprise plans,
publish/share/delete land in the org audit log as `claude_artifact_*` events, and
an Owner can set retention ([artifacts docs](https://code.claude.com/docs/en/artifacts)).

## House rule (decided 2026-08-31, Zak)

**Graceful fallback: use these features if they are installed and configured.**
Nothing gates on capability detection up front; every renderer is a rung on a
ladder whose bottom rung always works.

| Rung | Requires | Gives |
|---|---|---|
| Publish an artifact | Claude Code ≥ 2.1.183, `/login` claude.ai session, Pro/Max/Team/Enterprise, Anthropic API provider, no CMEK/HIPAA/ZDR | Org-visible URL, comments, audit log, retention |
| Browser companion | A local process that survives turns, and a browser | Real click-to-select loop feeding `$STATE_DIR/events` back into the next turn |
| Local HTML file | Nothing | Something to open |
| Markdown file | Nothing | The committed record |

The bottom two rungs are unconditional, so no skill ever stalls. The Artifact
tool degrades itself into rung 3 already: "When one is not met, Claude writes a
local HTML file or says it cannot publish instead" (artifacts docs).

## Current state

Read the core skills in worktree `.claude/worktrees/wf_238bb49d-362-13`
(`import/packages-core`); `packages/core` on `main` is a stub.

**Census of core skills producing a human-facing artifact:**

| Skill | Human-facing output today | Tier | Candidate |
|---|---|---|---|
| `brainstorming` | spec to `docs/moe/specs/…-design.md` (`SKILL.md:100,206`), human reviews it (`:222-226`); plus the companion (`:235-250`) | core | **Yes — already has the renderer** |
| `writing-plans` | plan to `docs/moe/plans/…md` (`SKILL.md:18,157`), `- [ ]` steps tracked during execution (`:61,98`) | core | **Yes** |
| `finding-duplicate-functions` | `generate-report.sh` writes `duplicates-report.md`, then "Phase 6: Human Review" (`SKILL.md:86-96`) | everything | **Yes — smallest** |
| `requesting-code-review` | findings return to the *coordinator agent* (`SKILL.md:42-46,79`) | core | No — agent-to-agent |
| `receiving-code-review` | consumes those findings in-session | core | No — agent-to-agent |
| `auditing-progress` | "Return the audit result … to the orchestrator" (`SKILL.md:58-60`) | everything | No — agent-to-agent |

Tiers from `packages/core/skill-tiers.yaml` (a proposal, `:5-6`).

**mint cannot gate content per harness — and it is the wrong layer, not a missing
feature.** `packages/mint/src/adapters/types.ts:4-13` defines `SupportLevel` /
`ComponentSupport`, but its columns are `skills | commands | agents | hooks | mcp
| bootstrap` — component *kinds*, not runtime capabilities. More decisively, mint
never reads skill bodies: `SkillRef` is `{ name, dir, description }`
(`packages/mint/src/model.ts:6-10,39-54`), and `generate(root, adapterList, opts)`
emits manifests **in place** into the one plugin root (`generate.ts:62-69`) —
source tree is output tree (`packages/core/moe-mint.yaml:9-11`). Per-harness
config accepts exactly `hooks` and `manifest` (`config.ts:50-53`);
`harnesses.exclude` drops whole adapters (`config.ts:157-162`). The ladder above
is therefore expressed in skill prose, guarded by
`test/metadata.test.ts:606-607`, which already asserts `using-moe/SKILL.md` names
every file in `references/` and no others.

**"Include artifact-design if present" — settled both ways.** Not vendorable:
`artifact-design`, `artifact-diagramming`, `artifact-capabilities` and `dataviz`
have no files anywhere on this machine (searched `~/.claude`, `/Applications`,
both global `node_modules` roots; CLI 2.1.251) — harness-delivered, nothing to
copy, so the license question never arises. Not necessary: "Claude applies a
built-in design skill when it builds an artifact… without extra prompting… That
skill also looks for an existing design system in your project before choosing
its own" (artifacts docs). The residue — record Moe's design tokens where Claude
looks — is `moe-tone-and-branding`'s.

**Naming:** all of the above is `~/Code/moe`, the Superpowers fork.
`~/.claude/skills/` on this machine holds 67 entries, almost all `moe-*` skills
from a *different* Moe (`~/.claude/moe-core` / `~/Code/tools/moe`) — none of them
the 27 skills here.

## Windows is a first-class target, and the server already handles it

Most of the platform matrix is built and tested, not hypothetical:

- **Port selection and lifecycle.** `brainstorming/scripts/server.cjs:87-95`
  prefers an explicit port, else the port this session last bound, else a random
  high port; `:644-694` falls back to a random port once when the preferred one is
  taken, and refuses the fallback when `BRAINSTORM_TOKEN` is set explicitly;
  `:625` runs an owner-death / idleness watchdog.
- **Portable new-file detection — the answer to "how does the loop notice?"**
  `server.cjs:566-599` uses `fs.watch(CONTENT_DIR, …)` but explicitly does *not*
  trust the event: the comment records that "macOS fs.watch reports 'rename' for
  both new files and overwrites", so on any event it re-reads the directory
  listing and picks the newest `.html` by mtime (`:253`, `:569`). Event as hint,
  listing as truth — which is the pattern that survives Windows, network paths and
  case-insensitive filesystems. The `$STATE_DIR/events` direction needs no watcher
  at all: the server writes it from WebSocket messages and the **agent reads it as
  a plain file on its next turn** (`visual-companion.md:120-123`), cleared when a
  new screen is pushed (`:260`).
- **Launcher.** `brainstorming/scripts/start-server.sh:86-96` detects Windows via
  `MSYSTEM` and `uname -s` (`MSYS*|MINGW*|CYGWIN*`); `:102` auto-foregrounds
  because "Windows/Git Bash reaps nohup background processes"; `:161` records that
  "Windows/MSYS2: Node.js cannot see POSIX PIDs from the MSYS2 namespace".
  `server.cjs:276-282` platform-branches the browser open, including WSL
  detection.
- **Naming constraint for anything new.** `packages/core/hooks/run-hook.cmd:7-9`
  records that "Claude Code's Windows auto-detection … prepends 'bash' to any
  command containing .sh", which is why hook scripts here are extensionless and
  `run-hook.cmd` is a cmd/bash polyglot. For `start-server.sh` that prepend is
  benign (it *is* a bash script); any new launcher must either keep `.sh` and
  accept the prepend, or go extensionless behind a `.cmd` polyglot. Do not invent
  a third convention.
- **Prior art to follow, not reinvent.** `packages/glass` already solves
  port-owner lookup per platform: `findPidOnPort` uses `lsof -ti:PORT -sTCP:LISTEN`
  on darwin/linux and, on `win32`, runs `netstat` and filters the local-address
  column **in JS** rather than shelling out to `netstat | findstr`, because
  `execFileSync` cannot express a pipe
  (`packages/glass/skills/browsing/lib/chrome-launcher-helpers.js:161-183`),
  regression-tested at `packages/glass/test/lib/find-pid-on-port-guard.test.mjs:7-25,97-103`.
  Process teardown ordering and its timeout fallback are pinned in
  `packages/glass/test/lib/chrome-process.test.mjs:132-158`, and profile-name
  validation at `:61-68`. Per-platform data directories are resolved at
  `chrome-launcher-helpers.js:44-47` (`LOCALAPPDATA` on win32). Note the files are
  `.mjs`, not `.ts`.

**The honest limitation:** none of this can be verified on CI or on the dev
machines. `skill-tiers.yaml:205-210` records that the `windows-vm` skill "cannot
run on this fork's dev machines or in CI — needs /dev/kvm, sshpass and Debian".
Windows verification is a manual pass on a real Windows box, and it is ~2 h of the
estimate below.

## Prerequisites

- **DO-NOW-1** — every file this touches is on `import/packages-core`, unmerged.
- **DO-NOW-2** — the lean/full decision determines which plugin carries the
  changed skills, and `metadata.test.ts:474` enforces that no core-tier skill
  REQUIREs an everything-tier one. A new `_shared/` reference read by three skills
  must sit on the right side of that line.
- **DO-NOW-3** — decides which adapters get emitted. If only `claude-code` ships
  first, the seven translation-file edits are deferred (~1 h off).

## Proposed approach

**Option A — Per-harness conditional emission in mint.** Trade-off: wrong layer
(mint does not read skill bodies), multi-day feature, solves nothing the runtime
ladder does not.

**Option B — Reuse the existing companion server, add the artifact rung beside
it.** `writing-plans` and `finding-duplicate-functions` invoke
`${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/scripts/start-server.sh` for their
human-review step; a new `_shared/native-rendering.md` holds the ladder; the
artifact rung sits beside the browser rung, not above it. Trade-off: a
cross-skill dependency on a path that lives under `brainstorming/`, which reads
oddly.

**Option C — Move the server to `skills/_shared/companion/` first, then wire all
three skills.** Trade-off: cleaner name, but it breaks the
`${CLAUDE_PLUGIN_ROOT}`-anchored paths asserted by `metadata.test.ts:270`, the
nine tests under `test/brainstorm-server/`, and the "every directory under
skills/ is either a skill or the shared reference dir" assertion
(`metadata.test.ts:101`) — `_shared/` holds only markdown today.

**Recommendation: Option B**, with the rename deferred as separate cleanup. Steps:

1. `packages/core/skills/_shared/native-rendering.md`: the four-rung ladder and
   the "if installed and configured" house rule; when a page beats terminal text
   (borrow `visual-companion.md:9-25`, which already gets this right); the cost
   warning ("a styled page is more token-intensive than the same content as
   terminal text", artifacts doc — brainstorming already warns users of exactly
   this at `SKILL.md:238`); and the Windows notes above by reference.
2. `brainstorming`: keep the companion as the primary renderer. Add the artifact
   as a sibling rung for the approved architectural spec — published **in addition
   to** the file at `docs/moe/specs/…`, which stays the committed record.
3. `writing-plans`: after saving the plan, offer a companion screen and/or a
   published checklist page that ticks off during execution — the `- [ ]` steps
   (`SKILL.md:61,98`) already give it structure.
4. `finding-duplicate-functions`: Phase 5 keeps writing `duplicates-report.md`;
   Phase 6 offers to render it grouped by confidence, since human review is that
   report's whole point.
5. Sharing default: **private**, exposed as a `MOE_*` env var following the Stop
   hook's precedent — `MOE_LATTE_ENABLED` is opt-in, read as `${VAR:-}` with
   default-off (`hooks/claude-judge-continuation:6,14,150-151`), state under
   `$HOME/.claude/moe/…` (`:58`), and `metadata.test.ts:411-420` asserts the
   default is off. Mirror all four: a default-private setting, an env var, and a
   test.
6. One line per file in `using-moe/references/` (seven files) mapping the artifact
   and companion rungs onto that harness, defaulting to "write the file".
7. Extend `test/metadata.test.ts`: every skill naming the Artifact tool also names
   a fallback; `_shared/native-rendering.md` is referenced (the reachability
   pattern at `:292-304`); the new setting defaults to private.

**What server-first costs versus artifact-first**, kept on the record: no
org-shareable URL as the default output, so a colleague cannot open a
brainstorm or plan without the session owner publishing one; no per-thread
comments; nothing in the org audit log; and the reader must be at the machine
running the server. What it buys is the real click-to-select loop that feeds
`$STATE_DIR/events` straight into the next turn — artifacts recover that only as
a "copy as prompt" control the human pastes back — plus a renderer that works
with no claude.ai account, on any plan, behind ZDR, on Bedrock or Vertex.

## Does this reuse flight's dashboard? No — a third thing, following its pattern

`packages/flight/dashboard` (worktree `.claude/worktrees/wf_238bb49d-362-15`) *is*
a server-side renderer, and it is good prior art: it vendors htmx and
`htmx-ext-sse` plus Inter woff2 locally under `dashboard/src/static/` with a
`VENDOR.md`, and references them from generated HTML by local path
(`dashboard/src/templates.ts:380-382`) — no CDN, which is the right instinct for
an internal tool. Borrow that instinct. Do not depend on the package:

- **License.** PARITY.md "License exposure" records that `superpowers-evals` ships
  no LICENSE and no license field, so the default is all rights reserved; it was
  imported anyway on internal-use grounds, and the decision is void if flight is
  "published to any registry", if "Moe [is] open-sourced, or any part of flight
  shipped to a customer or contractor", or if it is otherwise distributed
  (PARITY.md:59-77). Enforced in code: `@bubstack/moe-flight` and both frontends
  carry `"private": true` (`packages/flight/package.json:4`) and flight is absent
  from `.claude-plugin/marketplace.json`. `core` **is** in that marketplace, so a
  `core → flight` edge would put that material behind every core plugin install.
- **Shape.** `core` is a content package with no build (`typecheck` is literally
  `echo 'content package: no TypeScript'`, `packages/core/package.json`), while
  dashboard is compiled TypeScript with `@hono/node-server` and `zod`.
- **Redundancy.** Moe already has a zero-dependency plain-Node server in
  `brainstorming/scripts/server.cjs`, already tested nine ways. Building or
  importing a second one is the duplication, not the fix.

Flight's two frontends remain complements, not duplicates: dashboard is a
long-running SSE monitor over `results/` that "imports NOTHING from the harness"
(`dashboard/src/server.ts:22-27`); `packages/flight/ui` is a React+Vite SPA that
*also* emits a self-contained single-file run report via `vite-plugin-singlefile`
(`ui/vite.static.config.ts:21-28`, `ui/src/static.tsx`). That single-file report
is the one genuine overlap with an artifact — artifact wins on distribution, the
static file wins where there is no claude.ai session. Both survive; flight is out
of scope here.

## Scope boundary

**In:** `_shared/native-rendering.md`; the ladder wired into `brainstorming`,
`writing-plans`, `finding-duplicate-functions`; the default-private sharing env
var; one line each in the seven `using-moe/references/` files; assertions in
`test/metadata.test.ts`; a manual Windows verification pass.

**Out:**
- Any change to `packages/mint/` — nothing here needs one. Adapter emission is
  DO-NOW-3's; the roster is `runtime-pruning`'s.
- Any change to `packages/flight/`, and any `core → flight` dependency. Its
  `glass`/`crew` edges are DO-NOW-4's.
- Moving the companion out of `skills/brainstorming/scripts/` (Option C) — a
  follow-up once three skills actually share it.
- Vendoring `artifact-design` / `dataviz` / `artifact-diagramming` — impossible
  and unnecessary. Recording Moe's design tokens so pages inherit Moe's look is
  `moe-tone-and-branding`'s: it owns voice and visual identity, this owns medium.
- An artifact renderer for code review (the annotated-diff walkthrough the
  artifacts doc names). Real, but those findings go to an agent — a new skill.
- A `TodoWrite` / `AskUserQuestion` audit of all 27 skills. Exactly one live skill
  body names `TodoWrite` (`developing-claude-code-plugins/SKILL.md:97`).
- MCP-connector-backed live pages: a published page can only call claude.ai
  account connectors, never local `.mcp.json` ones (artifacts doc), and Moe's
  memory MCP is local — closed today.

## Open questions for Zak

None. Q1 (graceful fallback), Q2 (server-first) and Q3 (private, configurable)
are answered above and folded into the house rule and step 5.

## Effort

| Step | Time | What makes it slower |
|---|---|---|
| `_shared/native-rendering.md` | 1-1.5 h | Short enough to read every session, precise enough that three skills defer to it |
| `brainstorming` | 1-1.5 h | The most load-bearing skill in the set (`skill-tiers.yaml:54-60`); additive-only around a 250-line SKILL.md and a 299-line guide |
| `writing-plans` + `finding-duplicate-functions` | 1.5-2 h | First cross-skill use of the companion; `${CLAUDE_PLUGIN_ROOT}` paths must stay resolvable (`metadata.test.ts:270`) |
| Sharing env var + default | 0.5-1 h | Mirroring the `MOE_LATTE_ENABLED` pattern end to end, test included |
| Seven `references/` files | 0.5 h | Zero if DO-NOW-3 emits `claude-code` only |
| `test/metadata.test.ts` | 0.5-1 h | "Names a fallback" needs a rule a grep can enforce without false positives |
| Windows verification | 2 h | Cannot run in CI or on the dev machines (`skill-tiers.yaml:205-210`); needs a real Windows box with Git Bash |

**Total 7-10 h.** Slower if the Windows pass finds the companion's foreground mode
unusable for the two new skills, since that would need a launcher change under the
`.sh`-prepend constraint above.

## Verification

- `pnpm --filter @bubstack/moe-core test` green, including new assertions: every
  skill naming the Artifact tool also names its fallback,
  `_shared/native-rendering.md` is referenced, and the sharing setting defaults to
  private. `metadata.test.ts:251`, `:270` and `:606-607` still pass.
- `pnpm --filter @bubstack/moe-core test:brainstorm` still green — nine server
  tests proving the companion was not broken. `lint` green.
- `packages/core/skills/_shared/native-rendering.md` exists, under 100 lines.
- Manual on macOS: run each of the three skills; confirm the companion opens, and
  that with `CLAUDE_CODE_DISABLE_ARTIFACT=1` the skill drops a rung instead of
  stalling.
- Manual on Windows (Git Bash): `start-server.sh` binds, the browser opens, a new
  screen is picked up, `$STATE_DIR/events` is written and read back, and
  `stop-server.sh` leaves no orphan node process.

Sources: [Share session output as artifacts — Claude Code docs](https://code.claude.com/docs/en/artifacts)
