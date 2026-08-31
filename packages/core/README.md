# @bubstack/moe-core

The house skills. Brainstorming, planning, TDD, systematic debugging, code
review, finishing a branch — plus an alternative iterative methodology, writing
guidance, plugin authoring, four experimental tools, and one Stop hook that
judges whether the agent should keep working.

Ships as **two** generated plugins from this one source tree — `moe-core` (the
everyday set) and `moe-everything` (all of them) — built into `/plugins/` by
`@bubstack/moe-mint`. Never hand-edit a generated manifest.

**Status:** imported. 27 skills. 205 tests passing, 5 skipped, across five
suites — see [Verification](#verification). The lean/full split is a **proposal
awaiting review**; see [Two plugins, one source tree](#two-plugins-one-source-tree).

## Forked from

Six upstreams, four inbound licenses, one package. This is the hardest import in
the fork and the only multi-license one.

| Upstream repo | Pinned | License | Contributes |
|---|---|---|---|
| `superpowers` | `b36e082` | MIT | 14 skills, the polyglot hook wrapper |
| `superpowers-lab` | `51111f7` | MIT | 4 experimental skills |
| `iterative-development` | `c05889a` | Apache-2.0 | 6 skills + 3 shared PAR references |
| `the-elements-of-style` | `05fc4f0` | Public domain | 1 skill, and the `moe-mint.yaml` seed |
| `superpowers-developing-for-claude-code` | `74afe93` | MIT (asserted, no LICENSE) | 2 skills, 2 example plugins |
| `double-shot-latte` | `dfe7567` | MIT | the Stop hook. Zero skills. |

Snapshots are in `../../../.moe-references/` (gitignored). They are the spec —
not upstream `main`. See [PARITY.md](../../PARITY.md).

### Licensing

`licenses/` holds one verbatim copy per inbound notice, which is what root
`NOTICE` promises ("retained alongside the code derived from them, under each
package"). The glass precedent — one upstream, one `LICENSE` at the package
root — does not generalise here.

| File | Notice |
|---|---|
| `licenses/superpowers.MIT.LICENSE` | MIT, Copyright © 2025 Jesse Vincent |
| `licenses/superpowers-lab.MIT.LICENSE` | MIT, Copyright © 2025 Jesse Vincent (byte-identical to the above) |
| `licenses/double-shot-latte.MIT.LICENSE` | MIT, **Copyright © 2024 Anthropic** |
| `licenses/iterative-development.Apache-2.0.LICENSE` | Apache-2.0, Copyright 2026 Prime Radiant, Inc. |

`package.json` declares `MIT AND Apache-2.0`. The scaffold said `Apache-2.0`;
that was the guess `packages/glass` and `packages/crew` both had to correct, and
here neither single value is right.

Two things worth recording rather than silently reconciling:

- **`double-shot-latte`'s LICENSE says Anthropic; its git author is Jesse
  Vincent,** and every sibling `obra` repo says "Copyright (c) 2025 Jesse
  Vincent". Root `NOTICE` lists it under Jesse Vincent / MIT. The file is left
  verbatim — editing a license notice breaks the grant — but the discrepancy is
  real and belongs in `NOTICE`.
- **`superpowers-developing-for-claude-code` ships no LICENSE at all.** Its
  README says "MIT License - See LICENSE file" and points at a file that does not
  exist; the only MIT assertion was in a `plugin.json` that mint replaces. The
  shared `superpowers.MIT.LICENSE` covers it by same-author inference, which is
  weaker than a retained notice.

#### Statement of changes (Apache-2.0 §4(b))

Apache-2.0 requires stating that files were changed. `iterative-development`
contributes `skills/{auditing-progress,extracting-requirements,implementing-tasks,iterative-development,running-an-iteration,scoping-the-simplest-core}/`
and `skills/_shared/`. Of its 25 imported files, **11 are byte-identical to
`c05889a`** and **11 were modified** (verified with `cmp`); the remaining 3 moved
from `skills/shared/` to `skills/_shared/` unchanged in content. The
modifications are: the rebrand described below, the `${CLAUDE_PLUGIN_ROOT}`
anchoring, and two test fixtures. No methodology, gate, threshold, artifact
format or prompt was changed.

Per-source totals, same method:

| Source | identical | modified |
|---|---|---|
| `superpowers` | 21 | 22 |
| `superpowers-lab` | 8 | 2 |
| `iterative-development` | 11 | 11 |
| `the-elements-of-style` | 1 | 1 |
| `superpowers-developing-for-claude-code` | 2 | 4 |

## Layout

```
skills/                 27 skills, one flat namespace. Six upstreams merged here.
  _shared/              3 PAR reference documents. NOT a skill — no SKILL.md, so
                        moe-mint's readSkills() skips it. Was skills/shared/.
hooks/
  hooks.json            The Stop hook only. moe-mint owns SessionStart.
  run-hook.cmd          The cmd/bash polyglot dispatcher. One of four upstream
                        copies; see below.
  claude-judge-continuation   The Stop hook. Opt-in, default OFF.
scripts/validate_skill.py     Frontmatter validator, exercised by test/iterative-development/.
moe-mint.yaml           The moe-core plugin config. Seeded from
                        the-elements-of-style's everyharness.yaml.
skill-tiers.yaml        The lean/full curation, as data. A PROPOSAL.
licenses/               One verbatim notice per inbound license.
test/
  metadata.test.ts      30 vitest assertions. THE verification for this package.
  iterative-development/  37 Python unittest tests over the 9 skill CLIs.
  brainstorm-server/    130 upstream node:assert + `ws` tests over server.cjs.
  shell/                8 bash assertions over find-polluter.sh and render-graphs.mjs.
  latte/                65 conversation scenarios for the Stop hook. Opt-in.
docs/history/           62 files. Inherited record — see below. Byte-identical.
```

## Two plugins, one source tree

`skill-tiers.yaml` is the boundary, and it is data rather than two copies of the
skills. `tier: core` ships in both plugins; `tier: everything` ships in
`moe-everything` only. Thirteen core, fourteen everything-only, and
`moe-everything` is a strict superset.

The principle is ARCHITECTURE.md §2's: *a skill earns `moe-core` if it fires on
ordinary work without being asked for.* Two rules were layered on it, pulling in
opposite directions:

- **Closure.** A `**REQUIRED SUB-SKILL:**` or `**REQUIRED BACKGROUND:**` marker
  in a lean-tier skill naming a skill the reader does not have installed is a
  dead end mid-workflow. So the target is lean-tier too.
  `test/metadata.test.ts` enforces this.
- **Err small.** Where closure does not force the answer, the tie goes to
  `everything`.

Closure is what sets the size. The everyday spine is
brainstorm → plan → execute → review → finish, and four of the thirteen
(`subagent-driven-development`, `executing-plans`, `using-git-worktrees`,
`finishing-a-development-branch`) are in the lean tier because a core skill
marks them REQUIRED, not because they fire unprompted. Cut them and
`writing-plans` ends by naming two execution options the reader cannot reach.

**The most arguable call, flagged deliberately:**
`writing-clearly-and-concisely` is `tier: core`. Its trigger is literally "ANY
prose humans will read", so it fires more often than anything else here; its
lean cost is one description line, because the ~12,000-token 1918 text is a
separate file opened on demand. If the reviewer disagrees, this is the one to
move — it breaks no closure edge. Every other rationale is in
`skill-tiers.yaml` next to the skill it justifies.

### The mechanism does not exist yet

`moe-mint` reads exactly `<root>/moe-mint.yaml`, and `readSkills()` takes every
subdirectory of one `components.skills` path that contains a `SKILL.md`
(`packages/mint/src/model.ts`). There is no skill-level filter, and `--dir` is
one argument for both config-in and files-out. So:

- `moe-mint.yaml` here describes **`moe-core` only**, and generating it today
  would emit all 27 skills, not 13.
- `moe-everything` has no config file, because a second one at this root could
  not be read.

`skill-tiers.yaml` is therefore the spec for the mint feature as much as the
curation itself. Two ways to close it, both a mint change: a skill-level
include/exclude in the config, or a `--config` flag plus a staging step. Listed
in the follow-ups.

## What changed on import

### The delete set came first

Roughly a third of `superpowers` should not be rebranded — it should not exist
here. Deciding that before running any sweep removed ~250 Zone-A brand tokens
rather than rewriting them.

**Everything moe-mint generates.** All nine hand-maintained plugin manifests,
`.agents/`, `.codex-plugin/`, `.cursor-plugin/`, `.devin-plugin/`,
`.kimi-plugin/`, `.hermes-plugin/`, `.opencode/`, `.pi/`, `GEMINI.md`,
`gemini-extension.json`, the root `package.json`, `.version-bump.json`,
`scripts/bump-version.sh`, `hooks/hooks-cursor.json`, `hooks/session-start`, and
the nine test groups that existed only to check them
(`tests/{devin,kimi,codex,antigravity,pi,hermes,opencode,version-bump,codex-plugin-sync}`).
Three of those tests asserted `manifest.name == "superpowers"`; all nine were
testing the thing mint replaces.

**Everything that is public-OSS governance for an audience of twenty.**
`CODE_OF_CONDUCT.md` (its only brand token was a live abuse-reporting address at
the upstream author's company — worse than having no CoC), `.github/**` entirely,
`.pre-commit-config.yaml` (three hooks all scoped to an `evals/` directory that
is gitignored and absent), and `scripts/{sync-to-codex-plugin,package-codex-plugin}.sh`
(820 lines that clone, rsync and open a pull request against a public GitHub
fork — void under the no-public-publishing decision, and the densest Zone-A file
in the repo was their test).

**`scripts/lint-shell.sh` and its test.** It mixes `git ls-files` (CWD-relative)
with `git diff --name-only` (root-relative), so inside a monorepo subdirectory it
resolves nothing, reports "No shell files found", and exits green having linted
nothing. There is no shell linter in ARCHITECTURE.md §6 to hand it to.

**Upstream branding artwork** — `assets/superpowers-small.svg` and
`assets/app-icon.png`, a Prime Radiant mark and icon referenced only by the
deleted codex manifest.

### Three adapter-only tool mappings were extracted before the adapters went

Each existed nowhere but inside a hand-maintained loader that mint regenerates,
so each would have vanished on the next `generate`:

| Mapping | Was | Now |
|---|---|---|
| OpenCode | an inline template literal in `.opencode/plugins/superpowers.js` | `skills/using-moe/references/opencode-tools.md` |
| Kimi Code | a 1,400-character `skillInstructions` string in `.kimi-plugin/plugin.json` | `skills/using-moe/references/kimi-tools.md` |
| Pi | **two divergent copies** — `piToolMapping()` in the extension and `references/pi-tools.md` | merged into `references/pi-tools.md` |

`using-moe`'s Platform Adaptation list now names all seven reference files.
Upstream's named four, omitted `gemini-tools.md` while `GEMINI.md` loaded exactly
that file, and only the `antigravity` entry was test-enforced.
`test/metadata.test.ts` now checks the list and the directory agree in both
directions.

### The bootstrap wrapper is a behaviour change, and it is flagged

`bootstrap: { skill: using-moe }` makes mint emit the SessionStart hook. Its
wrapper is `<plugin-bootstrap plugin="moe-core">The following skill … is loaded
at session start:`. Upstream's hand-written hook wrapped the same content in
`<EXTREMELY_IMPORTANT>\nYou have superpowers.` plus, on three harnesses, an
explicit *it is ALREADY LOADED — do NOT use the skill tool to load it again*.
Upstream's own `CLAUDE.md` says that framing is the mechanism that makes skills
auto-trigger.

Resolution: adopt mint's wrapper — hand-carrying a session-start hook
reintroduces exactly the drift mint exists to remove — and move both dropped
instructions **into `skills/using-moe/SKILL.md`**, which mint `cat`s verbatim
inside its wrapper. The imperative framing was already in the skill body; the
new `<ALREADY-LOADED>` block is the part that was only in the wrapper.

**This is unverified behaviourally.** Upstream's acceptance test for it was
"does brainstorming fire on *let's make a react todo list*". Nothing here proves
the swap is neutral, and four of the five upstream resolvers failed *silently* on
a miss, so the tests cannot tell you either. It wants a session and, ideally, a
`@bubstack/moe-flight` eval.

### Four identifier renames that break at runtime

| Kind | Upstream | Moe | Notes |
|---|---|---|---|
| Skill-tool namespace | `superpowers:<skill>` | bare backticked name | 32 occurrences, 11 targets. See below. |
| Bootstrap skill | `using-superpowers` | `using-moe` | The only brand-tokened skill name, and load-bearing in five resolvers. |
| Working-tree state dir | `.superpowers/{sdd,brainstorm}/` | `.moe/{sdd,brainstorm}/` | In the **user's** repo, not this one. |
| Taught output path | `docs/superpowers/{plans,specs,iterations}/` | `docs/moe/…` | 57 occurrences, prose only — no script hardcodes it. |

**The plugin prefix is gone, not translated.** One source tree emits two plugins
with different names, so no single prefix (`moe-core:` or `moe-everything:`) is
correct in both — and 14 of the 27 skills are absent from `moe-core` entirely, so
`moe-core:windows-vm` would be provably dangling. The bare frontmatter `name:` is
the one form stable across both plugins and a personal or project install. It
also loses nothing: three of upstream's sixteen qualified forms were **already
dangling** (`superpowers:code-reviewer`, whose agent was deleted in v6.x;
`superpowers:testing-anti-patterns`, which never existed;
`superpowers:brainstorm`, a command), so the prefix was buying no verification.
`test/metadata.test.ts` asserts no qualified form and no retired name survives.

The sweep for `superpowers:` did **not** find everything: `brainstorming/SKILL.md`
carried `elements-of-style:writing-clearly-and-concisely`, a *different* plugin's
prefix pointing at a skill that now lives in the same package. The metadata test
found it, not the sweep.

**`.superpowers/` → `.moe/` is a user-data migration, not a rename.** Existing
SDD ledgers and brainstorm port/token files on every machine become invisible,
and `sdd-workspace` will cheerfully create a fresh empty directory beside them.
There is no fallback read of the old path. That belongs in a release note.

### Runtime paths were anchored, because they were broken upstream

Five of the six sources addressed their own scripts with bare relative paths —
`python3 "scripts/chunk_spec.py"`, `./scripts/extract-functions.sh`,
`skills/shared/par-reviewer-wrapper.md`, `./find-polluter.sh`. At runtime the
agent's cwd is the **user's** project, so all of them resolved to nonexistent
files in the user's tree. Moving the code neither caused nor fixed that.

One convention now, and it is the one this package's own
`developing-claude-code-plugins/references/plugin-structure.md` mandates:

```
${CLAUDE_PLUGIN_ROOT}/skills/<skill-name>/<path>
```

93 anchored references. `test/metadata.test.ts` resolves every
`${CLAUDE_PLUGIN_ROOT}/skills/…` path against the tree. Quick-reference table
cells and diagram labels keep the short name — they are identifiers, not
commands.

Also fixed: `using-tmux-for-interactive-commands` pointed at
`/home/jesse/git/interactive-command/tmux-wrapper.sh`, the upstream author's home
directory, while the wrapper it ships sat unreferenced beside its `SKILL.md`. No
brand-token sweep would have found that.

### The telemetry beacon was removed, not rebranded

`skills/brainstorming/scripts/server.cjs` injected
`<img src="https://primeradiant.com/brand/…?v=<version>">` into every page the
visual companion served, sending the plugin version and the viewer's IP to the
upstream author's company on every session — opt-out only, via three env vars. A
naive rebrand leaves the fork phoning home with a Moe version number.

Removed: the image URL, the three-variable opt-out array, the
`SUPERPOWERS_TELEMETRY_DISABLED` const, the `<img>`, and the outbound `<a href>`.
What remains is `Moe v<version>` as text. `test/brainstorm-server/branding.test.cjs`
was rewritten around the inverse invariant — *the served HTML must contain no
remote asset and no outbound link at all* — which is a sturdier guard than the
five opt-out permutations it replaced.

The version probe was repointed while it was open: upstream read
`package.json` then `.codex-plugin/plugin.json` from the plugin root, and mint
emits neither, so the version silently became `unknown` in the shipped tree. It
now reads `.claude-plugin/plugin.json` first, and a test builds a
mint-shaped fixture tree to prove the depth.

### The Stop hook ships default OFF

`double-shot-latte`'s contribution asks a Haiku instance, on every stop attempt,
whether the agent should keep working — and blocks the stop if it says yes. It is
the most behaviour-altering thing in this merge: it overrides the agent's own
decision to stop, for everyone, permanently, and a hook is not a skill, so the
lean/full split gives no lever over it.

`MOE_LATTE_ENABLED` must be set to a truthy value. Unset, the hook exits 0
immediately.

Three defects were fixed on the way in:

1. **It was a silent no-op on macOS.** Upstream wrapped the judge call in
   `timeout`, which is GNU coreutils and is not on a stock macOS. Exit 127 → the
   "command failed" branch → allow the stop. It installed, fired, reported
   success and did nothing. Now it probes `timeout`, accepts `gtimeout`, and runs
   unwrapped with a printed warning if neither exists.
2. **Every failure looked identical.** Six of eight exit paths emitted the same
   silent `approve`, which is what hid defect 1. Each now prints its reason to
   stderr.
3. **An unparseable transcript tail was classified as an empty conversation,**
   which reliably yields STOP. `jq -s` failing on a partial JSONL write is
   routine. Now it says so instead.

Renamed, and the rename *is* the migration safety mechanism: anyone who still has
the upstream plugin installed would otherwise share a throttle counter and a
recursion sentinel with it.

| Upstream | Moe |
|---|---|
| `DOUBLE_SHOT_LATTE_MODEL` / `_TIMEOUT` | `MOE_LATTE_MODEL` / `MOE_LATTE_TIMEOUT` |
| `CLAUDE_HOOK_JUDGE_MODE` | `MOE_LATTE_JUDGE_MODE` |
| `$HOME/.claude/double-shot-latte` | `$HOME/.claude/moe/latte` |
| `/tmp/.claude-continue-throttle-<session>` | `$HOME/.claude/moe/latte/throttle/<session>` |

`claude-judge-continuation` keeps its name. It describes what it does, and the
extensionless form is load-bearing — Claude Code on Windows prepends `bash` to
any command containing `.sh`, which defeats the CMD dispatch.

### One `run-hook.cmd`, hand-merged from four

Three sources contributed a byte-different copy, and a fourth canonical version
lived in a reference document that **contradicted the code shipping beside it**:
`polyglot-hooks.md` stated that `$0` is required because
`${BASH_SOURCE[0]:-$0}` is a "Bad substitution" under dash, while
`double-shot-latte`'s wrapper — the one that would have shipped — used
`${BASH_SOURCE[0]:-$0}`. Its own CHANGELOG records the fix at v1.1.5; v1.2.0
reverted it.

`superpowers`' copy is the union and it wins: all three Windows bash locations,
`$0`, `exec bash` (so the dispatched script needs no execute bit), and a silent
`exit /b 0` when no bash is found. `polyglot-hooks.md` was replaced with
`superpowers`' newer `docs/windows/polyglot-hooks.md` — which also documents the
`"shell": "bash"` key and the `.sh` auto-prepend the older copy lacked — and
repointed at the wrapper and hook that actually ship. `hooks/hooks.json` carries
both fixes that upstream kept alternating between: the path is quoted *and*
`"shell": "bash"` is set, which is one fix, not two.

`test/metadata.test.ts` asserts the wrapper is dash-safe, uses `exec bash`, and
keeps all three Windows fallbacks.

### Module format: two latent bugs

`packages/core/package.json` declares `"type": "module"`, and the **generated
plugin has no `package.json` at all** (the opencode and pi adapters are
excluded). So a bare `.js` in this package is ESM in the source tree and
CommonJS once installed. Two files relied on one classification each:

- `skills/writing-skills/render-graphs.js` is ESM (`import` at top level) →
  `SyntaxError` in the installed plugin. Now `render-graphs.mjs`.
- `skills/working-with-claude-code/scripts/update_docs.js` is CommonJS →
  `ReferenceError: require is not defined` in the source tree. Now
  `update_docs.cjs`, the same fix `packages/crew` made for `csd.cjs`.

`skills/brainstorming/scripts/helper.js` → `helper.cjs` (a browser IIFE with a
`module.exports` guard so its unit test can require the pure function; the
content is inlined into HTML, so the extension is invisible to the browser), and
the seven `test/brainstorm-server/*.test.js` suites → `.cjs`.

### The 42-file Claude Code docs corpus was dropped

`working-with-claude-code` shipped a verbatim mirror of
`docs.claude.com/en/docs/claude-code/*` — 42 files, 572 KB, 12,265 lines, 88% of
that source's bytes. Four independent reasons to drop it, in order of force:

1. **It is behind this repo's own schema.** Its `plugins-reference.md` "Complete
   schema" documents 11 `plugin.json` keys and omits `skills` entirely plus all
   eight of `channels`, `dependencies`, `lspServers`, `monitors`, `outputStyles`,
   `settings`, `themes`, `userConfig` — every one of which
   `packages/mint/schemas/claude-code-plugin-manifest.json` already validates. A
   skill whose whole pitch is "authoritative, stop guessing" that is behind the
   monorepo's own schema launders a wrong answer as an official one.
2. **It is stale.** Newest model ids are `claude-sonnet-4-5-20250929`;
   `skills.md` opens "Claude Code version 1.0 or later". Pinned 2025-12-03.
3. **It is regenerable in one command** and contains nothing the fork authored —
   zero brand tokens, zero local edits.
4. **It is not MIT.** It is Anthropic's copyrighted documentation, in a package
   whose root `NOTICE` entry says MIT / Jesse Vincent. Committing it would put
   88% of that source's bytes under a false attribution — exactly what PARITY's
   License-exposure discipline exists to catch, and a needless second entry in a
   ledger that already carries one knowingly-accepted unlicensed body.

The self-update script stays, guarded, and `SKILL.md` was rewritten to route to
`https://docs.claude.com/en/docs/claude-code/<topic>.md` by default and treat the
local cache as an explicitly-populated, explicitly-stale convenience. The cache
directory is not committed; it needs a root `.gitignore` line (see
[Root changes needed](#root-changes-needed)).

### Two inherited test failures, fixed

`test/iterative-development/` was **red at `c05889a`** — 35 of 37 passing,
reproduced here before anything was touched. The 2026-04-11 behaviour-evidence
redesign added a required `**Journey scenario:**` field to a roadmap's
walking-skeleton section and a required `**Scenarios:**` field to each
iteration-log entry — both validators enforce them, both `SKILL.md` templates
document them — and never refreshed the two `.example` fixtures. Two added lines
in two fixtures; 37/37. No validator and no skill body was touched.

Also fixed in that suite: `subprocess.run(["python3", …])` → `sys.executable` in
all six modules (a hardcoded interpreter *name* dies with `FileNotFoundError`
under a venv or an image with no `python3` shim), and every
`Path(__file__).parent.parent` anchor gained one `.parent` for the extra
directory level.

### Other content reconciliations

- **`implementing-tasks` declares itself a fork of `subagent-driven-development`,**
  which now lives in the same plugin. Rewritten from cross-plugin to
  intra-plugin, and it now says which one to reach for.
- **`scoping-the-simplest-core` reads a prompt template out of
  `running-an-iteration`'s directory.** Anchored and labelled; the two skills
  cannot be split across tiers, which is why the whole cluster is one tier.
- **`developing-claude-code-plugins` Phase 2 and Phase 6 were rewritten.** Phase
  2 instructed the reader to hand-write `plugin.json` and `marketplace.json`;
  ARCHITECTURE §2 generates both and forbids hand-editing. Phase 6 instructed
  `git push origin main`, `git tag`, GitHub releases and
  `github.com/your-org/…` distribution; origin is GitLab and Moe publishes
  nothing publicly. A token sweep would have left both intact — this is the
  edit class that has no brand token in it at all.
- **`examples/simple-greeter-plugin/skills/professional-greeting/SKILL.md` had no
  frontmatter,** so Claude Code would not have loaded it — while `SKILL.md` and
  the sibling README both cite it as the canonical minimal plugin demonstrating
  "proper skill structure with frontmatter". Frontmatter added. Both example
  manifests lost the upstream author's name, email and `github.com/obra`
  placeholder repo.
- **`skills/shared/` → `skills/_shared/`.** It is not a skill, it has no
  `SKILL.md`, and `shared` is the most generic possible name in a directory that
  now holds 27 skills from six upstreams. The underscore sorts it first and
  signals what it is. `moe-mint`'s `readSkills()` skips it either way.
- **`update_docs.cjs` write path guarded.** The output filename came straight
  from remote content (`path.basename` of a URL matched out of a fetched
  `llms.txt`) with no validation.
- **`examples/` moved under the skill that documents it.** Upstream it sat at the
  repo root and was referenced as `examples/…` from `SKILL.md` seven times, which
  only resolved from the repo root. As `skills/developing-claude-code-plugins/examples/`
  all seven resolve, and the nested manifests stay two levels deep — out of
  `readSkills()`'s one-level scan, so `example-workflow` and
  `professional-greeting` do not register as real skills.

## Rebrand, and what was deliberately left alone

Zone A only. Substitutions were applied longest-token-first, with the ALL-CAPS
forms as a separate pass.

| Kind | Upstream | Moe | Occurrences now |
|---|---|---|---|
| Skill cross-reference | `superpowers:<skill>` | `` `<skill>` `` | 36 |
| Bootstrap skill | `using-superpowers` | `using-moe` | 7 |
| State dir (user's repo) | `.superpowers/` | `.moe/` | 21 |
| Taught output path | `docs/superpowers/` | `docs/moe/` | 57 |
| Prose | `Superpowers` | `Moe` | 16 |
| Stop-hook env vars | `DOUBLE_SHOT_LATTE_*`, `CLAUDE_HOOK_JUDGE_MODE` | `MOE_LATTE_*` | 15 |
| Test env var | `SUPERPOWERS_ROOT` | `MOE_CORE_ROOT` | 2 |
| Plugin name in prose | `superpowers`, `superpowers-developing-for-claude-code` | `moe-core` | 10 |
| Cross-package pointer | `superpowers-chrome` | `moe-glass` | 2 |
| Generator | `everyharness` | `moe-mint` | 22 |
| Config file | `everyharness.yaml` | `moe-mint.yaml` | 1 |
| Path anchors added | (bare relative) | `${CLAUDE_PLUGIN_ROOT}/skills/…` | 93 |

**Kept, deliberately:**

- **`elements-of-style.md`** — the reference filename in
  `writing-clearly-and-concisely`. Its basename contains a brand-shaped token but
  it names *the book*, not the upstream project, and `SKILL.md` cites it three
  times as a bare relative sibling with nothing guarding the link. The Project
  Gutenberg #37134 provenance was moved into `SKILL.md`, since the upstream
  README that carried it is now only in `docs/history/`.
- **`claude-judge-continuation`, `run-hook.cmd`, `find-polluter.sh`,
  `sdd-workspace`, `task-brief`, `review-package`** — descriptive names, and
  three of them are invoked as bare paths with no `bash` prefix. Same reasoning
  `packages/glass` applied to `chrome-ws` and `packages/crew` to
  `driving-claude-code-sessions`.
- **`BRAINSTORM_*` (14 env vars)** — they describe a brainstorm server, not a
  project.
- **`writing-skills/anthropic-best-practices.md`** — 1,150 lines of Anthropic's
  public skill-authoring documentation, verbatim, containing *example*
  frontmatter blocks inside fenced code at lines ~206–275 that a frontmatter
  scanner or `sed` sweep would corrupt. Excluded from every sweep in this
  package, including the metadata test's own. Note that upstream's `CLAUDE.md`
  says their philosophy *differs* from this document — whether it should ship at
  all is a separate question.
- **`github.com/{dockur,f,anthropics}/…`** — third-party project URLs, not
  self-reference.
- **`test/latte/scenarios/*.json`** — 65 frozen conversation fixtures where the
  text *is* the test input. Four of them are verbatim captures of the upstream
  author's own sessions (scenario 64 addresses him by name; 61–64 mention another
  of his projects). Correctness-neutral: the classification signal is the
  completion phrasing, not the nouns. A sweep here would rewrite the data under
  the assertion.

**`docs/history/` and `licenses/` are untouched — byte-identical to the pinned
snapshots, verified with `cmp` and `diff -rq` over all 66 files.** They describe
projects that *were* called by their upstream names. Note that `superpowers`'
changelog is **`RELEASE-NOTES.md`, not `CHANGELOG.md`** — 94 KB and the single
largest Zone-B file, which every exclusion list keyed on the string "CHANGELOG"
misses entirely.

### Where the upstream files went

| Upstream path | Here |
|---|---|
| `superpowers/CLAUDE.md` | `docs/history/superpowers/CLAUDE.md` |
| `superpowers/RELEASE-NOTES.md` | `docs/history/superpowers/RELEASE-NOTES.md` |
| `superpowers/docs/superpowers/{plans,specs}/` | `docs/history/superpowers/{plans,specs}/` |
| `superpowers/docs/plans/` | `docs/history/superpowers/docs-plans/` |
| `superpowers/docs/{testing,porting-to-a-new-harness}.md` | `docs/history/superpowers/` — both stale; `testing.md` omits ten of the test groups |
| `superpowers/docs/windows/polyglot-hooks.md` | replaced `developing-claude-code-plugins/references/polyglot-hooks.md` |
| `iterative-development/docs/superpowers/{plans,specs}/` | `docs/history/iterative-development/{plans,specs}/` |
| `iterative-development/{ABOUT.md,catalog-info.yaml}` | `docs/history/iterative-development/` — `ABOUT.md` carries a "do not hand-edit; regenerated" banner naming a `maintaining-project-map` skill that exists in **none** of the 19 snapshots, and three claims that are false in the fork |
| `double-shot-latte/RELENG.md` | `docs/history/double-shot-latte/RELENG.md` — public-marketplace release process, void here; kept because it is the record |
| every source's `README.md` | `docs/history/<source>/UPSTREAM-README.md` |
| `superpowers/tests/` | `test/brainstorm-server/`, `test/shell/` (the rest deleted) |
| `iterative-development/tests/` | `test/iterative-development/` |
| `double-shot-latte/test/evals/` | `test/latte/` |
| `the-elements-of-style/everyharness.yaml` | `moe-mint.yaml` |

### Not imported

| Path | Why |
|---|---|
| `superpowers/{.claude-plugin,.agents,.codex-plugin,.cursor-plugin,.devin-plugin,.kimi-plugin,.hermes-plugin,.opencode,.pi}/`, `GEMINI.md`, `gemini-extension.json`, `package.json`, `.version-bump.json` | 15 hand-maintained files moe-mint generates. Read for identifiers first; the three adapter-only tool mappings were extracted. |
| `superpowers/AGENTS.md` | A git symlink to `CLAUDE.md`. Upstream conflated contributor governance with the agents.md instructions file; a plain `cp -r` would have materialised a duplicate 8.8 KB copy. The AGENTS.md surface is a separate decision. |
| `superpowers/CODE_OF_CONDUCT.md` | Contributor Covenant boilerplate whose only brand token is a live abuse-reporting address at the upstream author's company. |
| `superpowers/.github/**` | No workflows exist (PARITY's CI table correctly omits this repo). `FUNDING.yml` solicits sponsorship for the upstream author; the five issue/PR templates are rebuilt as GitLab equivalents, not translated. |
| `superpowers/scripts/{bump-version,lint-shell,package-codex-plugin,sync-to-codex-plugin}.sh` + their four test groups | Version bumping is `moe-mint bump`; the shell linter is broken in a monorepo subdirectory; the two codex-distribution scripts are void. |
| `superpowers/tests/{devin,kimi,codex,antigravity,pi,hermes,opencode,version-bump,codex-plugin-sync,hooks}/` | Test the manifests and the session-start hook that mint replaces. The one invariant worth keeping — that `using-moe/SKILL.md` names every file in `references/` — is now a vitest assertion that checks both directions. |
| `superpowers/tests/{claude-code,explicit-skill-requests}/` | 13 runners that drive the real `claude` CLI, one documented at 10–30 minutes, all burning real tokens and non-deterministic. They belong in `@bubstack/moe-flight`. |
| `superpowers/assets/` | Prime Radiant logo artwork. |
| `superpowers/.pre-commit-config.yaml` | Dead: all three hooks scoped to `^evals/.*\.py$`, and `evals/` is gitignored and absent. |
| `superpowers/skills/…` (nothing) | Every skill and companion file was imported. |
| `sp-dev-for-cc/skills/working-with-claude-code/references/` (42 files) | See above. |
| `iterative-development/scripts/run_validation_suite.sh` | Its eight stages are the vitest metadata suite (skill validation) plus `test:python` (fixtures and pipeline). It also aborted before six of its eight stages at `c05889a`, because `set -e` plus the two failing fixtures killed it at stage 1. |
| `double-shot-latte/.claude/settings.local.json` | A **committed personal machine file** granting `Bash(git add:*)`, `Bash(jq:*)` and an `episodic-memory` MCP permission. Imported by accident it would grant those in every Moe checkout. Same call `packages/glass` made on `.private-journal/`. |
| every source's nested `.gitignore`, `LICENSE` (→ `licenses/`), `plugin.json` | Root files govern; manifests are generated. |
| `tests/brainstorm-server/{package.json,package-lock.json}` | Nested npm project, flattened. `ws@^8.21.0` moved to this package's `devDependencies`. |

## Verification

Every number below was produced by running the command, on this machine, at the
commit this README ships in.

```
pnpm --filter @bubstack/moe-core test              #  30 passed  (vitest, test/metadata.test.ts)
pnpm --filter @bubstack/moe-core test:python       #  37 passed  (python3 -m unittest, 6 modules)
pnpm --filter @bubstack/moe-core test:brainstorm   # 130 passed  (9 suites: 32+15+3+20+3+33+13+4+7)
pnpm --filter @bubstack/moe-core test:shell        #   8 passed,  5 skipped (no graphviz)
pnpm --filter @bubstack/moe-core lint              #   0 errors, needs the biome override below
pnpm --filter @bubstack/moe-core typecheck         #   content package: no TypeScript
```

**205 passed, 5 skipped.** `pnpm test` (and therefore `turbo run test` and
`pnpm check`) runs only the 30 metadata assertions, which is the deliberate
choice: they are the verification this package's correctness actually rests on,
and they need nothing but node. The other four suites are opt-in for the reasons
`vitest.config.ts` records.

**What the 5 skipped tests are.** `test/shell/test-render-graphs.sh` needs a real
graphviz `dot` for its five rendering assertions. graphviz is not in
ARCHITECTURE.md §6's toolchain and is absent here and from the `node:24` CI
image, so they self-skip with a printed reason rather than fail. The three
assertions that do *not* need `dot` still run — including the one that catches a
`.js`/`.mjs` module-classification regression in `render-graphs.mjs`, which is
exactly the bug this import fixed.

**The stop-hook eval harness was verified without spending a token.**
`pnpm latte:evals` is 65 scenarios × 5 runs = 325 authenticated model calls, so
it is never in CI. `MOE_LATTE_FAKE_CLAUDE=1 bash test/latte/run-evals.sh` swaps
in a stub judge that always answers `should_continue: false`, and reports
**36 passed / 29 failed** — exactly the corpus's 36-STOP / 29-CONTINUE split.
That proves the whole harness end to end (transcript construction, hook event
shape, hook execution under the opt-in gate, decision parsing, per-run throttle
isolation) and proves nothing about the judge prompt. Both upstream entry points
were dead at `dfe7567` — they pointed at `../../scripts/claude-judge-continuation.sh`,
a directory that does not exist in that repo and a filename whose extension the
v1.2.0 rename had removed — so **there is no upstream pass rate to regress
against.** Do not read a real eval number here as a regression until a baseline
exists.

**Zone B was diffed, not assumed.** All 62 files under `docs/history/` and all 4
under `licenses/` are byte-identical to the pinned snapshots, checked with `cmp`
per file and `diff -rq` per directory.

**`moe-mint` was run, against a scratch copy.** `--dir` conflates config-in with
files-out, so generating into this tree would drop 26 files beside the source.
Copying the package to a temp directory and running it there proves the config
end to end:

```
moe-mint generate --dir <copy>   # Generated 26 files for 9 harness(es)
moe-mint validate --dir <copy>   # validate: clean
```

Nine harnesses, not eleven — `opencode` and `pi` are excluded because both emit a
full-replacement `package.json` into the plugin root, and this plugin root is
`packages/core`, whose `package.json` is the pnpm workspace manifest. Confirmed:
no `package.json` appears in the generation manifest.

Three things that verifies which nothing else does:

- The generated `plugin.json` carries no upstream token, both URLs are GitLab,
  and `license` is `MIT AND Apache-2.0`.
- `hooks/moe-mint/hooks.json` contains **both** the `Stop` entry cloned from this
  package's `hooks/hooks.json` and mint's own `SessionStart` bootstrap entry — so
  the merge works and there is exactly one session-start implementation.
- All three bootstrap resolvers (`hooks/moe-mint/session-start`, `GEMINI.md`,
  `.hermes-plugin/__init__.py`) point at `skills/using-moe/SKILL.md`, which is
  also proof that `bootstrap: { skill: using-moe }` resolved — `buildModel()`
  throws if the named skill is absent.

One warning is expected and deliberate: *README.md has no moe-mint install
markers*. The install path here is the hand-maintained root
`.claude-plugin/marketplace.json`, not a per-package install table, so this README
carries no `<!-- moe-mint:install:start -->` pair. Adding them is a decision
someone can take later.

**What is still unverified.** The mint bootstrap-wrapper swap (above) — no test
here can see it, and four of the five upstream resolvers failed silently on a
miss. The `windows-vm` skill cannot be exercised on any machine in this fork.

## Two skills that ship with caveats

Both are `tier: everything`, and both are audience questions rather than import
mechanics.

- **`windows-vm` cannot run here.** It needs `/dev/kvm` (absent on darwin),
  `sshpass`, imagemagick's `convert`, and Debian's `apt`. It also hard-codes
  `USERNAME=user` / `PASSWORD=password` across two `docker run` blocks and six
  `sshpass -p 'password'` invocations, and names its container the unqualified
  `windows11` — a host-global name that collides with any other `windows11`
  container on the machine. Ports are bound to `127.0.0.1`, which is the
  mitigation upstream chose.
- **`mcp-cli` installs a third-party binary onto your PATH.** Its documented first
  step is `git clone --depth 1 https://github.com/f/mcptools && CGO_ENABLED=0 go
  build -o ~/.local/bin/mcp ./cmd/mcptools`. It needs Go and network, it writes to
  the user's PATH, and the skill has no way to verify what it built.

## Root changes needed

Confined to this package otherwise; these four need a root file.

1. **`biome.json`** — add two globs to the **existing** first override (the one
   already covering `**/packages/glass/**` and `**/packages/mint/**`):
   `**/packages/core/skills/**` and `**/packages/core/test/{brainstorm-server,iterative-development,latte}/**`.
   Same reason as glass: upstream ran no formatter, and reformatting 18 near-verbatim
   files would bury the rebrand diff under whitespace. The override's retained rules
   pass as-is — the 24 unused `catch (e)` bindings were fixed to `catch (_e)` rather
   than exempted, so `noUnusedVariables: "error"` still holds. Verified: with the
   formatter and assist disabled and only those rules active, `biome check
   packages/core` reports 0 diagnostics. My own authored files
   (`test/metadata.test.ts`, `vitest.config.ts`) are outside those globs, follow the
   root config, and are clean (3 `noTemplateCurlyInString` warnings for literal
   `${CLAUDE_PLUGIN_ROOT}` strings; warnings exit 0).
2. **`.gitignore`** — add `packages/core/skills/working-with-claude-code/references/`.
   That is the on-demand Claude Code docs cache `update_docs.cjs` writes. Until it
   lands, running the populate script leaves 42 untracked files.
3. ~~**`ARCHITECTURE.md` §4 and `.claude-plugin/marketplace.json`**~~ — **DONE
   2026-08-31.** Both fixed, along with two more `28` claims in ARCHITECTURE.md
   §2 and §3 that this note had not spotted. Kept here for the reasoning: both said
   `moe-core` has **28 skills**. It has **27**. Counting frontmatter `name:`
   across the six pinned sources: superpowers 14, iterative-development 6,
   superpowers-lab 4, sp-dev-for-cc 2, the-elements-of-style 1,
   double-shot-latte 0. The 28th was almost certainly `example-workflow`, a
   pseudo-skill inside an example plugin that is not a skill. Asserted in
   `test/metadata.test.ts`.
4. **`NOTICE`** — two corrections. `double-shot-latte` is listed under Jesse
   Vincent / MIT, but its retained `LICENSE` reads "Copyright (c) 2024
   Anthropic"; and `superpowers-developing-for-claude-code` is listed under MIT
   with no LICENSE file anywhere to retain, so the promise that copies "are
   retained alongside the code derived from them" cannot be met for it from this
   snapshot.

`pnpm-lock.yaml` also changed — three `devDependencies` (`vitest`, `ws`, `yaml`)
were added to this package and an install was required to verify. It will
conflict with every other concurrent import and should be regenerated at
integration.

Also worth correcting in `PARITY.md` when someone is in there: its rebrand
footprint says `iterative-development` has 22 files to touch (the real figure is
26 — 17 Zone A + 9 Zone B) and `the-elements-of-style` 31 (a content count that
misses two brand-token *filenames* with token-free bodies).

## Follow-ups

- **The lean/full split cannot be built.** `moe-mint` needs either a skill-level
  include/exclude in `moe-mint.yaml` or a `--config` flag plus a staging step, and
  `--dir` needs to stop conflating config-in with files-out. `skill-tiers.yaml` is
  the spec. Until then this package generates one plugin containing all 27 skills.
- **`moe-mint` does not detect duplicate skill `name:`.** `readSkills()` maps
  directory → `{name, dir}` and sorts; two directories declaring the same
  frontmatter `name` emit two manifest entries with the same name, silently. Here
  the filesystem happens to guard it because every name equals its directory, and
  `test/metadata.test.ts` asserts that — but the guarantee belongs in mint.
- **`moe-mint` must not emit a `hooks` key in `plugin.json`.** `hooks/hooks.json`
  is auto-discovered; referencing it from the manifest loads it twice and errors.
  The only record of this is `docs/history/double-shot-latte/CHANGELOG.md` v1.1.1
  and v1.0.1 — a file every sweep is told to skip. It wants a mint test.
- **The bootstrap-wrapper swap wants an eval,** not a code review. See above.
- **`test/latte/scenarios/` are acceptance-criteria cards in all but name** — 65
  fixtures, uniform schema, a boolean expectation each. They should become
  `@bubstack/moe-flight` story cards once flight lands. Same follow-up
  `packages/glass` carries for `test/scenarios/`.
- **The 13 `claude`-CLI-driven suites belong in `@bubstack/moe-flight` too.** They
  were deleted here rather than carried unrun; the snapshot is the record.
- **`test/brainstorm-server/` is 3,000 lines of bare async IIFE + `node:assert`,
  not vitest.** It runs and passes as-is via `test:brainstorm`, which is why it
  was not rewritten during the import — but it is outside `pnpm test`, spawns
  servers on fixed ports, and `stop-server.test.sh` `mktemp -d`s *inside* the test
  directory, so an interrupted run litters `.stop-persistent.*` in the source tree.
- **`test/iterative-development/` is Python in a package whose `typecheck` echoes
  "no TypeScript".** 37 tests, stdlib only, no manifest. ARCHITECTURE §6 puts
  Python only in `py/proof` under uv. It works and it is the only coverage the 9
  skill CLIs have; wiring it into CI needs a `python3` in the image.
- **Three of `iterative-development`'s scripts have no test at all** —
  `aggregate_scenarios.py` (217 lines, the largest script here),
  `backlink_scenarios.py` (113) and `validate_scenarios.py` (122), 452 lines
  invoked by `extracting-requirements/SKILL.md`.
- **`check_citations.py` exists twice, byte-identical** (67 lines), once under
  `running-an-iteration` and once under `scoping-the-simplest-core`. Kept as two
  copies deliberately: each skill's Quick Reference documents it relative to
  itself, only the `scoping` copy has test coverage, and de-duplicating would add a
  cross-skill edge to save 67 lines. Recorded because this package also ships a
  `finding-duplicate-functions` skill, and the irony should be on the record.
- **`generate-report.sh` swallows `jq` errors** in three `2>/dev/null || true`
  blocks: malformed subagent output yields a silently empty report section rather
  than a failure. Verified that the HIGH/MEDIUM/LOW counters do survive.
- **`extract-functions.sh` emits absolute paths** when handed an absolute source
  directory, and those flow into `catalog.json`, the LLM prompt, and the shared
  markdown report — leaking machine paths into any report a human circulates.
- **`finding-duplicate-functions` prescribes bare model families** (`haiku`,
  `opus`) in 13 places across 5 files, with no agent definition and no `model:`
  field to select either. Bare family names go stale; capability tiers ("a cheap
  model to categorise, a strong one to detect") would not.
- **The dead `.brand-logo` / `.brand a` CSS is still in both HTML templates** now
  that no image and no link are emitted. Inert, and touching a dense template to
  remove inert CSS was not worth the risk during the import.
- **One provenance URL was lost with the deleted `hooks/session-start`:**
  `github.com/obra/superpowers/issues/571`, which explained why that hook used
  `printf` rather than a heredoc (a bash 5.3 hang). mint's generated template also
  uses `printf`, so the behaviour survives — but the reason now lives only in the
  snapshot.
- **`windows-vm` carries command-shaped frontmatter** (`argument-hint`,
  `allowed-tools`). `allowed-tools` is a live runtime gate; `argument-hint` is a
  *command* property in the vendored manifest schema and inert on a skill. The
  skill is written as a slash command and converting it to `commands/` is a real
  option.
