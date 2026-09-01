# TC downstream realignment requirements

Captured 2026-09-01 from Zak Keown's completion-audit Q&A. These requirements
supersede conflicting completion claims in the historical backlog. A status
label or merge SHA is not evidence that a requirement below is satisfied.

## Distribution and Git flow

- **TC-DIST-01 — Repository roles.** `mirror/main` is the neutral upstream;
  `origin/main` is the TC downstream and this checkout's default branch.
- **TC-DIST-02 — Upstream-first flow.** Generic changes land against
  `mirror/main` first and then merge into `origin/main`. TC-only changes start
  from `origin/main` and never flow upstream.
- **TC-DIST-03 — Auditable ancestry.** Downstream consumes upstream with merge
  commits, not downstream rebases or duplicate cherry-picks.
- **TC-DIST-04 — Committed TC identity.** Every downstream artifact, internal
  dependency, generated manifest, test, and install instruction uses the
  committed `@tc/*` scope. Release-time scope rewriting is forbidden.
- **TC-DIST-05 — Registry boundary.** `@tc/*` publishes to the established
  internal ProGet npm feed using protected CI credentials. The GitLab project is
  the source host, not the package registry.
- **TC-DIST-06 — Lockstep release.** All publishable downstream packages share
  one version and release together.
- **TC-DIST-07 — Upstream-derived version.** A downstream release derived from
  upstream `X.Y.Z` is `X.Y.Z-tc.N` and records the exact upstream commit.
- **TC-DIST-08 — Dist-tag protection.** Branch and merge-request pipelines are
  credential-free pack-only dry runs using `next`. Only a protected
  default-branch push that changes `tc-release.json` may publish and move
  `latest`, and only after every normal build, test, mint-reproducibility, and
  provenance gate succeeds.

## Installation and platforms

- **TC-INSTALL-01 — Umbrella package.** `@tc/moe` is a real publishable package
  whose supported bootstrap is `npx @tc/moe install`.
- **TC-INSTALL-02 — Bare command.** A successful install places `moe`,
  `moe-install`, and `moe-doctor` on PATH. `moe` dispatches every supported
  namespace and reports which namespaces are present or absent.
- **TC-INSTALL-03 — Lifecycle.** Install, upgrade, and uninstall operate only on
  `@tc/*` artifacts and have clean-home acceptance coverage.
- **TC-INSTALL-04 — No retired-key migration.** No MCP migration command or
  compatibility layer is required for `episodic-memory` or `chrome`.
- **TC-PLATFORM-01 — Supported systems.** macOS, Linux, and WSL2 are supported.
  Native Windows is explicitly deferred.

## Completion evidence and execution safety

- **TC-EVIDENCE-01 — Local default.** Completion evidence defaults to a
  gitignored repository-local `.audit/`, keyed so parallel worktrees remain
  distinguishable.
- **TC-EVIDENCE-02 — Sensitive-repository escape.** Users can explicitly route
  evidence to the home-directory store instead.
- **TC-EVIDENCE-03 — Behavioral proof.** Tests exercise transcript parsing,
  command/exit/output capture, evidence-free completion warnings, and the
  per-session firing counter. Static hook-registration tests are insufficient.
- **TC-PARALLEL-01 — Isolation gate.** Parallel implementation requires
  disjoint file ownership, declared handoff interfaces, and one isolated
  worktree per worker. If any condition fails, execution is sequential.

## Context, governance, and TC capabilities

- **TC-CONTEXT-01 — Core retrieval policy.** `retrieving-context` ships in the
  core/lean plugin so it can fire unprompted. This is an explicit exception to
  the authored-skills-everything-only rule.
- **TC-GOV-01 — Non-blocking default.** Governance presence remains a
  non-blocking SessionStart warning by default.
- **TC-GOV-02 — Optional enforcement.** Blocking `PreToolUse` enforcement is
  available only behind an explicit opt-in setting.
- **TC-GOV-03 — Drift coverage.** The TC drift manifest includes watch-only
  entries for `ai/aigovernance` and `ai/tc-guide` without vendoring their text.
- **TC-TRACE-01 — Cross-stack tracing.** An everything-tier
  `tracing-across-the-stack` skill answers endpoint-to-UI impact and
  component-to-endpoint provenance questions.
- **TC-TRACE-02 — Capability ladder.** CodeGraph is the baseline; convention-led
  Grep is the offline/degraded fallback; Moedex is an optional enhancement and
  never a prerequisite.
- **TC-TRACE-03 — Honest limits.** The skill warns that CodeGraph's `impact`
  operation, not `consumers`, is the verified Route traversal; it states when an
  NgRx link was convention-matched rather than graph-proven.

## Backlog truth and verification

- **TC-TRUTH-01 — Canceled work is not completed work.** The 17-skill TC port is
  canceled: thirteen duplicates are declined, three wrapper capabilities are
  superseded by cross-stack tracing, and the one knowledge artifact belongs in
  `ai/kb`.
- **TC-TRUTH-02 — Historical reconciliation.** Backlog prose and tests that
  assert superseded requirements—native Windows, MCP-key migration, the 17-skill
  port, home-directory evidence by default, or already-built cross-stack
  tracing—must be corrected explicitly.
- **TC-VERIFY-01 — Acceptance over assertion.** Clean-home install/upgrade/
  uninstall, bare-command resolution, evidence-hook behavior, review-script
  behavior, governance modes, and both tracing directions receive executable
  acceptance coverage. Manual-only checks record the platform, command, result,
  and repository SHA.

## Traceability

Implementation is staged by
`tc-downstream-realignment-and-repair`. The historical source documents remain
useful research, but these requirements and `ARCHITECTURE.md` govern where their
older decisions conflict.
