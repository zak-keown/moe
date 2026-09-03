# Smoothing the Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand authored Moe skill that reads recent local Claude Code and Codex operational logs, suggests narrowly scoped non-destructive permanent permissions across four evidence classes, and applies individually approved changes safely.

**Architecture:** A dependency-free Node helper separates harness discovery/readers, evidence-class safety policies, deterministic ranking/rendering, and hash-bound atomic mutation. `SKILL.md` orchestrates the human report-selection-diff-confirmation flow; generated plugin copies come only from `pnpm mint`.

**Tech Stack:** Node.js 24 ESM and built-ins, TypeScript/Vitest tests, YAML skill registry, `@bubstack/moe-mint`, Claude Code settings JSON, Codex App Server and experimental exec-policy Starlark rules.

**Spec:** `docs/moe/specs/2026-09-03-smoothing-the-experience-design.md`

## Global Constraints

- Implement the authored `smoothing-the-experience` skill inside the generated `moe` plugin; do not add a package, standalone plugin, or eighth `moe` namespace.
- Use dependency-free Node.js and keep the helper inside `packages/core/skills/smoothing-the-experience/scripts/`.
- Never hand-edit `/plugins/`; edit package sources and regenerate with `pnpm mint`.
- Scan only local native session/config data. Do not call a model, access the network, or read/write Moe Memory.
- Never retain prompts, assistant prose, tool output, secret values, URL paths/query strings, arbitrary command arguments, or raw session identities in reports, plans, fixtures, or generated artifacts.
- Default to a 30-day window; require two distinct root sessions for project scope and two projects plus the smaller global-safe catalog for user-global scope.
- Return at most ten suggestions per harness and at most five per evidence class; `--all` relaxes only display limits.
- Existing permissions and any observed denial suppress a candidate.
- Claude may render audited shell, exact-path `Read`/`Edit`, exact-host `WebFetch`, and exact curated MCP rules. Never render `Write(...)`; decline filesystem rendering when the canonical project-root anchor is unproven.
- Codex may render shell rules only. Prove enabled user/trusted-project layers with App Server `config/read`, version-gate the experimental `.rules` schema, and fail closed on exec-policy validator drift.
- Applying a change requires individual IDs, an exact diff, explicit confirmation for one harness, source-hash revalidation, complete replacement validation, a destination lock, a mode-`0600` same-directory temporary file, atomic rename, and read-back verification.
- Keep `packages/core/skill-tiers.yaml`'s frozen `imported:` map and imported-set test literal unchanged; add this skill only under `authored:`.
- Automated tests use sanitized synthetic fixtures and never inspect the developer's real home directory.

## Open Decisions

None. The approved design resolves the first-release product, evidence, safety, rendering, and mutation contracts.

## Not Yet Specified

None. Later harness adapters and new Codex renderer classes are explicitly outside this release.

## Out of Scope

- Cursor, Copilot CLI, Gemini CLI, Kimi Code, OpenCode, and Pi adapters: no locally validated operational evidence exists for this release.
- Background collectors and installer-time scanning: the feature is an explicit on-demand audit.
- A public `moe smooth` dispatcher command or new package: the helper remains skill-owned.
- LLM classification, transcript summarization, remote analysis, and Moe Memory integration: the audit is deterministic, local, and ephemeral.
- Permission revocation or general policy auditing: this release only proposes new narrow allow rules.
- Codex filesystem, network, or MCP rendering: no stable narrow native permission plus validator is available.

---

### Task 1: Typed Evidence and Local Discovery

**depends_on:** []

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/evidence.mjs`
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/discovery.mjs`
- Test: `packages/core/test/smoothing-evidence-discovery.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `makeEvidence(input): EvidenceRecord`, `evidenceKey(record): string`, `redactedEvidenceSummary(records): EvidenceSummary`, `discoverHarnesses({env, homeDir, cwd, fsOps, detectedCommands, nowMs, days}): Promise<DiscoveryReport>`, and the JSDoc types `EvidenceRecord`, `Operation`, `HarnessDiscovery`, and `DiscoveryReport`.

- [ ] **Step 1: Write the failing evidence-contract tests**

```ts
// packages/core/test/smoothing-evidence-discovery.test.ts
import { describe, expect, it } from "vitest";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { evidenceKey, makeEvidence, redactedEvidenceSummary } from "../skills/smoothing-the-experience/scripts/lib/evidence.mjs";

describe("smoothing evidence contract", () => {
  it("rejects prose and secret-bearing fields", () => {
    expect(() => makeEvidence({
      harness: "claude", rootSessionId: "root-1", projectRoot: "/fixture/repo-a",
      observedAt: "2026-09-01T00:00:00.000Z", class: "network",
      operation: { hostname: "docs.example.invalid" }, outcome: "success",
      approvalProvenance: "unknown", sourceSchema: "claude-jsonl-tool-use-v1",
      toolOutput: "private output",
    })).toThrow(/unknown evidence field: toolOutput/);
  });

  it("derives grouping keys without exposing root session ids", () => {
    const row = makeEvidence({
      harness: "claude", rootSessionId: "root-1", projectRoot: "/fixture/repo-a",
      observedAt: "2026-09-01T00:00:00.000Z", class: "filesystem",
      operation: { action: "read", path: "src/index.ts" }, outcome: "success",
      approvalProvenance: "explicit", sourceSchema: "claude-jsonl-tool-use-v1",
    });
    expect(evidenceKey(row)).toBe('claude\u0000filesystem\u0000{"action":"read","path":"src/index.ts"}');
    expect(JSON.stringify(redactedEvidenceSummary([row]))).not.toContain("root-1");
  });
});
```

- [ ] **Step 2: Write the failing isolated discovery tests**

```ts
// append to packages/core/test/smoothing-evidence-discovery.test.ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { discoverHarnesses } from "../skills/smoothing-the-experience/scripts/lib/discovery.mjs";

it("honors config roots and reports unsupported installed harnesses", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "moe-smoothing-discovery-"));
  await mkdir(join(homeDir, "claude-home", "projects"), { recursive: true });
  await mkdir(join(homeDir, "codex-home", "sessions"), { recursive: true });
  await writeFile(join(homeDir, "bin-cursor"), "fixture");
  const report = await discoverHarnesses({
    env: {
      CLAUDE_CONFIG_DIR: join(homeDir, "claude-home"),
      CODEX_HOME: join(homeDir, "codex-home"),
    },
    homeDir,
    cwd: join(homeDir, "repo-a"),
    nowMs: Date.parse("2026-09-03T00:00:00Z"),
    days: 30,
    fsOps: undefined,
    detectedCommands: new Set(["claude", "codex", "cursor"]),
  });
  expect(report.harnesses.map((entry: { harness: string; status: string }) => [entry.harness, entry.status])).toEqual([
    ["claude", "ready"], ["codex", "ready"], ["cursor", "not-evaluated"],
  ]);
  expect(report.cutoffMs).toBe(Date.parse("2026-08-04T00:00:00Z"));
});
```

- [ ] **Step 3: Run the focused test and verify the missing modules fail**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-evidence-discovery.test.ts`

Expected: FAIL because `evidence.mjs` and `discovery.mjs` do not exist.

- [ ] **Step 4: Implement the closed evidence schema and redacted summaries**

