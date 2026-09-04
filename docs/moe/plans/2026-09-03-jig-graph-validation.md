# Graph-Grounded Plan Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire moedex's code graph into the planning pipeline so that plans can be validated against — and seeded from — real dependency structure.

**Architecture:** A new `@bubstack/moe-jig-graph` package (L1) extends jig's CLI with two commands: `moe jig plan validate` and `moe jig plan seed`. Jig gains an extension discovery mechanism so graph-aware commands share its namespace without polluting its L0 dependency position. The plan parser is extracted from core's task-set hook into jig so both task-set and jig-graph can share it.

**Tech Stack:** TypeScript, vitest, commander (via jig), `@modelcontextprotocol/sdk` (MCP client for moedex)

**Spec:** `docs/moe/specs/2026-09-03-jig-graph-validation-design.md`

## Global Constraints

- Node ≥ 24, pnpm 11.23.0, TypeScript ≥ 5.9.
- jig stays L0 — no `@bubstack/moe-*` imports. The parser extraction adds code to jig but no workspace dependencies.
- jig-graph is L1 — depends on `@bubstack/moe-jig` for parser types + `@modelcontextprotocol/sdk` for moedex.
- `tsconfig.json` `references` must mirror runtime `dependencies` one-for-one.
- All existing tests must pass after each task (`pnpm check`).
- Multi-harness: nothing here changes task-set or plan-set behavior. Both degrade when moedex is absent.

## Open Decisions

- **D1 — moedex MCP SDK version** · `research` · AFK
  - **Question:** Which version of `@modelcontextprotocol/sdk` supports `StreamableHTTPClientTransport` and is compatible with Node 24?
  - **Options:** latest stable / pinned known-good
  - **Recommendation:** latest stable, pinned to exact version in package.json
  - **Blocked by:** —
  - **Blocks:** Task 3
  - **Resolution:** Pin `@modelcontextprotocol/sdk` to `1.30.0` — latest stable, exports `StreamableHTTPClientTransport`, Node 24 compatible.

## Not Yet Specified

- How `impact_analysis` results should be clustered into task groups in seed — the clustering heuristic will emerge from looking at real moedex output on an indexed repo.
- Whether validate findings should be machine-actionable (auto-fixable) in a future iteration.

## Out of Scope

- Modifying task-set or plan-set to call moedex at runtime (approach C from the spec — deferred).
- Governance integration (tc-governance gating on graph findings).
- Indexing strategy for moedex (which repos, update cadence). Indexing moe is in scope; the policy is not.

---

### Task 1: Extract Plan Parser Into Jig

**depends_on:** []

**Files:**
- Create: `packages/jig/src/parser.ts`
- Create: `packages/jig/test/parser.test.ts`
- Modify: `packages/jig/src/cli.ts`
- Modify: `packages/jig/package.json`
- Modify: `packages/core/hooks/task-set`

**Interfaces:**
- Consumes: `None`
- Produces: `parsePlan(text: string): { tasks: PlanTask[] }`, `validatePlan(tasks: PlanTask[]): { errors: string[] }`, `computeWaves(tasks: PlanTask[]): number[][]`, and the `PlanTask` type — all exported from `@bubstack/moe-jig/parser`

- [ ] **Step 1: Write the parser test**

Create `packages/jig/test/parser.test.ts` with tests for the three functions. Use a fixture plan string that exercises all parsed fields.

```typescript
import { describe, expect, it } from "vitest";
import { computeWaves, parsePlan, validatePlan } from "../src/parser.js";
import type { PlanTask } from "../src/parser.js";

const FIXTURE = `
### Task 1: Foundation

**depends_on:** []

**Files:**
- Create: \`src/foundation.ts\`
- Test: \`test/foundation.test.ts\`

**Interfaces:**
- Consumes: \`None\`
- Produces: \`createFoundation(): Foundation\`

- [ ] **Step 1: Write test**
- [x] **Step 2: Implement**

### Task 2: Walls

**depends_on:** [1]

**Files:**
- Create: \`src/walls.ts\`
- Test: \`test/walls.test.ts\`

**Interfaces:**
- Consumes: \`createFoundation(): Foundation\`
- Produces: \`buildWalls(f: Foundation): Walls\`

- [ ] **Step 1: Write test**

### Task 3: Roof

**depends_on:** [1]

**Files:**
- Create: \`src/roof.ts\`
- Test: \`test/roof.test.ts\`

**Interfaces:**
- Consumes: \`createFoundation(): Foundation\`
- Produces: \`addRoof(f: Foundation): Roof\`

- [ ] **Step 1: Write test**
`;

describe("parsePlan", () => {
  it("extracts tasks with all fields", () => {
    const { tasks } = parsePlan(FIXTURE);
    expect(tasks).toHaveLength(3);

    const t1 = tasks.find((t) => t.num === 1)!;
    expect(t1.title).toBe("Foundation");
    expect(t1.dependsOn).toEqual([]);
    expect(t1.files).toEqual(["src/foundation.ts", "test/foundation.test.ts"]);
    expect(t1.hasConsumes).toBe(true);
    expect(t1.hasProduces).toBe(true);
    expect(t1.steps).toEqual([{ checked: false }, { checked: true }]);
  });

  it("parses depends_on integers", () => {
    const { tasks } = parsePlan(FIXTURE);
    const t2 = tasks.find((t) => t.num === 2)!;
    expect(t2.dependsOn).toEqual([1]);
  });

  it("skips fenced code blocks", () => {
    const withFence = "```\n### Task 99: Fake\n```\n" + FIXTURE;
    const { tasks } = parsePlan(withFence);
    expect(tasks.find((t) => t.num === 99)).toBeUndefined();
  });
});

