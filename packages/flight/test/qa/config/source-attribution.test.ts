/**
 * Regression test for source-attribution invariants on AppConfig.sources.
 *
 * `mergeRunConfig` reads `sources.defaultChrome === "default"` to decide
 * whether to leave `chrome` undefined (so WebAdapter auto-launches) or
 * use the operator's default. `moe-flight qa config` also surfaces source
 * strings to the human. This test pins the load-bearing behavior so
 * the Phase 4 `resolveSetting` migration cannot quietly drop it.
 *
 * Stays green BEFORE any Phase 4 migration starts and through all the
 * block-by-block migrations. If it goes red, the migration mistakenly
 * changed an attribution.
 */
import { describe, it, expect } from "vitest";
import { loadConfig, mergeRunConfig } from "../../../src/qa/config.js";

describe("source attribution (load-bearing for mergeRunConfig)", () => {
  it("sources.defaultChrome === 'default' when env+args empty", () => {
    const config = loadConfig({}, {});
    expect(config.sources.defaultChrome).toBe("default");
  });

  it("mergeRunConfig leaves chrome undefined when source is default and body has no chrome", () => {
    const config = loadConfig({}, {});
    const merged = mergeRunConfig(config, { target: "http://example.com" });
    expect(merged.chrome).toBeUndefined();
  });

  it("mergeRunConfig honors env-sourced chrome", () => {
    const config = loadConfig({}, { MOE_FLIGHT_CHROME: "127.0.0.1:9333" });
    expect(config.sources.defaultChrome).toBe("env");
    const merged = mergeRunConfig(config, { target: "http://example.com" });
    expect(merged.chrome).toEqual({ host: "127.0.0.1", port: 9333 });
  });

  it("sources.defaultTarget === 'unset' when nothing sets it", () => {
    const config = loadConfig({}, {});
    expect(config.sources.defaultTarget).toBe("unset");
  });

  it("sources.defaultTarget === 'env' when env supplies it", () => {
    const config = loadConfig({}, { MOE_FLIGHT_TARGET: "http://x" });
    expect(config.sources.defaultTarget).toBe("env");
    expect(config.defaultTarget).toBe("http://x");
  });

  it("sources.defaultTarget === 'flag' when arg overrides env", () => {
    const config = loadConfig(
      { target: "http://flag" },
      { MOE_FLIGHT_TARGET: "http://env" },
    );
    expect(config.sources.defaultTarget).toBe("flag");
    expect(config.defaultTarget).toBe("http://flag");
  });

  it("sources.projectRoot/port/defaultBudgetMs/defaultReflectionInterval/defaultViewport/defaultSaveScreencast cascade default → env → flag", () => {
    const def = loadConfig({}, {});
    expect(def.sources.projectRoot).toBe("default");
    expect(def.sources.port).toBe("default");
    expect(def.sources.defaultBudgetMs).toBe("default");
    expect(def.sources.defaultReflectionInterval).toBe("default");
    expect(def.sources.defaultViewport).toBe("default");
    expect(def.sources.defaultSaveScreencast).toBe("default");

    const envOnly = loadConfig({}, {
      MOE_FLIGHT_PROJECT_ROOT: "/tmp/x",
      MOE_FLIGHT_PORT: "5500",
      MOE_FLIGHT_MAX_TIME: "60s",
      MOE_FLIGHT_REFLECTION_INTERVAL: "5",
      MOE_FLIGHT_VIEWPORT: "1024x768",
      MOE_FLIGHT_SAVE_SCREENCAST: "true",
    });
    expect(envOnly.sources.projectRoot).toBe("env");
    expect(envOnly.sources.port).toBe("env");
    expect(envOnly.sources.defaultBudgetMs).toBe("env");
    expect(envOnly.sources.defaultReflectionInterval).toBe("env");
    expect(envOnly.sources.defaultViewport).toBe("env");
    expect(envOnly.sources.defaultSaveScreencast).toBe("env");

    const withFlag = loadConfig({
      projectRoot: "/tmp/y",
      port: 6600,
      maxTime: "30s",
      reflectionInterval: 7,
      viewport: "800x600",
      saveScreencast: false,
    }, {
      MOE_FLIGHT_PROJECT_ROOT: "/tmp/x",
      MOE_FLIGHT_PORT: "5500",
      MOE_FLIGHT_MAX_TIME: "60s",
      MOE_FLIGHT_REFLECTION_INTERVAL: "5",
      MOE_FLIGHT_VIEWPORT: "1024x768",
      MOE_FLIGHT_SAVE_SCREENCAST: "true",
    });
    expect(withFlag.sources.projectRoot).toBe("flag");
    expect(withFlag.sources.port).toBe("flag");
    expect(withFlag.sources.defaultBudgetMs).toBe("flag");
    expect(withFlag.sources.defaultReflectionInterval).toBe("flag");
    expect(withFlag.sources.defaultViewport).toBe("flag");
    expect(withFlag.sources.defaultSaveScreencast).toBe("flag");
  });

  it("env-only knobs (shutdownGraceMs, maxRequestBodySize, ...) cascade default → env", () => {
    const def = loadConfig({}, {});
    expect(def.sources.shutdownGraceMs).toBe("default");
    expect(def.sources.maxRequestBodySize).toBe("default");
    expect(def.sources.maxConcurrentRuns).toBe("default");
    expect(def.sources.activeRunTargetMaxBytes).toBe("default");
    expect(def.sources.wsIdleTimeoutSec).toBe("default");
    expect(def.sources.wsOriginAllowlist).toBe("default");

    const envSet = loadConfig({}, {
      MOE_FLIGHT_SHUTDOWN_GRACE_MS: "5000",
      MOE_FLIGHT_MAX_REQUEST_BODY_SIZE: "2048",
      MOE_FLIGHT_MAX_CONCURRENT_RUNS: "8",
      MOE_FLIGHT_ACTIVE_RUN_TARGET_MAX_BYTES: "512",
      MOE_FLIGHT_WS_IDLE_TIMEOUT_SEC: "30",
      MOE_FLIGHT_WS_ORIGIN_ALLOWLIST: "http://a,http://b",
    });
    expect(envSet.sources.shutdownGraceMs).toBe("env");
    expect(envSet.sources.maxRequestBodySize).toBe("env");
    expect(envSet.sources.maxConcurrentRuns).toBe("env");
    expect(envSet.sources.activeRunTargetMaxBytes).toBe("env");
    expect(envSet.sources.wsIdleTimeoutSec).toBe("env");
    expect(envSet.sources.wsOriginAllowlist).toBe("env");
    expect(envSet.wsOriginAllowlist).toEqual(["http://a", "http://b"]);
  });

  it("models.agent and models.fanout source attribution", () => {
    const def = loadConfig({}, {});
    expect(def.sources["models.agent"]).toBe("default");
    expect(def.sources["models.fanout"]).toBe("unset");

    const envSet = loadConfig({}, {
      MOE_FLIGHT_AGENT_MODEL: "claude-opus-4-7",
      MOE_FLIGHT_FANOUT_MODEL: "claude-sonnet-4-6",
    });
    expect(envSet.sources["models.agent"]).toBe("env");
    expect(envSet.sources["models.fanout"]).toBe("env");

    const withFlag = loadConfig({
      models: { agent: "claude-opus-4-7", fanout: "claude-sonnet-4-6" },
    }, {});
    expect(withFlag.sources["models.agent"]).toBe("flag");
    expect(withFlag.sources["models.fanout"]).toBe("flag");
  });

  it("models.available cascade — env source is 'env', default is 'default'", () => {
    const def = loadConfig({}, {});
    expect(def.sources["models.available"]).toBe("default");
    expect(def.models.available).toEqual([]);

    const envSet = loadConfig({}, { MOE_FLIGHT_MODELS: "claude-opus-4-7,claude-sonnet-4-6" });
    expect(envSet.sources["models.available"]).toBe("env");
    expect(envSet.models.available).toEqual(["claude-opus-4-7", "claude-sonnet-4-6"]);
  });
});
