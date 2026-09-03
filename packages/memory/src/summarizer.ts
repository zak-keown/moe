import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  codexVersionRequirementMessage,
  parseCodexCliVersion,
  versionMeetsMinimum,
} from "./codex-support.js";
import { SUMMARIZER_CONTEXT_MARKER } from "./constants.js";
import type { ConversationExchange } from "./types.js";
import { VERSION } from "./version.js";
import { createChildProcessAdapter } from "./summarizers/process.js";
import {
  buildClaudeSummarizerCommand,
  buildSummarySystemPrompt,
  buildSummaryPrompt,
  buildChunkPrompt,
  buildSynthesisPrompt,
  runClaudeCommand,
} from "./summarizers/claude.js";

export class SummarizerSdkError extends Error {
  constructor(
    public readonly subtype: string,
    public readonly sessionId?: string,
  ) {
    super(`Summarizer SDK error: ${subtype}${sessionId ? ` (session ${sessionId})` : ""}`);
    this.name = "SummarizerSdkError";
  }
}

export function isResumeFailure(error: unknown): boolean {
  return error instanceof SummarizerSdkError && error.subtype === "error_during_execution";
}

export interface CodexSummarizerCommand {
  command: string;
  args: string[];
  prompt: string;
  sessionId: string;
  model?: string | undefined;
  versionArgs?: string[] | undefined;
  skipVersionCheck?: boolean | undefined;
}

export function getApiEnv(): Record<string, string | undefined> | undefined {
  const baseUrl = process.env.MOE_MEMORY_API_BASE_URL;
  const token = process.env.MOE_MEMORY_API_TOKEN;
  const timeoutMs = process.env.MOE_MEMORY_API_TIMEOUT_MS;

  return {
    ...process.env,
    MOE_MEMORY_SUMMARIZER_GUARD: "1",
    ...(baseUrl && { ANTHROPIC_BASE_URL: baseUrl }),
    ...(token && { ANTHROPIC_AUTH_TOKEN: token }),
    ...(timeoutMs && { API_TIMEOUT_MS: timeoutMs }),
  };
}

export function shouldSkipReentrantSync(): boolean {
  return process.env.MOE_MEMORY_SUMMARIZER_GUARD === "1";
}

export function formatConversationText(exchanges: ConversationExchange[]): string {
  return exchanges
    .map((ex) => {
      return `User: ${ex.userMessage}\n\nAgent: ${ex.assistantMessage}`;
    })
    .join("\n\n---\n\n");
}

function extractSummary(text: string): string {
  const match = text.match(/<summary>(.*?)<\/summary>/s);
  const captured = match?.[1];
  if (captured !== undefined) {
    return captured.trim();
  }
  return text.trim();
}

export function buildSummarizerQueryOptions(args: {
  model: string;
  sessionId?: string | undefined;
}): Record<string, unknown> {
  const { model, sessionId } = args;
  return {
    model,
    max_tokens: 4096,
    env: getApiEnv(),
    resume: sessionId,
    persistSession: false,
    ...(sessionId
      ? {}
      : { systemPrompt: buildSummarySystemPrompt() }),
  };
}

export function buildCodexSummaryPrompt(): string {
  return `${SUMMARIZER_CONTEXT_MARKER}.

You are running in an ephemeral Codex fork of an existing session. Use the forked session context, including available reasoning summaries and thinking context, to write a concise, factual summary of the conversation.

Do not inspect files, run commands, search the web, or modify state. Use only the conversation context already available in this forked session.

Output ONLY a <summary></summary> block. Summarize what happened in 2-4 sentences.

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
}

export function buildCodexSummarizerCommand(args: {
  sessionId: string;
  prompt: string;
  model?: string | undefined;
  codexBin?: string | undefined;
}): CodexSummarizerCommand {
  const command = args.codexBin || process.env.MOE_MEMORY_CODEX_BIN || "codex";

  return {
    command,
    args: ["app-server"],
    prompt: args.prompt,
    sessionId: args.sessionId,
    model: args.model,
  };
}

async function callClaude(
  prompt: string,
  sessionId?: string,
  useFallback = false,
  cwd?: string,
): Promise<string> {
  const primaryModel = process.env.MOE_MEMORY_API_MODEL || "haiku";
  const fallbackModel = process.env.MOE_MEMORY_API_MODEL_FALLBACK || "sonnet";
  const model = useFallback ? fallbackModel : primaryModel;

  const spec = buildClaudeSummarizerCommand({
    prompt,
    model,
    sessionId,
    cwd,
    systemPrompt: sessionId ? undefined : buildSummarySystemPrompt(),
  });

  const adapter = createChildProcessAdapter();
  try {
    return await runClaudeCommand(spec, adapter);
  } catch (error) {
    if (
      !useFallback &&
      error instanceof Error &&
      error.message.includes("thinking.budget_tokens")
    ) {
      console.log(
        `    ${primaryModel} hit thinking budget error, retrying with ${fallbackModel}`,
      );
      return await callClaude(prompt, sessionId, true, cwd);
    }
    throw error;
  }
}

interface PendingAppServerRequest {
  method: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

function appServerTimeoutMs(): number {
  const configured = Number(process.env.MOE_MEMORY_CODEX_SUMMARY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

function readCommandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: getApiEnv() as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${output.trim()}`),
        );
      }
    });
  });
}