```js
// packages/core/skills/smoothing-the-experience/scripts/lib/evidence.mjs
const FIELDS = new Set(["harness", "rootSessionId", "projectRoot", "observedAt", "class", "operation", "outcome", "approvalProvenance", "sourceSchema"]);
const ENUMS = {
  harness: new Set(["claude", "codex"]),
  class: new Set(["shell", "filesystem", "network", "mcp"]),
  outcome: new Set(["success", "denied", "failed", "unknown"]),
  approvalProvenance: new Set(["explicit", "existing-rule", "automatic", "unknown"]),
};

export function makeEvidence(input) {
  for (const key of Object.keys(input)) if (!FIELDS.has(key)) throw new TypeError(`unknown evidence field: ${key}`);
  for (const [key, values] of Object.entries(ENUMS)) if (!values.has(input[key])) throw new TypeError(`invalid ${key}`);
  if (!input.rootSessionId || !input.projectRoot || !input.sourceSchema || !Number.isFinite(Date.parse(input.observedAt))) throw new TypeError("incomplete evidence record");
  return Object.freeze({ ...input, operation: Object.freeze({ ...input.operation }) });
}

export function evidenceKey(record) {
  return [record.harness, record.class, JSON.stringify(record.operation, Object.keys(record.operation).sort())].join("\0");
}

export function redactedEvidenceSummary(records) {
  const counts = new Map();
  for (const record of records) counts.set(`${record.harness}:${record.class}:${record.outcome}`, (counts.get(`${record.harness}:${record.class}:${record.outcome}`) ?? 0) + 1);
  return { counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))) };
}
```

- [ ] **Step 5: Implement injected, local-only harness discovery**

```js
// packages/core/skills/smoothing-the-experience/scripts/lib/discovery.mjs
import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const SUPPORTED = ["claude", "codex"];
const KNOWN = ["claude", "codex", "cursor", "copilot", "gemini", "kimi", "opencode", "pi"];

export async function discoverHarnesses({ env, homeDir, cwd, fsOps = { access, readdir, stat }, detectedCommands = new Set(), nowMs = Date.now(), days = 30 }) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new TypeError("days must be an integer from 1 to 365");
  const roots = {
    claude: join(env.CLAUDE_CONFIG_DIR || join(homeDir, ".claude"), "projects"),
    codex: join(env.CODEX_HOME || join(homeDir, ".codex"), "sessions"),
  };
  const harnesses = [];
  for (const harness of KNOWN) {
    const installed = detectedCommands.has(harness) || (SUPPORTED.includes(harness) && await exists(fsOps, roots[harness]));
    if (!installed) continue;
    harnesses.push(SUPPORTED.includes(harness)
      ? { harness, status: "ready", sessionRoot: roots[harness], cwd }
      : { harness, status: "not-evaluated", reason: "no locally validated adapter" });
  }
  return { cutoffMs: nowMs - days * 86_400_000, harnesses };
}

async function exists(fsOps, path) {
  try { await fsOps.access(path); return true; } catch { return false; }
}
```

- [ ] **Step 6: Run the focused test and commit the evidence boundary**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-evidence-discovery.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/evidence.mjs packages/core/skills/smoothing-the-experience/scripts/lib/discovery.mjs packages/core/test/smoothing-evidence-discovery.test.ts
git commit -m "feat(core): add smoothing evidence discovery"
```

### Task 2: Claude Session and Permission Adapter

**depends_on:** [1]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs`
- Create: `packages/core/test/fixtures/smoothing-the-experience/claude/root.jsonl`
- Create: `packages/core/test/fixtures/smoothing-the-experience/claude/subagents/agent.jsonl`
- Create: `packages/core/test/fixtures/smoothing-the-experience/claude/settings.json`
- Test: `packages/core/test/smoothing-claude.test.ts`

**Interfaces:**
- Consumes: `makeEvidence(input): EvidenceRecord` from Task 1.
- Produces: `discoverClaude({env, homeDir, cwd, cutoffMs, fsOps}): Promise<ClaudeDiscovery>`, `readClaudeSession(file, {cutoffMs, resolveProjectRoot, realpath, effectivePermissions}): Promise<ReaderResult>`, `loadClaudePermissions({configDir, projectRoot, primaryCwd, fsOps}): Promise<ClaudePermissionState>`, `matchClaudePermission(rule, operation, context): boolean`, and `classifyClaudePermission(operation, state): "denied" | "existing-rule" | "ask" | "unmatched"`.

- [ ] **Step 1: Add sanitized Claude fixtures for all four evidence classes**

```jsonl
{"type":"assistant","sessionId":"root-a","cwd":"/fixture/repo-a","timestamp":"2026-09-01T10:00:00.000Z","message":{"content":[{"type":"tool_use","id":"tool-1","name":"Bash","input":{"command":"git status"}},{"type":"tool_use","id":"tool-2","name":"Read","input":{"file_path":"/fixture/repo-a/src/index.ts"}},{"type":"tool_use","id":"tool-3","name":"WebFetch","input":{"url":"https://docs.example.invalid/reference?q=discard","prompt":"discard"}},{"type":"tool_use","id":"tool-4","name":"mcp__plugin_moe-memory_moe-memory__search_conversations","input":{"query":"discard"}}]}}
{"type":"user","sessionId":"root-a","timestamp":"2026-09-01T10:00:01.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1","is_error":false},{"type":"tool_result","tool_use_id":"tool-2","is_error":false},{"type":"tool_result","tool_use_id":"tool-3","is_error":false},{"type":"tool_result","tool_use_id":"tool-4","is_error":false}]}}
```

Put a second sanitized record in `subagents/agent.jsonl` with the same `sessionId`, an `agentId`, `Edit` and `Write` tool uses for `src/index.ts`, a denied `Bash` result with `toolDenialKind: "permission-rule"`, and an unknown record shape. Use only `/fixture/repo-a`, `.invalid` hosts, and opaque fake IDs.

- [ ] **Step 2: Write failing decoder, outcome, root-collapse, and privacy tests**

```ts
// packages/core/test/smoothing-claude.test.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import { readClaudeSession } from "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs";

const fixture = fileURLToPath(new URL("fixtures/smoothing-the-experience/claude/root.jsonl", import.meta.url));

describe("Claude smoothing reader", () => {
  it("extracts four classes without carrying tool payload prose", async () => {
    const result = await readClaudeSession(fixture, {
      cutoffMs: Date.parse("2026-08-04T00:00:00Z"),
      resolveProjectRoot: async () => "/fixture/repo-a",
      realpath: async (value: string) => value,
      effectivePermissions: { deny: [], ask: [], allow: [] },
    });
    expect(result.evidence.map((row: { class: string }) => row.class)).toEqual(["shell", "filesystem", "network", "mcp"]);
    expect(JSON.stringify(result)).not.toContain("discard");
    expect(new Set(result.evidence.map((row: { rootSessionId: string }) => row.rootSessionId))).toEqual(new Set(["root-a"]));
  });

  it("maps recognized denials to denied and leaves unmatched calls unknown", async () => {
    const text = await readFile(fixture, "utf8");
    expect(text).toContain('"is_error":false');
  });
});
```

- [ ] **Step 3: Write failing effective-settings precedence tests**

```ts
// append to packages/core/test/smoothing-claude.test.ts
// @ts-expect-error — plain ESM production helper.
import { classifyClaudePermission, loadClaudePermissions } from "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs";

it("loads user, shared, and local settings and applies deny then ask then allow", async () => {
  const state = await loadClaudePermissions({ configDir: "/fixture/claude", projectRoot: "/fixture/repo-a", primaryCwd: "/fixture/repo-a", fsOps: fixtureFs });
  expect(classifyClaudePermission({ class: "shell", argv: ["git", "status"] }, state)).toBe("denied");
});

it("fails closed on malformed permission lists", async () => {
  await expect(loadClaudePermissions({ configDir: "/fixture/malformed", projectRoot: "/fixture/repo-a", primaryCwd: "/fixture/repo-a", fsOps: fixtureFs })).rejects.toThrow(/permissions.allow must contain strings/);
});
```

Define `fixtureFs` in the test as an injected `readFile` map for user `settings.json`, project `.claude/settings.json`, and project `.claude/settings.local.json`; make `deny` contain `Bash(git status)` so precedence is observable.

