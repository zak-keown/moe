> **Superseded 2026-09-01.** Every branch this document names has been merged and
> deleted. It is kept as a point-in-time record of that run, so its "Ready to
> merge" and "Iterate" sections describe branches that no longer exist — do not
> try to check them out. For final state see `.planning/backlog/WAVES.md`.

## Base
- Base: main@6b0e28c7 — planned 6 ready items, 1 in-branch, 1 merged.

## Ready to execute

### gsd-core-skill-import
Summary: Import the 9 upstream MIT GSD-core debugger references (plus `security-asvs-levels.md`) as siblings inside `packages/core/skills/systematic-debugging/`, ship the upstream LICENSE, add a PARITY.md row and an ARCHITECTURE.md §2 note — no new skill directory, so the pinned-27 fidelity assertions are untouched.

Approach: Preflight the SBFL preconditions on two real TC repos; if per-test coverage is absent, fall back to a PARITY-only `Excluded` row. Otherwise shallow-clone `open-gsd/gsd-core@996196f` into the `.moe-references/` snapshot dir, import the 9 debugger reference files (plus `security-asvs-levels.md`) as siblings of `systematic-debugging/SKILL.md`, rewriting `@-include` directives, `gsd-debugger:` cross-refs, and DEBUG.md assumptions inline. Link every imported file from SKILL.md's "Supporting Techniques" list, add one row to PARITY.md's Map, drop `open-gsd.MIT.LICENSE` into `packages/core/licenses/`, and extend the enumerated-licenses assertion in metadata.test.ts. Do NOT touch skill-tiers.yaml — no new skill directory means `imported:` stays at 27 and the fidelity pins remain untouched.

Files (write):
- packages/core/skills/systematic-debugging/debugger-sbfl.md
- packages/core/skills/systematic-debugging/debugger-bug-taxonomy.md
- packages/core/skills/systematic-debugging/debugger-techniques.md
- packages/core/skills/systematic-debugging/debugger-fix-acceptance.md
- packages/core/skills/systematic-debugging/debugger-repro-hardening.md
- packages/core/skills/systematic-debugging/debugger-rca-branching.md
- packages/core/skills/systematic-debugging/debugger-prevention.md
- packages/core/skills/systematic-debugging/debugger-semantic-recall.md
- packages/core/skills/systematic-debugging/debugger-philosophy.md
- packages/core/skills/systematic-debugging/security-asvs-levels.md
- packages/core/skills/systematic-debugging/SKILL.md
- packages/core/licenses/open-gsd.MIT.LICENSE
- packages/core/test/metadata.test.ts
- PARITY.md
- ARCHITECTURE.md

Contended files:
- packages/core/test/metadata.test.ts — GUARDED per WAVES.md (self-guarding via 'accounts for every skill on disk in exactly one of the two maps' plus LEAN_TIER_COUNT). Loud failure on a bad merge. Only edit required: add `open-gsd.MIT.LICENSE` to the enumerated list and a verbatim copyright-line assertion in `it("retains one LICENSE per inbound license, as NOTICE promises")` at :942-957. — native-renderers, verification-split-and-firing-rate
- ARCHITECTURE.md — Unguarded prose per WAVES.md. Silent failure mode is stale line-numbered citations surviving a merge. Cite by section name (§2) and quoted heading, not by line number. — installer-hq-dx

Gates:
```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core lint
pnpm --filter @bubstack/moe-core typecheck
git -C ../.moe-references/gsd-core rev-parse --short HEAD | grep -qx 996196f
test -f ../.moe-references/gsd-core/LICENSE && grep -q 'MIT' ../.moe-references/gsd-core/LICENSE
grep -rn 'gsd' packages/core/skills/ | wc -l | grep -qx 0
grep -rniE 'spectrum|sbfl|fault localiz|bug taxonom' packages/core/skills/ | grep -q .
grep -qE '^\| `open-gsd/gsd-core` \|' PARITY.md
vitest run --filter=metadata -t 'pins the IMPORTED skill set at exactly 27' packages/core/test/metadata.test.ts
vitest run --filter=metadata -t 'keeps the lean tier lean' packages/core/test/metadata.test.ts
vitest run --filter=metadata -t 'every relative markdown link inside skills/ resolves on disk' packages/core/test/metadata.test.ts
vitest run --filter=metadata -t 'retains one LICENSE per inbound license, as NOTICE promises' packages/core/test/metadata.test.ts
git -C ~/.claude status --porcelain=v1 | wc -l | grep -qx 0
```

