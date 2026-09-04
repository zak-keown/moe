# Release roadmap — 0.2.1 and 0.3.0

Planning doc, not an executable plan-set. It scopes the next two releases and
records why each item lands where it does. The two release plans it indexes:

- [`2026-09-04-v0.2.1-plan.md`](./2026-09-04-v0.2.1-plan.md) — patch: make the
  install real, land in-flight fixes, kill dead code, true up docs.
- [`2026-09-04-v0.3.0-plan.md`](./2026-09-04-v0.3.0-plan.md) — minor: the
  features the backlog and the audits point to.

Authored 2026-09-04 against `main` @ `64304930` (clean). Supersedes nothing;
depends on the `v0.2.0-release-closure` plan set shipping first.

## Where 0.2.0 sits

0.2.0 is mid-flight (Codex). Its plan set (`v0.2.0-release-closure-MANIFEST.md`)
does three things: syncs all six public packages + mint to `0.2.0`; rebuilds
Memory's rollback/recovery from the real published `@bubstack/moe-memory@0.1.4`
bytes; and stands up release orchestration — candidate packing, `next`→`latest`
promotion, and **per-harness candidate-tarball install-qualification drivers**
(plan 03). 0.2.0 does *not* change any package `files` array or add a `prepack`,
so it changes the *versioning and release machinery*, not the *contents* of the
published tarballs.

Everything below assumes 0.2.0 has shipped. The per-package versions today are
deliberately incoherent (memory `0.2.0`, core/backstory/crew/glass `0.1.6`,
statusline `0.1.2`, jig `0.1.4`, jig-graph `0.1.0`, flight/mint `0.0.0`); repo
tags run `v0.1.0`…`v0.1.4`. 0.2.0's baseline plan reconciles the six public
packages to `0.2.0`, which is the version floor these two releases build on.

## The split rule

- **0.2.1 = patch, led by packaging.** No new user-facing capability. Its
  **priority 1** is making the install real — wiring the release orchestration
  and republishing complete plugin trees (see R1); 0.2.0 ships without that
  wiring. Then: reproducibility (umask #4, render-graphs, the EPIPE races — all
  already merged), dead-code removal, and documentation truthing.
- **0.3.0 = minor.** New capability: the backlog's high/medium features, the
  advertised-surface stubs promoted to real implementations, and the
  multi-harness parity work. Several 0.3.0 items need their own spec + plan-set
  before execution; those are flagged.

## Inputs behind this roadmap

1. **`.moe/backlog/`** — 31 open items: the original 9, plus 22 filed this
   session from the audit + verification (see below).
2. **GitHub** — issue #4 (umask/reproducibility) fixed by PR #7 (`b8986b96`) and
   issue #5 (EPIPE) by PR #6 (`ffbf1bf6`), both **merged** this session.
3. **Concept review** (`.moe/concept-review/SYNTHESIS.md`) — 11-reviewer audit.
   Predates 0.2.0; its structural themes still stand, and its packaging headline
   is 0.2.1 priority 1 (see R1).
4. **Packaging verification** (this session) — the release orchestration packs
   the complete plugin tree, but the release CLI paths are unwired and 0.2.0
   ships without them, so packaging is **0.2.1 priority 1**. See risk **R1**.
5. **Promise-hunt audit** (this session, `main` @ `64304930`) — 22
   findings across stubs, dead code, harness-parity, and doc drift. Referenced
   below as **A#n**.

## Two release-shaping risks

- **R1 — the install is incomplete and 0.2.0 ships without the fix, so it is
  0.2.1 priority 1.** The release *design* is sound: `release/candidate.ts`
  `prepareCandidate` packs `artifact.artifactRoot`, which `artifact/check.ts`
  sets to `plugins/<id>` — the complete generated tree carrying
  `.claude-plugin/plugin.json`, LICENSE, NOTICE, `dist`, and all eight harness
  dirs (`license-payload.ts` writes LICENSE/NOTICE there). But the CLI is not
  wired to it: `release candidate/promote/certify-claude --execute` all throw
  `*_EXECUTE_NOT_WIRED` on main. Per the release owner, **0.2.0 ships before that
  wiring lands** — so 0.2.0's published install is the incomplete one (raw
  `packages/<pkg>` tarball: no top-level manifest, no LICENSE, so the `using-moe`
  bootstrap never registers), the same shape as the already-broken 0.1.x
  installs. Wiring the three `--execute` paths and republishing complete trees is
  therefore **0.2.1 priority 1** (tracked: `BL-d932811282`; earlier in this
  session this was mislabelled 0.2.0's job). Residual (→ 0.3.0): an end-to-end
  "after install the bootstrap fires" test for the non-memory plugins, under
  robust e2e testing (`BL-3ce1956bb4`).
- **R2 — "8 harnesses" is true for skills only.** commands/mcp/hooks/agents are
  absent on most of the seven non-Claude harnesses (A#5), and this is honest at
  the machine level (mint yaml tiers, INSTALL matrix, `moe-install` refusal) but
  invisible in README/ARCHITECTURE prose. 0.2.1 truths the docs (item **D3**);
  0.3.0 closes the actual parity gaps where they matter (Codex MCP, the memory
  bootstrap-without-backend). This is load-bearing per CLAUDE.md's multi-harness
  rule.

## Not in either release yet — needs a spec first

Named here so they are not lost, but deliberately unscheduled until designed:

- Shared **CDP transport/launcher/session** package (glass ⇄ flight are a
  divergent 27-file fork; the `chrome-ws` CLI carries a third `WebSocketClient`;
  `bin/lib/probes.mjs` reinvents Chrome discovery). Synthesis theme #4.
- Shared **harness-paths** and **usage/cost** models (four surfaces each, no
  shared model; the one dialect a Moe user actually has — Claude JSONL — is the
  one `tab` lacks). Synthesis theme #4.
- Porting core's `latte:evals` into `proof` (gives proof a reason to exist).

These are the 0.3.x+ architecture track.