describe("validatePlan", () => {
  it("passes on a valid plan", () => {
    const { tasks } = parsePlan(FIXTURE);
    const { errors } = validatePlan(tasks);
    expect(errors).toEqual([]);
  });

  it("detects duplicate task numbers", () => {
    const dup = FIXTURE + "\n### Task 1: Duplicate\n\n**Files:**\n- Create: `x.ts`\n\n**Interfaces:**\n- Consumes: `None`\n- Produces: `None`\n\n- [ ] Step\n";
    const { tasks } = parsePlan(dup);
    const { errors } = validatePlan(tasks);
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("detects missing depends_on target", () => {
    const bad = FIXTURE.replace("**depends_on:** [1]", "**depends_on:** [99]");
    const { tasks } = parsePlan(bad);
    const { errors } = validatePlan(tasks);
    expect(errors.some((e) => e.includes("99"))).toBe(true);
  });
});

describe("computeWaves", () => {
  it("groups independent tasks into the same wave", () => {
    const { tasks } = parsePlan(FIXTURE);
    const waves = computeWaves(tasks);
    // Task 1 is wave 0. Tasks 2 and 3 depend on 1 but not each other,
    // and have disjoint files — same wave.
    expect(waves[0]).toEqual([1]);
    expect(waves[1]).toEqual(expect.arrayContaining([2, 3]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bubstack/moe-jig test -- parser`
Expected: FAIL — `parser.js` does not exist yet.

- [ ] **Step 3: Create the parser module**

Create `packages/jig/src/parser.ts`. Extract the `parsePlan`, `validate` (renamed to `validatePlan` to avoid collision with the reserved word in strict-mode contexts), and `computeWaves` functions from `packages/core/hooks/task-set`. Add TypeScript types.

```typescript
export interface PlanTask {
  num: number;
  title: string;
  dependsOn: number[];
  blockedBy: string | null;
  files: string[];
  hasConsumes: boolean;
  hasProduces: boolean;
  steps: { checked: boolean }[];
}

export function parsePlan(text: string): { tasks: PlanTask[] } {
  const lines = text.split(/\r?\n/);
  const tasks: PlanTask[] = [];
  let current: PlanTask | null = null;
  let inFence = false;

  const pushCurrent = () => {
    if (current !== null) tasks.push(current);
    current = null;
  };

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const taskMatch = /^###\s+Task\s+(\d+)\s*:\s*(.*)$/.exec(line);
    if (taskMatch) {
      pushCurrent();
      current = {
        num: parseInt(taskMatch[1]!, 10),
        title: taskMatch[2]!.trim(),
        dependsOn: [],
        blockedBy: null,
        files: [],
        hasConsumes: false,
        hasProduces: false,
        steps: [],
      };
      continue;
    }

    if (!current) continue;

    const depMatch = /^\*\*depends_on:\*\*\s*\[([^\]]*)\]/.exec(line);
    if (depMatch) {
      const inner = depMatch[1]!.trim();
      if (inner !== "") {
        current.dependsOn = inner.split(",").map((s) => {
          const n = parseInt(s.trim(), 10);
          if (Number.isNaN(n))
            throw new Error(
              `task ${current!.num}: depends_on contains non-integer "${s.trim()}"`,
            );
          return n;
        });
      }
      continue;
    }

    const blockedMatch = /^\*\*Blocked by:\*\*\s*(.+)/.exec(line);
    if (blockedMatch) {
      current.blockedBy = blockedMatch[1]!.trim();
      continue;
    }

    const fileMatch = /^-\s+(?:Create|Modify|Test):\s*`([^`]+)`/.exec(line);
    if (fileMatch) {
      current.files.push(fileMatch[1]!);
      continue;
    }

    if (/^-\s+Consumes:/.test(line)) {
      current.hasConsumes = true;
      continue;
    }
    if (/^-\s+Produces:/.test(line)) {
      current.hasProduces = true;
      continue;
    }

    const checkMatch = /^-\s+\[([ xX])\]/.exec(line);
    if (checkMatch) {
      current.steps.push({ checked: checkMatch[1] !== " " });
      continue;
    }
  }
  pushCurrent();
  return { tasks };
}

export function validatePlan(tasks: PlanTask[]): { errors: string[] } {
  // Exact logic from task-set hook, typed.
  // See packages/core/hooks/task-set lines 152-214 for the reference
  // implementation. Copy the complete validation logic here.
  // ... (full implementation — see core/hooks/task-set)
}

export function computeWaves(tasks: PlanTask[]): number[][] {
  // Exact logic from task-set hook, typed.
  // See packages/core/hooks/task-set lines 228-304.
  // ... (full implementation — see core/hooks/task-set)
}
```

The implementer must copy the full function bodies from `packages/core/hooks/task-set` (lines 152–214 for `validate`, lines 228–304 for `computeWaves`), adding types and replacing `die()` calls with thrown `Error`s. The logic is identical; this is a mechanical type-annotation pass plus replacing `die()` with `throw`.

- [ ] **Step 4: Export parser from package.json**

Add an `exports` map to `packages/jig/package.json` so consumers can import from `@bubstack/moe-jig/parser`:

```json
{
  "exports": {
    ".": "./dist/cli.js",
    "./parser": "./dist/parser.js"
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bubstack/moe-jig test -- parser`
Expected: PASS — all parser tests green.

- [ ] **Step 6: Update core's task-set hook to import from jig**

Replace the inline `parsePlan`, `validate`, and `computeWaves` in `packages/core/hooks/task-set` with imports from the jig package. The hook is a standalone `#!/usr/bin/env node` script that uses only Node built-ins today. Since core is L1 and jig is L0, this dependency direction is valid.

At the top of `packages/core/hooks/task-set`, replace the three function definitions (lines 61–304) with:

```javascript
import { parsePlan, validatePlan, computeWaves } from "@bubstack/moe-jig/parser";
```

Rename the hook's internal calls from `validate(tasks)` to `validatePlan(tasks)` to match the export.

Add `@bubstack/moe-jig` to `packages/core/package.json` dependencies and add the corresponding reference to `packages/core/tsconfig.json`.

- [ ] **Step 7: Run full test suite**

Run: `pnpm check`
Expected: All tests pass. The task-set hook behavior is identical — same parsing, same validation, same wave computation.

- [ ] **Step 8: Commit**

```bash
git add packages/jig/src/parser.ts packages/jig/test/parser.test.ts \
  packages/jig/package.json packages/jig/src/cli.ts \
  packages/core/hooks/task-set packages/core/package.json \
  packages/core/tsconfig.json
git commit -m "refactor(jig): extract plan parser from core's task-set hook

Moves parsePlan, validatePlan, and computeWaves into jig as typed
exports. Core's task-set hook now imports from @bubstack/moe-jig/parser.
This enables jig-graph (and future extensions) to reuse the parser
without depending on core."
```

### Task 2: Add Extension Discovery to Jig's CLI

**depends_on:** [1]

**Files:**
- Create: `packages/jig/src/extension.ts`
- Create: `packages/jig/test/extension.test.ts`
- Modify: `packages/jig/src/cli.ts`

**Interfaces:**
- Consumes: `None`
- Produces: `JigExtensionCommand` interface and `JigContext` type exported from `@bubstack/moe-jig/extension`, plus the `loadExtensions(program: Command, ctx: JigContext)` function

- [ ] **Step 1: Write the extension discovery test**

Create `packages/jig/test/extension.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { JigExtensionCommand, JigContext } from "../src/extension.js";
import { loadExtensions } from "../src/extension.js";
import { Command } from "commander";

describe("loadExtensions", () => {
  it("merges extension commands into an existing command group", () => {
    const program = new Command();
    const plan = program.command("plan").description("test plan group");
    plan.command("init").description("existing init").action(() => {});

    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    const mockExtension: JigExtensionCommand[] = [
      {
        namespace: "plan",
        name: "validate",
        description: "Validate a plan against the code graph",
        options: [
          { flags: "--json", description: "JSON output" },
          { flags: "--manifest <path>", description: "Validate all plans in manifest" },
        ],
        run: vi.fn().mockResolvedValue(0),
      },
    ];

    // Mock require.resolve to find our fake extension
    loadExtensions(program, ctx, () => mockExtension);

    const planCmd = program.commands.find((c) => c.name() === "plan")!;
    const validateCmd = planCmd.commands.find((c) => c.name() === "validate");
    expect(validateCmd).toBeDefined();
    expect(validateCmd!.description()).toBe(
      "Validate a plan against the code graph",
    );
  });

  it("silently skips when no extension is found", () => {
    const program = new Command();
    program.command("plan").description("test");
    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    // Resolver throws — extension not installed
    expect(() =>
      loadExtensions(program, ctx, () => {
        throw new Error("MODULE_NOT_FOUND");
      }),
    ).not.toThrow();
  });

  it("errors on collision with built-in command", () => {
    const program = new Command();
    const plan = program.command("plan").description("test");
    plan.command("init").description("built-in").action(() => {});

    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    const collision: JigExtensionCommand[] = [
      {
        namespace: "plan",
        name: "init",
        description: "collides with built-in",
        run: vi.fn().mockResolvedValue(0),
      },
    ];

    expect(() => loadExtensions(program, ctx, () => collision)).toThrow(
      /collision/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bubstack/moe-jig test -- extension`
Expected: FAIL — `extension.js` does not exist.

- [ ] **Step 3: Implement the extension module**

Create `packages/jig/src/extension.ts`:

```typescript
import type { Command } from "commander";
import type { PlanTask } from "./parser.js";
import { parsePlan, validatePlan, computeWaves } from "./parser.js";

export interface JigContext {
  parsePlan: typeof parsePlan;
  validatePlan: typeof validatePlan;
  computeWaves: typeof computeWaves;
}

export interface JigExtensionCommand {
  namespace: string;
  name: string;
  description: string;
  options?: { flags: string; description: string }[];
  run(args: string[], ctx: JigContext): Promise<number>;
}

type ExtensionResolver = () => JigExtensionCommand[];

const EXTENSION_PACKAGES = ["@bubstack/moe-jig-graph/jig-extension"];

function defaultResolver(): JigExtensionCommand[] {
  for (const pkg of EXTENSION_PACKAGES) {
    try {
      const resolved = require.resolve(pkg);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(resolved);
      return mod.commands ?? mod.default?.commands ?? [];
    } catch {
      // Extension not installed — skip
    }
  }
  return [];
}

export function loadExtensions(
  program: Command,
  ctx: JigContext,
  resolve: ExtensionResolver = defaultResolver,
): void {
  let commands: JigExtensionCommand[];
  try {
    commands = resolve();
  } catch {
    return;
  }

  for (const ext of commands) {
    const group = program.commands.find((c) => c.name() === ext.namespace);
    if (!group) continue;

    const existing = group.commands.find((c) => c.name() === ext.name);
    if (existing) {
      throw new Error(
        `Extension collision: "${ext.namespace} ${ext.name}" shadows a built-in command`,
      );
    }

    const sub = group
      .command(ext.name)
      .description(ext.description);

    if (ext.options) {
      for (const opt of ext.options) {
        sub.option(opt.flags, opt.description);
      }
    }

    sub.argument("[args...]", "command arguments")
      .action(async (args: string[], opts: Record<string, unknown>) => {
        const flatArgs = [...args];
        for (const [k, v] of Object.entries(opts)) {
          if (v === true) flatArgs.push(`--${k}`);
          else if (typeof v === "string") flatArgs.push(`--${k}`, v);
        }
        const code = await ext.run(flatArgs, ctx);
        if (code !== 0) process.exitCode = code;
      });
  }
}
```

- [ ] **Step 4: Wire extension discovery into cli.ts**

In `packages/jig/src/cli.ts`, after all static commands are registered and before `program.parseAsync`, add:

```typescript
import { loadExtensions } from "./extension.js";
import { parsePlan, validatePlan, computeWaves } from "./parser.js";

// After the spec command group and before main():
loadExtensions(program, { parsePlan, validatePlan, computeWaves });
```

- [ ] **Step 5: Export extension types from package.json**

Add the extension export to `packages/jig/package.json`'s `exports` map:

```json
{
  "exports": {
    ".": "./dist/cli.js",
    "./parser": "./dist/parser.js",
    "./extension": "./dist/extension.js"
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bubstack/moe-jig test`
Expected: PASS — all tests including extension discovery.

- [ ] **Step 7: Run full test suite**

Run: `pnpm check`
Expected: All tests pass. No behavioral change to existing commands.

- [ ] **Step 8: Commit**

```bash
git add packages/jig/src/extension.ts packages/jig/test/extension.test.ts \
  packages/jig/src/cli.ts packages/jig/package.json
git commit -m "feat(jig): add extension discovery mechanism

Jig probes for @bubstack/moe-jig-graph/jig-extension at startup and
merges discovered commands into existing command groups. Extensions
receive a JigContext with parser functions. Discovery failure is
silent — jig continues with built-in commands only."
```

### Task 3: Create jig-graph Package With Moedex MCP Client

**depends_on:** []

**Files:**
- Create: `packages/jig-graph/package.json`
- Create: `packages/jig-graph/tsconfig.json`
- Create: `packages/jig-graph/tsconfig.tests.json`
- Create: `packages/jig-graph/src/moedex.ts`
- Create: `packages/jig-graph/src/jig-extension.ts`
- Create: `packages/jig-graph/test/moedex.test.ts`
- Modify: `tsconfig.json` (root — add project reference)

**Interfaces:**
- Consumes: `None`
- Produces: `MoedexClient` class with `impactAnalysis(target: string): Promise<ImpactResult>`, `traceConsumers(files: string[]): Promise<ConsumerResult>`, `searchContext(query: string): Promise<SearchResult>`, `traceCalls(symbol: string): Promise<CallResult>`, and `isAvailable(): Promise<boolean>`. Also exports `commands` array from `jig-extension.ts`.

- [ ] **Step 1: Create package scaffold**

Create `packages/jig-graph/package.json`:

```json
{
  "name": "@bubstack/moe-jig-graph",
  "version": "0.1.0",
  "type": "module",
  "description": "Graph-grounded plan validation. Extends jig with moedex-powered validate and seed commands.",
  "license": "MIT",
  "author": {
    "name": "Zak Keown",
    "email": "zak.keown@outlook.com"
  },
  "homepage": "https://github.com/zak-keown/moe",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zak-keown/moe.git"
  },
  "keywords": ["moe", "jig", "moedex", "code-graph", "plan-validation"],
  "exports": {
    "./jig-extension": "./dist/jig-extension.js"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "files": ["dist"],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "build": "tsc -b && node ../../scripts/copy-license.mjs MIT dist/LICENSE",
    "typecheck": "tsc -b --pretty",
    "test": "vitest run",
    "lint": "biome check ."
  },
  "dependencies": {
    "@bubstack/moe-jig": "workspace:*",
    "@modelcontextprotocol/sdk": "1.30.0"
  },
  "devDependencies": {
    "@types/node": "^24.7.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/jig-graph/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../jig" }
  ]
}
```

Create `packages/jig-graph/tsconfig.tests.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist-test",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"],
  "references": [
    { "path": "../jig" }
  ]
}
```

Add the project reference to the root `tsconfig.json`.

- [ ] **Step 2: Write the moedex client test**

Create `packages/jig-graph/test/moedex.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoedexClient } from "../src/moedex.js";

describe("MoedexClient", () => {
  it("reports unavailable when connection fails", async () => {
    const client = new MoedexClient("http://127.0.0.1:0");
    expect(await client.isAvailable()).toBe(false);
  });

  it("calls impact_analysis via MCP", async () => {
    const mockCallTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [
              {
                rel_path: "src/api/handler.ts",
                score: 0.85,
                repo: "moe",
              },
              {
                rel_path: "src/api/middleware.ts",
                score: 0.72,
                repo: "moe",
              },
            ],
          }),
        },
      ],
    });

    const client = new MoedexClient("http://mock:8081");
    client._setTransport(mockCallTool);

    const result = await client.impactAnalysis("handleRequest");
    expect(mockCallTool).toHaveBeenCalledWith({
      name: "impact_analysis",
      arguments: { query: "handleRequest" },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.rel_path).toBe("src/api/handler.ts");
  });

  it("calls trace_consumers via MCP", async () => {
    const mockCallTool = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [
              {
                rel_path: "src/routes.ts",
                score: 0.90,
                repo: "moe",
              },
            ],
          }),
        },
      ],
    });

    const client = new MoedexClient("http://mock:8081");
    client._setTransport(mockCallTool);

    const result = await client.traceConsumers(["src/api/handler.ts"]);
    expect(result.results).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @bubstack/moe-jig-graph test`
Expected: FAIL — `moedex.js` does not exist.

- [ ] **Step 4: Implement the moedex client**

Create `packages/jig-graph/src/moedex.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface GraphResult {
  rel_path: string;
  score: number;
  repo: string;
  abs_path?: string;
  line_start?: number;
  line_end?: number;
  neighbors?: unknown[];
}

export interface ImpactResult {
  results: GraphResult[];
}

export interface ConsumerResult {
  results: GraphResult[];
}

export interface SearchResult {
  results: GraphResult[];
}

export interface CallResult {
  results: GraphResult[];
}

type ToolCaller = (req: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<{ content: { type: string; text: string }[] }>;

const DEFAULT_ADDR =
  process.env["MOEDEX_MCP_HTTP_ADDR"] ?? "http://127.0.0.1:8081";

export class MoedexClient {
  private addr: string;
  private callTool: ToolCaller | null = null;
  private client: Client | null = null;

  constructor(addr: string = DEFAULT_ADDR) {
    this.addr = addr;
  }

  _setTransport(caller: ToolCaller): void {
    this.callTool = caller;
  }

  async connect(): Promise<boolean> {
    if (this.callTool) return true;
    try {
      const url = new URL("/mcp", this.addr);
      const transport = new StreamableHTTPClientTransport(url);
      this.client = new Client({ name: "moe-jig-graph", version: "0.1.0" });
      await this.client.connect(transport);
      this.callTool = (req) =>
        this.client!.callTool(req) as Promise<{
          content: { type: string; text: string }[];
        }>;
      return true;
    } catch {
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.connect();
  }

  private async call(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.callTool) {
      const ok = await this.connect();
      if (!ok) throw new Error("moedex unavailable");
    }
    const result = await this.callTool!(
      { name: tool, arguments: args },
    );
    const text = result.content.find((c) => c.type === "text")?.text;
    if (!text) throw new Error(`${tool} returned no text content`);
    return JSON.parse(text);
  }

  async impactAnalysis(target: string): Promise<ImpactResult> {
    return (await this.call("impact_analysis", {
      query: target,
    })) as ImpactResult;
  }

  async traceConsumers(files: string[]): Promise<ConsumerResult> {
    return (await this.call("trace_consumers", {
      query: files.join(", "),
    })) as ConsumerResult;
  }

  async traceCalls(symbol: string): Promise<CallResult> {
    return (await this.call("trace_calls", {
      query: symbol,
    })) as CallResult;
  }

  async searchContext(query: string): Promise<SearchResult> {
    return (await this.call("search_context", {
      query,
      token_budget: 8000,
    })) as SearchResult;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.callTool = null;
    }
  }
}
```

- [ ] **Step 5: Create the extension entry point**

Create `packages/jig-graph/src/jig-extension.ts` — a stub that will be filled in by Tasks 4 and 5:

```typescript
import type { JigExtensionCommand } from "@bubstack/moe-jig/extension";

export const commands: JigExtensionCommand[] = [];
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @bubstack/moe-jig-graph test`
Expected: PASS — moedex client tests green.

- [ ] **Step 7: Run full check**

Run: `pnpm check`
Expected: PASS — new package builds and typechecks, existing packages unaffected.

- [ ] **Step 8: Commit**

```bash
git add packages/jig-graph/ tsconfig.json pnpm-lock.yaml
git commit -m "feat(jig-graph): scaffold package with moedex MCP client

New @bubstack/moe-jig-graph at L1. Connects to moedex's warm HTTP
daemon via @modelcontextprotocol/sdk. Degrades gracefully when moedex
is unavailable. Extension entry point is stubbed — validate and seed
commands are added in subsequent tasks."
```

### Task 4: Implement the Validate Command

**depends_on:** [1, 2, 3]

**Files:**
- Create: `packages/jig-graph/src/validate.ts`
- Create: `packages/jig-graph/src/report.ts`
- Create: `packages/jig-graph/test/validate.test.ts`
- Modify: `packages/jig-graph/src/jig-extension.ts`

**Interfaces:**
- Consumes: `parsePlan`, `validatePlan`, `computeWaves` from Task 1; `JigExtensionCommand`, `JigContext` from Task 2; `MoedexClient` from Task 3
- Produces: `validatePlanAgainstGraph(planPath: string, ctx: JigContext, client: MoedexClient, opts: ValidateOpts): Promise<Finding[]>` and the `Finding` type

- [ ] **Step 1: Define the Finding type and report module**

Create `packages/jig-graph/src/report.ts`:

```typescript
export interface Finding {
  check: "uncovered" | "missing-edge" | "wave-conflict" | "phantom";
  severity: "warning";
  tasks: number[];
  files: string[];
  message: string;
}

export function formatFindings(
  findings: Finding[],
  json: boolean,
): string {
  if (json) return JSON.stringify(findings, null, 2);

  if (findings.length === 0) return "No findings.";

  const lines: string[] = [];
  for (const f of findings) {
    const taskStr =
      f.tasks.length > 0 ? ` (task${f.tasks.length > 1 ? "s" : ""} ${f.tasks.join(", ")})` : "";
    lines.push(`[${f.check}]${taskStr}: ${f.message}`);
    if (f.files.length > 0) {
      for (const file of f.files) {
        lines.push(`  - ${file}`);
      }
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Write the validate test**

Create `packages/jig-graph/test/validate.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { validatePlanAgainstGraph } from "../src/validate.js";
import type { JigContext } from "@bubstack/moe-jig/extension";
import type { MoedexClient } from "../src/moedex.js";
import type { PlanTask } from "@bubstack/moe-jig/parser";

async function makeCtx(): Promise<JigContext> {
  const { parsePlan, validatePlan, computeWaves } = await import(
    "@bubstack/moe-jig/parser"
  );
  return { parsePlan, validatePlan, computeWaves };
}

function makeMockClient(overrides: Partial<MoedexClient> = {}): MoedexClient {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    impactAnalysis: vi.fn().mockResolvedValue({ results: [] }),
    traceConsumers: vi.fn().mockResolvedValue({ results: [] }),
    traceCalls: vi.fn().mockResolvedValue({ results: [] }),
    searchContext: vi.fn().mockResolvedValue({ results: [] }),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MoedexClient;
}

const PLAN_WITH_GAP = `
# Test Plan

**Goal:** Refactor the API handler

---

### Task 1: Update Handler

**depends_on:** []

**Files:**
- Modify: \`src/api/handler.ts\`
- Test: \`test/api/handler.test.ts\`

**Interfaces:**
- Consumes: \`None\`
- Produces: \`handleRequest(): Response\`

- [ ] **Step 1: Write test**
`;

describe("validatePlanAgainstGraph", () => {
  it("reports uncovered files from blast radius", async () => {
    const ctx = await makeCtx();
    const client = makeMockClient({
      impactAnalysis: vi.fn().mockResolvedValue({
        results: [
          { rel_path: "src/api/handler.ts", score: 0.9, repo: "moe" },
          { rel_path: "src/api/middleware.ts", score: 0.8, repo: "moe" },
          { rel_path: "src/api/auth.ts", score: 0.7, repo: "moe" },
        ],
      }),
    });

    const findings = await validatePlanAgainstGraph(
      PLAN_WITH_GAP,
      ctx,
      client,
    );

    const uncovered = findings.filter((f) => f.check === "uncovered");
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0]!.files).toContain("src/api/middleware.ts");
    expect(uncovered[0]!.files).toContain("src/api/auth.ts");
  });

  it("reports phantom files that don't exist on disk", async () => {
    const ctx = await makeCtx();
    const client = makeMockClient();

    const planWithPhantom = PLAN_WITH_GAP.replace(
      "src/api/handler.ts",
      "src/api/nonexistent.ts",
    );

    const findings = await validatePlanAgainstGraph(
      planWithPhantom,
      ctx,
      client,
      { checkPhantoms: true, cwd: "/fake/root" },
    );

    const phantoms = findings.filter((f) => f.check === "phantom");
    expect(phantoms).toHaveLength(1);
  });

  it("returns empty findings for a well-covered plan", async () => {
    const ctx = await makeCtx();
    const client = makeMockClient({
      impactAnalysis: vi.fn().mockResolvedValue({
        results: [
          { rel_path: "src/api/handler.ts", score: 0.9, repo: "moe" },
        ],
      }),
    });

    const findings = await validatePlanAgainstGraph(
      PLAN_WITH_GAP,
      ctx,
      client,
    );

    expect(findings).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bubstack/moe-jig-graph test -- validate`
Expected: FAIL — `validate.js` does not exist.

- [ ] **Step 4: Implement validate**

Create `packages/jig-graph/src/validate.ts`:

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { JigContext } from "@bubstack/moe-jig/extension";
import type { PlanTask } from "@bubstack/moe-jig/parser";
import type { MoedexClient } from "./moedex.js";
import type { Finding } from "./report.js";

export interface ValidateOpts {
  checkPhantoms?: boolean;
  cwd?: string;
}

export async function validatePlanAgainstGraph(
  planText: string,
  ctx: JigContext,
  client: MoedexClient,
  opts: ValidateOpts = {},
): Promise<Finding[]> {
  const { tasks } = ctx.parsePlan(planText);
  const findings: Finding[] = [];

  // All files claimed by all tasks.
  const allClaimedFiles = new Set<string>();
  for (const t of tasks) {
    for (const f of t.files) allClaimedFiles.add(f);
  }

  // --- Check 1: Uncovered files ---
  // Query the blast radius from the plan's goal, compare against claimed files.
  const goalMatch = /^\*\*Goal:\*\*\s*(.+)/m.exec(planText);
  if (goalMatch) {
    const impact = await client.impactAnalysis(goalMatch[1]!.trim());
    const blastFiles = impact.results
      .filter((r) => r.score >= 0.5)
      .map((r) => r.rel_path);

    const uncovered = blastFiles.filter((f) => !allClaimedFiles.has(f));
    if (uncovered.length > 0) {
      findings.push({
        check: "uncovered",
        severity: "warning",
        tasks: [],
        files: uncovered,
        message: `${uncovered.length} file(s) in the blast radius are not covered by any task`,
      });
    }
  }

  // --- Check 2: Missing edges ---
  // For each pair of tasks, check if their file sets are coupled in the
  // call graph but have no depends_on edge.
  const depSet = new Map<number, Set<number>>();
  for (const t of tasks) {
    depSet.set(t.num, new Set(t.dependsOn));
  }

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i]!;
      const b = tasks[j]!;

      const aDepB = depSet.get(a.num)?.has(b.num) ?? false;
      const bDepA = depSet.get(b.num)?.has(a.num) ?? false;
      if (aDepB || bDepA) continue;

      const consumers = await client.traceConsumers(a.files);
      const coupled = consumers.results.some(
        (r) => r.score >= 0.5 && b.files.includes(r.rel_path),
      );

      if (coupled) {
        findings.push({
          check: "missing-edge",
          severity: "warning",
          tasks: [a.num, b.num],
          files: [],
          message: `Tasks ${a.num} and ${b.num} are coupled in the call graph but have no depends_on edge`,
        });
      }
    }
  }

  // --- Check 3: Wave conflicts ---
  const schedulable = tasks.filter((t) => t.blockedBy === null);
  if (schedulable.length > 1) {
    const waves = ctx.computeWaves(schedulable);
    const taskByNum = new Map<number, PlanTask>();
    for (const t of schedulable) taskByNum.set(t.num, t);

    for (const wave of waves) {
      for (let i = 0; i < wave.length; i++) {
        for (let j = i + 1; j < wave.length; j++) {
          const a = taskByNum.get(wave[i]!)!;
          const b = taskByNum.get(wave[j]!)!;

          const consumers = await client.traceConsumers(a.files);
          const coupled = consumers.results.some(
            (r) => r.score >= 0.5 && b.files.includes(r.rel_path),
          );

          if (coupled) {
            findings.push({
              check: "wave-conflict",
              severity: "warning",
              tasks: [a.num, b.num],
              files: [],
              message: `Tasks ${a.num} and ${b.num} are in the same wave but coupled in the call graph`,
            });
          }
        }
      }
    }
  }

  // --- Check 4: Phantom files (no moedex needed) ---
  if (opts.checkPhantoms !== false) {
    const cwd = opts.cwd ?? process.cwd();
    for (const t of tasks) {
      for (const f of t.files) {
        // Only check Modify: files — Create: files don't exist yet
        const fullPath = resolve(cwd, f);
        if (!existsSync(fullPath)) {
          const lineMatch = planText.match(
            new RegExp(`-\\s+(?:Modify|Test):\\s*\`${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``)
          );
          if (lineMatch) {
            findings.push({
              check: "phantom",
              severity: "warning",
              tasks: [t.num],
              files: [f],
              message: `Task ${t.num} references "${f}" (Modify/Test) but the file does not exist`,
            });
          }
        }
      }
    }
  }

  return findings;
}
```

- [ ] **Step 5: Register the validate command in jig-extension.ts**

Update `packages/jig-graph/src/jig-extension.ts`:

```typescript
import { readFileSync } from "node:fs";
import type { JigExtensionCommand } from "@bubstack/moe-jig/extension";
import { MoedexClient } from "./moedex.js";
import { validatePlanAgainstGraph } from "./validate.js";
import { formatFindings } from "./report.js";

const validate: JigExtensionCommand = {
  namespace: "plan",
  name: "validate",
  description: "Validate a plan against the moedex code graph",
  options: [
    { flags: "--json", description: "Output findings as JSON" },
    {
      flags: "--manifest <path>",
      description: "Validate all plans listed in a MANIFEST.md",
    },
  ],
  async run(args, ctx) {
    const jsonFlag = args.includes("--json");
    const planArgs = args.filter(
      (a) => !a.startsWith("--") && a !== "validate",
    );
    const planPath = planArgs[0];

    if (!planPath) {
      console.error("Usage: moe jig plan validate <plan.md>");
      return 1;
    }

    const client = new MoedexClient();
    const available = await client.isAvailable();

    const planText = readFileSync(planPath, "utf8");

    if (!available) {
      // Phantom-files check only
      const findings = await validatePlanAgainstGraph(planText, ctx, client, {
        checkPhantoms: true,
      });
      const phantoms = findings.filter((f) => f.check === "phantom");
      if (phantoms.length > 0) {
        console.log(formatFindings(phantoms, jsonFlag));
      }
      console.error(
        "moedex unavailable — skipping graph validation (phantom-files only)",
      );
      return 0;
    }

    const findings = await validatePlanAgainstGraph(planText, ctx, client);
    console.log(formatFindings(findings, jsonFlag));

    await client.disconnect();
    return 0;
  },
};

export const commands: JigExtensionCommand[] = [validate];
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @bubstack/moe-jig-graph test`
Expected: PASS — validate tests green.

- [ ] **Step 7: Run full check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/jig-graph/src/validate.ts packages/jig-graph/src/report.ts \
  packages/jig-graph/test/validate.test.ts packages/jig-graph/src/jig-extension.ts
git commit -m "feat(jig-graph): implement plan validate command

Three graph checks (uncovered files, missing edges, wave conflicts)
plus a phantom-files check that runs even without moedex. Findings are
warnings, not failures — exit 0 always. Supports --json for CI."
```

### Task 5: Implement the Seed Command

**depends_on:** [1, 2, 3]

**Files:**
- Create: `packages/jig-graph/src/seed.ts`
- Create: `packages/jig-graph/test/seed.test.ts`
- Modify: `packages/jig-graph/src/jig-extension.ts`

**Interfaces:**
- Consumes: `JigExtensionCommand`, `JigContext` from Task 2; `MoedexClient`, `ImpactResult`, `CallResult` from Task 3
- Produces: `seedPlanSkeleton(topic: string, client: MoedexClient, opts: SeedOpts): Promise<string>` — returns a markdown plan fragment

- [ ] **Step 1: Write the seed test**

Create `packages/jig-graph/test/seed.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { seedPlanSkeleton } from "../src/seed.js";
import type { MoedexClient } from "../src/moedex.js";

function makeMockClient(
  overrides: Partial<MoedexClient> = {},
): MoedexClient {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    impactAnalysis: vi.fn().mockResolvedValue({
      results: [
        { rel_path: "src/api/handler.ts", score: 0.95, repo: "moe" },
        { rel_path: "src/api/middleware.ts", score: 0.82, repo: "moe" },
        { rel_path: "src/db/queries.ts", score: 0.60, repo: "moe" },
      ],
    }),
    traceCalls: vi.fn().mockResolvedValue({
      results: [
        { rel_path: "src/api/middleware.ts", score: 0.88, repo: "moe" },
      ],
    }),
    traceConsumers: vi.fn().mockResolvedValue({
      results: [
        { rel_path: "src/api/handler.ts", score: 0.90, repo: "moe" },
      ],
    }),
    searchContext: vi.fn().mockResolvedValue({
      results: [
        { rel_path: "src/api/handler.ts", score: 0.95, repo: "moe" },
      ],
    }),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MoedexClient;
}

describe("seedPlanSkeleton", () => {
  it("generates a markdown skeleton with tasks", async () => {
    const client = makeMockClient();
    const skeleton = await seedPlanSkeleton(
      "add rate limiting to API handler",
      client,
      { entry: "src/api/handler.ts" },
    );

    expect(skeleton).toContain("### Task");
    expect(skeleton).toContain("**depends_on:**");
    expect(skeleton).toContain("**Files:**");
    expect(skeleton).toContain("src/api/handler.ts");
  });

  it("clusters tightly coupled files into the same task", async () => {
    const client = makeMockClient({
      traceConsumers: vi.fn().mockResolvedValue({
        results: [
          { rel_path: "src/api/handler.ts", score: 0.95, repo: "moe" },
          { rel_path: "src/api/middleware.ts", score: 0.92, repo: "moe" },
        ],
      }),
    });

    const skeleton = await seedPlanSkeleton("refactor handler", client, {
      entry: "src/api/handler.ts",
    });

    // handler.ts and middleware.ts are tightly coupled — should appear
    // in the same task
    const taskBlocks = skeleton.split(/(?=^### Task)/m);
    const handlerTask = taskBlocks.find((b) =>
      b.includes("src/api/handler.ts"),
    );
    expect(handlerTask).toContain("src/api/middleware.ts");
  });

  it("adds depends_on between coupled task groups", async () => {
    const client = makeMockClient();
    const skeleton = await seedPlanSkeleton("add rate limiting", client, {
      entry: "src/api/handler.ts",
    });

    // db/queries.ts is loosely coupled (0.60) — separate task.
    // It should have depends_on to the API task.
    expect(skeleton).toMatch(/\*\*depends_on:\*\*\s*\[\d+\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bubstack/moe-jig-graph test -- seed`
Expected: FAIL — `seed.js` does not exist.

- [ ] **Step 3: Implement seed**

Create `packages/jig-graph/src/seed.ts`:

```typescript
import type { MoedexClient, GraphResult } from "./moedex.js";

export interface SeedOpts {
  entry?: string;
}

interface FileCluster {
  files: string[];
  score: number;
}

function clusterByCoupling(
  results: GraphResult[],
  consumers: Map<string, Set<string>>,
): FileCluster[] {
  const clusters: FileCluster[] = [];
  const assigned = new Set<string>();

  // Sort by score descending — process highest-impact files first.
  const sorted = [...results]
    .filter((r) => r.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  for (const r of sorted) {
    if (assigned.has(r.rel_path)) continue;

    const cluster: string[] = [r.rel_path];
    assigned.add(r.rel_path);

    // Pull in tightly coupled files (consumer score >= 0.7).
    const deps = consumers.get(r.rel_path) ?? new Set();
    for (const dep of deps) {
      if (!assigned.has(dep)) {
        cluster.push(dep);
        assigned.add(dep);
      }
    }

    clusters.push({ files: cluster, score: r.score });
  }

  return clusters;
}

export async function seedPlanSkeleton(
  topic: string,
  client: MoedexClient,
  opts: SeedOpts = {},
): Promise<string> {
  // Step 1: Find the blast radius.
  const impact = opts.entry
    ? await client.impactAnalysis(opts.entry)
    : await client.searchContext(topic);

  // Step 2: Map coupling between files.
  const consumers = new Map<string, Set<string>>();
  for (const r of impact.results) {
    if (r.score < 0.5) continue;
    const result = await client.traceConsumers([r.rel_path]);
    const coupled = new Set(
      result.results.filter((c) => c.score >= 0.7).map((c) => c.rel_path),
    );
    consumers.set(r.rel_path, coupled);
  }

  // Step 3: Cluster into task groups.
  const clusters = clusterByCoupling(impact.results, consumers);

  // Step 4: Build depends_on edges between clusters.
  // A cluster B depends on cluster A if any file in B consumes a file in A.
  const clusterDeps = new Map<number, number[]>();
  for (let i = 0; i < clusters.length; i++) {
    const deps: number[] = [];
    for (let j = 0; j < clusters.length; j++) {
      if (i === j) continue;
      const bFiles = new Set(clusters[i]!.files);
      const aFiles = new Set(clusters[j]!.files);
      const bConsumesA = clusters[i]!.files.some((f) => {
        const fConsumers = consumers.get(f) ?? new Set();
        return [...fConsumers].some((c) => aFiles.has(c));
      });
      if (bConsumesA) deps.push(j + 1);
    }
    clusterDeps.set(i + 1, deps);
  }

  // Step 5: Emit markdown.
  const lines: string[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    const taskNum = i + 1;
    const deps = clusterDeps.get(taskNum) ?? [];

    lines.push(`### Task ${taskNum}: [TODO: name]`);
    lines.push("");
    lines.push(`**depends_on:** [${deps.join(", ")}]`);
    lines.push("");
    lines.push("**Files:**");
    for (const f of cluster.files) {
      lines.push(`- Modify: \`${f}\``);
    }
    lines.push("");
    lines.push("**Interfaces:**");
    lines.push("- Consumes: [TODO]");
    lines.push("- Produces: [TODO]");
    lines.push("");
    lines.push("- [ ] **Step 1: [TODO]**");
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Register the seed command in jig-extension.ts**

Add seed to the `commands` array in `packages/jig-graph/src/jig-extension.ts`:

```typescript
import { seedPlanSkeleton } from "./seed.js";

const seed: JigExtensionCommand = {
  namespace: "plan",
  name: "seed",
  description: "Generate a plan skeleton from the moedex code graph",
  options: [
    { flags: "--entry <file>", description: "Entry-point file or symbol" },
  ],
  async run(args, _ctx) {
    const entryIdx = args.indexOf("--entry");
    const entry = entryIdx >= 0 ? args[entryIdx + 1] : undefined;
    const skipSet = new Set<string>();
    if (entryIdx >= 0) {
      skipSet.add("--entry");
      if (entry) skipSet.add(entry);
    }
    const topic = args.filter((a) => !skipSet.has(a)).join(" ");

    if (!topic) {
      console.error("Usage: moe jig plan seed <topic> [--entry <file>]");
      return 1;
    }

    const client = new MoedexClient();
    const available = await client.isAvailable();
    if (!available) {
      console.error(
        "moedex required for seed — cannot generate a graph-grounded skeleton without it.",
      );
      return 1;
    }

    const skeleton = await seedPlanSkeleton(topic, client, { entry });
    console.log(skeleton);

    await client.disconnect();
    return 0;
  },
};

export const commands: JigExtensionCommand[] = [validate, seed];
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @bubstack/moe-jig-graph test`
Expected: PASS — seed tests green.

- [ ] **Step 6: Run full check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/jig-graph/src/seed.ts packages/jig-graph/test/seed.test.ts \
  packages/jig-graph/src/jig-extension.ts
git commit -m "feat(jig-graph): implement plan seed command

Queries moedex for blast radius and call graph, clusters results into
task groups by coupling strength, and emits a plan skeleton with
pre-populated Files blocks and depends_on edges. Exits 1 when moedex
is unavailable — seed cannot produce useful output without the graph."
```

### Task 6: Update writing-plans Skill

**depends_on:** []

**Files:**
- Modify: `packages/core/skills/writing-plans/SKILL.md`

**Interfaces:**
- Consumes: `None`
- Produces: `None`

- [ ] **Step 1: Add moedex instruction to the skill**

In `packages/core/skills/writing-plans/SKILL.md`, find the "File Structure" section (the task-decomposition step). Add the following paragraph immediately before "This structure informs the task decomposition":

```markdown
**Graph-grounded decomposition:** If moedex is available (via the
`retrieving-context` skill or the `moe:search-moedex` agent), query
`impact_analysis` on the change target before decomposing tasks. Use the blast
radius to populate `Files:` blocks from the actual call graph rather than from
your reading alone. After writing the plan, run `moe jig plan validate` to
check for uncovered files, missing dependency edges, and wave conflicts. If
moedex is unavailable, proceed from your own analysis as before.
```

- [ ] **Step 2: Verify the edit reads correctly**

Read the modified section to confirm it flows naturally between the existing paragraphs.

- [ ] **Step 3: Commit**

```bash
git add packages/core/skills/writing-plans/SKILL.md
git commit -m "docs(writing-plans): instruct moedex queries during plan authoring

Adds a paragraph to the File Structure section directing the LLM to
query impact_analysis before decomposing tasks. This is the prose-level
enhancement (approach A) — validate catches drift."
```

### Task 7: Index Moe in Moedex

**depends_on:** []

**Files:**
- Modify: (external — moedex configuration, not in this repo)

**Interfaces:**
- Consumes: `None`
- Produces: `None`

- [ ] **Step 1: Add moe to moedex's corpus**

Run the moedex CLI to add this repo to its index:

```bash
moedex repo add --path /Users/zakkeown/Code/tools/moe --name moe
```

(Exact command depends on moedex's repo management CLI — consult `moedex --help`.)

- [ ] **Step 2: Trigger a reindex**

```bash
moedex index --repo moe
```

- [ ] **Step 3: Verify indexing**

```bash
moedex search "parsePlan" --repo moe
```

Expected: Results with scores > 0.5 pointing to `packages/jig/src/parser.ts` and/or `packages/core/hooks/task-set`.

- [ ] **Step 4: Smoke-test validate against a real plan**

```bash
moe jig plan validate docs/moe/plans/2026-09-03-jig-graph-validation.md
```

Expected: Findings printed (warnings about uncovered files, coupling, etc.) or "No findings" if the plan is well-grounded. The command should not error.
