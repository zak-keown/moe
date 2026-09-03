# Native Skill Renderers — Design Spec

Build-time template substitution in mint so skills ship with
harness-native tool names instead of relying on prose translation at
runtime.

**Status:** superseded in part and implemented by Harness Neutrality 1 on
2026-09-03. The shared-Claude-baseline layout below is no longer authoritative:
each adapter now emits or consumes the explicit profile-correct tree recorded in
section 5.3, and support is reported only after full-tree closure validation.

## 1  Problem

Skills today ship identical content to all 8 harnesses. Per-harness
tool-name translation lives in 6 hand-maintained `references/*.md`
files that the agent reads at runtime and follows on good faith. The
Agent Skills spec (agentskills.io) has no template mechanism — it
relies on "the LLM figures it out."

That works often enough. It fails in three ways:

1. **Precision.** "Use the harness's ask-user tool" is ambiguous;
   `AskUserQuestion` is not.
2. **Testability.** No gate asserts that every harness has a mapping
   for every action a skill names. A missing entry in a references
   file is invisible until a user on that harness hits it.
3. **Maintenance.** Six files, ~400 lines total, hand-maintained,
   partially duplicating each other, drifting from the skills they
   describe.

## 2  Solution

A two-tier template vocabulary processed at build time by mint.
Source skills use `{token}` placeholders. During `pnpm mint`, each
adapter substitutes its own values, producing per-harness skill
directories with native tool names. The output is valid Agent Skills
format — the spec imposes no restrictions on body content.

## 3  Vocabulary

### 3.1  Inline tokens

Substitute to a tool name or short phrase. Used mid-sentence.

```
When a question would be clearer with options, use {ask} to present
2-4 choices with your recommendation first.
```

| Token | Claude Code | Gemini CLI | Codex | Kimi | Cursor | OpenCode | Pi | Antigravity |
|---|---|---|---|---|---|---|---|---|
| `{ask}` | `AskUserQuestion` | `ask_user` | ask in the terminal | `AskUserQuestion` | `AskUserQuestion` | ask in the terminal | ask in the terminal | ask in the terminal |
| `{todo}` | `TaskCreate`/`TaskUpdate` | `write_todos` | track in a checklist file | `TodoList` | `TaskCreate`/`TaskUpdate` | `todowrite` | `TODO.md` | task artifact via `write_to_file` |
| `{skill}` | the `Skill` tool | `activate_skill` | native skill discovery | the `Skill` tool | the `Skill` tool | the `skill` tool | read the skill's `SKILL.md` | read the skill's `SKILL.md` |
| `{artifact}` | the `Artifact` tool | a self-contained local HTML file | a self-contained local HTML file | a self-contained local HTML file | a self-contained local HTML file | a self-contained local HTML file | a self-contained local HTML file | a self-contained local HTML file |
| `{read}` | `Read` | `read_file` | `shell` (cat) | `Read` | `Read` | `read` | `read` | `read_file` |
| `{write}` | `Write` | `write_file` | `apply_patch` | `Write` | `Write` | `apply_patch` | `write` | `write_to_file` |
| `{edit}` | `Edit` | `replace` | `apply_patch` | `Edit` | `Edit` | `apply_patch` | `edit` | `replace_file_content` |
| `{search}` | `Grep` | `grep_search` | `shell` (rg/grep) | `Grep` | `Grep` | `grep` | `grep` | `grep` |
| `{find}` | `Glob` | `glob` | `shell` (find) | `Glob` | `Glob` | `glob` | `find` | `glob` |
| `{bash}` | `Bash` | `run_shell_command` | `shell` | `Bash` | `Bash` | `bash` | `bash` | `execute_command` |
| `{web-fetch}` | `WebFetch` | `web_fetch` | `shell` (curl) | `FetchURL` | `WebFetch` | `webfetch` | `bash` (curl) | `shell` (curl) |

### 3.2  Block tokens

Substitute to a multi-line prose block. Appear alone on a line.

```markdown
{subagent-dispatch}
Dispatch one implementer per task. Keep dependent steps sequential.
```

| Token | What it carries |
|---|---|
| `{subagent-dispatch}` | Tool name, required params, context model (fork vs. full history), model-routing rules. ~3-15 lines per harness. |
| `{subagent-wait}` | How to collect results. Event subscription vs. polling vs. mailbox. Codex's guidance alone is ~20 lines. |
| `{render-ladder}` | Which rungs of the native-rendering ladder are available on this harness and which to skip. |