Drift:
- `metadata.test.ts:115` — `expect(skills.length).toBe(27)` → line no longer exists; 27-pin is now `expect(Object.keys(imported).length).toBe(27)` at :174 with `LEAN_TIER_COUNT = 13` at :143.
- `metadata.test.ts:156-192` enumeration → now `expect(Object.keys(imported).sort()).toEqual(expected)` at :254; `expected` literal spans :215-248.
- `metadata.test.ts:242` REQUIRED-marker check → actually at :321.
- `metadata.test.ts:470` `expect(core.length).toBe(13)` → assertion inside `it("keeps the lean tier lean")` at :719-723; literal at :143.
- `metadata.test.ts:251` relative-link check → actually at :350.
- `../.moe-references/gsd-core` per PARITY.md → resolves to `/Users/zakkeown/Code/tools/.moe-references/`, which does not exist. Actual snapshot dir is `/Users/zakkeown/Code/.moe-references/`, containing only `mattpocock-skills/` @ `6654f6b` — cloned 2026-08-31 during the W02P05 `mattpocock-skills-import` census, not by any Wave 1 item. `gsd-core` still has to be cloned; the path mismatch called out below is still real.
- Q2 claim of `~/Code/.moe-references/moe-core-local-only/` with 46 files + MANIFEST → directory does not exist.
- Option B: "the only test that gains work is the relative-link check at :251" → licence test at :942-957 also gains work (5th LICENSE row).

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) Environmental precondition unmet: PARITY.md's `../.moe-references/` convention does not resolve on this machine. Gates 4-5 fail before any file is touched. The plan straddles two conventions without picking one.
- (integration-risk, high) Two plan-authored gates fail on first run because of the same path mismatch — executor cannot silently pick a location without escalating.
- (integration-risk, high) `PARITY.md` is missing from `contended` entirely; `runtime-pruning` also writes it. `ARCHITECTURE.md`'s co-writers under-enumerated (missing runtime-pruning, verification-split-and-firing-rate).
- (cross-check, risk-reduced) A sibling W02 census (`W02P05 mattpocock-skills-import`, 2026-08-31) grepped `mattpocock/skills @ 6654f6b` for `sbfl|spectrum|ochiai|bohrbug|heisenbug|mandelbug|fault local|bug taxonom|delta debug|semantic recall|asvs` and found zero hits — none of the 9 debugger references or `security-asvs-levels.md` is superseded by a second upstream. The Option B recommendation stands on its own evidence and now on the absence of a competing source; the "worth importing at all" risk narrows to the Fall-back-to-A precondition (SBFL requires per-test coverage on the target repos), which is still the only 15-minute question that decides the whole item.

### installer-hq-dx
Summary: Ship `bin/moe-doctor` and `bin/moe-install` as cross-platform Node CLIs that probe prereqs, install/upgrade/uninstall Moe's plugins via `claude plugin`, migrate the renamed MCP keys, and flip memory+glass to npm-source marketplace entries so native Windows and WSL2 users get a working install with a real diagnostic.

Approach: Introduce two dependency-free Node scripts (`bin/moe-doctor`, `bin/moe-install`) that shell out to `claude plugin` for every install/upgrade operation and provide a `--migrate` path for the renamed MCP keys. Flip memory and glass to `{"source":"npm","package":"@bubstack/moe-<name>"}` in `.claude-plugin/marketplace.json`, relax `checkMarketplace()` to accept npm sources while still enforcing bidirectional listing↔registry equality, and generalise `githubOwnerRepo` in `packages/mint/src/adapters/shared.ts` to accept GitLab/Bitbucket hosts. Add INSTALL.md at repo root and a Vitest smoke test for the doctor. Do NOT re-do the DO-NOW-3 work (plugins tracked, .gitattributes pinned, ARCHITECTURE.md §6 Windows/WSL2 table) — it has already landed.

Files (write):
- bin/moe-doctor
- bin/moe-install
- bin/lib/probes.mjs
- bin/lib/migrate.mjs
- bin/test/doctor.test.ts
- packages/memory/package.json
- packages/glass/package.json
- .claude-plugin/marketplace.json
- scripts/mint-plugins.mjs
- packages/mint/src/adapters/shared.ts
- packages/mint/src/adapters/pi.ts
- packages/mint/src/adapters/claude-code.ts
- packages/mint/src/adapters/hermes.ts
- packages/mint/src/adapters/devin.ts
- packages/mint/test/adapters/claude-code.test.ts
- packages/mint/test/adapters/pi.test.ts
- packages/mint/test/adapters/hermes.test.ts
- packages/mint/test/adapters/devin.test.ts
- INSTALL.md
- README.md
- ARCHITECTURE.md

