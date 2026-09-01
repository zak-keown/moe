# TC Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every TC-specific customization from the Moe tree so this repository can serve as generic upstream for a downstream TC-customized fork.

**Architecture:** Seven ordered tasks. Tasks 1–6 each modify one narrow category of the tree (URL swap, hook genericization, skill rewrite, outright deletion, surgical prose strips, backlog cleanup). Task 7 regenerates `/plugins/` and runs the full gate. The intermediate tree is inconsistent by design — only the final state is required to be green.

**Tech Stack:** pnpm 11.23.0 workspaces, TypeScript per-package, Vitest, Node ≥ 24, bash SessionStart hooks, `.gitlab-ci.yml`, mint YAML-driven plugin generation (`@bubstack/moe-mint`).

**Spec:** `.planning/2026-09-01-tc-decoupling-design.md`

## Global Constraints

- Every citation to a file location uses a content anchor (a symbol, test name, or quoted sentence). **Never a line number.** AGENTS.md "Guarded surfaces" is load-bearing.
- Every change to the plugin tree under `/plugins/` is made by editing `packages/*/mint/*.yaml` and running `pnpm mint`. Never hand-edit `/plugins/`. `pnpm mint:check` in CI enforces this.
- New upstream URL: `https://gitlab.com/moe-ai/moe`. Old URL: `https://gitlab.tcdevops.com/Zak/moe`. Any TC-flavored URL that is not the Moe repo (e.g. `gitlab.tcdevops.com/ai/*`) is removed rather than rewritten.
- Do NOT modify `PARITY.md` or `NOTICE`. TC content was not in the provenance ledger.
- Do NOT modify anything under `@bubstack/*` scope, `packages/backstory/**` copyright, or the `moe-tone-and-branding` backlog item. Those are Zak's, not TC's.
- Never skip hooks (`--no-verify`) or `--force` on git operations.
- After every task, `git status` before staging; stage explicit paths, not `git add -A`.
- The MR that ships this work lands on `gitlab.com/moe-ai/moe`. Do not push to the current `gitlab.tcdevops.com` remote as part of executing this plan.

---

### Task 1: URL rewrite — `gitlab.tcdevops.com/Zak/moe` → `gitlab.com/moe-ai/moe`

