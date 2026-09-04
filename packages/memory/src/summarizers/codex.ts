import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  codexVersionRequirementMessage,
  parseCodexCliVersion,
  versionMeetsMinimum,
} from "../codex-support.js";
import { VERSION } from "../version.js";

export interface CodexSummarizerCommand {
  command: string;
  args: string[];
  prompt: string;
  sessionId: string;
  model?: string | undefined;
  versionArgs?: string[] | undefined;
  skipVersionCheck?: boolean | undefined;
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

export function getApiEnv(): Record<string, string | undefined> {
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

function readCommandOutput(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env as NodeJS.ProcessEnv,
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
    // 'close' (not 'exit'): 'exit' can fire before stdout 'data' is delivered,
    // truncating or emptying `output` under load.
    child.on("close", (code) => {
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

async function assertSupportedCodexVersion(
  command: CodexSummarizerCommand,
  env: Record<string, string | undefined>,
): Promise<void> {
  if (command.skipVersionCheck) {
    return;
  }

  const output = await readCommandOutput(
    command.command,
    command.versionArgs || ["--version"],
    env,
  );
  const version = parseCodexCliVersion(output);
  if (!version || !versionMeetsMinimum(version)) {
    throw new Error(codexVersionRequirementMessage(output));
  }
}

export async function runCodexCommand(command: CodexSummarizerCommand): Promise<string> {
  const env = getApiEnv();
  await assertSupportedCodexVersion(command, env);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: env as NodeJS.ProcessEnv,
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