Contended files:
- .claude-plugin/marketplace.json — Guarded by checkMarketplace() in scripts/mint-plugins.mjs:207-230. Relaxing the guard for npm-source entries is part of this item. — moe-tone-and-branding
- ARCHITECTURE.md — Unguarded prose; cite-by-name mitigation. — runtime-pruning, gsd-core-skill-import
- packages/mint/src/adapters/shared.ts — runtime-pruning touches adapters broadly. Self-guarded by mint test suite. — runtime-pruning
- packages/mint/src/adapters/pi.ts — runtime-pruning may remove pi entirely; check first. — runtime-pruning
- packages/mint/src/adapters/claude-code.ts — Self-guarded by claude-code.test.ts. — runtime-pruning
- packages/mint/src/adapters/hermes.ts — runtime-pruning may prune hermes; verify. — runtime-pruning
- packages/mint/src/adapters/devin.ts — Same runtime-pruning risk. — runtime-pruning
- packages/mint/test/adapters/claude-code.test.ts — Vitest is the guard. — runtime-pruning
- packages/mint/test/adapters/pi.test.ts — May be deleted by runtime-pruning. — runtime-pruning
- packages/mint/test/adapters/hermes.test.ts — May be deleted by runtime-pruning. — runtime-pruning
- packages/mint/test/adapters/devin.test.ts — runtime-pruning touches test dir. — runtime-pruning

Gates:
```bash
cd /Users/zakkeown/Code/tools/moe && pnpm --filter @bubstack/moe-mint test
cd /Users/zakkeown/Code/tools/moe && pnpm --filter @bubstack/moe-mint build
cd /Users/zakkeown/Code/tools/moe && pnpm mint:check
cd /Users/zakkeown/Code/tools/moe && pnpm test
cd /Users/zakkeown/Code/tools/moe && pnpm lint
cd /Users/zakkeown/Code/tools/moe && node bin/moe-doctor; test $? -eq 0 -o $? -eq 1
cd /Users/zakkeown/Code/tools/moe && node bin/moe-install --help
cd /Users/zakkeown/Code/tools/moe && node bin/moe-install --migrate --help
cd /Users/zakkeown/Code/tools/moe && test $(grep -c -i windows ARCHITECTURE.md) -gt 0
cd /Users/zakkeown/Code/tools/moe && git ls-files --eol -- '*.cmd' '*.sh' 'hooks/**' 'packages/*/hooks/**' 'plugins/**/hooks/**' | grep -v 'w/lf' | grep -Ev '^i/-text|^i/binary' || true # no CRLF entries
cd /Users/zakkeown/Code/tools/moe && grep -q '"source": "npm"' .claude-plugin/marketplace.json && grep -q '@bubstack/moe-memory' .claude-plugin/marketplace.json && grep -q '@bubstack/moe-glass' .claude-plugin/marketplace.json
cd /Users/zakkeown/Code/tools/moe && ! grep -q '"private": true' packages/memory/package.json && ! grep -q '"private": true' packages/glass/package.json
cd /Users/zakkeown/Code/tools/moe && grep -q 'gitlab.tcdevops.com' packages/mint/test/adapters/claude-code.test.ts
manual: on a native Windows box with Git for Windows uninstalled, node bin/moe-doctor names the bootstrap-hook silent-skip and prints the CLAUDE_CODE_GIT_BASH_PATH remediation
```

Drift:
- `.gitignore:17-18` still contains `/plugins/` → actually replaced with an 8-line comment explaining `/plugins/` is generated but tracked.
- Root `pnpm mint` is a deliberate `exit 1` → actually `"mint": "turbo run mint:generate"`.
- `/Users/ZKeown/Code/moe/plugins` does not exist → repo lives at `/Users/zakkeown/Code/tools/moe`; plugins/ exists with all six subdirs.
- "There is no `.gitattributes`, and upstream had one" → .gitattributes exists (62 lines) with all EOL pins in place.
- ARCHITECTURE.md contains zero occurrences of "Windows"/"WSL"/"win32" → contains 7 occurrences including full Windows/WSL2 table.
- §6 "Local prerequisites" at ARCHITECTURE.md:215-244 → §6 titled "Toolchain" spans 283-364; prereqs subsection at 317+.
- glass `private:true` at `packages/glass/package.json:5` → actually on line 4.
- `packages/core/moe-mint.yaml` line citations → file does not exist; configs at `packages/core/mint/moe-{core,everything}.yaml`.
- Doc scope-marker "not `~/Code/tools/moe`" → this IS the work location.
- Marketplace flip omits that scripts/mint-plugins.mjs:221 hardcodes `expected = ./plugins/${entry.name}` — flipping JSON without relaxing this guard fails `pnpm mint:check`.
- `packages/memory/README.md:217-225` → citation is into a memory worktree, not the in-tree README.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) Doctor smoke test at `bin/test/doctor.test.ts` is not executed by any listed gate — `pnpm test` iterates package-level scripts and none cover repo-root `bin/`. Test lands green by default.
- (correctness, high) Install-doc emission for non-GitHub hosts is broken and the plan enshrines it in a test. `claude /plugin marketplace add Zak/moe` resolves to `github.com/Zak/moe`, not the GitLab instance. The helper must return richer data and emit the full URL for non-GitHub hosts.