Block token content is the behavioral guidance that currently lives in
`references/*.md`. It migrates into `moe-mint-vocab.yaml` where it is
testable.

### 3.3  Escaping

A literal `{` in skill prose that is not a token: `\{`. The
substitution engine skips `\{...}` and strips the backslash in
output. This matters for JSON examples and template literals in
skill bodies.

### 3.4  The vocabulary is closed until it isn't

Start with the tokens above. Adding a token requires a mapping for
every active adapter and an update to the vocabulary file. No
"partial coverage" tokens — a token that maps to an empty string for
some harnesses silently deletes prose, which is the failure mode this
system exists to prevent. A harness with no equivalent gets a
prose fallback ("ask in the terminal"), never an empty string.

## 4  Vocabulary file

`moe-mint-vocab.yaml`, sibling to `moe-mint.yaml` in each plugin's
source root. Staged alongside the mint config.

```yaml
# moe-mint-vocab.yaml
tokens:
  ask:
    claude-code: "`AskUserQuestion`"
    gemini: "`ask_user`"
    codex: "ask in the terminal"
    kimi: "`AskUserQuestion`"
    cursor: "`AskUserQuestion`"
    opencode: "ask in the terminal"
    pi: "ask in the terminal"
    antigravity: "ask in the terminal"
  # ... one entry per inline token

blocks:
  subagent-dispatch:
    claude-code: |
      Use the `Agent` tool with `subagent_type: "general-purpose"`.
      Pass the filled prompt into `prompt` and a short `description`.
      For read-only exploration, use `subagent_type: "Explore"`.
    codex: |
      Use `spawn_agent` with `fork_turns: "none"` for context
      isolation. Set `model` AND `reasoning_effort` explicitly.
      Resume the implementer with `followup_task` — it delivers
      your message and transparently reloads an evicted child.
    # ... one entry per harness per block token
```

## 5  Pipeline

### 5.1  Current

```
staging script (byte-copy skills) → buildModel() → per-adapter emit() → writeFileSet()
```

Adapters emit manifests only. Skills are untouched.

### 5.2  Proposed

```
staging script (byte-copy skills) → buildModel() → loadVocabulary()
  → per-adapter { substituteSkills() + emit() } → writeFileSet()
```

`loadVocabulary()`: reads `moe-mint-vocab.yaml`, validates every token
has a mapping for every active adapter. Hard error on missing
mappings.

`substituteSkills()`: snapshots the complete skill tree once. It replaces
`{token}` in Markdown files, copies every other regular file byte-for-byte,
preserves exact file modes, and rejects symlinks and unsupported nodes. Inline
tokens use string replacement; block tokens replace the token line with the
configured indentation-aware content. Each adapter receives a model rooted at
the directory that was actually emitted for it.

### 5.3  Adapter output

```
plugins/moe/
  skills/              ← Agent Plugins 1.0 in-place profile
  .claude-plugin/
    skills/            ← Claude Code profile; Copilot consumes this compatible tree
  .codex-plugin/
    plugin.json
    skills/            ← codex-substituted
  .kimi-plugin/
    plugin.json
    skills/            ← kimi-substituted
  .cursor-plugin/
    plugin.json
    skills/            ← cursor-substituted
    hooks/              ← Cursor-private bootstrap loader
  .opencode/
    plugins/
    skills/
  .pi/
    extensions/
    skills/
```

Claude Code, Cursor, Codex, Kimi, OpenCode, and Pi consume private rendered
trees. Copilot is `shared-compatible` with the Claude Code profile and directory.
Agent Plugins 1.0 uses `native-discovery` at the spec-mandated root `skills/`
location. The other delivery states are `rendered` and `unsupported`; a generated
support matrix may claim `skills: full` only after every expected file exists in
the achieved tree. OpenCode and Pi retain one byte-identical root `package.json`,
but its Pi skill declaration and both runtime loaders name their canonical
private directories explicitly.

## 6  What happens to references files

The 6 files under `using-moe/references/` carry two kinds of content:

1. **Tool-name mappings** — subsumed by inline tokens. Deleted.
2. **Behavioral guidance** — subagent lifecycle, environment
   detection, Codex App finishing. Some migrates into block tokens;
   the rest stays as trimmed reference files.

