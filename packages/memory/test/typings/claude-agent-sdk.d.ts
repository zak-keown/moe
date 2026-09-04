declare module "@anthropic-ai/claude-agent-sdk" {
  export function query(opts: {
    model: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    thinking?: { type: string; budget_tokens: number };
  }): AsyncIterable<unknown>;
}