### native-renderers
Summary: Add a shared four-rung native-rendering ladder (Claude artifact / browser companion / local HTML / markdown file) that brainstorming, writing-plans, and finding-duplicate-functions defer to, plus a default-private opt-in env var mirrored on MOE_LATTE_ENABLED, with grep-based assertions in metadata.test.ts.

Approach: Add `packages/core/skills/_shared/native-rendering.md` (under 100 lines) containing the four-rung ladder, the "if installed and configured, degrade cleanly" rule, and the sharing-default (private, override via env var). Reference it from three consumer skills (brainstorming, writing-plans, finding-duplicate-functions) as an additive rung, plus one-liners in each `using-moe/references/*-tools.md`. Introduce a `MOE_ARTIFACT_SHARING` env var modeled on `MOE_LATTE_ENABLED` (default off). Add three metadata.test.ts assertions: every "Artifact"-mentioning owned markdown file also names a fallback rung, `_shared/native-rendering.md` is reachable, and the env-var default is off. Do NOT rename companion scripts or touch mint/flight/marketplace.

Files (write):
- packages/core/skills/_shared/native-rendering.md
- packages/core/skills/brainstorming/SKILL.md
- packages/core/skills/writing-plans/SKILL.md
- packages/core/skills/finding-duplicate-functions/SKILL.md
- packages/core/skills/using-moe/references/antigravity-tools.md
- packages/core/skills/using-moe/references/codex-tools.md
- packages/core/skills/using-moe/references/gemini-tools.md
- packages/core/skills/using-moe/references/hermes-tools.md
- packages/core/skills/using-moe/references/kimi-tools.md
- packages/core/skills/using-moe/references/opencode-tools.md
- packages/core/skills/using-moe/references/pi-tools.md
- packages/core/test/metadata.test.ts

Contended files:
- packages/core/test/metadata.test.ts — GUARDED, self-guarding via skill-map completeness + LEAN_TIER_COUNT. Add assertions as a NEW describe block. — verification-split-and-firing-rate, tc-standards-conformance, runtime-pruning, gsd-core-skill-import, moe-tone-and-branding
- packages/core/skills/_shared/native-rendering.md — GUARDED directory: every relative link must resolve. Must be added to the reachability `shared[]` array. — (none)
- packages/core/skills/using-moe/references/antigravity-tools.md — Guarded by proxy: metadata.test.ts line 919 asserts references files exactly match SKILL.md backticks. — moe-tone-and-branding
- packages/core/skills/using-moe/references/codex-tools.md — Same references/ guard. — moe-tone-and-branding
- packages/core/skills/using-moe/references/gemini-tools.md — Same guard. — moe-tone-and-branding
- packages/core/skills/using-moe/references/hermes-tools.md — Same guard. — moe-tone-and-branding
- packages/core/skills/using-moe/references/kimi-tools.md — Same guard. — moe-tone-and-branding
- packages/core/skills/using-moe/references/opencode-tools.md — Same guard; metadata.test.ts:835 pins 'superpowers' token — do not remove. — moe-tone-and-branding
- packages/core/skills/using-moe/references/pi-tools.md — Same guard. — moe-tone-and-branding
- packages/core/skills/brainstorming/SKILL.md — Prose; `test:brainstorm` + metadata literals at 216-247 pin the skill name. — moe-tone-and-branding, runtime-pruning
- packages/core/skills/writing-plans/SKILL.md — Prose; tiered-workflow-naming rewrites work-shape vocab in W03. — moe-tone-and-branding, tiered-workflow-naming
- packages/core/skills/finding-duplicate-functions/SKILL.md — Prose; keep `${CLAUDE_PLUGIN_ROOT}`-anchored paths intact. — moe-tone-and-branding

Gates:
```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core test:brainstorm
pnpm --filter @bubstack/moe-core lint
test $(wc -l < packages/core/skills/_shared/native-rendering.md) -lt 100
test -f packages/core/skills/_shared/native-rendering.md
grep -q 'native-rendering.md' packages/core/skills/brainstorming/SKILL.md packages/core/skills/writing-plans/SKILL.md packages/core/skills/finding-duplicate-functions/SKILL.md
Manual macOS smoke: run each of brainstorming, writing-plans, finding-duplicate-functions; confirm the companion opens; with CLAUDE_CODE_DISABLE_ARTIFACT=1 the skill drops a rung instead of stalling.
Manual Windows (Git Bash) smoke: start-server.sh binds, browser opens, a new screen is picked up, $STATE_DIR/events is written and read back, stop-server.sh leaves no orphan node process.
```