**Files:**
- Modify: `packages/core/test/metadata.test.ts` (the `"uses the canonical GitLab project URL in plugin configs"` test in the `fork invariants` describe block)
- Modify: `packages/core/mint/moe-core.yaml` (`repository:` and `homepage:` values)
- Modify: `packages/core/mint/moe-everything.yaml` (`repository:` and `homepage:` values)
- Modify: `ARCHITECTURE.md` (the sentence naming the canonical project)
- Modify: `INSTALL.md` (the `claude plugin marketplace add https://gitlab.tcdevops.com/Zak/moe.git` command)
- Modify: `CODEOWNERS` (header comment naming the project)
- Modify: `.gitlab/merge_request_templates/Default.md` (the top HTML-comment line `Default MR template for gitlab.tcdevops.com/Zak/moe.` — only the URL. The rest of that template is Task 6's job.)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is Task 1).
- Produces: the new URL `https://gitlab.com/moe-ai/moe` as the string every downstream task assumes has already landed. Test-consumer contract: `expect(config, rel).toContain("https://gitlab.com/moe-ai/moe")` in `metadata.test.ts`.

- [ ] **Step 1: Confirm the current state of the test assertion**

Read `packages/core/test/metadata.test.ts` and locate the block:

```ts
describe("fork invariants", () => {
  // ...
  it("uses the canonical GitLab project URL in plugin configs", () => {
    for (const rel of ["mint/moe-core.yaml", "mint/moe-everything.yaml"]) {
      const config = readFileSync(join(PKG, rel), "utf8");
      expect(config, rel).toContain("https://gitlab.tcdevops.com/Zak/moe");
    }
  });
});
```

- [ ] **Step 2: Flip the test assertion first (TDD — expect this test to fail against the current YAML)**

Change the assertion's URL only:

```ts
expect(config, rel).toContain("https://gitlab.com/moe-ai/moe");
```

- [ ] **Step 3: Run the test and confirm it fails against the still-old YAML**

Run:

```bash
pnpm --filter @bubstack/moe-core test -- metadata.test.ts
```

Expected: `uses the canonical GitLab project URL in plugin configs` fails with a `toContain` message quoting the still-present `https://gitlab.tcdevops.com/Zak/moe`.

- [ ] **Step 4: Update `packages/core/mint/moe-core.yaml`**

Replace both `repository:` and `homepage:` values:

```yaml
repository: https://gitlab.com/moe-ai/moe
homepage: https://gitlab.com/moe-ai/moe
```

- [ ] **Step 5: Update `packages/core/mint/moe-everything.yaml`**

Same two-line edit as Step 4, in the everything YAML.

- [ ] **Step 6: Re-run the test and confirm it passes**

```bash
pnpm --filter @bubstack/moe-core test -- metadata.test.ts
```

Expected: `fork invariants` describe block passes. If any other test in the file fails, stop — an assumption about the change scope is wrong.

- [ ] **Step 7: Update `ARCHITECTURE.md`**

Find the sentence beginning `The canonical project is` (a `git grep -n "canonical project" ARCHITECTURE.md` will locate it). Replace the URL. The rest of the sentence stays.

- [ ] **Step 8: Update `INSTALL.md`**

Find the marketplace-add command (`git grep -n "claude plugin marketplace add" INSTALL.md`). Replace only the `.git` URL. Any other URL on the page (e.g. links to install docs) stays.

- [ ] **Step 9: Update `CODEOWNERS`**

Replace the top comment's `gitlab.tcdevops.com/Zak/moe` with `gitlab.com/moe-ai/moe`. Do not change any ownership rules.

- [ ] **Step 10: Update the MR template's top URL**

In `.gitlab/merge_request_templates/Default.md`, find the top HTML-comment line (`git grep -n "gitlab.tcdevops.com" .gitlab/merge_request_templates/Default.md` locates it) and change the URL to `gitlab.com/moe-ai/moe`. Do NOT touch the TC-conventions paragraph or the `Card: sc-` footer — Task 6 handles those.

- [ ] **Step 11: Verify the URL is nowhere except history**

```bash
git grep -n "gitlab.tcdevops.com/Zak/moe" -- ':(exclude)plugins/**' ':(exclude).planning/**' ':(exclude)docs/**' ':(exclude)packages/*/docs/**'
```

Expected: no output. `.planning/**` and any `docs/history/**` still contain the old URL and that is fine — the deletion sweep is Task 4/6, and history is preserved deliberately.

- [ ] **Step 12: Commit**

```bash
git add packages/core/test/metadata.test.ts packages/core/mint/moe-core.yaml packages/core/mint/moe-everything.yaml ARCHITECTURE.md INSTALL.md CODEOWNERS .gitlab/merge_request_templates/Default.md
git commit -m "refactor(url): retarget canonical project at gitlab.com/moe-ai/moe"
```

`pnpm mint:check` will fail until Task 7 regenerates `/plugins/`. That is expected and covered in the MR description.

---

### Task 2: Genericize the governance hook

**Files:**
- Delete: `packages/core/hooks/tc-governance-check`
- Create: `packages/core/hooks/governance-marker-check`
- Modify: `packages/core/hooks/hooks.json` (SessionStart hook wiring)
- Modify: `packages/core/README.md` (the sentence mentioning `MOE_TC_GOVERNANCE_DISABLED=1`)

**Interfaces:**
- Consumes: nothing.
- Produces: a new SessionStart hook `governance-marker-check`, off by default, opted in via `MOE_GOVERNANCE_MARKER`. Env-var contract: `MOE_GOVERNANCE_MARKER` (string, the H1 to grep for; unset ⇒ hook exits 0 silently), `MOE_GOVERNANCE_POLICY_HINT` (string, appended when marker is missing; optional), `MOE_GOVERNANCE_MARKER_CHECK_DISABLED` (any non-empty value disables the hook regardless of `MOE_GOVERNANCE_MARKER`). Task 4's mint regeneration relies on the hook file existing under its new name.

- [ ] **Step 1: Read the current hook**

Read `packages/core/hooks/tc-governance-check` to internalize the shape (POSIX bash, `set -u`, hand-built JSON via `printf`, exit 0 on every failure path). The rewrite preserves those choices — they are load-bearing.

- [ ] **Step 2: Write the new hook**

Create `packages/core/hooks/governance-marker-check` with mode 755:

```bash
#!/bin/bash
# governance-marker-check: SessionStart hook that verifies a caller-configured
# governance policy is loaded on this machine, and optionally emits an
# installation hint when it is not.
#
# WHY A PRESENCE CHECK AND NOT A SKILL. Moe's using-moe skill states that
# user instructions (CLAUDE.md, AGENTS.md, direct requests) take precedence
# over skills. A governance policy that must NOT be overridable by user
# framing is only enforceable while it lives in CLAUDE.md, where using-moe
# already ranks it above every skill. This hook checks it arrived.
#
# It is a NUDGE, not a gate. Enforcing policy requires a PreToolUse hook that
# can refuse a read; that is a separate, larger piece of work.
#
# Every failure path exits 0 with no context. A non-zero SessionStart hook
# can block every session on the machine, which is far worse than a missing
# notice.

set -u

# The hook is off by default. Downstream forks set MOE_GOVERNANCE_MARKER to
# the exact H1 (or other line) that identifies their policy file.
if [ -z "${MOE_GOVERNANCE_MARKER:-}" ]; then
    exit 0
fi

# Kill switch. Any non-empty value disables the hook regardless of the marker.
if [ -n "${MOE_GOVERNANCE_MARKER_CHECK_DISABLED:-}" ]; then
    exit 0
fi

MARKER="$MOE_GOVERNANCE_MARKER"
HINT="${MOE_GOVERNANCE_POLICY_HINT:-}"

HOME_DIR="${HOME:-${USERPROFILE:-}}"
if [ -z "$HOME_DIR" ]; then
    exit 0
fi

# No jq. jq is missing on some Windows and WSL installs, and a hook that dies
# on a missing jq fails silently — which for a governance check is the worst
# possible failure mode, because absence of a warning reads as compliance.
governance_loaded=no
for f in "$HOME_DIR/.claude/CLAUDE.md" "$HOME_DIR/.codex/AGENTS.md"; do
    if [ -f "$f" ] && grep -qF "$MARKER" "$f" 2>/dev/null; then
        governance_loaded=yes
        break
    fi
done

if [ "$governance_loaded" = yes ]; then
    exit 0
fi

if [ -n "$HINT" ]; then
    CONTEXT="Governance policy marker \"$MARKER\" was not found in ~/.claude/CLAUDE.md or ~/.codex/AGENTS.md. $HINT"
else
    CONTEXT="Governance policy marker \"$MARKER\" was not found in ~/.claude/CLAUDE.md or ~/.codex/AGENTS.md."
fi

# Hand-built JSON with one field. The payload is a fixed string with no
# interpolated user data beyond MARKER and HINT; escape only what those
# strings can carry.
escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}
CONTEXT_JSON=$(escape "$CONTEXT")
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$CONTEXT_JSON"
exit 0
```

- [ ] **Step 3: Make the new hook executable**

```bash
chmod +x packages/core/hooks/governance-marker-check
```

- [ ] **Step 4: Smoke-test the new hook, unset marker path**

```bash
env -u MOE_GOVERNANCE_MARKER packages/core/hooks/governance-marker-check < /dev/null; echo "exit=$?"
```

Expected: no stdout, `exit=0`.

- [ ] **Step 5: Smoke-test the new hook, disabled kill-switch path**

```bash
MOE_GOVERNANCE_MARKER="# Test Marker" MOE_GOVERNANCE_MARKER_CHECK_DISABLED=1 packages/core/hooks/governance-marker-check < /dev/null; echo "exit=$?"
```

Expected: no stdout, `exit=0`.

- [ ] **Step 6: Smoke-test the new hook, marker-missing path**

```bash
MOE_GOVERNANCE_MARKER="# Definitely Not Present Marker $$" MOE_GOVERNANCE_POLICY_HINT="Install from example.com/policy.md." packages/core/hooks/governance-marker-check < /dev/null
```

Expected: single-line JSON on stdout, exit 0, and the `additionalContext` string contains the marker string and the hint string. Confirm the JSON parses:

```bash
MOE_GOVERNANCE_MARKER="# Definitely Not Present Marker $$" MOE_GOVERNANCE_POLICY_HINT="Install from example.com/policy.md." packages/core/hooks/governance-marker-check < /dev/null | node -e 'let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{const o=JSON.parse(d); console.log(o.hookSpecificOutput.hookEventName); console.log(o.hookSpecificOutput.additionalContext);})'
```

Expected: prints `SessionStart` on line 1, the additional-context string (containing the marker and hint) on line 2. No JSON parse error.

- [ ] **Step 7: Smoke-test the new hook, marker-present path**

Create a scratch marker file, point HOME at its parent, and re-run:

```bash
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/.claude"
printf '# Test Marker\n\nBody.\n' > "$TMPDIR/.claude/CLAUDE.md"
HOME="$TMPDIR" MOE_GOVERNANCE_MARKER="# Test Marker" packages/core/hooks/governance-marker-check < /dev/null; echo "exit=$?"
rm -rf "$TMPDIR"
```

Expected: no stdout, `exit=0`.

- [ ] **Step 8: Delete the old hook**

```bash
git rm packages/core/hooks/tc-governance-check
```

- [ ] **Step 9: Update `packages/core/hooks/hooks.json`**

Change the SessionStart `command` line from:

```json
"command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" tc-governance-check",
```

to:

```json
"command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" governance-marker-check",
```

Do not change any other hook entry (`plan-set-notice`, `claude-judge-continuation`, `moe-completion-evidence`).

- [ ] **Step 10: Update `packages/core/README.md`**

`git grep -n MOE_TC_GOVERNANCE_DISABLED packages/core/README.md` locates the sentence. Remove the entire sentence (and the preceding sentence if it only exists to introduce this env var — inspect the surrounding paragraph). The README does not need to document either the old or the new env var; the hook script itself is the reference.

- [ ] **Step 11: Confirm no leftover references to the old names**

```bash
git grep -nE "tc-governance-check|MOE_TC_GOVERNANCE_DISABLED" -- ':(exclude)plugins/**' ':(exclude).planning/**' ':(exclude)docs/**' ':(exclude)packages/*/docs/**'
```

Expected: no output. `.planning/**` and history are excluded on purpose.

- [ ] **Step 12: Commit**

The deletion of `tc-governance-check` was already staged by Step 8's `git rm`. This commit adds the new hook, wiring, and README edit alongside that deletion.

```bash
git add packages/core/hooks/governance-marker-check packages/core/hooks/hooks.json packages/core/README.md
git status  # confirm the staged set: new hook + hooks.json + README + deletion of the old hook
git commit -m "refactor(hooks): rename tc-governance-check to generic governance-marker-check"
```

---

### Task 3: Rewrite `retrieving-context` skill and `search-moedex` agent for a TC-free corpus

**Files:**
- Modify: `packages/core/skills/retrieving-context/SKILL.md` (full content rewrite)
- Modify: `packages/core/agents/search-moedex.md` (remove `TurnCommerce` framing and `search-codegraph` fallback references)

**Interfaces:**
- Consumes: nothing from earlier tasks; the new URL is not referenced in either file.
- Produces: a corpus-agnostic `retrieving-context` skill and a corpus-agnostic `search-moedex` agent. Downstream forks (including TC) re-add corpus-specific routing on top.

- [ ] **Step 1: Rewrite `packages/core/skills/retrieving-context/SKILL.md`**

The rewrite must:

- Drop the **CodeGraph** row from the backends table (leaving `moedex` and `moe-memory`).
- Drop every mention of `mcp__codegraph__*`, `rag_search`, `rag_context`, `codegraph_search`, `graph_trace`, `graph_cluster`, `search_journal` behind CodeGraph, `claim_bundle`, `subgraph`, "~620 TC GitLab repos", "structured docs", "wikis", "ai/kb", "TC convention", `kb:git.md`, `kb:dotnet-project-docs.md`, `ai/claude-code-platform-plugin`, and any TC repo naming.
- Recast **moedex** as the single code-corpus backend (still `mcp__moedex__*`, still access-scoped, still returns access-scoped results — those properties are moedex's, not TC's).
- Recast **moe-memory** unchanged (`mcp__plugin_moe-memory_moe-memory__*`).
- Rewrite the Routing table so each row's "Baseline" column is either moedex, moe-memory, or `Read`/`Grep`, and drop the moedex "upgrade over CodeGraph" framing entirely.
- Rewrite the Write-back table to remove the "CodeGraph connected" / "CodeGraph absent" split — the durable-fact rows now route to `memory_store` when moe-memory is connected and to `process_thoughts` (journal) otherwise.
- Delete the `Reproducibility, and what may be cited` section's "cite the CodeGraph baseline" instruction. Replace with a shorter statement: moedex results are access-scoped and therefore not reproducible for a reader who is not the caller — call this out when the answer is headed for a shared artifact, and ground shared-artifact citations in the working tree (a re-fetchable path in a public repo) rather than in the corpus.
- Delete the "When a backend is missing or slow" case for "CodeGraph absent". Keep the "moedex absent" case and the "only the working tree" case.
- Delete the last Red flag about "Citing a moedex `abs_path`" only if the surrounding red-flags list still parses without it (it does; keep it — abs_path citation is a moedex-specific hazard, not a TC one).
- Delete the "Read before you answer" section — it exists to enforce a CodeGraph server instruction; without CodeGraph, it is orphaned. Fold the "search memory first for questions about prior work" idea into the Routing table as its own row if it isn't already covered.
- Keep every occurrence of `moe-memory`, `Read`, `Grep`, `search_context`, `impact_analysis`, `token_budget`, `graph_depth`, `min_confidence`. These are moedex or working-tree mechanics, not TC.
- Do NOT invent new tool names or example queries; if a row loses its content when CodeGraph is removed, delete the row.

- [ ] **Step 2: Verify the rewrite still parses and has no dangling references**

```bash
git grep -nE "TurnCommerce|codegraph|CodeGraph|rag_search|rag_context|ai/kb|structured_doc" packages/core/skills/retrieving-context/SKILL.md
```

Expected: no output.

- [ ] **Step 3: Rewrite `packages/core/agents/search-moedex.md`**

Two edits:

- In the `description:` frontmatter, replace `TurnCommerce corpus` with `code corpus indexed by moedex`. Delete the trailing sentence `Optional backend — if its tools are absent, use search-codegraph instead and do not wait.` — with no CodeGraph fallback, that instruction is dead.
- In the body, in the "Access-scoped" paragraph, delete the sentence beginning `The caller has a rule for this: cite the CodeGraph baseline` and its follow-on clause. Replace the paragraph's last sentence with: `Ground shared-artifact citations in the working tree (a re-fetchable path in a public repo), not in this corpus.`
- In the "For Follow-Up" section, delete `it tells the caller to fall back to the CodeGraph baseline.` and replace with `it tells the caller to look elsewhere — the working tree, memory, or a targeted `Read`/`Grep`.`

- [ ] **Step 4: Verify no lingering CodeGraph references in the agent**

```bash
git grep -nE "codegraph|CodeGraph|TurnCommerce" packages/core/agents/search-moedex.md
```

Expected: no output.

- [ ] **Step 5: Run the core test suite to confirm no metadata assertion breaks**

```bash
pnpm --filter @bubstack/moe-core test
```

Expected: the skill-and-agent metadata tests pass. If a test enforces something about `retrieving-context`'s content (e.g., a shared-link resolver), fix inline before continuing.

- [ ] **Step 6: Commit**

```bash
git add packages/core/skills/retrieving-context/SKILL.md packages/core/agents/search-moedex.md
git commit -m "refactor(skills): retarget retrieving-context and search-moedex at generic corpora"
```

---

### Task 4: Delete outright — TC-only files and the CI drift job

**Files:**
- Delete: `packages/core/skills/_shared/tc-conventions.md`
- Delete: `packages/core/agents/search-codegraph.md`
- Delete: `.planning/backlog/W01P06 - tc-standards-conformance.md`
- Delete: `.planning/backlog/W03P02 - tc-governance-integration.md`
- Delete: `.planning/backlog/W05P02 - tc-domain-skills-port.md`
- Modify: `.gitlab-ci.yml` (remove the `tc-conventions-drift` job and its preamble)

**Interfaces:**
- Consumes: Task 3's rewrite of `retrieving-context` (which stops linking to CodeGraph). Task 5 will strip skill-file links to `_shared/tc-conventions.md` — do that in Task 5, not here; this task only deletes the target file.
- Produces: five fewer files in the tree and one fewer CI job. The `_shared/` link-resolution test will fail against any surviving link to `tc-conventions.md`; the guarded surface for skill-tier maps is unaffected because no skill directory is removed (search-codegraph is under `agents/`, not `skills/`).

- [ ] **Step 1: Confirm `_shared/tc-conventions.md` has no dangling callers from earlier tasks**

```bash
git grep -n "_shared/tc-conventions.md" -- 'packages/core/**' ':(exclude)packages/core/skills/_shared/tc-conventions.md'
```

Expected: matches only in `finishing-a-development-branch/SKILL.md`, `using-git-worktrees/SKILL.md`, `receiving-code-review/SKILL.md`, and `writing-skills/SKILL.md`. Those are stripped in Task 5. Any hit outside those four files means the rewrite of `retrieving-context` (Task 3) missed a reference or a new consumer exists; fix Task 3's edit before proceeding.

- [ ] **Step 2: Delete the five files**

```bash
git rm packages/core/skills/_shared/tc-conventions.md
git rm packages/core/agents/search-codegraph.md
git rm ".planning/backlog/W01P06 - tc-standards-conformance.md"
git rm ".planning/backlog/W03P02 - tc-governance-integration.md"
git rm ".planning/backlog/W05P02 - tc-domain-skills-port.md"
```

- [ ] **Step 3: Read the CI file to locate the drift-job stanza**

```bash
grep -n "^tc-conventions-drift:" -B 30 .gitlab-ci.yml | head -60
```

Locate the top of the preamble (a comment block beginning with `# Scheduled drift check`) and the bottom of the job (the last indented line — a `check "ai/claude-code-platform-plugin" ...` invocation). The stanza to delete runs from the preamble's first `#` line through the job's last line, inclusive.

- [ ] **Step 4: Delete the `tc-conventions-drift` block from `.gitlab-ci.yml`**

Remove the entire stanza located in Step 3. Do NOT delete any surrounding job. If the job is followed by a blank separator line and the next job starts fresh, leave one blank line between the previous job and the next one — do not concatenate.

- [ ] **Step 5: Verify the CI file still parses as YAML**

```bash
node -e 'const y=require("js-yaml"); const fs=require("fs"); y.load(fs.readFileSync(".gitlab-ci.yml","utf8")); console.log("ok");'
```

If `js-yaml` is not installed at the root, fall back to:

```bash
python3 -c 'import yaml,sys; yaml.safe_load(open(".gitlab-ci.yml")); print("ok")'
```

Expected: `ok`. A parse error means the stanza deletion left invalid indentation.

- [ ] **Step 6: Confirm no leftover TC-drift references**

```bash
git grep -nE "tc-conventions-drift|TC_GITLAB_TOKEN|TC-BOOTSTRAP-PENDING|tc-conventions\.md" -- ':(exclude).planning/**' ':(exclude)docs/**' ':(exclude)packages/*/docs/**'
```

Expected: no output. `.planning/**` still contains historical references and that is fine — Task 6 sweeps prose there.

- [ ] **Step 7: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "chore: remove TC-only files and the tc-conventions-drift CI job"
```

---

### Task 5: Surgical strips in shared skills

**Files:**
- Modify: `packages/core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/core/skills/using-git-worktrees/SKILL.md`
- Modify: `packages/core/skills/receiving-code-review/SKILL.md`
- Modify: `packages/core/skills/writing-skills/SKILL.md`
- Modify: `packages/core/skills/developing-claude-code-plugins/SKILL.md`

**Interfaces:**
- Consumes: Task 4's deletion of `_shared/tc-conventions.md`. Any surviving link to that file in this task's files fails the `_shared/` link resolver at gate time.
- Produces: five shared skills that no longer reference TC. Task 7's `pnpm mint` will pick up the changes automatically.

- [ ] **Step 1: `finishing-a-development-branch/SKILL.md` — remove TC section**

`git grep -n "tc-conventions" packages/core/skills/finishing-a-development-branch/SKILL.md` locates the references. Remove the entire block that begins with the paragraph mentioning "tool preference order, and the body shape TC expects" (or similar phrasing found by grep), and the sentence stating "The TC conventions above apply on `gitlab.tcdevops.com` only." Also remove any headed section that only contains TC guidance. Preserve every generic paragraph about opening MRs.

Verify:

```bash
git grep -nE "tc-conventions|gitlab.tcdevops.com|TC MR" packages/core/skills/finishing-a-development-branch/SKILL.md
```

Expected: no output.

- [ ] **Step 2: `using-git-worktrees/SKILL.md` — remove TC branch-name subsection and table row**

`git grep -n "tcdevops\|tc-conventions\|sc-{CARD" packages/core/skills/using-git-worktrees/SKILL.md` locates:

- In the `### 1b. Branch Name` section, the four lines starting `For repos on gitlab.tcdevops.com, TC conventions require…` through the numbered list item beginning `1. Card number known…` (up to and including step `2. No card`). Delete those and the preceding "In short:" paragraph. Leave the intro sentence `Runs whether Step 1a took over…` and the closing paragraph `For repos on any other forge, use whatever convention that repo's CONTRIBUTING…` intact — that sentence now covers all repos.
- In the `## Quick Reference` table, the row `| Branch name needed (any path) | Derive per Step 1b (TC card → strip feature/) |`. Change the right-hand cell to `Derive per Step 1b`.

Verify:

```bash
git grep -nE "tc-conventions|tcdevops|sc-\{CARD" packages/core/skills/using-git-worktrees/SKILL.md
```

Expected: no output.

- [ ] **Step 3: `receiving-code-review/SKILL.md` — remove TC reply-routing block**

`git grep -n "tcdevops\|tc-conventions\|TC MR" packages/core/skills/receiving-code-review/SKILL.md` locates:

- The paragraph beginning `When replying to inline review comments on gitlab.tcdevops.com, reply into…`. Delete the paragraph.
- The follow-on reference `TC MR conventions (branch format, labels, tool preference) — the discussion…`. Delete the sentence and any adjacent sentence that only exists to introduce it.

Preserve every generic guidance about reading review threads and structuring replies.

Verify:

```bash
git grep -nE "tc-conventions|tcdevops|TC MR" packages/core/skills/receiving-code-review/SKILL.md
```

Expected: no output.

- [ ] **Step 4: `writing-skills/SKILL.md` — remove TC parenthetical**

`git grep -n "tc-conventions" packages/core/skills/writing-skills/SKILL.md` locates a bullet ending with the parenthetical `(see finishing-a-development-branch — TC repos follow _shared/tc-conventions.md)`. Change the parenthetical to `(see finishing-a-development-branch)`.

Verify:

```bash
git grep -nE "tc-conventions|TC repos" packages/core/skills/writing-skills/SKILL.md
```

Expected: no output.

- [ ] **Step 5: `developing-claude-code-plugins/SKILL.md` — remove TC-host sentence**

`git grep -n "gitlab.tcdevops.com" packages/core/skills/developing-claude-code-plugins/SKILL.md` locates one hit. Delete the entire sentence — it starts with `Do not push to the default branch and do not tag a` per the discovery grep, and continues through the next period. If the surrounding paragraph parses cleanly after removal, leave it; if a leading connective ("Also,", "Then,") now dangles, remove the connective too.

Verify:

```bash
git grep -n "gitlab.tcdevops.com" packages/core/skills/developing-claude-code-plugins/SKILL.md
```

Expected: no output.

- [ ] **Step 6: Cross-file verification — no `_shared/tc-conventions.md` links survive anywhere in core**

```bash
git grep -n "_shared/tc-conventions.md" -- 'packages/core/**'
```

Expected: no output. If any hit surfaces, fix it now — Task 7's `pnpm mint:check` and the `_shared/` link resolver will both fail otherwise.

- [ ] **Step 7: Run the core test suite**

```bash
pnpm --filter @bubstack/moe-core test
```

Expected: pass, including the `_shared/` link-resolution test. The URL assertion should still pass from Task 1. Other guarded surfaces (skill-tier maps, marketplace consistency) should be unaffected.

- [ ] **Step 8: Commit**

```bash
git add packages/core/skills/finishing-a-development-branch/SKILL.md packages/core/skills/using-git-worktrees/SKILL.md packages/core/skills/receiving-code-review/SKILL.md packages/core/skills/writing-skills/SKILL.md packages/core/skills/developing-claude-code-plugins/SKILL.md
git commit -m "refactor(skills): strip TC-specific sections from shared skills"
```

---

### Task 6: Backlog and prose sweep

**Files:**
- Modify: `.planning/backlog/WAVES.md`
- Modify: every `.planning/backlog/W*.md` file that references a deleted slug (`tc-standards-conformance`, `tc-governance-integration`, `tc-domain-skills-port`)
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.gitlab/merge_request_templates/Default.md`

**Interfaces:**
- Consumes: Task 4's deletion of the three backlog files. If Task 4 has not run, this task's grep-based cleanup will still work but risks re-adding orphan references.
- Produces: a backlog that reads coherently without the three deleted TC items, and a merge-request template that does not name TC conventions.

- [ ] **Step 1: Enumerate the backlog files that reference a deleted slug**

```bash
git grep -lE "tc-standards-conformance|tc-governance-integration|tc-domain-skills-port" -- '.planning/backlog/**'
```

Expected: a list of ~15 files. Record it in scratchpad for Step 3.

- [ ] **Step 2: Sweep `.planning/backlog/WAVES.md`**

In every wave-schedule table and effort roll-up, delete rows and totals that refer to `tc-standards-conformance`, `tc-governance-integration`, or `tc-domain-skills-port`. Adjust every running count (`16 items`, `4 waves`, `~32 h wall clock`, `106.5 h`) to what the reduced set actually adds up to. If a wave becomes empty, delete the wave. If the "what happened" prose beneath a table depended on one of the removed items to make its argument, edit the prose so it still makes its argument — do not delete substantive analysis that survives the removal.

The narrative at the top ("CLOSED 2026-09-01. All sixteen shipped.") is factually about what shipped historically. Change the count and drop the "which the fork replaces" reasoning about `tc-standards-conformance`. Keep the "this is kept as the record of how it was scheduled and what the schedule got wrong" framing.

- [ ] **Step 3: Sweep each backlog item found in Step 1**

For each file:

- In the frontmatter block, remove the deleted slug from `conflicts_with:`, `depends_on:`, `blocks:`, and any other list-typed key. If a key becomes an empty list (`[]`), leave it as `[]` for schema stability. Do not delete the key.
- In the body prose, remove sentences that are entirely about the deleted slug. For sentences that name a deleted slug alongside other genuine references, rewrite to keep the genuine ones. Do not paraphrase surviving content; only remove the deleted-slug material.

Do NOT touch dependencies between surviving items. Do NOT rename the `W##P##` prefix on any file — the WAVES.md preamble explicitly says these prefixes are not re-derived.

- [ ] **Step 4: Verify the sweep**

```bash
git grep -nE "tc-standards-conformance|tc-governance-integration|tc-domain-skills-port" -- '.planning/**'
```

Expected: no output.

- [ ] **Step 5: Sweep `AGENTS.md`**

`git grep -n "tc-standards-conformance" AGENTS.md` locates one hit under the `## Not this file's job` section. Delete the entire bullet — it reads `— see tc-standards-conformance in the backlog.` alongside a preceding sentence about MR templates, branch naming, CODEOWNERS, and the merge-request templates directory. Preserve the other bullets in the section.

Verify:

```bash
git grep -nE "tc-standards-conformance|tc-governance-integration|tc-domain-skills-port|tcdevops" AGENTS.md
```

Expected: no output.

- [ ] **Step 6: Sweep `CONTRIBUTING.md`**

`git grep -n "tc-standards-conformance" CONTRIBUTING.md` locates the sentence. Delete the sentence and any adjacent sentence that only exists to introduce it. If the paragraph loses its point entirely, delete the paragraph.

Verify:

```bash
git grep -nE "tc-standards-conformance|tc-governance-integration|tc-domain-skills-port|tcdevops" CONTRIBUTING.md
```

Expected: no output.

- [ ] **Step 7: Sweep `.gitlab/merge_request_templates/Default.md`**

The top-line URL was already updated by Task 1 Step 10. This step removes the two TC-only prose blocks:

- In the header HTML comment, remove the paragraph that begins `TC conventions for agent-authored MRs live in` through its closing sentence about reading `tc-conventions.md`. Keep the paragraph beginning `Fills the PARITY.md "Not ported" routing for` intact.
- Remove the footer HTML comment entirely — the one beginning `If this branch is tied to a Shortcut card, include the trailer below…` and containing `Card: sc-{CARD_NUMBER}`.

The remaining template: the (already-URL-corrected) top comment, the PARITY.md-routing paragraph, the `## Summary` heading with its bullet placeholder, and the `## Test plan` heading with its checkbox placeholders. That is the whole template.

Verify:

```bash
git grep -nE "tcdevops|tc-conventions|sc-\{CARD" .gitlab/merge_request_templates/Default.md
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add .planning/backlog/ AGENTS.md CONTRIBUTING.md .gitlab/merge_request_templates/Default.md
git commit -m "chore: sweep TC references out of backlog and repo-level prose"
```

---

### Task 7: Regenerate `/plugins/` and run the full gate

**Files:**
- Modify: everything under `/plugins/moe-core/` and `/plugins/moe-everything/` (generated).

**Interfaces:**
- Consumes: every source change from Tasks 1–6. Runs against the finished tree.
- Produces: the final MR state — `pnpm mint:check` and `pnpm check` both green.

- [ ] **Step 1: Confirm the working tree is clean before regenerating**

```bash
git status
```

Expected: clean. If there are uncommitted changes, an earlier task did not commit — go back.

- [ ] **Step 2: Regenerate `/plugins/`**

```bash
pnpm mint
```

Expected exit 0. Expected diff: every occurrence of `tc-governance-check`, `_shared/tc-conventions.md`, and `gitlab.tcdevops.com/Zak/moe` under `/plugins/**` is gone. `governance-marker-check` and `gitlab.com/moe-ai/moe` appear. No files outside `/plugins/**` change.

- [ ] **Step 3: Verify the diff is scoped to `/plugins/`**

```bash
git status --short | awk '{print $NF}' | grep -v '^plugins/' | head
```

Expected: no output. Any file outside `/plugins/` means an earlier task was incomplete — go back and fix at that task's commit, do not paper over here.

- [ ] **Step 4: Run the mint-check gate**

```bash
pnpm mint:check
```

Expected: pass. This asserts `/plugins/` is byte-identical to a fresh mint from source.

- [ ] **Step 5: Run the full Node gate**

```bash
pnpm check
```

Expected: pass. This runs `pnpm lint`, then `turbo run typecheck test`. The URL assertion in `metadata.test.ts` should pass; the `_shared/` link resolver should pass; every skill-tier and marketplace consistency test should pass.

- [ ] **Step 6: Run the provenance check**

```bash
pnpm provenance
```

Expected: pass. This design does not modify `PARITY.md` or `NOTICE`; the check should be unchanged.

- [ ] **Step 7: Confirm no TC string leaks anywhere except allowed locations**

```bash
git grep -nE "gitlab\.tcdevops\.com|tc-governance-check|tc-conventions|MOE_TC_GOVERNANCE_DISABLED|tc-standards-conformance|tc-governance-integration|tc-domain-skills-port|TurnCommerce" -- ':(exclude)packages/*/docs/history/**'
```

Expected: no output. `packages/*/docs/history/**` is excluded because it holds frozen historical specs by design (per `PARITY.md`'s "Historical evidence may retain original names and URLs" clause).

If any string survives, stop and fix at the appropriate task — do not delete it from the regeneration commit.

- [ ] **Step 8: Commit the regenerated plugin tree**

```bash
git add plugins/
git commit -m "chore(mint): regenerate plugins after TC decoupling"
```

- [ ] **Step 9: Verify the final tree is green from a fresh state**

```bash
git status
pnpm check
pnpm mint:check
pnpm provenance
```

Expected: `git status` clean, all three checks pass. If any fails, the failure is a real regression — investigate rather than force-passing.

- [ ] **Step 10: Prepare MR notes**

Write MR body notes (not a commit) capturing:

- Which intermediate commits are known-red (`pnpm mint:check` fails on commits 1–6 because `/plugins/` lags source until commit 7).
- The URL swap (`gitlab.tcdevops.com/Zak/moe` → `gitlab.com/moe-ai/moe`).
- The one new env-var contract: `MOE_GOVERNANCE_MARKER`, `MOE_GOVERNANCE_POLICY_HINT`, `MOE_GOVERNANCE_MARKER_CHECK_DISABLED` — off by default upstream, downstream re-enables.
- The three backlog items removed and the shape of the residual prose edits.

Do NOT push. The MR lands on `gitlab.com/moe-ai/moe` and the current remote is still `gitlab.tcdevops.com`; pushing this branch there uploads TC-decoupled Moe onto the TC GitLab, which is the opposite of the intent.

---

## Self-review notes

**Spec coverage.** Every section of `.planning/2026-09-01-tc-decoupling-design.md` maps to a task above: §1 → Task 4, §2 → Tasks 2+3, §3 → Task 1, §4 → Task 5, §5 → Task 6, §6 → Task 7. §"What is deliberately out of scope" needs no task and is enforced by the Global Constraints.

**Placeholder scan.** No "TBD" / "add error handling" / "similar to Task N" placeholders. Every code block is complete. Every grep uses a concrete regex.

**Type consistency.** The three env-var names appear identically in the hook source (Task 2 Step 2), the smoke tests (Task 2 Steps 4–7), and the MR notes (Task 7 Step 10): `MOE_GOVERNANCE_MARKER`, `MOE_GOVERNANCE_POLICY_HINT`, `MOE_GOVERNANCE_MARKER_CHECK_DISABLED`. The URL string is one canonical form throughout: `https://gitlab.com/moe-ai/moe`. The `mint:check` / `check` / `provenance` command trio matches AGENTS.md's "Inner loop".