async function assertSupportedCodexVersion(command: CodexSummarizerCommand): Promise<void> {
  if (command.skipVersionCheck) {
    return;
  }

  const output = await readCommandOutput(command.command, command.versionArgs || ["--version"]);
  const version = parseCodexCliVersion(output);
  if (!version || !versionMeetsMinimum(version)) {
    throw new Error(codexVersionRequirementMessage(output));
  }
}

function requireThreadId(result: any, method: string): string {
  const threadId = result?.thread?.id;
  if (typeof threadId !== "string" || !threadId) {
    throw new Error(`${method} returned unexpected response: ${JSON.stringify(result)}`);
  }
  return threadId;
}

function requireTurnId(result: any, method: string): string {
  const turnId = result?.turn?.id;
  if (typeof turnId !== "string" || !turnId) {
    throw new Error(`${method} returned unexpected response: ${JSON.stringify(result)}`);
  }
  return turnId;
}

export async function runCodexCommand(command: CodexSummarizerCommand): Promise<string> {
  await assertSupportedCodexVersion(command);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: getApiEnv() as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let answer = "";
    let nextRequestId = 1;
    let targetTurnId: string | undefined;
    let finished = false;
    let timeout: NodeJS.Timeout | undefined;
    const pending = new Map<number, PendingAppServerRequest>();
    const lines = createInterface({ input: child.stdout });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      lines.close();
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    const finish = (error: Error | undefined, result = "") => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    timeout = setTimeout(() => {
      finish(
        new Error(`Codex summarizer timed out after ${appServerTimeoutMs()}ms: ${stderr.trim()}`),
      );
    }, appServerTimeoutMs());

    const send = (method: string, params?: Record<string, unknown>): Promise<any> => {
      const id = nextRequestId++;
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { method, resolve: resolveRequest, reject: rejectRequest });
      });
    };

    const notify = (method: string, params?: Record<string, unknown>) => {
      const message = params === undefined ? { method } : { method, params };
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    lines.on("line", (line) => {
      if (!line.trim()) return;

      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        finish(new Error(`Codex app-server emitted invalid JSON: ${line}`));
        return;
      }

      if (typeof message.id === "number" && pending.has(message.id)) {
        const request = pending.get(message.id)!;
        pending.delete(message.id);
        if (message.error) {
          request.reject(new Error(`${request.method} failed: ${JSON.stringify(message.error)}`));
        } else {
          request.resolve(message.result);
        }
        return;
      }

      if (message.method === "item/agentMessage/delta") {
        answer += message.params?.delta ?? "";
        return;
      }

      if (message.method === "item/completed" && message.params?.item?.type === "agentMessage") {
        answer = message.params.item.text ?? answer;
        return;
      }

      if (
        message.method === "turn/completed" &&
        (!targetTurnId || message.params?.turn?.id === targetTurnId)
      ) {
        if (message.params.turn.status === "completed") {
          finish(undefined, answer);
        } else {
          const detail = message.params.turn.error?.message || message.params.turn.status;
          finish(new Error(`Codex summarizer turn did not complete: ${detail}`));
        }
      }
    });

    child.on("error", (error) => {
      finish(error);
    });

    child.on("exit", (code) => {
      if (!finished) {
        const detail =
          code === 0
            ? "Codex app-server exited before the summary turn completed"
            : `Codex summarizer failed with exit code ${code}: ${stderr.trim()}`;
        finish(new Error(detail));
      }
    });

    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "moe-memory",
            title: "Moe Memory",
            version: VERSION,
          },
          capabilities: {
            experimentalApi: true,
          },
        });
        notify("initialized");

        const fork = await send("thread/fork", {
          threadId: command.sessionId,
          ephemeral: true,
          sandbox: "read-only",
          approvalPolicy: "never",
          ...(command.model ? { model: command.model } : {}),
        });
        const forkThreadId = requireThreadId(fork, "thread/fork");

        const turn = await send("turn/start", {
          threadId: forkThreadId,
          input: [
            {
              type: "text",
              text: command.prompt,
              textElements: [],
            },
          ],
        });
        targetTurnId = requireTurnId(turn, "turn/start");
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