Drift:
- Read core skills in worktree `.claude/worktrees/wf_238bb49d-362-13` → packages/core on main is fully populated; the worktrees directory does not exist. Read straight from main.
- `metadata.test.ts:606-607` asserts using-moe references completeness → assertion at lines 918-932.
- `metadata.test.ts:270` `${CLAUDE_PLUGIN_ROOT}`-anchored paths test → at line 420.
- `metadata.test.ts:411-420` LATTE default-off test → at lines 593-602.
- `metadata.test.ts:101` skills/ directory-shape assertion → at 153-159.
- `skill-tiers.yaml:205-210` windows-vm entry → at 254-259.
- `metadata.test.ts` is 690 lines → actually 964.
- `metadata.test.ts:474` no-core-REQUIREs-everything → at 726-764.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) Assertion (a) fires RED on day 1: `iterative-development/SKILL.md` contains `## Artifact Location` and `running-an-iteration/SKILL.md` contains `| Artifact validation |` — neither references the Claude Code Artifact tool nor a fallback. The grep must match `Artifact tool` / `publish an artifact`, not the bare word.
- (integration-risk, high) Every SKILL.md edit target is anchored by line number, violating WAVES.md integration protocol. Nine stale line citations already surfaced in ONE drift round; three of the three edited SKILL.md files are also written by moe-tone-and-branding.

### runtime-pruning
Summary: Delete the gemini mint adapter and its container install; strip grok's prose + container install; recount and rewrite the eleven-harness claims in prose, docs, and PARITY.

Approach: This is a census-then-delete with no new features. Delete `packages/mint/src/adapters/gemini.ts` and its test entirely, drop `gemini` from `ADAPTER_NAMES` and the adapters registry, and strip grok's prose (`agents-marketplace.ts` header, installDoc "On Grok:" block, docs-emit NOTES). Regenerate the vitest snapshot and hand-audit the delta (only gemini/grok hunks). Drop container `npm install` lines for `@google/gemini-cli` and `@xai-official/grok`, delete gemini/grok functions from `run-checks.sh`, and sweep prose in CONFIG.md, README.md, BROCHURE.md, ARCHITECTURE.md, PARITY.md, and packages/core/README.md — 12 → 10 adapters, 11 → 10 harnesses. Antigravity remains out of scope. Do NOT touch anything under `packages/*/docs/history/` or `../.moe-references/`.

Files (write):
- packages/mint/src/adapters/gemini.ts
- packages/mint/src/adapters/index.ts
- packages/mint/src/adapters/agents-marketplace.ts
- packages/mint/src/adapters/claude-code.ts
- packages/mint/src/adapters/cursor.ts
- packages/mint/src/bootstrap/generated.ts
- packages/mint/src/generate.ts
- packages/mint/src/config.ts
- packages/mint/src/docs-emit.ts
- packages/mint/test/adapters/gemini.test.ts
- packages/mint/test/__snapshots__/generate.test.ts.snap
- packages/mint/test/generate.test.ts
- packages/mint/test/cli.test.ts
- packages/mint/test/docs-emit.test.ts
- packages/mint/test/config.test.ts
- packages/mint/test/init.test.ts
- packages/mint/test/test-command.test.ts
- packages/mint/test/adapters/opencode.test.ts
- packages/mint/test/adapters/agents-marketplace.test.ts
- packages/mint/test/dogfood.test.ts
- packages/mint/checks/run-checks.sh
- packages/mint/docs/CONFIG.md
- packages/mint/README.md
- packages/mint/docs/BROCHURE.md
- packages/core/README.md
- packages/flight/README.md
- infra/container/Dockerfile
- infra/container/bin/harness-versions
- ARCHITECTURE.md
- PARITY.md

Contended files:
- ARCHITECTURE.md — Unguarded prose per WAVES.md. Cite by heading/quoted-phrase, not line number. — installer-hq-dx, gsd-core-skill-import
- PARITY.md — Unguarded prose. Append rows to `### Not ported` table at file tail. — gsd-core-skill-import
- packages/core/README.md — Unguarded prose; edits are at lines 241-242, 279, 623, 707 (delete-set trivia + bootstrap-resolver bullet). — verification-split-and-firing-rate
- packages/mint/test/adapters/gemini.test.ts — Self-guarded; this item DELETES the file. installer-hq-dx writes sibling files in the same dir. — installer-hq-dx
- packages/mint/src/adapters/index.ts — Self-guarded by registry.test.ts. — installer-hq-dx
- packages/mint/src/config.ts — Self-guarded by registry.test.ts. — (none)
- packages/mint/test/__snapshots__/generate.test.ts.snap — Self-guarded (vitest snapshot), 940 lines. Regenerate with `-u`. — (none)