- [ ] **Step 4: Run the Claude test and verify the adapter is missing**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-claude.test.ts`

Expected: FAIL because `harnesses/claude.mjs` does not exist.

- [ ] **Step 5: Implement structural JSONL decoding and privacy projection**

```js
// key decoder shape in packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs
const DENIALS = new Set(["user-rejected", "permission-rule", "automode-blocked", "automode-unavailable"]);

function outcomeFor(result) {
  if (!result) return "unknown";
  if (DENIALS.has(result.toolDenialKind)) return "denied";
  if (result.toolDenialKind) return "denied"; // unknown denial kinds fail closed
  return result.is_error === true ? "failed" : "success";
}

function operationFor(tool) {
  if (tool.name === "Bash") return { class: "shell", operation: { command: tool.input.command } };
  if (tool.name === "Read") return { class: "filesystem", operation: { action: "read", path: tool.input.file_path } };
  if (tool.name === "Edit" || tool.name === "Write") return { class: "filesystem", operation: { action: "modify", path: tool.input.file_path } };
  if (tool.name === "WebFetch") return { class: "network", operation: { url: tool.input.url } };
  if (tool.name.startsWith("mcp__")) return { class: "mcp", operation: { toolId: tool.name } };
  return null;
}
```

Match `tool_use.id` to `tool_result.tool_use_id`, group nested subagent files by row `sessionId` rather than `agentId`, skip timestamps before `cutoffMs`, count unknown structural shapes, and pass only typed operation fields into `makeEvidence`.
`discoverClaude` recursively enumerates `.jsonl` files below
`CLAUDE_CONFIG_DIR/projects` (or `~/.claude/projects`), sorts paths for
determinism, and never reads outside that root. Set approval provenance to
`existing-rule` only after semantic permission matching, to `automatic` only
when the structured record explicitly names automatic mode, and otherwise to
`unknown`; never infer `explicit` from an ordinary successful tool result.

- [ ] **Step 6: Implement settings loading and semantic rule matching**

```js
const SETTINGS = ({ configDir, primaryCwd }) => [
  { scope: "user", path: join(configDir, "settings.json") },
  { scope: "project", path: join(primaryCwd, ".claude", "settings.json") },
  { scope: "local", path: join(primaryCwd, ".claude", "settings.local.json") },
];

export function classifyClaudePermission(operation, state) {
  if (state.deny.some((entry) => matchClaudePermission(entry.rule, operation, entry))) return "denied";
  if (state.ask.some((entry) => matchClaudePermission(entry.rule, operation, entry))) return "ask";
  if (state.allow.some((entry) => matchClaudePermission(entry.rule, operation, entry))) return "existing-rule";
  return "unmatched";
}
```

Reject malformed JSON, non-object settings, non-array permission lists, and non-string members. Resolve all filesystem anchors through injected `realpath`; record `anchorProven: false` when `primaryCwd` and canonical project root differ.

- [ ] **Step 7: Run the Claude tests and commit the adapter**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-claude.test.ts test/smoothing-evidence-discovery.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs packages/core/test/smoothing-claude.test.ts packages/core/test/fixtures/smoothing-the-experience/claude
git commit -m "feat(core): read Claude smoothing evidence"
```

### Task 3: Codex Session and Active-Layer Adapter

**depends_on:** [1]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs`
- Create: `packages/core/test/fixtures/smoothing-the-experience/codex/item-completed.jsonl`
- Create: `packages/core/test/fixtures/smoothing-the-experience/codex/legacy-function-call.jsonl`
- Test: `packages/core/test/smoothing-codex.test.ts`

**Interfaces:**
- Consumes: `makeEvidence(input): EvidenceRecord` from Task 1.
- Produces: `CODEX_SCHEMA_DECODERS`, `discoverCodex({env, homeDir, cutoffMs, fsOps}): Promise<CodexDiscovery>`, `readCodexSessions({files, cutoffMs, resolveProjectRoot, existingPrefixes}): Promise<ReaderResult>`, `decodeCodexLine(record, state): DecodedCodexEvent | null`, `collapseCodexRoots(headers): Map<string, string>`, `readCodexConfigLayers({codexBin, cwd, spawnProcess, timeoutMs}): Promise<CodexLayerState>`, and `codexDestination({scope, codexHome, projectRoot, layerState}): Destination | null`.

- [ ] **Step 1: Add current and legacy sanitized rollout fixtures**

```jsonl
{"timestamp":"2026-09-01T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-root-a","cwd":"/fixture/repo-a","cli_version":"0.153.0"}}
{"timestamp":"2026-09-01T12:00:01.000Z","type":"event_msg","payload":{"type":"item_completed","item":{"type":"CommandExecution","command":["zsh","-lc","git status"],"cwd":"/fixture/repo-a","status":"completed","exit_code":0,"parsed_cmd":[{"cmd":"git status"}],"aggregated_output":"discard"}}}
{"timestamp":"2026-09-01T12:00:02.000Z","type":"world_state","payload":{"state":{"permissions":{"approved_command_prefixes":[["git","status"]]}}}}
```

Put sanitized `response_item.function_call` (`name: "exec_command"`) and `local_shell_call` records in `legacy-function-call.jsonl`. Include shell, filesystem, network, and MCP events when the structured record supplies them; output values must be the literal string `discard` and must never reach decoded evidence.

- [ ] **Step 2: Write failing decoder and prefix-provenance tests**

```ts
// packages/core/test/smoothing-codex.test.ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import { readCodexSessions } from "../skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs";

it("decodes supported rollout schemas and removes output", async () => {
  const file = fileURLToPath(new URL("fixtures/smoothing-the-experience/codex/item-completed.jsonl", import.meta.url));
  const result = await readCodexSessions({ files: [file], cutoffMs: Date.parse("2026-08-04T00:00:00Z"), resolveProjectRoot: async () => "/fixture/repo-a", existingPrefixes: [] });
  expect(result.evidence[0]).toMatchObject({ harness: "codex", class: "shell", outcome: "success", sourceSchema: "codex-item-completed-v1" });
  expect(JSON.stringify(result)).not.toContain("discard");
});

it("marks matching approved prefixes existing-rule and does not infer explicit approval", async () => {
  const result = await readCodexSessions({ files: [fixture], cutoffMs: 0, resolveProjectRoot: async () => "/fixture/repo-a", existingPrefixes: [["git", "status"]] });
  expect(result.evidence[0].approvalProvenance).toBe("existing-rule");
});
```

- [ ] **Step 3: Write failing App Server active-layer tests**

```ts
// append to packages/core/test/smoothing-codex.test.ts
// @ts-expect-error — plain ESM production helper.
import { codexDestination, readCodexConfigLayers } from "../skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs";

it("uses config/read layer details to prove a trusted project destination", async () => {
  const state = await readCodexConfigLayers({ codexBin: "codex", cwd: "/fixture/repo-a", spawnProcess: fakeAppServer, timeoutMs: 100 });
  expect(codexDestination({ scope: "project", codexHome: "/fixture/codex", projectRoot: "/fixture/repo-a", layerState: state })).toEqual({
    path: "/fixture/repo-a/.codex/rules/moe-smoothing.rules", scope: "project", restartRequired: true,
  });
});

it("declines project rendering when config/read is unavailable or trust is unproven", () => {
  expect(codexDestination({ scope: "project", codexHome: "/fixture/codex", projectRoot: "/fixture/repo-a", layerState: { status: "unavailable", layers: [] } })).toBeNull();
});
```

Implement `fakeAppServer` as an injected child-process double that returns an initialize response for ID 1 and a `config/read` response for ID 2 with one enabled user layer and one enabled trusted-project layer. Add cases for timeout, malformed JSON, error response, and an interspersed notification.

- [ ] **Step 4: Run the Codex test and verify the adapter is missing**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-codex.test.ts`

Expected: FAIL because `harnesses/codex.mjs` does not exist.

