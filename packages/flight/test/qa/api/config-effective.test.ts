import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { configEffectiveRoutes } from "../../../src/qa/api/routes/config-effective.js";
import { createApp } from "../../../src/qa/api/server.js";
import { loadConfig } from "../../../src/qa/config.js";

describe("GET /api/config/effective", () => {
  test("returns moe-flight + sdkEnv payload", async () => {
    const config = loadConfig({}, {
      MOE_FLIGHT_AGENT_MODEL: "claude-sonnet-4-6",
    } as NodeJS.ProcessEnv);
    const app = new Hono();
    app.route("/api/config/effective", configEffectiveRoutes(config));
    const res = await app.request("/api/config/effective");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flight).toBeDefined();
    expect(body.sdkEnv).toBeDefined();
    expect(body.flight.models.agent).toBe("claude-sonnet-4-6");
  });

  test("API keys reflect env at request time", async () => {
    const config = loadConfig({}, {} as NodeJS.ProcessEnv);
    const app = new Hono();
    app.route("/api/config/effective", configEffectiveRoutes(config));
    const saved = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      let body = await (await app.request("/api/config/effective")).json();
      expect(body.sdkEnv.ANTHROPIC_API_KEY).toBe("unset");

      process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
      body = await (await app.request("/api/config/effective")).json();
      expect(body.sdkEnv.ANTHROPIC_API_KEY).toBe("set");
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });

  test("createApp mounts /api/config/effective alongside /api/config", async () => {
    const config = loadConfig({ projectRoot: "." }, {
      MOE_FLIGHT_AGENT_MODEL: "claude-sonnet-4-6",
    } as NodeJS.ProcessEnv);
    const app = createApp(config);

    const eff = await app.request("/api/config/effective");
    expect(eff.status).toBe(200);
    const effBody = await eff.json();
    expect(effBody.flight).toBeDefined();

    const cfg = await app.request("/api/config");
    expect(cfg.status).toBe(200);
    const cfgBody = await cfg.json();
    expect(cfgBody.models).toBeDefined();
  });
});