Gates:
```bash
pnpm --filter @bubstack/moe-mint build
pnpm --filter @bubstack/moe-mint test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
test ! -f packages/mint/src/adapters/gemini.ts
test ! -f packages/mint/test/adapters/gemini.test.ts
node packages/mint/dist/cli.js matrix | tee /tmp/matrix-out.txt && test $(grep -cE '^\| [a-z]' /tmp/matrix-out.txt) -eq 10 && ! grep -q '^| gemini' /tmp/matrix-out.txt
rg -i 'gemini|grok' packages/mint/src packages/mint/checks packages/mint/test infra/container | grep -v 'AGY_OAUTH_HOME=/auth/gemini' | grep -v 'docs/history' | tee /tmp/leaks.txt && test ! -s /tmp/leaks.txt
! grep -qE '@google/gemini-cli|@xai-official/grok' infra/container/Dockerfile
grep -qE '^  agy$' infra/container/bin/harness-versions
! grep -qE '^  (gemini|grok)$' infra/container/bin/harness-versions
bash -n packages/mint/checks/run-checks.sh
MOE_MINT_PLUGIN_NAME=kitchen-sink MOE_MINT_PLUGIN_ROOT=$(mktemp -d) bash packages/mint/checks/run-checks.sh 2>&1 | tee /tmp/checks-out.txt; ! grep -qE '(install-gemini|install-grok|check_gemini)' /tmp/checks-out.txt
grep -q 'gemini' PARITY.md && grep -q 'grok' PARITY.md && grep -q 'dropped, not discontinued' PARITY.md
```

Drift:
- `ARCHITECTURE.md:17,24` → hits at 22 and 29.
- `packages/core/README.md:27-28` → lines are unrelated; real hits at 241, 242, 279, 623, 707.
- `packages/mint/README.md:267-271` (six-tests-skip bullet) → at 270-274.
- `packages/mint/docs/BROCHURE.md:37` Antigravity clause → across 38-39.
- `dogfood.test.ts` expected-difference at :148,191-196 → `EXPECTED_DIFFERENCES = []` at :130; real gemini touch points at :82, :102-103, :170, :215-220.
- `run-checks.sh` line anchors → each off by 1-2 lines from doc.
- Worktree path `.claude/worktrees/wf_238bb49d-362-15` → not accessible; cite on-main state.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) `pnpm mint:check` will fail after this lands. `/plugins/moe-{core,everything,memory,glass,backstory,crew}/` hold committed `gemini-extension.json`, `GEMINI.md`, install docs, and `commands/*.toml`. Approach never says to run `pnpm mint` and stage the deletions.
- (correctness, high) `init.test.ts:135-146` uses `GEMINI.md` as a functional collision fixture, not a name literal. Plan groups it under "adjust count/name literals".
- (correctness, high) `cli.test.ts:87-104` is a `harnesses: exclude: [gemini]` prune-test — semantic rewrite required, not a literal count.
- (correctness, high) `config.test.ts`, `opencode.test.ts`, `agents-marketplace.test.ts`, `docs-emit.test.ts` all use gemini/grok as functional test subjects. Plan groups all under "adjust literals" without naming substitutes.

### tc-standards-conformance
Summary: Retire the sibling fork `ai/claude-code-platform-plugin` by porting its TC deltas into `packages/core/`, mutating five core skills plus one references file to GitLab/MR vocabulary and `sc-{card}/{slug}` branch derivation, adding `_shared/tc-conventions.md` (with a pinned-upstream provenance manifest), creating root `CODEOWNERS` and `.gitlab/merge_request_templates/Default.md`, and wiring a `tc-conventions-drift` scheduled CI job into `.gitlab-ci.yml`.

Approach: Create `_shared/tc-conventions.md` with a provenance manifest naming `ai/skills@<sha>` and `ai/claude-code-platform-plugin@<sha>` (real SHAs, not placeholders), housing the branch format, labels, tool preference, and MR body shape. Rewrite Option 2 in `finishing-a-development-branch/SKILL.md` to MR-first via `gitlab_create_mr`. Insert a Step 1b in `using-git-worktrees/SKILL.md` for `sc-{card}/{slug}` branch derivation, stripping the tool's `feature/` prefix. Rewrite `receiving-code-review/SKILL.md`'s GitHub thread-replies section to GitLab discussions. Do a vocabulary pass on `writing-clearly-and-concisely`, `writing-skills`, and `codex-tools.md`. Create root `CODEOWNERS` and `.gitlab/merge_request_templates/Default.md`, port 17 tc-* skills into `packages/core/skills/` with tier assignments, and append a schedule-only `tc-conventions-drift` job to `.gitlab-ci.yml`. Regenerate `/plugins/`.

Files (write):
- packages/core/skills/_shared/tc-conventions.md
- packages/core/skills/finishing-a-development-branch/SKILL.md
- packages/core/skills/using-git-worktrees/SKILL.md
- packages/core/skills/receiving-code-review/SKILL.md
- packages/core/skills/verification-before-completion/SKILL.md
- packages/core/skills/writing-clearly-and-concisely/SKILL.md
- packages/core/skills/writing-skills/SKILL.md
- packages/core/skills/using-moe/references/codex-tools.md
- packages/core/skill-tiers.yaml
- packages/core/test/metadata.test.ts
- packages/core/skills/tc-*/
- CODEOWNERS
- .gitlab/merge_request_templates/Default.md
- .gitlab-ci.yml
- plugins/

