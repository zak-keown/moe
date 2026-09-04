import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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

type ToolCaller = (req: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<{ content: { type: string; text: string }[] }>;

const DEFAULT_ADDR = process.env["MOEDEX_MCP_HTTP_ADDR"] ?? "http://127.0.0.1:8081";

/**
 * Client for moedex's warm HTTP MCP daemon. Connects lazily and degrades
 * gracefully — `isAvailable()` returns false rather than throwing when the
 * daemon is unreachable, so callers can skip graph-grounded validation
 * instead of failing outright.
 */
export class MoedexClient {
  private readonly addr: string;
  private callTool: ToolCaller | null = null;
  private client: Client | null = null;

  constructor(addr: string = DEFAULT_ADDR) {
    this.addr = addr;
  }

  /** Test-only hook: inject a mock tool caller instead of a real transport. */
  _setTransport(caller: ToolCaller): void {
    this.callTool = caller;
  }

  async connect(): Promise<boolean> {
    if (this.callTool) return true;
    try {
      const url = new URL("/mcp", this.addr);
      const transport = new StreamableHTTPClientTransport(url);
      const client = new Client({ name: "moe-jig-graph", version: "0.1.0" });
      // The SDK's StreamableHTTPClientTransport exposes `sessionId` as
      // `string | undefined` while Transport declares it `sessionId?: string`;
      // under exactOptionalPropertyTypes those are not structurally
      // assignable even though the runtime shape matches exactly.
      await client.connect(transport as unknown as Transport);
      this.client = client;
      this.callTool = (req) =>
        client.callTool(req) as Promise<{
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

  private async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.callTool) {
      const ok = await this.connect();
      if (!ok) throw new Error("moedex unavailable");
    }
    const result = await this.callTool!({ name: tool, arguments: args });
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
