import { SUMMARIZER_CONTEXT_MARKER } from "./constants.js";
import {
  buildChunkPrompt,
  buildClaudeSummarizerCommand,
  buildSummaryPrompt,
  buildSummarySystemPrompt,
  buildSynthesisPrompt,
  runClaudeCommand,
} from "./summarizers/claude.js";
import { buildCodexSummarizerCommand, getApiEnv, runCodexCommand } from "./summarizers/codex.js";
import { createChildProcessAdapter } from "./summarizers/process.js";
import type { ConversationExchange } from "./types.js";

export {
  buildCodexSummarizerCommand,
  type CodexSummarizerCommand,
  getApiEnv,
  runCodexCommand,
} from "./summarizers/codex.js";

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

/**
 * Thrown by callClaude when BOTH the primary and fallback model hit the
 * "thinking.budget_tokens" API error (#96/CR-059). This used to be handled
 * by returning the raw error text as though it were the model's output —
 * summarizeConversation would then extractSummary() it, find no <summary>
 * tags, fall back to text.trim(), and write the error text to
 * `<archive>-summary.txt` as a permanent "summary" with no error sentinel
 * and no retry path. Throwing here routes the failure through the same
 * catch-and-sentinel machinery every caller already has for other errors.
 */
export class SummarizerThinkingBudgetError extends Error {
  constructor(public readonly rawResult: string) {
    super(
      `Summarizer hit a persistent thinking.budget_tokens error on both the primary and fallback model: ${rawResult}`,
    );
    this.name = "SummarizerThinkingBudgetError";
  }
}

/**
 * Detect whether the current process is running inside the Claude Agent SDK
 * subprocess that the summarizer just spawned. The flag is set by getApiEnv()
 * and inherited by the spawned subprocess. Used by sync entry points to bail
 * out before re-entering the sync→summarizer→spawn cycle (#87).
 */
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
    ...(sessionId ? {} : { systemPrompt: buildSummarySystemPrompt() }),
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
    if (error instanceof Error && error.message.includes("thinking.budget_tokens")) {
      if (!useFallback) {
        console.log(
          `    ${primaryModel} hit thinking budget error, retrying with ${fallbackModel}`,
        );
        return await callClaude(prompt, sessionId, true, cwd);
      }
      // Fallback also hit the same persistent error: throw instead of
      // returning the error text as data (CR-059), so callers' existing
      // catch blocks write the #96 error sentinel and retry on the next run.
      throw new SummarizerThinkingBudgetError(error.message);
    }
    throw error;
  }
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
    const conversationText = claudeSessionId ? "" : formatConversationText(exchanges);

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