Contended files:
- packages/core/skills/_shared/tc-conventions.md — Directory guarded; new file legal, internal links checked. — native-renderers
- packages/core/skills/verification-before-completion/SKILL.md — Prose; verification-split-and-firing-rate splits this skill. Coordinate merge order. — verification-split-and-firing-rate
- packages/core/skills/writing-clearly-and-concisely/SKILL.md — Prose; rebase on moe-tone-and-branding first. — moe-tone-and-branding
- packages/core/skills/writing-skills/SKILL.md — Prose; same rebase-on-tone requirement. — moe-tone-and-branding
- packages/core/skill-tiers.yaml — GUARDED by metadata.test.ts; adding 17 tc-* skills requires 17 rows + LEAN_TIER_COUNT bump. — gsd-core-skill-import
- packages/core/test/metadata.test.ts — GUARDED. Bump `LEAN_TIER_COUNT` and `expect(...).toBe(27)` deliberately. — gsd-core-skill-import, verification-split-and-firing-rate, native-renderers
- .gitlab-ci.yml — Unguarded but inconsequential; rebase on moe-tone-and-branding. — moe-tone-and-branding
- plugins/ — Generated; CI's `plugins:` job asserts byte-identity. Regenerate last, after all merges. — installer-hq-dx, native-renderers, verification-split-and-firing-rate, runtime-pruning, gsd-core-skill-import, moe-tone-and-branding

Gates:
```bash
test -f packages/core/skills/_shared/tc-conventions.md
test -f CODEOWNERS
test -f .gitlab/merge_request_templates/Default.md
grep -rniE 'pull request|gh pr|gh api|gh repo' packages/core/skills --include='*.md' | grep -vE 'developing-claude-code-plugins/|writing-skills/anthropic-best-practices.md|systematic-debugging/test-pressure-1.md' | (! grep .)
grep -q 'ai/skills@' packages/core/skills/_shared/tc-conventions.md
grep -q 'ai/claude-code-platform-plugin@' packages/core/skills/_shared/tc-conventions.md
grep -rq 'skills/_shared/tc-conventions.md' packages/core/skills/finishing-a-development-branch packages/core/skills/using-git-worktrees packages/core/skills/receiving-code-review
pnpm --filter @bubstack/moe-core test
pnpm mint
pnpm mint:check
pnpm lint
pnpm typecheck
pnpm test
The `tc-conventions-drift` CI job (in `.gitlab-ci.yml`, guarded by `$CI_PIPELINE_SOURCE == "schedule"`) passes against the recorded SHAs and fails when a manifest SHA is hand-edited to a stale value — verify manually before merge.
```

Drift:
- `writing-clearly-and-concisely/SKILL.md:27`, `writing-skills/SKILL.md:666` → actual lines 34 and 672.
- Frontmatter `touches:` misses `writing-clearly-and-concisely/`, `writing-skills/`, `using-moe/references/codex-tools.md`, plus 17 tc-* skills, skill-tiers.yaml, metadata.test.ts.
- Doc scope-marker excluding `~/Code/tools/moe` → this IS the Moe monorepo.
- `_shared/` holds 3 fragments referenced by 10 skills → confirmed.
- Recommendation option 2 → Debate-review block withdraws option 2's justification; the two halves of the doc contradict.
- Effort ~4-5h → re-scoped to 12-17h in the Decisions block; WAVES.md carries 14.5h.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) Plan proposes bumping `expect(Object.keys(imported).length).toBe(27)` when adding 17 tc-* skills, but `imported:` enumerates only the six pinned upstream sources. tc-* skills belong in `authored:` (currently `{}`); the 27-pin and the enumerated `expected` list must remain untouched.
- (correctness, high) Overlap between step 2 (rewrite `finishing-a-development-branch`) and step 7 (port `tc-finishing-branch`) unresolved. Two competing skills for the same slot is exactly what Q1 was meant to eliminate.
- (integration-risk, high) Line-number-only citations for unguarded prose in `codex-tools.md` and `receiving-code-review/SKILL.md` — WAVES.md protocol forbids.
- (integration-risk, high) Plan writes 17 new tc-* directories but does not enumerate them or their tier assignments. `metadata.test.ts`'s two-map completeness turns red on a single unregistered directory.

### verification-split-and-firing-rate
Summary: Split verification into a deterministic Node Stop-hook that captures test/build evidence and a skill-firing counter under repo-local `.audit/`, plus a goal-backward section added to `verification-before-completion/SKILL.md`.

