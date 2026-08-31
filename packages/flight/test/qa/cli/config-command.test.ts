import { describe, expect, test } from "vitest";
import type { ConfigArgs } from "../../../src/qa/cli/args.js";
import { runConfigCommand } from "../../../src/qa/cli/config-command.js";

const minimalArgs = (cli = {}): ConfigArgs => ({ command: "config", json: false, cli });

describe("runConfigCommand", () => {
  test("returns JSON when json flag true", () => {
    const result = runConfigCommand({ ...minimalArgs(), json: true }, {});
    const parsed = JSON.parse(result);
    expect(parsed.flight.projectRoot).toBe(".");
    expect(parsed.flight.port).toBe(4400);
    expect(parsed.sdkEnv.ANTHROPIC_API_KEY).toBe("unset");
  });

  test("returns text format when json flag false", () => {
    const result = runConfigCommand(minimalArgs(), {});
    expect(result).toContain("# Flight configuration");
    expect(result).toContain("projectRoot:");
    expect(result).toContain("anthropic:");
  });

  test("text output shows source attribution", () => {
    const result = runConfigCommand(minimalArgs({ projectRoot: "/flag" }), {
      MOE_FLIGHT_PORT: "5500",
    } as NodeJS.ProcessEnv);
    expect(result).toMatch(/projectRoot:\s+\/flag\s+\(flag\)/);
    expect(result).toMatch(/port:\s+5500\s+\(env\)/);
  });

  test("runConfigCommand propagates loadConfig errors (caller responsible for display)", () => {
    expect(() =>
      runConfigCommand(minimalArgs(), { MOE_FLIGHT_CHROME: "not-valid" } as NodeJS.ProcessEnv),
    ).toThrow(/MOE_FLIGHT_CHROME/);
  });

  test("sdkEnv section only shows presence for secrets", () => {
    const result = runConfigCommand({ ...minimalArgs(), json: true }, {
      ANTHROPIC_API_KEY: "sk-ant-secret",
      ANTHROPIC_BASE_URL: "https://custom",
    } as NodeJS.ProcessEnv);
    const parsed = JSON.parse(result);
    expect(parsed.sdkEnv.ANTHROPIC_API_KEY).toBe("set");
    expect(parsed.sdkEnv.ANTHROPIC_BASE_URL).toBe("https://custom");
  });
});