- [ ] **Step 5: Implement version-gated rollout decoding**

```js
export const CODEX_SCHEMA_DECODERS = Object.freeze([
  { name: "codex-item-completed-v1", matches: (row) => row?.type === "event_msg" && row?.payload?.type === "item_completed", decode: decodeItemCompleted },
  { name: "codex-function-call-v1", matches: (row) => row?.type === "response_item" && row?.payload?.type === "function_call" && row?.payload?.name === "exec_command", decode: decodeFunctionCall },
  { name: "codex-local-shell-call-v1", matches: (row) => row?.type === "response_item" && row?.payload?.type === "local_shell_call", decode: decodeLocalShellCall },
]);

function unwrapShell(command) {
  if (Array.isArray(command) && command.length === 3 && ["sh", "bash", "zsh"].includes(command[0]) && command[1] === "-lc") return { script: command[2], wrapped: true };
  return { argv: command, wrapped: false };
}
```

Decode only recognized structural shapes, carry `cli_version` in diagnostics, skip unknown shapes, collapse child threads through session headers, and conservatively parse wrapper scripts without granting the wrapper. Record `existing-rule` only when a captured approved prefix actually matches the normalized command.
`discoverCodex` recursively enumerates rollout `.jsonl` files below
`CODEX_HOME/sessions` (or `~/.codex/sessions`), sorts paths, and rejects a
resolved path outside that session root. The reader filters records by their
own timestamps rather than trusting file modification time.

- [ ] **Step 6: Implement the bounded App Server JSONL client and destination proof**

```js
export async function readCodexConfigLayers({ codexBin, cwd, spawnProcess, timeoutMs = 2000 }) {
  const child = spawnProcess(codexBin, ["app-server", "--stdio", "--strict-config"], { stdio: ["pipe", "pipe", "pipe"] });
  const client = jsonLineClient(child, timeoutMs);
  try {
    await client.request({ id: 1, method: "initialize", params: { clientInfo: { name: "moe-smoothing", version: "1" }, capabilities: {} } });
    const response = await client.request({ id: 2, method: "config/read", params: { cwd, includeLayers: true } });
    return parseEnabledLayers(response);
  } finally {
    child.kill();
  }
}

export function codexDestination({ scope, codexHome, projectRoot, layerState }) {
  if (scope === "project" && layerState.trustedProjectRoots?.includes(projectRoot)) return { path: join(projectRoot, ".codex", "rules", "moe-smoothing.rules"), scope, restartRequired: true };
  if (scope === "global" && layerState.userLayerEnabled) return { path: join(codexHome, "rules", "moe-smoothing.rules"), scope: "global", restartRequired: true };
  return null;
}
```

Match responses by numeric ID so notifications cannot satisfy requests, cap each line at 1 MiB, time out, kill the child in `finally`, and return `{status: "unavailable"}` rather than guessing precedence when initialization or `config/read` fails.

- [ ] **Step 7: Run the Codex tests and commit the adapter**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-codex.test.ts test/smoothing-evidence-discovery.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs packages/core/test/smoothing-codex.test.ts packages/core/test/fixtures/smoothing-the-experience/codex
git commit -m "feat(core): read Codex smoothing evidence"
```

### Task 4: Evidence-Class Safety Policies

**depends_on:** [1]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/safety/shell.mjs`
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/safety/filesystem.mjs`
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/safety/network.mjs`
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/safety/mcp.mjs`
- Test: `packages/core/test/smoothing-safety.test.ts`

**Interfaces:**
- Consumes: `EvidenceRecord` and `Operation` contracts from Task 1.
- Produces: `classifyShell(operation, context): PolicyDecision`, `classifyFilesystem(operation, context): Promise<PolicyDecision>`, `classifyNetwork(operation): PolicyDecision`, `classifyMcp(operation): PolicyDecision`, `parseConservativeShell(command): string[] | null`, `PROJECT_SHELL_CATALOG`, `GLOBAL_SHELL_CATALOG`, and `TRUSTED_READ_ONLY_MCP`; `PolicyDecision` is `{eligible: boolean, normalized?: object, globalSafe?: boolean, reason: string}`.

- [ ] **Step 1: Write table-driven adversarial shell tests**

```ts
// packages/core/test/smoothing-safety.test.ts
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import { classifyShell, parseConservativeShell } from "../skills/smoothing-the-experience/scripts/lib/safety/shell.mjs";

describe("shell safety", () => {
  it.each(["git status && git push", "git status | cat", "FOO=x git status", "git $(echo status)", "git st*", "bash -lc 'git status'", "cp a b", "rm file"])("rejects %s", (command) => {
    expect(parseConservativeShell(command)).toBeNull();
  });
  it.each([
    [["git", "status"], true, true],
    [["git", "add", "src/index.ts"], true, false],
    [["git", "push"], false, false],
  ])("classifies %j", (argv, eligible, globalSafe) => {
    expect(classifyShell({ argv }, { projectRoot: "/fixture/repo-a", harness: "claude" })).toMatchObject({ eligible, globalSafe });
  });
});
```

- [ ] **Step 2: Write filesystem containment and secret-path tests**

```ts
// append to packages/core/test/smoothing-safety.test.ts
// @ts-expect-error — plain ESM production helper.
import { classifyFilesystem } from "../skills/smoothing-the-experience/scripts/lib/safety/filesystem.mjs";

it.each(["../outside", ".env", ".git/config", ".claude/settings.local.json", "secrets/api-key.txt"])("rejects unsafe path %s", async (path) => {
  const result = await classifyFilesystem({ action: "read", path }, {
    projectRoot: "/fixture/repo-a", anchorProven: true,
    realpath: async (value: string) => value.includes("outside") ? "/fixture/outside" : `/fixture/repo-a/${value}`,
  });
  expect(result.eligible).toBe(false);
});

it("keeps read and modify exact and separate", async () => {
  const result = await classifyFilesystem({ action: "modify", path: "src/index.ts" }, {
    projectRoot: "/fixture/repo-a", anchorProven: true, realpath: async () => "/fixture/repo-a/src/index.ts",
  });
  expect(result).toMatchObject({ eligible: true, normalized: { action: "modify", path: "src/index.ts" }, globalSafe: false });
});
```

- [ ] **Step 3: Write exact-host network and curated MCP tests**

```ts
// append to packages/core/test/smoothing-safety.test.ts
// @ts-expect-error — plain ESM production helper.
import { classifyNetwork } from "../skills/smoothing-the-experience/scripts/lib/safety/network.mjs";
// @ts-expect-error — plain ESM production helper.
import { classifyMcp } from "../skills/smoothing-the-experience/scripts/lib/safety/mcp.mjs";

it.each(["https://127.0.0.1/x", "http://localhost/x", "https://10.0.0.2/x", "https://*.example.invalid/x", "file:///etc/passwd"])("rejects network target %s", (url) => {
  expect(classifyNetwork({ source: "WebFetch", url }).eligible).toBe(false);
});

it("retains only an exact normalized hostname", () => {
  expect(classifyNetwork({ source: "WebFetch", url: "https://Docs.Example.Invalid/a?q=secret#x" })).toMatchObject({ eligible: true, normalized: { hostname: "docs.example.invalid" } });
});

it("allows only exact Moe-owned read-only MCP identifiers", () => {
  expect(classifyMcp({ toolId: "mcp__plugin_moe-memory_moe-memory__search_conversations" }).eligible).toBe(true);
  expect(classifyMcp({ toolId: "mcp__unknown__read" }).eligible).toBe(false);
});
```

- [ ] **Step 4: Run the safety test and verify all policy modules are missing**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-safety.test.ts`

Expected: FAIL because the four safety modules do not exist.

- [ ] **Step 5: Implement conservative shell and filesystem policies**

