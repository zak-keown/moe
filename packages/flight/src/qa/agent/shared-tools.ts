import type { CredentialResolverConfig } from "../config.js";
import { buildFetchCredentialTool, type FetchCredentialTool } from "../context/credential-tool.js";
import { buildReadTool, type ReadTool } from "../context/read-tool.js";
import type { EvidenceLogger } from "../evidence/logger.js";
import type { ToolDefinition, ToolResult } from "../models/provider.js";
import { type BashTool, buildBashTool } from "./bash-tool.js";
import { buildWakeOnIdleLogTool, type WakeOnIdleLogTool } from "./wake-on-idle-log-tool.js";
import { buildWatchLogsTool, type WatchLogsTool } from "./watch-logs-tool.js";
import { WatchManager } from "./watch-manager.js";

export interface SharedToolsOptions {
  contextRoot?: string | undefined;
  credentialResolver?: CredentialResolverConfig | undefined;
  /**
   * Working directory for the bash tool. Optional: if omitted, the bash
   * tool's `execute()` errors. Adapters constructed only to enumerate
   * tool definitions (registry introspection) should omit this; real
   * runs always supply a `<runDir>/scratch` path.
   */
  cwd?: string | undefined;
}

export interface SharedTools {
  definitions(): ToolDefinition[];
  canExecute(name: string): boolean;
  execute(
    name: string,
    args: Record<string, unknown>,
    logger: EvidenceLogger,
  ): Promise<ToolResult> | ToolResult;
}

export function buildSharedTools(opts: SharedToolsOptions): SharedTools {
  const readTool: ReadTool | null = opts.contextRoot ? buildReadTool(opts.contextRoot) : null;
  const credentialTool: FetchCredentialTool | null = buildFetchCredentialTool(
    opts.contextRoot ?? "",
    opts.credentialResolver,
  );
  const bashTool: BashTool = buildBashTool({ cwd: opts.cwd });
  const watchManager = new WatchManager();
  const watchLogsTool: WatchLogsTool = buildWatchLogsTool({ manager: watchManager });
  const wakeTool: WakeOnIdleLogTool = buildWakeOnIdleLogTool({ manager: watchManager });

  const definitions = (): ToolDefinition[] => {
    const defs: ToolDefinition[] = [];
    if (readTool) defs.push(readTool.definition);
    if (credentialTool) defs.push(credentialTool.definition);
    defs.push(bashTool.definition);
    defs.push(watchLogsTool.definition);
    defs.push(wakeTool.definition);
    return defs;
  };

  const canExecute = (name: string): boolean => {
    if (name === "read") return readTool !== null;
    if (name === "fetch_credential") return credentialTool !== null;
    if (name === "bash") return true;
    if (name === "watch_logs") return true;
    if (name === "wake_on_idle_log") return true;
    return false;
  };

  const execute = (
    name: string,
    args: Record<string, unknown>,
    logger: EvidenceLogger,
  ): Promise<ToolResult> | ToolResult => {
    if (name === "read" && readTool) return readTool.execute(args);
    if (name === "fetch_credential" && credentialTool) {
      return credentialTool.execute(args, logger);
    }
    if (name === "bash") return bashTool.execute(args, logger);
    if (name === "watch_logs") return watchLogsTool.execute(args, logger);
    if (name === "wake_on_idle_log") return wakeTool.execute(args, logger);
    throw new Error(`SharedTools: unknown or unmounted tool: ${name}`);
  };

  return { definitions, canExecute, execute };
}
