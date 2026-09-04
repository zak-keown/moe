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

- **0.2.1 = patch.** No new user-facing capability. Bug fixes, correctness and
  reproducibility (umask #4, main's red render-graphs), dead-code removal, and
  documentation truthing. Packaging is *not* a 0.2.1 build — it is 0.2.0's job
  (see R1); 0.2.1 only verifies it landed.
- **0.3.0 = minor.** New capability: the backlog's high/medium features, the
  advertised-surface stubs promoted to real implementations, and the
  multi-harness parity work. Several 0.3.0 items need their own spec + plan-set
  before execution; those are flagged.

## Inputs behind this roadmap

1. **`.moe/backlog/`** — 31 open items: the original 9, plus 22 filed this
   session from the audit + verification (see below).
2. **GitHub** — issue #4 (umask/reproducibility, still open); issue #5 (EPIPE)
   closed by PR #6, **merged** this session (`ffbf1bf6`).
3. **Concept review** (`.moe/concept-review/SYNTHESIS.md`) — 11-reviewer audit.
   Predates 0.2.0; its structural themes still stand, but its packaging headline
   is now addressed by 0.2.0's release orchestration (see R1).
4. **Packaging verification** (this session) — the release orchestration packs
   the complete plugin tree; the gap is unwired release CLI paths, owned by
   0.2.0. See risk **R1** (this corrects an earlier over-call).
5. **Promise-hunt audit** (this session, `main` @ `64304930`) — 22
   findings across stubs, dead code, harness-parity, and doc drift. Referenced
   below as **A#n**.

## Two release-shaping risks

- **R1 — the install: solved by design in 0.2.0's release orchestration; the
  risk is unwired CLI, not missing packaging (CORRECTED).** An earlier read of
  this session called the install broken for 0.2.1 based on `npm pack` of the
  raw `packages/<pkg>` workspace — the wrong artifact. The release path packs the
  *assembled* tree: `release/candidate.ts` `prepareCandidate` packs
  `artifact.artifactRoot`, which `artifact/check.ts` sets to `plugins/<id>` — the
  complete generated tree carrying `.claude-plugin/plugin.json`, LICENSE, NOTICE,
  `dist`, and all eight harness dirs (`license-payload.ts` writes LICENSE/NOTICE
  into that root). So once the orchestration runs, published tarballs are
  complete and the `using-moe` bootstrap registers. What remains is **wiring**:
  `release candidate/promote/certify-claude --execute` all throw `*_EXECUTE_NOT_
  WIRED` on main, while `publish.yml` already calls `mint release candidate
  --execute` — so a real 0.2.0 tag fails loudly there until wired (never a silent
  broken ship). That wiring is 0.2.0's last mile (tracked: `BL-d932811282`).
  Caveat: the already-published 0.1.x tarballs were packed the old way and *are*
  incomplete, so 0.1.x installs stay broken until 0.2.0 republishes. The one true
  residual gap — an end-to-end "after install the bootstrap fires" test for the
  non-memory plugins — folds into robust e2e testing (`BL-3ce1956bb4`), a 0.3.0
  item.
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