```js
// shell.mjs catalog: every entry states whether arbitrary suffixes remain safe.
export const PROJECT_SHELL_CATALOG = new Map([
  ["git status", { prefix: ["git", "status"], suffixSafe: true, globalSafe: true }],
  ["git diff", { prefix: ["git", "diff"], suffixSafe: true, globalSafe: true }],
  ["git log", { prefix: ["git", "log"], suffixSafe: true, globalSafe: true }],
  ["git show", { prefix: ["git", "show"], suffixSafe: true, globalSafe: true }],
  ["git add", { prefix: ["git", "add"], suffixSafe: true, globalSafe: false }],
]);
export const GLOBAL_SHELL_CATALOG = new Set(["git status", "git diff", "git log", "git show"]);
```

Use a small tokenizer that accepts plain quoted tokens but returns `null` for metacharacters, redirection, expansion, assignments, wrappers, or globs. Permit `cp -n SOURCE DEST` for Claude only when both canonical paths stay inside the same project; decline it for Codex because a prefix rule would authorize additional suffixes.

For filesystem paths, canonicalize with injected `realpath`, compare path components with `relative(projectRoot, target)`, reject symlink escape and secret/policy segments case-insensitively, require `anchorProven`, and return exact project-relative POSIX paths only.

- [ ] **Step 6: Implement network and MCP policies**

```js
// mcp.mjs
export const TRUSTED_READ_ONLY_MCP = new Set([
  "mcp__plugin_moe-memory_moe-memory__search_conversations",
  "mcp__plugin_moe-memory_moe-memory__read_conversation",
  "mcp__plugin_moe-memory_moe-memory__search_journal",
  "mcp__plugin_moe-memory_moe-memory__read_journal_entry",
  "mcp__plugin_moe-memory_moe-memory__list_recent_entries",
  "mcp__plugin_moe-memory_moe-memory__read_recent_entries",
  "mcp__plugin_moe-memory_moe-memory__trace_provenance",
]);

export function classifyMcp(operation) {
  return TRUSTED_READ_ONLY_MCP.has(operation.toolId)
    ? { eligible: true, normalized: { toolId: operation.toolId }, globalSafe: false, reason: "exact Moe-owned read-only tool" }
    : { eligible: false, reason: "tool is not in the exact read-only catalog" };
}
```

For network operations accept only `source: "WebFetch"`, parse with `URL`, lower-case and IDNA-normalize the hostname, discard every other URL component, and reject wildcards, credentials, non-HTTP(S), IP literals, localhost, `.local`, link-local, and RFC1918/private targets.

- [ ] **Step 7: Run policy tests and commit the four independent safety gates**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-safety.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/safety packages/core/test/smoothing-safety.test.ts
git commit -m "feat(core): classify safe smoothing evidence"
```

### Task 5: Eligibility, Ranking, and Harness Rendering

**depends_on:** [2, 3, 4]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/rank.mjs`
- Modify: `packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs`
- Modify: `packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs`
- Test: `packages/core/test/smoothing-ranking-rendering.test.ts`

**Interfaces:**
- Consumes: `EvidenceRecord`, all four `classify*` policy functions, `ClaudePermissionState`, and `CodexLayerState` from Tasks 1–4.
- Produces: `buildCandidates(records, context): Promise<CandidateReport>`, `rankCandidates(candidates, {all}): Candidate[]`, `candidateId(candidate): string`, `renderClaudeCandidate(candidate, context): RenderedCandidate | null`, `renderClaudeSettings(sourceJson, selectedRules): string`, `renderCodexPermission(candidate): RenderedCandidate | null`, `inspectCodexDecision({ruleFiles, argv, runExecpolicy}): Promise<ExecPolicyDecision>`, and `validateCodexReplacement({contents, ruleFiles, witnesses, codexBin, tempDir, runExecpolicy}): Promise<void>`.

- [ ] **Step 1: Write failing threshold, suppression, and deterministic-ranking tests**

```ts
// packages/core/test/smoothing-ranking-rendering.test.ts
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import { buildCandidates, rankCandidates } from "../skills/smoothing-the-experience/scripts/lib/rank.mjs";

it("requires two root sessions and suppresses denials and existing rules", async () => {
  const records = [
    evidence("root-a", "success", "unknown"),
    evidence("root-b", "success", "explicit"),
    evidence("root-c", "denied", "unknown", ["git", "add"]),
    evidence("root-d", "success", "existing-rule", ["git", "diff"]),
  ];
  const report = await buildCandidates(records, fixtureContext);
  expect(report.suggestions.map((entry: { rule: string }) => entry.rule)).toEqual(["Bash(git status:*)"]);
});

it("requires two projects for globals and enforces ten total and five per class", () => {
  const ranked = rankCandidates(makeEligibleCandidates({ shell: 8, filesystem: 8, projects: 2 }), { all: false });
  expect(ranked).toHaveLength(10);
  expect(Math.max(...Object.values(countByClass(ranked)) as number[])).toBe(5);
});
```

Define deterministic fixture builders in the test; shuffle input order twice and assert byte-identical JSON output and stable IDs that contain neither `root-a` nor absolute fixture paths.

- [ ] **Step 2: Write failing Claude renderer tests**

```ts
// append to packages/core/test/smoothing-ranking-rendering.test.ts
// @ts-expect-error — plain ESM production helper.
import { renderClaudeCandidate, renderClaudeSettings } from "../skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs";

it.each([
  [{ class: "filesystem", operation: { action: "read", path: "src/index.ts" } }, "Read(src/index.ts)"],
  [{ class: "filesystem", operation: { action: "modify", path: "src/index.ts" } }, "Edit(src/index.ts)"],
  [{ class: "network", operation: { hostname: "docs.example.invalid" } }, "WebFetch(domain:docs.example.invalid)"],
  [{ class: "mcp", operation: { toolId: "mcp__plugin_moe-memory_moe-memory__search_conversations" } }, "mcp__plugin_moe-memory_moe-memory__search_conversations"],
])("renders exact Claude rule", (candidate, rule) => {
  expect(renderClaudeCandidate({ harness: "claude", scope: "project", ...candidate }, { anchorProven: true })).toMatchObject({ rule });
});

it("never emits Write and declines unproven filesystem anchors", () => {
  expect(renderClaudeCandidate(modifyCandidate, { anchorProven: false })).toBeNull();
  expect(renderClaudeSettings('{"permissions":{"allow":[]},"unrelated":true}', ["Edit(src/index.ts)"])).not.toContain("Write(");
});
```

Also assert malformed Claude JSON blocks replacement, unrelated keys remain unchanged, existing semantic rules deduplicate, and the write destination is project `.claude/settings.local.json` or user `settings.json` according to scope.

- [ ] **Step 3: Write failing Codex rendering and validator-drift tests**

```ts
// append to packages/core/test/smoothing-ranking-rendering.test.ts
// @ts-expect-error — plain ESM production helper.
import { renderCodexPermission, validateCodexReplacement } from "../skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs";

it("renders one lexical literal-only prefix block", () => {
  expect(renderCodexPermission({ id: "shell-abc", class: "shell", operation: { argv: ["git", "status"] }, scope: "project" })?.rule).toBe(`# moe-smoothing:shell-abc\nprefix_rule(\n    pattern = ["git", "status"],\n    decision = "allow",\n    justification = "Moe smoothing: repeated safe use",\n)\n`);
});

it("fails closed when execpolicy output shape drifts", async () => {
  await expect(validateCodexReplacement({ contents: validRule, ruleFiles: [], witnesses: [["git", "status"]], codexBin: "codex", tempDir: "/fixture/tmp", runExecpolicy: async () => ({ novel: true }) })).rejects.toThrow(/unsupported execpolicy output/);
});
```

Assert project rendering returns `null` without a proven trusted layer, global rendering returns `null` for `git add`, blocks sort lexically by stable ID, and `match` plus adjacent `not_match` witnesses prove the prefix authorizes only the audited catalog shape.

- [ ] **Step 4: Run rendering tests and verify missing rank/render exports fail**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-ranking-rendering.test.ts`

