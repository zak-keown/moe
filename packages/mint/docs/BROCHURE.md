# moe-mint — what it is, who it's for

Generate a coding-agent plugin for every harness from one config file.

> **Status: imported, `0.0.0`.** Inherited from upstream `everyharness` @
> `4f7c5e2`, whose feature set was complete at its v1.0.0: eleven harness
> adapters, init/import, generated install docs, container-backed install
> checks. This fork's inbound adapter count is ten — Gemini CLI and Grok Build
> CLI were retired in this repo (see PARITY.md's "Not ported" table). The
> `moe-mint.yaml` schema and generation-manifest format were declared stable
> upstream and are unchanged here. `@bubstack/moe-mint` is not published to any
> registry and is not intended to be — it is a workspace bin and the
> monorepo's plugin build step. Every "unpublished on npm" note below is
> inherited framing; the fork's answer is that npm was never the plan.

## What you get

You wrote a plugin and people liked it. Then they asked for it in their own
coding agent. Claude Code reads `.claude-plugin/plugin.json`. Codex reads
`.codex-plugin/plugin.json`. OpenCode wants a JavaScript plugin file, Pi wants
a TypeScript extension, and Hermes wants YAML plus a Python init file (real
generated tree, "Using it" below). Each format drifts on its own schedule, and
every release means editing all of them by hand. Superpowers, the plugin this
tool was extracted from — and which lands in this fork as
`@bubstack/moe-core` — carried nine hand-maintained manifest files and four
distinct bootstrap mechanisms
(`docs/history/2026-08-10-everyharness-design.md`). A missed edit ships as a
user's broken install.

moe-mint gives you one file, `moe-mint.yaml`, as the source of truth,
and generates the rest:

- **Native files for 10 harnesses through 10 adapters.** Claude Code, Codex,
  Cursor, Copilot CLI, OpenCode, Pi, Kimi Code, Hermes, Devin CLI, and Factory
  Droid. Droid installs through the generated agents-marketplace descriptor,
  and Copilot installs through the generated Claude-format marketplace
  descriptor (`src/adapters/index.ts`, `adapters`;
  `src/adapters/agents-marketplace.ts`, header notes; the install-check loop
  in `checks/run-checks.sh`). Antigravity is on the roadmap (docs/CONFIG.md,
  goal paragraph).
- **Install docs and a support matrix with every generation.** A
  `docs/install/<harness>.md` per adapter and `docs/support-matrix.md`, so your
  users get accurate install steps for their agent without you writing them
  (`src/docs-emit.ts`, `installDocFile`).
- **Bootstrap wiring.** The SessionStart hooks and pointer files that make a
  discovery skill load automatically at session start, synthesized from your
  skill list or pointed at a skill you wrote (`src/bootstrap/generated.ts`,
  `generatedBootstrap`).
- **A scaffold and a converter.** `moe-mint init` creates a working
  config in an empty directory (`src/init.ts`, `init`), and
  `moe-mint import` converts an existing Claude-format plugin, carrying
  over its metadata fields and its skill, command, agent, hook, and MCP-server
  entries (`src/import.ts`, `importPlugin`).
- **Drift detection for CI.** `moe-mint validate` loads your config with
  the same rules `generate` uses, then compares every generated file on disk
  against the hashes recorded in the generation manifest, with distinct exit
  codes for config errors, schema violations, and drift (`src/validate.ts`,
  `validate`; `src/manifest.ts`, `checkDrift`; exit codes assigned in
  `src/cli.ts`, `validate` action).
- **Proof it round-trips a real plugin.** The dogfood test regenerates the
  remaining seven of superpowers' hand-maintained manifests from one config
  and compares them semantically (the eighth, `gemini-extension.json`, was
  dropped alongside the gemini adapter). On import it was re-pointed from a
  live upstream checkout at the author's own path to the pinned `superpowers`
  @ `b36e082` reference snapshot, and it passes there. It skips when the
  snapshot is absent, which is the case in CI (`test/dogfood.test.ts`,
  `COMPARED_FILES`, `dogfood` describe block).

## Using it

Real session with `@bubstack/moe-mint` 0.0.0, re-run against this import from a
clean directory named `demo-plugin` (`init` names the plugin after its
directory: `src/init.ts`, `init`). The CLI runs from the built workspace
package, so the transcript uses its `dist/cli.js` directly:

```
$ node packages/mint/dist/cli.js init
created: moe-mint.yaml
created: skills/getting-started/SKILL.md
Generated 29 files for initialization
Next: edit moe-mint.yaml, then re-run moe-mint generate

$ node packages/mint/dist/cli.js generate
warning: [kimi] kimi sessionStart requires a named bootstrap skill; generate mode is not supported on kimi
Generated 29 files for 10 harness(es): claude-code, cursor, codex, devin,
kimi, opencode, pi, hermes, agent-plugins-1.0, agents-marketplace

$ node packages/mint/dist/cli.js validate
validate: clean
```

Those files include `.claude-plugin/plugin.json`,
`.codex-plugin/plugin.json`, `.opencode/plugins/demo-plugin.js`,
`.pi/extensions/demo-plugin.ts`, `.hermes-plugin/plugin.yaml`, ten install
docs, the support matrix, and the bootstrap hook wiring. You commit them;
`validate` keeps them honest from then on.

## Running it

You own a plugin repo and want releases to stay coherent:

- **CI**: run `moe-mint validate` on every push. Exit code 1 is a config
  error, 2 is a schema violation, 3 is drift: a generated file hand-edited or
  deleted since the last `generate` (`src/cli.ts`, `validate` action;
  `src/manifest.ts`, `checkDrift`). An edited `moe-mint.yaml` whose
  outputs were never regenerated passes validate, so regenerate after every
  config change.
- **Install checks**: `moe-mint test` runs two offline tiers inside a
  shared container image: first it parses every generated manifest and checks
  referenced paths exist, then it performs a real install into each harness
  CLI and asserts the CLI enumerates the plugin's skills
  (`checks/run-checks.sh`, header comment). This is the check that catches a
  manifest that parses but is wired to the wrong place.
- **Releases**: `moe-mint bump 1.2.3` rewrites the version in
  `moe-mint.yaml` and any declared version-bearing files, regenerates all
  manifests, then audits the repo for stray version strings. `bump --check`
  reports versions and drift without writing anything; `bump --audit` runs
  the stray-string scan alone (`src/bump.ts`, `bumpVersion`, `bumpCheck`,
  `bumpAudit`). It replaces per-repo bump scripts.

## Who it's for — and not for

For plugin authors who ship one plugin to several coding agents, and for
maintainers who want manifest drift caught by CI instead of by bug reports.

A plugin that targets one harness and will stay there is better served by its
single hand-written manifest; this tool earns its keep at two harnesses and
up. In Moe that threshold is met by construction: `moe-core` and `moe-backstory`
ship to every harness the fork supports.

## Limitations

Each limitation is tagged with who bears it: the plugin author using the
tool, or the maintainer running its guardrails.

- **(author)** Not on any registry, and not headed for one — it is a workspace
  bin, run through the repo (Getting started).
- **(maintainer)** `moe-mint test` needs Docker and pulls
  `registry.gitlab.tcdevops.com/Zak/moe/moe-container`, a ~15 GB linux/amd64
  image, on first use (`docs/CONFIG.md`, `moe-mint test` section). **That image
  has not been built or pushed yet** — its Dockerfile is in `infra/container/`
  and the registry path is still an assumption; see that directory's README.
- **(maintainer)** Kimi Code, Cursor, and Devin CLI have no offline install
  check; `test` reports them as `skip` (`docs/CONFIG.md`, `moe-mint test`
  section).
- **(maintainer)** Install docs shorten a repository URL to an `owner/repo`
  slug only for `github.com` hosts (`src/adapters/shared.ts`,
  `githubOwnerRepo`). Moe is on GitLab, so the claude-code, devin, hermes and
  pi install docs will emit a `<your-repo>` placeholder rather than a working
  command. Deliberate upstream — it never fabricates a listing — but it needs
  fixing before those docs ship.
- **(author)** Kimi requires a named bootstrap skill; under
  `bootstrap: generate` the kimi adapter warns and skips its bootstrap wiring
  (observed in the session above; `src/adapters/kimi.ts`).

## Getting started

`@bubstack/moe-mint` is MIT-licensed (`LICENSE`) and needs Node 24 or newer
(`package.json`, `engines` — raised from upstream's Node 20 to match the
workspace root).

```bash
git clone git@gitlab.tcdevops.com:Zak/moe.git
cd moe && pnpm install && pnpm --filter @bubstack/moe-mint build
cd ~/your-plugin && node /path/to/moe/packages/mint/dist/cli.js import   # existing Claude-format plugin
node /path/to/moe/packages/mint/dist/cli.js generate
```

**Maintainer** (wire the guardrails): add `moe-mint validate` to CI, run
`moe-mint test` before releases, and adopt `moe-mint bump` in place of
your version script. `docs/CONFIG.md` documents every knob.

Contributors: the design record lives in `docs/history/`.

<!-- Upstream rendered a brochure site from this file with its own docs skill.
That site is now docs/history/UPSTREAM-BROCHURE-PAGE.html, kept verbatim as a
point-in-time record and no longer re-rendered — Moe has no landing page. -->

<!-- Deferred claims (ground truth outside this repo): the ~15 GB size of
registry.gitlab.tcdevops.com/Zak/moe/moe-container, which has not been
built yet. -->

---
<!-- doc-audit:last-reviewed -->
_Last reviewed upstream: 2026-08-15 · upstream commit `34526db` · verified
against code there (2 claims deferred). Re-verified on import against
`everyharness` @ `4f7c5e2`: the "Using it" transcript, the kimi warning text
and the inbound adapter names were re-run and match; the status, registry,
Node-version and install-doc-slug claims were corrected.

Re-recorded 2026-09-01 on the runtime-pruning wave, which removed the Gemini
CLI and Grok Build CLI adapters (see PARITY.md's "Not ported" table). The
whole "Using it" transcript above was re-run against `dist/cli.js` in a clean
`demo-plugin` directory, not edited by hand: `init` and `generate` each emit
29 files, down from the 32 the eleven-adapter tool emitted, and `generate`
names ten harnesses. The ten install docs and the file list below were
re-counted against that run._
