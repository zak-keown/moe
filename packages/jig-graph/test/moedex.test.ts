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
                score: 0.9,
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
