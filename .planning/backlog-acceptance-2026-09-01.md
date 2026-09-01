# Backlog acceptance ledger — 2026-09-01

This is the execution record for the second completion pass. It ignores backlog
frontmatter status and records what was actually exercised at downstream SHA
`a0f66fb8217373b2fa0397ac8ded4f93d79710d1`. The recorded neutral mirror base is
`54b4ec6c54540d472835c1e074e7e7c8e6469329`; `git merge-base HEAD mirror/main`
returned that exact commit.

## Closed in this pass

- **Deterministic DAG.** `sequencing-plans` now invokes the generated sibling
  `plan-set` by its `${CLAUDE_PLUGIN_ROOT}` path. The "plan-set" suite covers
  check, next, done, persistence across a fresh process, invalid ranges,
  unfinished dependencies, cycles, blocked descendants, missing plan files and
  every SessionStart notice state.
- **Governance nudge.** The "tc-governance-check" suite executes the real
  SessionStart hook for missing and present markers, both supported memory-file
  locations, explicit disablement and missing home variables.
- **Context routing.** The "retrieving-context contract" suite guards direct
  working-tree reads, the CodeGraph baseline, optional Moedex, the local-memory
  fallback, reproducible shared citations and bounded delegated search. Live
  `rag_search` plus `rag_context` found the exact `ai/kb` branch convention and
  demonstrated that its low absolute score was still relevant; the unsafe
  universal score cutoff was removed. See
  `.planning/context-routing-acceptance-2026-09-01.md`.
- **Claude project context.** A real `claude -p '/context'` invocation reported
  both `CLAUDE.md` and `AGENTS.md` under Memory files, with zero model turns and
  zero cost.
- **Native companion automation.** `pnpm --filter @tc/moe-core test:brainstorm`
  passed 130 checks covering framing, reconnection, launch routing,
  authentication, serving, event persistence, lifecycle and the Windows-like
  shell start/stop paths.
- **Native renderer human acceptance.** Zak reviewed live companion screens for
  `brainstorming`, `writing-plans`, and `finding-duplicate-functions`; the event
  stream recorded `brainstorm-pass`, `plan-pass`, and `duplicates-pass`. A
  read-only Claude Code probe with `CLAUDE_CODE_DISABLE_ARTIFACT=1` selected rung
  2 and the private sharing default instead of stalling. The exercise also found
  and repaired the Codex foreground recipe and a malformed Copilot launcher;
  the "keeps persistent harness launch recipes executable" test now guards both
  platform instructions.
- **Verification and firing-rate acceptance.** A genuine Claude session invoked
  `verification-before-completion`, observed a green unit test, worked backward
  to the missing user-visible file, and reported the goal not met. A subsequent
  fresh Stop event wrote one real skill firing and the exact `pnpm test` output
  with exit code 0. The exercise found and repaired an ESM crash, Claude
  2.1.252's metadata boundary, missing successful exit-code representation, and
  destructive clean-slate guidance. See
  `.planning/verification-firing-acceptance-2026-09-01.md`.
- **Parallel execution acceptance.** A committed three-task plan dispatched
  three concurrent workers from the same recorded base into pairwise-unique
  linked worktrees. Alpha, Beta, and Gamma each changed and committed only their
  assigned evidence file; their three branches merged without conflict, and the
  integrated tree passed all 26 `pnpm check` tasks. See
  `.planning/parallel-execution-acceptance-2026-09-01.md`.
- **Fresh-clone contributor flow.** A new local clone at this SHA passed
  `pnpm install --frozen-lockfile`, all 26 `pnpm check` tasks,
  `pnpm mint:check`, 88 `pnpm proof:test` cases, 86 `pnpm tab:test` cases and
  all 5 `pnpm tab:test:bindings` cases. The first cold run exposed the script
  parser's default five-second timeout; commit `a0f66fb` gives that subprocess-
  heavy test a 15-second budget, and a second cold run passed after taking 7.23
  seconds under full workspace contention.
- **Packed downstream install.** Eight `0.0.0-tc.1` tarballs were produced and
  installed together into an empty prefix. All package manifests carried the
  `@tc` scope and lockstep version; `moe`, `moe-install` and `moe-doctor` ran;
  `moe status` resolved the four distributed namespace CLIs; and a JSON-RPC
  initialize request sent through `moe glass` returned server version
  `0.0.0-tc.1`. Removing all eight packages removed the umbrella shim.
- **Release policy.** Read-only validation accepted `next` for a feature branch
  and `latest` for `main`, rejected `next` on `main`, and rejected a missing
  protected ProGet credential. No registry write was attempted.
- **Final local gates.** `pnpm check`, `pnpm mint:check`, `pnpm provenance`, the
  downstream-scope guard and the four-row TC drift-manifest suite all passed;
  the tracked worktree was clean.
- **Live TC drift review.** CodeGraph read current `main` for all four watched
  projects. Three pins still matched. `ai/skills` had advanced through MR !11;
  the ref diff changed only its README and `shortcut-triage`, not the incorporated
  `creating-merge-requests` source. The pin was reviewed and advanced to
  `aa27d97d2551f7341ef606a8e427f060091ad627`.

## Still requires a different execution environment or external mutation

These are not implementation gaps disguised as statuses. The code and local
contracts exist, but the named acceptance event has not occurred.

| Backlog ask | Remaining acceptance event | Why it is still open |
|---|---|---|
| `installer-hq-dx` | Install from the configured `@tc` ProGet scope on a real WSL2 host; run install, upgrade and uninstall | This host is macOS, and the packages have not been published |
| `codebase-review-skills` | Run a complete reviewer-shard/merge/`--verify` agent flow on a real repository | The scripts have 21 behavioral cases; the agent orchestration itself has not been exercised end to end |
| `tc-governance-integration` | Observe the scheduled drift job with the protected GitLab token | A live CodeGraph comparison and repin are complete; the scheduled CI credential path itself has not run here |
| `tc-downstream-realignment-and-repair` | Push, observe a real GitLab pipeline, and publish/promote the eight-artifact train to internal ProGet | Those are external mutations and were not authorized by “commit all you need” |

Native Windows and retired-key migration remain canceled/out of scope. The
17-skill TC port remains deliberately declined; cross-stack tracing is its built
replacement, with optional Moedex enhancement rather than a dependency.