Approach: Create `packages/core/hooks/moe-completion-evidence` as a Node Stop-hook (default-ON, gated by `MOE_EVIDENCE_DISABLED`) that parses the transcript JSONL, matches Bash tool_use commands against an allowlist of `pnpm test`/`pnpm build`/etc., and writes `.audit/<session>-<turn>.json` with exit code + output tail. Same hook also counts `tool_use` entries with `name:"Skill"` and writes `.audit/<session>-firing.json`. Warn (never block) on completion-claims without matching evidence. Register as the SECOND Stop entry in `hooks/hooks.json`, invoked directly as `node ...`. Add a `## Goal-Backward Verification` section to `verification-before-completion/SKILL.md` between "Common Failures" and "Red Flags", with a fixture at `tests/goal-backward-scenario.md`. Extend the metadata.test.ts extensionless-shebang router to include node, add three hook assertions, and add `.audit/` to `.gitignore`.

Files (write):
- packages/core/hooks/hooks.json
- packages/core/hooks/moe-completion-evidence
- packages/core/skills/verification-before-completion/SKILL.md
- packages/core/skills/verification-before-completion/tests/goal-backward-scenario.md
- packages/core/test/metadata.test.ts
- packages/core/README.md
- .gitignore
- .gitattributes

Contended files:
- packages/core/test/metadata.test.ts — GUARDED via accounts-for-every-skill + X_BIT_ALLOWLIST. Any new executable must be listed. — native-renderers
- packages/core/skills/verification-before-completion/SKILL.md — Unguarded prose; tc-standards-conformance also edits (both additive). — tc-standards-conformance
- packages/core/README.md — Unguarded prose; cite named subsections not line numbers. — runtime-pruning
- .gitattributes — GUARDED via `git ls-files --eol`. Existing `packages/*/hooks/** text eol=lf` covers new hook; skip write if `git check-attr eol` reports `lf`. — installer-hq-dx
- .gitignore — Unguarded; simple additive append of `.audit/`. — installer-hq-dx

Gates:
```bash
pnpm --filter @bubstack/moe-core test
pnpm --filter @bubstack/moe-core lint
pnpm check
pnpm mint:check
node --check packages/core/hooks/moe-completion-evidence
test -x packages/core/hooks/moe-completion-evidence
git check-attr eol -- packages/core/hooks/moe-completion-evidence | grep -q 'eol: lf'
git ls-files --eol packages/core/hooks/moe-completion-evidence | grep -q 'w/lf'
grep -q '^\.audit/' .gitignore
printf '{"session_id":"t","transcript_path":""}' | MOE_EVIDENCE_DISABLED=1 node packages/core/hooks/moe-completion-evidence
Hand-inspect one real session's .audit/<session>-firing.json before drawing any conclusion from the counter (doc's own verification step)
Metadata suite's new assertions pass: (a) Stop[0].hooks[1] invokes node on hooks/moe-completion-evidence; (b) X_BIT_ALLOWLIST contains hooks/moe-completion-evidence; (c) node-shebang extensionless files are routed through node --check; (d) hook exits 0 empty when MOE_EVIDENCE_DISABLED is set
```

Drift:
- `using-moe:16` "Every OTHER skill you reach through the Skill tool" → at line 13.
- `writing-plans:63` **Goal:** and `:68-69` **Spec:** → Goal at 63 ok; Spec at 69-70.
- `writing-skills:374-387` Iron Law block → roughly 371-397; "Not for 'just adding a section'" at line 386.
- MOE_LATTE_ENABLED default-off assertion → at metadata.test.ts:593-602.
- Hooks pattern references → confirmed at claude-judge-continuation:58 and hooks.json:3-14.
- crew's windows-hooks.md rewrite-to-node history → confirmed.
- auditing-progress tier/from → confirmed.
- verification-before-completion 120 lines, tier: core → confirmed.

Lens verdicts: correctness: risky · integration-risk: risky

Open concerns:
- (correctness, high) `files.write` omits `plugins/moe-core/hooks/*` and `plugins/moe-everything/hooks/*`. Adding a new hook and editing `hooks.json` requires `pnpm mint` regeneration and commit; without it, `pnpm mint:check` fails.
- (correctness, high) Default-on + repo-local `.audit/` ships to every user of this plugin. `git rev-parse --show-toplevel` lands `.audit/` in each user's own project. Only THIS repo's `.gitignore` is updated. Needs opt-in marker file or `$HOME/.claude/moe/audit/<repo-basename>/` fallback.

## Blocked
(none)

## In-branch (skipped)
- moe-tone-and-branding — branch: (WAVES.md: complete on a branch and awaiting merge; no matching local branch under refs/heads/, only 'main' exists locally)

## Merged (skipped)
- skill-set-fidelity-refactor — WAVES.md: merged to main on 2026-08-31

## Integration reminders
- A worker's findings are scoped to the tree it read; its report names the SHA.
- Reviewers compare SHAs before comparing claims.
- Cross-boundary citations use a test name, symbol or quoted sentence — never a line number.
