import type { JigContext } from "@bubstack/moe-jig/extension";
import type { PlanTask } from "@bubstack/moe-jig/parser";
import { describe, expect, it, vi } from "vitest";
import type { MoedexClient } from "../src/moedex.js";
import { validatePlanAgainstGraph } from "../src/validate.js";

async function makeCtx(): Promise<JigContext> {
  const { parsePlan, validatePlan, computeWaves } = await import("@bubstack/moe-jig/parser");
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

    const findings = await validatePlanAgainstGraph(PLAN_WITH_GAP, ctx, client);

    const uncovered = findings.filter((f) => f.check === "uncovered");
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0]!.files).toContain("src/api/middleware.ts");
    expect(uncovered[0]!.files).toContain("src/api/auth.ts");
  });

  it("reports phantom files that don't exist on disk", async () => {
    const ctx = await makeCtx();
    const client = makeMockClient();

    const planWithPhantom = PLAN_WITH_GAP.replace("src/api/handler.ts", "src/api/nonexistent.ts");

    const findings = await validatePlanAgainstGraph(planWithPhantom, ctx, client, {
      checkPhantoms: true,
      cwd: "/fake/root",
    });

    const phantoms = findings.filter((f) => f.check === "phantom");
    expect(phantoms).toHaveLength(1);
  });

  it("returns empty findings for a well-covered plan", async () => {
    const ctx = await makeCtx();
    const client = makeMockClient({
      impactAnalysis: vi.fn().mockResolvedValue({
        results: [{ rel_path: "src/api/handler.ts", score: 0.9, repo: "moe" }],
      }),
    });

    const findings = await validatePlanAgainstGraph(PLAN_WITH_GAP, ctx, client);

    expect(findings).toHaveLength(0);
  });
});
