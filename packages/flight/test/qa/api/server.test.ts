import { describe, expect, test } from "vitest";
import { createApp } from "../../../src/qa/api/server.js";
import { loadConfig } from "../../../src/qa/config.js";

describe("API server error handler", () => {
  test("returns JSON 500 for unhandled route exceptions", async () => {
    const config = loadConfig({ projectRoot: "." }, {
      MOE_FLIGHT_AGENT_MODEL: "claude-sonnet-4-6",
    } as NodeJS.ProcessEnv);
    const app = createApp(config);
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBe("internal");
    expect(body.message).toBe("boom");
  });
});
