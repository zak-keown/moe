import { type AppConfig, loadConfig } from "../config.js";
import type { ConfigArgs } from "./args.js";

interface ConfigOutput {
  flight: {
    projectRoot: string;
    stateDirName: string;
    port: number;
    defaultChrome: { host: string; port: number };
    defaultTarget: string | null;
    defaultBudgetMs: number;
    defaultReflectionInterval: number;
    defaultViewport: { width: number; height: number };
    defaultSaveScreencast: boolean;
    shutdownGraceMs: number;
    maxRequestBodySize: number;
    maxConcurrentRuns: number;
    activeRunTargetMaxBytes: number;
    wsIdleTimeoutSec: number;
    wsOriginAllowlist: string[];
    models: {
      agent: string;
      fanout: string | null;
      available: string[];
    };
    apiKeys: { anthropic: "set" | "unset"; openai: "set" | "unset" };
    sources: Record<string, string>;
  };
  sdkEnv: {
    ANTHROPIC_API_KEY: "set" | "unset";
    ANTHROPIC_BASE_URL: string | null;
    ANTHROPIC_LOG: string | null;
    OPENAI_API_KEY: "set" | "unset";
    OPENAI_BASE_URL: string | null;
    OPENAI_ORG_ID: string | null;
    OPENAI_PROJECT: string | null;
    HTTPS_PROXY: string | null;
    HTTP_PROXY: string | null;
    NO_PROXY: string | null;
  };
}

export function buildConfigOutput(config: AppConfig, env: NodeJS.ProcessEnv): ConfigOutput {
  return {
    flight: {
      projectRoot: config.projectRoot,
      stateDirName: config.stateDirName,
      port: config.port,
      defaultChrome: config.defaultChrome,
      defaultTarget: config.defaultTarget ?? null,
      defaultBudgetMs: config.defaultBudgetMs,
      defaultReflectionInterval: config.defaultReflectionInterval,
      defaultViewport: config.defaultViewport,
      defaultSaveScreencast: config.defaultSaveScreencast,
      shutdownGraceMs: config.shutdownGraceMs,
      maxRequestBodySize: config.maxRequestBodySize,
      maxConcurrentRuns: config.maxConcurrentRuns,
      activeRunTargetMaxBytes: config.activeRunTargetMaxBytes,
      wsIdleTimeoutSec: config.wsIdleTimeoutSec,
      wsOriginAllowlist: config.wsOriginAllowlist,
      models: {
        agent: config.models.agent,
        fanout: config.models.fanout ?? null,
        available: config.models.available,
      },
      apiKeys: {
        anthropic: config.apiKeys.anthropic ? "set" : "unset",
        openai: config.apiKeys.openai ? "set" : "unset",
      },
      sources: config.sources,
    },
    sdkEnv: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ? "set" : "unset",
      ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL ?? null,
      ANTHROPIC_LOG: env.ANTHROPIC_LOG ?? null,
      OPENAI_API_KEY: env.OPENAI_API_KEY ? "set" : "unset",
      OPENAI_BASE_URL: env.OPENAI_BASE_URL ?? null,
      OPENAI_ORG_ID: env.OPENAI_ORG_ID ?? null,
      OPENAI_PROJECT: env.OPENAI_PROJECT ?? null,
      HTTPS_PROXY: env.HTTPS_PROXY ?? null,
      HTTP_PROXY: env.HTTP_PROXY ?? null,
      NO_PROXY: env.NO_PROXY ?? null,
    },
  };
}

export function formatConfigText(output: ConfigOutput): string {
  const lines: string[] = [];
  lines.push("# Flight configuration");
  lines.push("");
  lines.push(
    `  projectRoot:    ${output.flight.projectRoot}  (${output.flight.sources.projectRoot})`,
  );
  lines.push(
    `  stateDirName:   ${output.flight.stateDirName}  (${output.flight.sources.stateDirName})`,
  );
  lines.push(`  port:           ${output.flight.port}  (${output.flight.sources.port})`);
  lines.push(
    `  defaultChrome:  ${output.flight.defaultChrome.host}:${output.flight.defaultChrome.port}  (${output.flight.sources.defaultChrome})`,
  );
  lines.push(
    `  defaultTarget:  ${output.flight.defaultTarget ?? "(unset)"}  (${output.flight.sources.defaultTarget})`,
  );
  lines.push(
    `  defaultBudgetMs: ${output.flight.defaultBudgetMs}  (${output.flight.sources.defaultBudgetMs})`,
  );
  lines.push(
    `  defaultReflectionInterval: ${output.flight.defaultReflectionInterval}  (${output.flight.sources.defaultReflectionInterval})`,
  );
  lines.push(
    `  defaultViewport: ${output.flight.defaultViewport.width}x${output.flight.defaultViewport.height}  (${output.flight.sources.defaultViewport})`,
  );
  lines.push(
    `  defaultSaveScreencast: ${output.flight.defaultSaveScreencast}  (${output.flight.sources.defaultSaveScreencast})`,
  );
  lines.push(
    `  shutdownGraceMs: ${output.flight.shutdownGraceMs}  (${output.flight.sources.shutdownGraceMs})`,
  );
  lines.push(
    `  maxRequestBodySize: ${output.flight.maxRequestBodySize}  (${output.flight.sources.maxRequestBodySize})`,
  );
  lines.push(
    `  maxConcurrentRuns: ${output.flight.maxConcurrentRuns}  (${output.flight.sources.maxConcurrentRuns})`,
  );
  lines.push(
    `  activeRunTargetMaxBytes: ${output.flight.activeRunTargetMaxBytes}  (${output.flight.sources.activeRunTargetMaxBytes})`,
  );
  lines.push(
    `  wsIdleTimeoutSec: ${output.flight.wsIdleTimeoutSec}  (${output.flight.sources.wsIdleTimeoutSec})`,
  );
  lines.push(
    `  wsOriginAllowlist: [${output.flight.wsOriginAllowlist.join(", ")}]  (${output.flight.sources.wsOriginAllowlist})`,
  );
  lines.push(
    `  models.agent:   ${output.flight.models.agent}  (${output.flight.sources["models.agent"]})`,
  );
  lines.push(
    `  models.fanout:  ${output.flight.models.fanout ?? "(unset)"}  (${output.flight.sources["models.fanout"]})`,
  );
  lines.push(
    `  models.available: [${output.flight.models.available.join(", ")}]  (${output.flight.sources["models.available"]})`,
  );
  lines.push("");
  lines.push("# API keys");
  lines.push(`  anthropic:      ${output.flight.apiKeys.anthropic}`);
  lines.push(`  openai:         ${output.flight.apiKeys.openai}`);
  lines.push("");
  lines.push("# SDK-visible environment variables (pass through to SDKs, not read by Flight)");
  for (const [k, v] of Object.entries(output.sdkEnv)) {
    lines.push(`  ${k.padEnd(22)}${v === null ? "(unset)" : v}`);
  }
  return lines.join("\n");
}

export function runConfigCommand(args: ConfigArgs, env: NodeJS.ProcessEnv): string {
  const config = loadConfig(args.cli, env);
  const output = buildConfigOutput(config, env);
  return args.json ? JSON.stringify(output, null, 2) : formatConfigText(output);
}