Expected: FAIL because `rank.mjs` and renderer exports do not exist.

- [ ] **Step 5: Implement grouping, scope eligibility, stable IDs, and caps**

```js
// packages/core/skills/smoothing-the-experience/scripts/lib/rank.mjs
import { createHash } from "node:crypto";

export function candidateId(candidate) {
  const projectIdentity = candidate.scope === "project"
    ? createHash("sha256").update(candidate.projectRoot).digest("hex")
    : null;
  const publicIdentity = JSON.stringify({ harness: candidate.harness, class: candidate.class, scope: candidate.scope, projectIdentity, rule: candidate.rule });
  return `${candidate.harness}-${candidate.class}-${createHash("sha256").update(publicIdentity).digest("hex").slice(0, 12)}`;
}

export function rankCandidates(candidates, { all = false } = {}) {
  const sorted = [...candidates].sort(compareConfidenceThenSessionsThenRecencyThenCountThenRule);
  if (all) return sorted;
  const perClass = new Map();
  return sorted.filter((candidate) => {
    if ((perClass.get(candidate.class) ?? 0) >= 5) return false;
    perClass.set(candidate.class, (perClass.get(candidate.class) ?? 0) + 1);
    return true;
  }).slice(0, 10);
}
```

In `buildCandidates`, group by normalized operation and project, treat root-session IDs only as ephemeral `Set` members, suppress the complete group if any denial or `existing-rule` exists, require two root sessions, then consider a global only when the same global-safe operation spans two projects and two roots. First render a canonical permission body without metadata, derive the stable ID from that body, then add any ID-bearing decoration such as Codex's `# moe-smoothing:<id>` comment; this avoids a circular ID dependency. An unrenderable item goes into redacted `dispositions` as `no narrow renderer` rather than `suggestions`.

- [ ] **Step 6: Implement exact Claude and validated Codex renderers**

```js
// Claude mapping inside claude.mjs
const CLAUDE_RULE = {
  read: (path) => `Read(${path})`,
  modify: (path) => `Edit(${path})`,
  network: (hostname) => `WebFetch(domain:${hostname})`,
  mcp: (toolId) => toolId,
};

// Codex block inside codex.mjs
export function renderCodexPermission(candidate) {
  if (candidate.class !== "shell" || !candidate.operation.suffixSafe) return null;
  const pattern = candidate.operation.prefix.map((token) => JSON.stringify(token)).join(", ");
  return { ...candidate, rule: `# moe-smoothing:${candidate.id}\nprefix_rule(\n    pattern = [${pattern}],\n    decision = "allow",\n    justification = "Moe smoothing: repeated safe use",\n)\n` };
}
```

Claude settings rendering parses and clones the complete document, appends only deduplicated `permissions.allow` strings, and serializes with two-space indentation plus a final newline. Codex validation writes the proposed complete rule file only under `tempDir`, invokes injected `codex execpolicy check --rules <all-active-rules> -- <argv>`, requires a recognized JSON decision for every positive and negative witness, and deletes the temporary validation file in `finally`.

- [ ] **Step 7: Run ranking/rendering plus upstream adapter tests and commit**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-ranking-rendering.test.ts test/smoothing-claude.test.ts test/smoothing-codex.test.ts test/smoothing-safety.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/rank.mjs packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs packages/core/skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs packages/core/test/smoothing-ranking-rendering.test.ts
git commit -m "feat(core): rank and render smoothing candidates"
```

### Task 6: Hash-Bound Plans and Atomic Config Mutation

**depends_on:** [5]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/lib/mutation.mjs`
- Test: `packages/core/test/smoothing-mutation.test.ts`

**Interfaces:**
- Consumes: Rendered candidates and complete-replacement validators from Task 5.
- Produces: `createBoundPlan({harness, selected, destination, sourceBytes, replacement, now, planDir, fsOps}): Promise<BoundPlan>`, `readBoundPlan(path, fsOps): Promise<BoundPlan>`, `formatUnifiedDiff({destination, sourceBytes, replacement}): string`, and `applyBoundPlan({planPath, expectedHarness, confirmToken, validateReplacement, fsOps}): Promise<ApplyResult>`; plan schema is `{version: 1, harness, createdAt, destination, source:{exists,sha256}, replacement, replacementSha256, selected:[{id,rule}], restartRequired}`.

- [ ] **Step 1: Write failing bound-plan and redacted-diff tests**

```ts
// packages/core/test/smoothing-mutation.test.ts
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM production helper.
import { createBoundPlan, formatUnifiedDiff } from "../skills/smoothing-the-experience/scripts/lib/mutation.mjs";

it("writes a mode-0600 plan containing only selected rule material", async () => {
  const planDir = await mkdtemp(join(tmpdir(), "moe-smoothing-plan-"));
  const plan = await createBoundPlan({ harness: "claude", selected: [{ id: "claude-shell-a", rule: "Bash(git status:*)" }], destination: join(planDir, "settings.json"), sourceBytes: Buffer.from("{}\n"), replacement: '{"permissions":{"allow":["Bash(git status:*)"]}}\n', now: () => "2026-09-03T00:00:00.000Z", planDir });
  expect((await stat(plan.path)).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(plan)).not.toContain("rootSessionId");
  expect(formatUnifiedDiff({ destination: plan.destination, sourceBytes: Buffer.from("{}\n"), replacement: plan.replacement })).toContain('+{"permissions"');
});
```

- [ ] **Step 2: Write failing stale, lock, validation, and atomicity tests**

```ts
// append to packages/core/test/smoothing-mutation.test.ts
// @ts-expect-error — plain ESM production helper.
import { applyBoundPlan } from "../skills/smoothing-the-experience/scripts/lib/mutation.mjs";

it.each(["stale-source", "lock-held", "validator-failure", "rename-failure"])("leaves the original byte-identical on %s", async (failure) => {
  const fixture = await mutationFixture(failure);
  const before = await readFile(fixture.destination);
  await expect(applyBoundPlan(fixture.input)).rejects.toThrow();
  expect(await readFile(fixture.destination)).toEqual(before);
});

it("is idempotent after a successful application", async () => {
  const fixture = await mutationFixture("none");
  expect((await applyBoundPlan(fixture.input)).status).toBe("applied");
  expect((await applyBoundPlan(fixture.input)).status).toBe("already-applied");
});
```

The injected `mutationFixture` must expose spies for `open`, `writeFile`, `fsync`, `rename`, `readFile`, `unlink`, and lock acquisition. Assert the temporary file is in the destination directory, opened with `0o600` and exclusive creation, flushed before rename, read back after rename, and cleaned on every pre-rename failure.

- [ ] **Step 3: Run mutation tests and verify the module is missing**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-mutation.test.ts`

Expected: FAIL because `mutation.mjs` does not exist.

- [ ] **Step 4: Implement canonical plan creation and exact diff output**

```js
export async function createBoundPlan({ harness, selected, destination, sourceBytes, replacement, now = () => new Date().toISOString(), planDir, fsOps = defaultFs }) {
  if (!selected.length || selected.some(({ id, rule }) => !id || !rule)) throw new TypeError("selected permission IDs are required");
  const plan = {
    version: 1, harness, createdAt: now(), destination,
    source: { exists: sourceBytes !== null, sha256: sourceBytes === null ? null : sha256(sourceBytes) },
    replacement, replacementSha256: sha256(Buffer.from(replacement)),
    selected: selected.map(({ id, rule }) => ({ id, rule })),
    restartRequired: harness === "codex",
  };
  const path = join(planDir, `moe-smoothing-${harness}-${randomUUID()}.json`);
  await fsOps.writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return { ...plan, path };
}
```