References files shrink, not vanish. Codex's environment-detection
section, its App finishing protocol, and any guidance too long or
too specific for a block token stays in the file. The bootstrap in
`using-moe/SKILL.md` still tells non-Claude harnesses to read their
reference file when one exists.

Over time, as block tokens mature, more guidance migrates and
references files may reach zero. That is a later decision, not a
launch requirement.

## 7  Testing

The original three vocabulary assertions remain enforceable by `pnpm mint`:

1. **Complete coverage.** Every token in `moe-mint-vocab.yaml` has a
   mapping for every active adapter. Missing mapping → build error.
2. **No unknown tokens.** Every `{word}` in source SKILL.md files
   (and their `references/*.md`, `scripts/*.md`) matches a declared
   token. Unknown token → build error.
3. **No survivors.** After substitution, no `{word}` pattern remains
   in any generated skill file. Survivor → build error.

These compose with `mint:check`: `pnpm mint` runs substitutions,
`mint:check` asserts the output is byte-identical to what is
committed.

Harness Neutrality 1 adds full-tree closure, binary fidelity, mode preservation,
adapter-native loader paths, compatible-sharing, and achieved-delivery reporting
to those vocabulary checks.

## 8  Migration

Four phases. Each is independently shippable with `pnpm check` and
`pnpm mint:check` green.

### Phase 1: Infrastructure

Build the vocabulary file schema, `loadVocabulary()`,
`substituteSkills()`, and the three test assertions in mint. Ship
with zero tokens defined. All skills pass through unchanged. Per-
adapter skill directories are emitted as byte-identical copies.

**Deliverable:** the pipeline works end to end, producing identical
output. A token added to the vocab file and a skill file is
substituted on the next `pnpm mint`.

### Phase 2: First inline tokens

Define `{ask}`, `{todo}`, `{skill}` — the three tokens with the most
divergence across harnesses. Convert 2-3 skills that use those tool
names directly (`developing-claude-code-plugins` for `TodoWrite`,
`brainstorming` for `AskUserQuestion`). Validate per-adapter output.

**Deliverable:** converted skills ship with native tool names on
every harness. The pattern is proven.

### Phase 3: Block tokens and remaining inline tokens

Add `{subagent-dispatch}`, `{subagent-wait}`, `{render-ladder}`.
Add the remaining inline tokens (`{artifact}`, `{read}` through
`{web-fetch}`). Convert the skills with the heaviest per-harness
divergence: `dispatching-parallel-agents`,
`subagent-driven-development`, `brainstorming`'s rendering sections,
`writing-plans`.

**Deliverable:** the block-token pattern is proven. Most tool-name
references across all 27 skills are templated.

### Phase 4: Trim references files

Delete the tool-name mapping sections from all 6 references files.
Delete the native-rendering-ladder sections (now `{render-ladder}`).
What remains is behavioral guidance too specific for a block token.
Update `metadata.test.ts` if any file becomes empty and is deleted.

**Deliverable:** references files carry behavioral guidance only.
Tool-name translation is fully build-time.

## 9  Scope boundary

**In:** vocabulary file and schema, `loadVocabulary()`,
`substituteSkills()`, per-adapter skill directories, three test
assertions, migration phases 1-4, references-file trimming.

**Out:**
- Changes to the Agent Skills spec. This is a Moe extension, not a
  spec proposal.
- Per-harness agent definitions. Agents (under `agents/`) are
  separate from skills and do not use the same template vocabulary
  today.
- Rendering infrastructure (artifact templates, companion HTML
  generators). This spec replaces the tool-name routing; actual
  rendering code is a separate effort.
- `moe-mint-vocab.yaml` as a published spec. The file is an
  implementation detail of Moe's build. It is not a proposed standard
  for other plugins.

## 10  Compatibility with the Agent Skills spec

The Agent Skills spec (agentskills.io/specification) defines 6
frontmatter fields and imposes no restrictions on body content.
Template substitution operates on body content only — never on
frontmatter. The output of substitution is a valid SKILL.md with
the same frontmatter and harness-native prose in the body.

The spec's progressive-disclosure model (metadata → instructions →
resources) is unchanged. Substitution happens before any harness
sees the file.

## 11  Open questions

None. The vocabulary, pipeline, output structure, migration path,
and testing strategy are resolved above.
