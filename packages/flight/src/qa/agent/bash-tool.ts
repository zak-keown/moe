import { mkdirSync } from "node:fs";
import type { EvidenceLogger } from "../evidence/logger.js";
import { type ToolDefinition, type ToolResult, textResult } from "../models/provider.js";
import { killProcessTree, listDescendants } from "../runtime/process-tree.js";
import { spawn } from "../runtime/spawn.js";

const BASH_TOOL_DESCRIPTION =
  "The best interface for inspecting logs and files on the host via " +
  "standard Unix tools (rg, tail, grep, cat, wc, find, head, jq, etc.). " +
  "Use this to verify what the system under test actually did or what " +
  "landed on disk — not to drive the SUT itself (use the adapter's " +
  "screen/keyboard tools for that). Each call runs `bash -c <command>` " +
  "in a fresh subprocess; pipes and redirects work; no state persists " +
  "between calls.";

export interface BashToolOptions {
  /**
   * Working directory for every bash call. Optional at construction so
   * the registry tool-introspection path can build a tool definition
   * without committing to a runtime cwd. If `execute()` is called when
   * `cwd` is absent, it errors — introspection-only construction is not
   * supposed to execute.
   */
  cwd?: string | undefined;
}

export interface BashTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, logger: EvidenceLogger): Promise<ToolResult>;
}

export function buildBashTool(opts: BashToolOptions): BashTool {
  const definition: ToolDefinition = {
    name: "bash",
    description: BASH_TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run via `bash -c`.",
        },
        timeout_ms: {
          type: "integer",
          description: `Per-call timeout in milliseconds. Default ${DEFAULT_TIMEOUT_MS}, range ${MIN_TIMEOUT_MS}–${MAX_TIMEOUT_MS}. On timeout, the process tree is SIGKILLed and partial output is returned.`,
          minimum: MIN_TIMEOUT_MS,
          maximum: MAX_TIMEOUT_MS,
        },
      },
      required: ["command"],
    },
  };

  const execute = async (
    args: Record<string, unknown>,
    logger: EvidenceLogger,
  ): Promise<ToolResult> => {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command) {
      return textResult(`Error: bash requires a non-empty "command" argument.`);
    }
    if (!opts.cwd) {
      return textResult(
        `Error: bash tool has no cwd configured (adapter was constructed without runDir; this path is for tool-definition introspection, not execution).`,
      );
    }

    const cwd = opts.cwd;
    mkdirSync(cwd, { recursive: true });
    const start = Date.now();

    const timeoutMs =
      typeof args.timeout_ms === "number" && Number.isFinite(args.timeout_ms)
        ? Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(args.timeout_ms)))
        : DEFAULT_TIMEOUT_MS;

    // Built once and reused for both the child's env and the transcript
    // redaction below (CR-038), so the set of secrets we scrub from the
    // evidence log always matches exactly what was actually forwarded.
    const scrubbedEnv = buildScrubbedEnv(process.env);

    // detached: true makes proc.pid serve as pgid (setsid).
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(["bash", "-c", command], {
        cwd,
        detached: true,
        env: scrubbedEnv,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.logEvent("bash_spawn_failed", { command, error: msg });
      return textResult(`Error: bash spawn failed: ${msg}`);
    }

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      const descendants = listDescendants(proc.pid);
      killProcessTree(proc.pid, descendants);
    }, timeoutMs);

    const [stdoutResult, stderrResult] = await Promise.all([
      drainStreamCapped(proc.stdout, STDOUT_CAP_BYTES),
      drainStreamCapped(proc.stderr, STDERR_CAP_BYTES),
    ]);
    const code = await proc.exited;
    clearTimeout(timeoutHandle);
    const elapsedMs = Date.now() - start;

    logger.logEvent("bash_call", {
      command,
      cwd,
      timeout_ms: timeoutMs,
      stdout_bytes: stdoutResult.text.length,
      stderr_bytes: stderrResult.text.length,
      exit_code: timedOut || code < 0 ? null : code,
      timed_out: timedOut,
      truncated: { stdout: stdoutResult.truncated, stderr: stderrResult.truncated },
      elapsed_ms: elapsedMs,
    });

    const resultText = formatResult({
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      exit_code: timedOut || code < 0 ? null : code,
      truncated: { stdout: stdoutResult.truncated, stderr: stderrResult.truncated },
      timed_out: timedOut,
      elapsed_ms: elapsedMs,
    });
    // CR-038: the agent still needs the real output in `text` (it may need
    // to read or act on a forwarded credential's value), but nothing
    // forwarded via SDK_PASSTHROUGH_KEYS may reach the persisted evidence
    // log — see redactSecrets. Mirrors the transcriptText redaction
    // credential-tool.ts already applies to resolver stdout (PRI-1605).
    return textResult(resultText, { transcriptText: redactSecrets(resultText, scrubbedEnv) });
  };

  return { definition, execute };
}