Validate the closed schema when reading it, require one harness per plan, reject duplicate IDs and non-absolute destinations, and format a deterministic unified diff from `sourceBytes` and `replacement` without adding evidence history.

- [ ] **Step 5: Implement locked, fail-closed atomic replacement**

```js
export async function applyBoundPlan({ planPath, expectedHarness, confirmToken, validateReplacement, fsOps = defaultFs }) {
  const plan = await readBoundPlan(planPath, fsOps);
  if (plan.harness !== expectedHarness || confirmToken !== `apply:${plan.harness}:${plan.replacementSha256}`) throw new Error("explicit harness confirmation does not match plan");
  const current = await readOptional(plan.destination, fsOps);
  if (sha256OrNull(current) === plan.replacementSha256) return { status: "already-applied", destination: plan.destination };
  if (sha256OrNull(current) !== plan.source.sha256) throw new Error("stale source config");
  await validateReplacement(plan.replacement);
  return withExclusiveLock(`${plan.destination}.moe-smoothing.lock`, fsOps, async () => atomicReplace(plan, fsOps));
}
```

Inside the lock, re-read and re-hash the source, create a random same-directory temporary with `wx` and mode `0o600`, write the full replacement, call the file handle's `sync()`, close it, rename atomically, read back, verify `replacementSha256`, then release the lock. Before rename, every error removes only the known temporary and leaves the destination untouched; never unlink or truncate the destination.

- [ ] **Step 6: Run mutation tests and commit the transaction boundary**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-mutation.test.ts`

Expected: PASS.

```bash
git add packages/core/skills/smoothing-the-experience/scripts/lib/mutation.mjs packages/core/test/smoothing-mutation.test.ts
git commit -m "feat(core): apply bound permission plans atomically"
```

### Task 7: Helper CLI and Isolated End-to-End Journey

**depends_on:** [5, 6]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/scripts/smooth.mjs`
- Test: `packages/core/test/smoothing-cli-e2e.test.ts`

**Interfaces:**
- Consumes: `discoverHarnesses`, both harness readers, `buildCandidates`, `createBoundPlan`, `formatUnifiedDiff`, and `applyBoundPlan` from Tasks 1–6.
- Produces: internal CLI verbs `smooth.mjs scan [--days N] [--harness claude,codex] [--all] [--json]`, `smooth.mjs plan --select <id,...> [--json]`, and `smooth.mjs apply --plan <path> --confirm <token>`; exit codes `0` success, `2` usage, `3` no selectable candidates, `4` stale/invalid plan, and `5` harness write failure.

- [ ] **Step 1: Write failing CLI usage and read-only scan tests**

```ts
// packages/core/test/smoothing-cli-e2e.test.ts
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
const run = promisify(execFile);
const cli = new URL("../skills/smoothing-the-experience/scripts/smooth.mjs", import.meta.url);

it("scan is read-only and reports both supported harnesses plus four classes", async () => {
  const fixture = await isolatedHome();
  const before = await snapshotTree(fixture.home);
  const { stdout } = await run(process.execPath, [cli.pathname, "scan", "--days", "30", "--json"], { cwd: fixture.repo, env: fixture.env });
  const report = JSON.parse(stdout);
  expect(report.harnesses.map((entry: { harness: string }) => entry.harness)).toEqual(["claude", "codex"]);
  expect(new Set(report.evidenceClasses)).toEqual(new Set(["shell", "filesystem", "network", "mcp"]));
  expect(await snapshotTree(fixture.home)).toEqual(before);
  expect(stdout).not.toContain("discard");
});
```

- [ ] **Step 2: Write the failing scan-plan-diff-apply-rescan journey**

```ts
it("selects individual IDs, applies one harness, and suppresses the new permission", async () => {
  const fixture = await isolatedHome({ duplicateClaudeSessions: true });
  const scan = JSON.parse((await run(process.execPath, [cli.pathname, "scan", "--json"], { cwd: fixture.repo, env: fixture.env })).stdout);
  const selected = scan.harnesses.find((entry: { harness: string }) => entry.harness === "claude").suggestions[0];
  const planned = JSON.parse((await run(process.execPath, [cli.pathname, "plan", "--select", selected.id, "--json"], { cwd: fixture.repo, env: fixture.env })).stdout);
  expect(planned.diff).toContain(selected.rule);
  expect(planned.plan.mode).toBe("0600");
  await run(process.execPath, [cli.pathname, "apply", "--plan", planned.plan.path, "--confirm", planned.confirmToken], { cwd: fixture.repo, env: fixture.env });
  const rescanned = JSON.parse((await run(process.execPath, [cli.pathname, "scan", "--json"], { cwd: fixture.repo, env: fixture.env })).stdout);
  expect(rescanned.harnesses.find((entry: { harness: string }) => entry.harness === "claude").suggestions).not.toContainEqual(expect.objectContaining({ id: selected.id }));
});
```

Make `isolatedHome` copy only repository fixtures into a temporary `HOME`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME`. Provide a fake `codex` executable only for deterministic App Server/execpolicy responses. Add cases proving `plan` rejects unknown IDs, multi-harness selection, duplicate IDs, and no select-all flag; `apply` rejects a missing or mismatched confirmation.

- [ ] **Step 3: Run the CLI test and verify the entry point is missing**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-cli-e2e.test.ts`

Expected: FAIL because `smooth.mjs` does not exist.

- [ ] **Step 4: Implement strict CLI parsing and the ephemeral scan cache**

```js
const USAGE = `Usage:
  smooth.mjs scan [--days N] [--harness claude,codex] [--all] [--json]
  smooth.mjs plan --select <id,...> [--json]
  smooth.mjs apply --plan <path> --confirm <token>`;

const [verb, ...argv] = process.argv.slice(2);
try {
  if (verb === "scan") await scanVerb(parseScanArgs(argv));
  else if (verb === "plan") await planVerb(parsePlanArgs(argv));
  else if (verb === "apply") await applyVerb(parseApplyArgs(argv));
  else usageError();
} catch (error) {
  process.stderr.write(`${publicError(error)}\n`);
  process.exitCode = exitCodeFor(error);
}
```

`scan` writes nothing and emits redacted report JSON or human text. To make a later `plan` invocation resolve IDs without persisting evidence, `plan` performs a fresh uncapped scan using the same 30-day eligibility window, resolves only the requested stable IDs (including IDs first displayed by `scan --all`), and errors if any ID is absent or the selection crosses harnesses. It then writes the one-harness bound plan to `mkdtemp(join(tmpdir(), "moe-smoothing-"))` with the diff and exact confirmation token in stdout. No `--select all`, wildcard, or implicit selection is accepted.

- [ ] **Step 5: Wire per-harness validation and isolated failure reporting**

```js
async function applyVerb(args) {
  const plan = await readBoundPlan(args.plan);
  const validateReplacement = plan.harness === "claude"
    ? (replacement) => validateClaudeReplacement(replacement)
    : (replacement) => validateCodexReplacementForPlan(plan, replacement);
  const result = await applyBoundPlan({ planPath: args.plan, expectedHarness: plan.harness, confirmToken: args.confirm, validateReplacement });
  emit({ harness: plan.harness, ...result, restartRequired: plan.restartRequired });
}
```

Scanning catches errors per harness and reports `status: "not-evaluated"` or `status: "blocked"` without hiding successful results from the other adapter. Applying is intentionally one harness per invocation. Human output includes ID, scope, destination, literal rule, evidence class, root/project counts, last seen, provenance confidence, safety reason, dispositions, and whether a restart/new session is required.