async function callCodex(prompt: string, sessionId: string, model?: string): Promise<string> {
  const command = buildCodexSummarizerCommand({ sessionId, prompt, model });
  return runCodexCommand(command);
}

function chunkExchanges(
  exchanges: ConversationExchange[],
  chunkSize: number,
): ConversationExchange[][] {
  const chunks: ConversationExchange[][] = [];
  for (let i = 0; i < exchanges.length; i += chunkSize) {
    chunks.push(exchanges.slice(i, i + chunkSize));
  }
  return chunks;
}

function getCodexSessionId(
  exchanges: ConversationExchange[],
  sessionId?: string,
): string | undefined {
  if (!exchanges.some((exchange) => exchange.harness === "codex")) {
    return undefined;
  }
  return sessionId || exchanges.find((exchange) => exchange.sessionId)?.sessionId;
}

export function getCodexModel(_exchanges: ConversationExchange[]): string | undefined {
  return process.env.MOE_MEMORY_CODEX_MODEL || undefined;
}

export async function summarizeConversation(
  exchanges: ConversationExchange[],
  sessionId?: string,
): Promise<string> {
  if (exchanges.length === 0) {
    return "Trivial conversation with no substantive content.";
  }

  if (exchanges.length === 1) {
    const text = formatConversationText(exchanges);
    if (text.length < 100 || exchanges[0]?.userMessage.trim() === "/exit") {
      return "Trivial conversation with no substantive content.";
    }
  }

  const codexSessionId = getCodexSessionId(exchanges, sessionId);
  if (codexSessionId) {
    try {
      const result = await callCodex(
        buildCodexSummaryPrompt(),
        codexSessionId,
        getCodexModel(exchanges),
      );
      return extractSummary(result);
    } catch (error) {
      console.log(
        `  Codex summarizer unavailable, falling back to transcript text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (exchanges.length <= 15) {
    const claudeSessionId = codexSessionId ? undefined : sessionId;
    const cwd = claudeSessionId ? exchanges.find((e) => e.cwd)?.cwd : undefined;
    const conversationText = claudeSessionId
      ? ""
      : formatConversationText(exchanges);

    const prompt = buildSummaryPrompt(conversationText, claudeSessionId);

    try {
      const result = await callClaude(prompt, claudeSessionId, false, cwd);
      return extractSummary(result);
    } catch (error) {
      if (claudeSessionId && isResumeFailure(error)) {
        console.log(
          `    resume failed for ${claudeSessionId} (${(error as Error).message}); retrying without resume`,
        );
        const fullPrompt = buildSummaryPrompt(formatConversationText(exchanges));
        const result = await callClaude(fullPrompt);
        return extractSummary(result);
      }
      throw error;
    }
  }

  console.log(
    `  Long conversation (${exchanges.length} exchanges) - using hierarchical summarization`,
  );

  const chunks = chunkExchanges(exchanges, 8);
  console.log(`  Split into ${chunks.length} chunks`);

  const chunkSummaries: string[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const chunkText = formatConversationText(chunk);
    const prompt = buildChunkPrompt(chunkText);

    try {
      const summary = await callClaude(prompt);
      const extracted = extractSummary(summary);
      chunkSummaries.push(extracted);
      console.log(`  Chunk ${i + 1}/${chunks.length}: ${extracted.split(/\s+/).length} words`);
    } catch {
      console.log(`  Chunk ${i + 1} failed, skipping`);
    }
  }

  if (chunkSummaries.length === 0) {
    return "Error: Unable to summarize conversation.";
  }

  const synthesisPrompt = buildSynthesisPrompt(chunkSummaries);

  console.log(`  Synthesizing final summary...`);
  try {
    const result = await callClaude(synthesisPrompt);
    return extractSummary(result);
  } catch {
    console.log(`  Synthesis failed, using chunk summaries`);
    return chunkSummaries.join(" ");
  }
}
