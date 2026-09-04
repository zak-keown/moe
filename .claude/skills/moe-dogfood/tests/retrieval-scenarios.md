# Retrieval-scenario checks for `moe-dogfood`

`moe-dogfood` is a **reference** skill (a command reference + a diagnosis
table), so it is validated the way `write-skill` prescribes for reference
skills: **retrieval, application, and gap scenarios** — can a fresh agent *find*
the right information in the skill and *apply* it correctly — not the
pressure/rationalization scenarios used for discipline skills.

Each scenario names the correct answer and the **regression markers**: the
answers that mean the agent fell back to the pre-rewrite mental model (the
directory-marketplace + `stage.py` + `@tc` scope + hand-repoint model). A GREEN
run that produces any regression marker is a failure of the skill, not the
agent.

## How to run

Use fresh-context subagents; score every answer by hand (template echoes and
quoted counter-examples masquerade as hits).

- **RED (baseline, no skill):** a fresh agent answers the scenarios from general
  knowledge, forbidden from reading files or searching the repo. Confirms the
  information is non-obvious — an agent cannot supply it without the reference.
  The historically observed RED is stronger and is on the record: in the session
  that produced this rewrite, an agent followed the *old* SKILL and was led to
  `~/.moe/local-marketplace` (a location nothing loads) and a non-existent
  `@tc/moe-memory` package, and briefly concluded the live install was damaged.
- **GREEN (with skill):** a fresh agent reads **only**
  `../SKILL.md` and answers from it alone. Must hit the correct answer with no
  regression markers.

## Scenarios

### S1 — Install from scratch (retrieval + application)
**Ask:** From the repo, what exact commands install Moe's plugins into Claude
Code from scratch?
**Correct:** `node bin/moe-install --harness claude-code` (dry-run) then the same
with `--apply`; the emitted plan is `claude plugin marketplace add
https://github.com/zak-keown/moe.git` followed by `claude plugin install
<name>@moe` for the six plugins; then **restart the session**.
**Regression markers:** copying `plugins/` into a directory; running a
`stage.py`; `~/.moe/local-marketplace`; editing a staged `hooks.json`.

### S2 — Dogfood a working-tree change (application; the core trap)
**Ask:** You edited `packages/memory`. How do you make that change live in a
running Claude Code dogfood session, and why is editing the repo not enough?
**Correct:** the marketplace serves **published** versions — the working tree is
not live until published (a `v*` tag → `publish.yml` → npm, plus the matching
`marketplace.json` on `zak-keown/moe` main); then `claude plugin marketplace
update moe`, update the plugins, and **restart**. Must state that a repo edit
alone does nothing to the install.
**Regression markers:** "re-stage and restart"; "copy the dist and restart";
"`pnpm mint` then restart" presented as making the edit live.

### S3 — Diagnose MODULE_NOT_FOUND (diagnosis retrieval)
**Ask:** Every Bash hook fails with a `node:internal/modules/cjs/loader`
MODULE_NOT_FOUND and no plugin name. Cause and fix?
**Correct:** a plugin's installed runtime is missing/broken or a half-finished
install; reinstall that plugin and confirm the version dir under
`<config-dir>/plugins/cache/moe/<plugin>/<version>/`; restart.
**Regression markers:** "`moe-crew/dist` missing from the **staged** copy,
re-stage"; any fix that repoints or copies a `dist/` by hand.

### S4 — Source of truth + config-home gotcha (diagnosis retrieval)
**Ask:** A plugin shows enabled but misbehaves. Where is the authoritative record
of what's installed and where the marketplace resolves from, and what's the
config-directory gotcha?
**Correct:** `enabledPlugins` in `<config-dir>/settings.json`, plus
`installed_plugins.json` and `known_marketplaces.json`; a marketplace's
`installLocation` can sit under a **different config home** (`~/.claude` vs
`~/.claude-alt`); a stale session is settled by a restart; the versioned cache's
timestamps mislead.
**Regression markers:** "check `~/.moe/local-marketplace`, never the cache" as
the source of truth.

### S5 — Retire a plugin (application; ordering)
**Ask:** Remove a plugin leaving the marketplace without breaking the running
session — order of operations, and what breaks if reversed?
**Correct:** `claude plugin uninstall <name>@moe` **first**, while the session
still holds it; then `claude plugin marketplace update moe`; restart. Doing it
after removal leaves the session firing the plugin's hooks at a gone directory
(`Plugin directory does not exist` every event until restart).

### S6 — Publication fact (gap check on the exact staleness fixed)
**Ask:** Are Moe's plugins published to npm, under what scope, and what package
backs the `moe-memory` plugin (and the `moe` plugin)?
**Correct:** yes, public npm, scope `@bubstack`; `moe-memory` → `@bubstack/moe-memory`,
`moe` → `@bubstack/moe-core`.
**Regression markers:** `@tc/...`; "never published."

## Results — last run (2026-09-04, post-rewrite SKILL)

Fresh general-purpose subagents: 1 RED (general knowledge, no file access), 2
GREEN (each read only `../SKILL.md`). Every answer scored by hand.

| Scenario | RED (no skill) | GREEN rep 1 | GREEN rep 2 |
|---|---|---|---|
| S1 install | ✗ reconstructed the old directory-marketplace + `pnpm mint` model; couldn't name `bin/moe-install`, the github URL, or the plugin slugs | ✓ | ✓ |
| S2 dogfood edit | ✗ "`pnpm mint` + restart makes it live" — the exact regression | ✓ named the published-version caveat | ✓ |
| S3 MODULE_NOT_FOUND | ✗ guessed "re-run install/mint/build"; missed reinstall-the-plugin | ✓ | ✓ |
| S4 source of truth | ~ got the `CLAUDE_CONFIG_DIR` gotcha, but could not name the truth files | ✓ | ✓ |
| S5 retire order | ~ roughly right (detach consumer first) — partly derivable without the skill | ✓ | ✓ |
| S6 npm/scope | ~ `@bubstack` scope, but *unsure the plugins are published* | ✓ `@bubstack/moe-memory` | ✓ + `moe`→`@bubstack/moe-core` |

**GREEN:** 6/6 both reps, zero regression markers, answers near-identical
(low variance → the content is binding, not merely present).

**RED:** the information is non-obvious, and an agent's *default* reconstruction
is the superseded model (directory marketplace, `pnpm mint` to go live, `@tc`
doubt) — i.e. the failure this rewrite prevents. The `@bubstack` scope and the
retire ordering (S5) proved partly guessable, so S5 is the weakest
discriminator; the load-bearing checks are S1, S2, S3, and S6.

**Gaps prompting a skill edit:** none this run.
