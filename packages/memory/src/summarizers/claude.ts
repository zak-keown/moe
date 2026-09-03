import fs from "node:fs";
import { SUMMARIZER_CONTEXT_MARKER } from "../constants.js";
import { SummarizerSdkError } from "../summarizer.js";
import type { ProcessAdapter, ProcessSpec } from "./process.js";

export const MIN_CLAUDE_VERSION = "2.1.141";

export interface ClaudeCommandOptions {
  prompt: string;
  sessionId?: string | undefined;
  cwd?: string | undefined;
  model: string;
  systemPrompt?: string | undefined;
}

export function buildClaudeSummarizerCommand(options: ClaudeCommandOptions): ProcessSpec {
  const claudeBin = process.env.MOE_MEMORY_CLAUDE_BIN || "claude";
  const args: string[] = [
    "-p",
    "--input-format",
    "text",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--model",
    options.model,
  ];

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  if (!options.sessionId && options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOE_MEMORY_SUMMARIZER_GUARD: "1",
    NODE_OPTIONS: undefined,
  };

  const baseUrl = process.env.MOE_MEMORY_API_BASE_URL;
  const token = process.env.MOE_MEMORY_API_TOKEN;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (token) env.ANTHROPIC_AUTH_TOKEN = token;

  return {
    command: claudeBin,
    args,
    cwd: options.cwd && fs.existsSync(options.cwd) ? options.cwd : undefined,
    env,
    stdin: options.prompt,
    timeoutMs: Number(process.env.MOE_MEMORY_API_TIMEOUT_MS) || 120_000,
    maxStderrBytes: 4096,
  };
}

export interface ClaudeJsonResult {
  result?: string;
  is_error?: boolean;
  subtype?: string;
  session_id?: string;
}

export async function runClaudeCommand(
  spec: ProcessSpec,
  adapter: ProcessAdapter,
): Promise<string> {
  const result = await adapter.run(spec);

  if (result.signal) {
    throw new Error(`Claude process killed by signal ${result.signal}`);
  }

  if (!result.stdout.trim()) {
    if (result.code !== 0) {
      const stderrMatch = result.stderr.match(/No conversation found with session ID: (.+)/);
      if (stderrMatch) {
        throw new SummarizerSdkError("error_during_execution", stderrMatch[1]?.trim());
      }
      throw new Error(`Claude exited with code ${result.code}: ${result.stderr.trim()}`);
    }
    return "";
  }

  let parsed: ClaudeJsonResult;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Claude returned malformed JSON: ${result.stdout.slice(0, 200)}`);
  }

  if (parsed.is_error) {
    throw new SummarizerSdkError(parsed.subtype || "unknown", parsed.session_id);
  }

  if (typeof parsed.result !== "string") {
    throw new Error(`Claude returned non-string result: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  return parsed.result;
}

export function buildSummarySystemPrompt(): string {
  return 'Write concise, factual summaries. Output ONLY the summary - no preamble, no "Here is", no "I will". Your output will be indexed directly.';
}

export function buildSummaryPrompt(conversationText: string, sessionId?: string): string {
  const preamble = `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise, factual summary of this conversation. Output ONLY the summary - no preamble. Claude will see this summary when searching previous conversations for useful memories and information.

Summarize what happened in 2-4 sentences. Be factual and specific. Output in <summary></summary> tags.

Include:
- What was built/changed/discussed (be specific)
- Key technical decisions or approaches
- Problems solved or current state

Exclude:
- Apologies, meta-commentary, or your questions
- Raw logs or debug output
- Generic descriptions - focus on what makes THIS conversation unique

Good:
<summary>Built JWT authentication for React app with refresh tokens and protected routes. Fixed token expiration bug by implementing refresh-during-request logic.</summary>

Bad:
<summary>I apologize. The conversation discussed authentication and various approaches were considered...</summary>`;

  if (sessionId) {
    return preamble;
  }
  return `${preamble}\n\n${conversationText}`;
}

export function buildChunkPrompt(conversationText: string): string {
  return `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise summary of this part of a conversation in 2-3 sentences. What happened, what was built/discussed. Use <summary></summary> tags.

${conversationText}

Example: <summary>Implemented HID keyboard functionality for ESP32. Hit Bluetooth controller initialization error, fixed by adjusting memory allocation.</summary>`;
}

export function buildSynthesisPrompt(chunkSummaries: string[]): string {
  return `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise, factual summary that synthesizes these part-summaries into one cohesive paragraph. Focus on what was accomplished and any notable technical decisions or challenges. Output in <summary></summary> tags. Claude will see this summary when searching previous conversations for useful memories and information.

Part summaries:
${chunkSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Good:
<summary>Built conversation search system with JavaScript, sqlite-vec, and local embeddings. Implemented hierarchical summarization for long conversations. System archives conversations permanently and provides semantic search via CLI.</summary>

Bad:
<summary>This conversation synthesizes several topics discussed across multiple parts...</summary>

Your summary (max 200 words):`;
}