const STDOUT_CAP_BYTES = 64 * 1024;
const STDERR_CAP_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;

const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "TZ",
] as const;

const SDK_PASSTHROUGH_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_LOG",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
] as const;

// CR-013: SDK_PASSTHROUGH_KEYS carries live LLM provider credentials (and
// any proxy credentials embedded in HTTPS_PROXY/HTTP_PROXY). Forwarding
// them unconditionally into every `bash -c <command>` child is dangerous
// specifically because the QA agent that controls this shell also reads
// untrusted content from the target under test (extract/screenshot) into
// its own context every turn — an indirect prompt-injection payload on a
// page can induce the agent to run a command that exfiltrates the
// credential over the network without ever printing it anywhere CR-038's
// transcript redaction would catch. So this pass-through is opt-in per
// run, not a default: the operator must explicitly set
// MOE_FLIGHT_BASH_FORWARD_CREDENTIALS to enable it.
const FORWARD_CREDENTIALS_ENV_VAR = "MOE_FLIGHT_BASH_FORWARD_CREDENTIALS";

function isCredentialForwardingEnabled(parent: NodeJS.ProcessEnv): boolean {
  const raw = parent[FORWARD_CREDENTIALS_ENV_VAR];
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function buildScrubbedEnv(parent: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = isCredentialForwardingEnabled(parent)
    ? [...BASE_ENV_KEYS, ...SDK_PASSTHROUGH_KEYS]
    : BASE_ENV_KEYS;
  for (const key of keys) {
    const v = parent[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

/**
 * Mask every occurrence of a forwarded SDK credential/config value out of
 * bash output before it reaches the evidence log (CR-038). When the operator
 * has opted in (CR-013) via MOE_FLIGHT_BASH_FORWARD_CREDENTIALS,
 * `buildScrubbedEnv` forwards ANTHROPIC_API_KEY/OPENAI_API_KEY (and the other
 * SDK_PASSTHROUGH_KEYS) into the child process the LLM controls; any command
 * that prints its environment (`env`, `printenv`, a failing `curl -v`, ...)
 * would otherwise put a live credential on disk in run.jsonl or a spilled
 * artifacts/N.txt. `text` (what the model sees) is left untouched — the
 * agent may legitimately need the real value — only the transcriptText
 * derived from this is affected. Plain substring replace, not a regex: a
 * credential can contain characters that are regex metacharacters, and the
 * values are compared literally either way.
 */
function redactSecrets(text: string, scrubbedEnv: Record<string, string>): string {
  let out = text;
  for (const key of SDK_PASSTHROUGH_KEYS) {
    const value = scrubbedEnv[key];
    if (!value) continue;
    out = out.split(value).join(`<redacted:${key}>`);
  }
  return out;
}

async function drainStreamCapped(
  stream: ReadableStream<Uint8Array>,
  capBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  const chunks: string[] = [];
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (truncated) continue; // keep draining to let the child finish; discard
    if (bytes + value.byteLength > capBytes) {
      const remaining = capBytes - bytes;
      if (remaining > 0) {
        chunks.push(decoder.decode(value.slice(0, remaining), { stream: true }));
        bytes = capBytes;
      }
      truncated = true;
    } else {
      chunks.push(decoder.decode(value, { stream: true }));
      bytes += value.byteLength;
    }
  }
  chunks.push(decoder.decode());
  return { text: chunks.join(""), truncated };
}

interface BashRunResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  truncated: { stdout: boolean; stderr: boolean };
  timed_out: boolean;
  elapsed_ms: number;
}

function formatResult(r: BashRunResult): string {
  const parts: string[] = [];
  parts.push(`exit_code: ${r.exit_code === null ? "null (killed)" : r.exit_code}`);
  parts.push(`elapsed_ms: ${r.elapsed_ms}`);
  if (r.timed_out) parts.push(`timed_out: true`);
  if (r.truncated.stdout) parts.push(`stdout truncated at cap`);
  if (r.truncated.stderr) parts.push(`stderr truncated at cap`);
  parts.push("--- stdout ---");
  parts.push(r.stdout);
  parts.push("--- stderr ---");
  parts.push(r.stderr);
  return parts.join("\n");
}
