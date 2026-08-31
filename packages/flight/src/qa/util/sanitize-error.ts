/**
 * Sanitized error type for LLM SDK failures.
 *
 * The Anthropic and OpenAI SDKs throw errors that carry the response
 * `Headers` object — which contains data we never want surfaced to users:
 * `anthropic-organization-id` (a UUID), `cf-ray`, `traceresponse`,
 * `set-cookie` (rotates per response). When a thrown SDK error escapes
 * uncaught, Bun's unhandled-rejection printer calls `util.inspect` on it
 * and dumps every reachable property — including those headers — into
 * stdout, the run transcript, and `run.jsonl`.
 *
 * `LlmError` is the seam: model adapters catch SDK errors and rethrow
 * `LlmError` instances. The class carries only allow-listed fields:
 *
 *   - `status`     — HTTP status from the response
 *   - `requestId`  — opaque request ID (safe to surface; useful for support)
 *   - `errorType`  — provider error_type code (e.g. `rate_limit_error`)
 *   - `message`    — sanitized message string
 *
 * No reference to the original SDK error or its headers is retained — not
 * via `.cause`, not as a hidden property, not anywhere reachable.
 */
export class LlmError extends Error {
  readonly status?: number | undefined;
  readonly requestId?: string | undefined;
  readonly errorType?: string | undefined;

  constructor(message: string, fields: { status?: number | undefined; requestId?: string | undefined; errorType?: string | undefined } = {}) {
    super(message);
    this.name = "LlmError";
    this.status = fields.status;
    this.requestId = fields.requestId;
    this.errorType = fields.errorType;
  }
}

/**
 * Translate a thrown value (typically from `@anthropic-ai/sdk` or `openai`)
 * into a sanitized `LlmError`. Reads only allow-listed fields from the
 * input; never throws; never retains a reference to the input error.
 */
export function sanitizeLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;

  if (err instanceof Error) {
    const status = readNumber(err, "status");
    const requestId = readString(err, "requestID") ?? readString(err, "request_id");
    const errorType = readErrorType(err);
    return new LlmError(err.message, { status, requestId, errorType });
  }

  return new LlmError(typeof err === "string" ? err : safeStringify(err));
}

function readNumber(obj: object, key: string): number | undefined {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function readString(obj: object, key: string): string | undefined {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Anthropic SDK shape: `err.error` is the parsed JSON body, of the form
 *   { type: "error", error: { type: "rate_limit_error", message: "..." } }
 * OpenAI SDK shape: `err.error` is similar — `{ type, code, message, ... }`.
 * We pull `type` first (Anthropic), falling back to `code` (OpenAI).
 */
function readErrorType(err: Error): string | undefined {
  const body = (err as unknown as { error?: unknown | undefined }).error;
  if (!body || typeof body !== "object") return undefined;
  const inner = (body as Record<string, unknown>).error;
  if (inner && typeof inner === "object") {
    const t = (inner as Record<string, unknown>).type;
    if (typeof t === "string") return t;
  }
  const t = (body as Record<string, unknown>).type;
  if (typeof t === "string" && t !== "error") return t;
  const code = (body as Record<string, unknown>).code;
  if (typeof code === "string") return code;
  return undefined;
}

/**
 * Run an async LLM SDK call. If it throws, rethrow a sanitized `LlmError`
 * — never the original SDK error. Use this at every model-adapter boundary
 * (`messages.create`, `chat.completions.create`, etc.) so callers above the
 * adapter only ever see `LlmError`.
 */
export async function withLlmErrorSanitization<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw sanitizeLlmError(err);
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
