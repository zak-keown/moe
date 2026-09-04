import { describe, expect, it, vi } from "vitest";
import type { MoedexClient } from "../src/moedex.js";
import { seedPlanSkeleton } from "../src/seed.js";

function makeMockClient(overrides: Partial<MoedexClient> = {}): MoedexClient {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    impactAnalysis: vi.fn().mockResolvedValue({
      results: [
        { rel_path: "src/api/handler.ts", score: 0.95, repo: "moe" },
        { rel_path: "src/api/middleware.ts", score: 0.82, repo: "moe" },
        { rel_path: "src/db/queries.ts", score: 0.6, repo: "moe" },
      ],
    }),
    traceConsumers: vi.fn().mockResolvedValue({
      results: [{ rel_path: "src/api/handler.ts", score: 0.9, repo: "moe" }],
    }),
    searchContext: vi.fn().mockResolvedValue({
      results: [{ rel_path: "src/api/handler.ts", score: 0.95, repo: "moe" }],
    }),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MoedexClient;
}

describe("seedPlanSkeleton", () => {
  it("generates a markdown skeleton with tasks", async () => {
    const client = makeMockClient();
    const skeleton = await seedPlanSkeleton("add rate limiting to API handler", client, {
      entry: "src/api/handler.ts",
    });

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
    const handlerTask = taskBlocks.find((b) => b.includes("src/api/handler.ts"));
    expect(handlerTask).toContain("src/api/middleware.ts");
  });

  it("adds depends_on between coupled task groups", async () => {
    const client = makeMockClient();
    const skeleton = await seedPlanSkeleton("add rate limiting", client, {
      entry: "src/api/handler.ts",
    });

    // db/queries.ts is loosely coupled (0.60) — separate task. The API
    // (handler.ts) task consumes it, so the API task should carry a
    // non-empty depends_on (CR-018: direction runs from the consuming
    // task to the consumed task, not the reverse).
    expect(skeleton).toMatch(/\*\*depends_on:\*\*\s*\[\d+(?:, \d+)*\]/);
  });

  it("points depends_on from the consuming task to the consumed task, not backwards", async () => {
    // The default mock's traceConsumers always resolves to handler.ts
    // regardless of the queried file, i.e. handler.ts is the sole consumer
    // of (depends on) every other file. That makes three separate task
    // clusters (handler.ts, middleware.ts, queries.ts — nothing else meets
    // the 0.7 clustering threshold since each file's only "coupled"
    // consumer, handler.ts, is already assigned to its own cluster first).
    const client = makeMockClient();
    const skeleton = await seedPlanSkeleton("add rate limiting", client, {
      entry: "src/api/handler.ts",
    });

    const taskBlocks = skeleton.split(/(?=^### Task)/m).filter((b) => b.trim().length > 0);
    expect(taskBlocks).toHaveLength(3);

    const handlerTask = taskBlocks[0]!;
    const middlewareTask = taskBlocks[1]!;
    const queriesTask = taskBlocks[2]!;

    expect(handlerTask).toContain("src/api/handler.ts");
    expect(middlewareTask).toContain("src/api/middleware.ts");
    expect(queriesTask).toContain("src/db/queries.ts");

    // handler.ts consumes (depends on) middleware.ts and queries.ts, so
    // handler.ts's task must declare depends_on those tasks — not the
    // reverse, and the leaf tasks must declare no dependencies of their own.
    expect(handlerTask).toMatch(/\*\*depends_on:\*\*\s*\[2, 3\]/);
    expect(middlewareTask).toMatch(/\*\*depends_on:\*\*\s*\[\]/);
    expect(queriesTask).toMatch(/\*\*depends_on:\*\*\s*\[\]/);
  });
});