- [ ] **Step 6: Run the end-to-end and complete smoothing test set**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-cli-e2e.test.ts test/smoothing-*.test.ts`

Expected: PASS, and the isolated-home test proves scan → individual select → exact diff → confirm → apply → rescan suppression.

- [ ] **Step 7: Commit the internal helper CLI**

```bash
git add packages/core/skills/smoothing-the-experience/scripts/smooth.mjs packages/core/test/smoothing-cli-e2e.test.ts
git commit -m "feat(core): add smoothing permission workflow"
```

### Task 8: Skill Orchestration, Authored Registry, and Generated Distribution

**depends_on:** [7]

**Files:**
- Create: `packages/core/skills/smoothing-the-experience/SKILL.md`
- Modify: `packages/core/skill-tiers.yaml`
- Test: `packages/core/test/smoothing-the-experience-contract.test.ts`
- Test: `packages/core/test/metadata.test.ts`
- Modify: `plugins/moe/.moe-mint/manifest.json`
- Create: `plugins/moe/skills/smoothing-the-experience/SKILL.md`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/smooth.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/discovery.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/evidence.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/rank.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/mutation.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/harnesses/claude.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/harnesses/codex.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/safety/shell.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/safety/filesystem.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/safety/network.mjs`
- Create: `plugins/moe/skills/smoothing-the-experience/scripts/lib/safety/mcp.mjs`
- Create: `plugins/moe/.codex-plugin/skills/smoothing-the-experience/SKILL.md`
- Create: `plugins/moe/.cursor-plugin/skills/smoothing-the-experience/SKILL.md`
- Create: `plugins/moe/.kimi-plugin/skills/smoothing-the-experience/SKILL.md`
- Create: `plugins/moe/.opencode/skills/smoothing-the-experience/SKILL.md`
- Create: `plugins/moe/.pi/skills/smoothing-the-experience/SKILL.md`

**Interfaces:**
- Consumes: The three internal helper verbs from Task 7 and the approved report-selection-diff-confirmation protocol.
- Produces: An authored `smoothing-the-experience` skill discoverable from requests to reduce repeated permission prompts or audit permanent permissions, plus mint-generated copies for every supported plugin harness.

- [ ] **Step 1: Write the failing skill contract test**

```ts
// packages/core/test/smoothing-the-experience-contract.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const skillPath = new URL("../skills/smoothing-the-experience/SKILL.md", import.meta.url);

describe("smoothing-the-experience skill contract", () => {
  it("requires read-only scan, individual selection, exact diff, and one-harness confirmation", async () => {
    const skill = await readFile(skillPath, "utf8");
    expect(skill).toMatch(/^---\nname: smoothing-the-experience\n/);
    expect(skill).toContain("scan --days 30");
    expect(skill).toContain("Never offer select-all");
    expect(skill).toContain("Show the exact diff");
    expect(skill).toContain("one harness at a time");
    expect(skill).toContain("Do not run `apply` until the user explicitly confirms");
  });

  it("does not claim unsupported harness coverage or background behavior", async () => {
    const skill = await readFile(skillPath, "utf8");
    expect(skill).toContain("not evaluated");
    expect(skill).toContain("Claude Code and Codex");
    expect(skill).not.toContain("background service");
    expect(skill).not.toContain("automatically grant");
  });
});
```

- [ ] **Step 2: Run contract and metadata tests to verify the missing skill fails**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-the-experience-contract.test.ts test/metadata.test.ts`

Expected: FAIL because the skill is absent and is not accounted for in the authored map.

- [ ] **Step 3: Write the skill orchestration instructions**

```markdown
---
name: smoothing-the-experience
description: Use when a developer wants to reduce repeated agent permission prompts, audit permanent tool permissions, or inspect recent Claude Code and Codex sessions for safe allow rules
---

# Smoothing the Experience

Run the skill-owned helper with Node. The audit is local, deterministic, and on demand.

1. Resolve `<skill-dir>` to the directory containing this loaded `SKILL.md`; under Claude Code this is `${CLAUDE_PLUGIN_ROOT}/skills/smoothing-the-experience`, and repository development may use `packages/core/skills/smoothing-the-experience`.
2. Run `node "<skill-dir>/scripts/smooth.mjs" scan --days 30`.
3. Present Claude Code and Codex separately. Preserve `not evaluated`, `blocked`, and `no narrow renderer` dispositions.
4. Ask the user to select individual candidate IDs. Never offer select-all.
5. Run `node "<skill-dir>/scripts/smooth.mjs" plan --select <comma-separated-ids>` for exactly one harness and show the exact diff.
6. Explain the destination and whether a new session is required.
7. Do not run `apply` until the user explicitly confirms that exact diff, one harness at a time.
8. Pass the plan path and printed confirmation token to `node "<skill-dir>/scripts/smooth.mjs" apply --plan <path> --confirm <token>`; report the result and leave other harnesses unchanged.

Never summarize raw transcripts, broaden a rule, reinterpret an ineligible item, or bypass a helper refusal.
```

Use harness-neutral wording for locating the installed plugin root, matching existing authored skill conventions; document the direct repository fallback for development. Include the exact `scan`, `plan`, and `apply` invocations and state that unsupported installed harnesses are best-effort `not evaluated` results.

- [ ] **Step 4: Register only the authored skill**

```yaml
# append under authored: in packages/core/skill-tiers.yaml
  smoothing-the-experience:
    from: moe
    why: >-
      An on-demand local audit that turns repeated successful Claude Code and
      Codex tool use into narrow, individually reviewed permanent permission
      suggestions. It is deterministic and never grants permissions without
      an exact diff and explicit per-harness confirmation.
```

Do not touch the frozen `imported:` map, its pinned literal in `metadata.test.ts`, `NOTICE`, `.claude-plugin/marketplace.json`, or `packages/core/mint/moe.yaml`.

- [ ] **Step 5: Run source contract, metadata, and core typecheck tests**

Run: `pnpm --filter @bubstack/moe-core exec vitest run test/smoothing-the-experience-contract.test.ts test/metadata.test.ts test/smoothing-*.test.ts`

Expected: PASS, including the metadata test named "accounts for every skill on disk in exactly one of the two maps".

Run: `pnpm --filter @bubstack/moe-core typecheck`

Expected: PASS.

- [ ] **Step 6: Regenerate all plugin copies from source**

Run: `pnpm mint`

Expected: PASS. `git status --short` shows only generated additions/manifest changes under `plugins/moe/`; every generated harness copy contains the same `SKILL.md` and complete `scripts/` tree as the package source.

- [ ] **Step 7: Run repository release gates**

Run: `pnpm check`

Expected: PASS.

Run: `pnpm mint:check`

Expected: PASS with the generated tree byte-identical.

Run: `pnpm provenance`

Expected: PASS without imported-work metadata changes.

Run: `git diff --check && git ls-files --eol | rg 'smoothing-the-experience|skill-tiers.yaml'`

Expected: `git diff --check` exits 0 and every listed new/modified text file reports LF line endings.

- [ ] **Step 8: Perform the privacy and generated-copy audit**

Run: `rg -n '(/Users/|rootSessionId|toolOutput|aggregated_output|"prompt"|secret)' packages/core/skills/smoothing-the-experience packages/core/test/fixtures/smoothing-the-experience plugins/moe`

Expected: No real home path, retained session identity, tool output, prompt, or secret appears. Any matches are schema-rejection tests, explicit privacy assertions, or the synthetic literal `discard`; inspect each match before proceeding.

Run: `diff -qr packages/core/skills/smoothing-the-experience plugins/moe/skills/smoothing-the-experience`

Expected: No output.

- [ ] **Step 9: Commit source and generated distribution together**

```bash
git add packages/core/skills/smoothing-the-experience packages/core/skill-tiers.yaml packages/core/test/smoothing-the-experience-contract.test.ts plugins/moe
git commit -m "feat(core): ship smoothing experience skill"
```

The final review must cite guarded behavior by the test name "accounts for every skill on disk in exactly one of the two maps" and by the `smoothing-the-experience` contract symbols, never by line number.
