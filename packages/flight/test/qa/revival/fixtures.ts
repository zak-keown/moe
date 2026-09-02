import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { anthropicToolResultMessages } from "../../../src/qa/models/anthropic.js";

export function makeRunDir(events: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), "moe-flight-revival-"));
  mkdirSync(join(dir, "screenshots"), { recursive: true });
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  let lastId = 0;
  const chained = events.map((e, i) => {
    const eventId = (e.eventId as number) ?? i + 1;
    const parentEventId = (e.parentEventId as number) ?? lastId;
    lastId = eventId;
    return {
      eventId,
      parentEventId,
      ts: e.ts ?? new Date().toISOString(),
      ...e,
    };
  });
  writeFileSync(join(dir, "run.jsonl"), chained.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return dir;
}

export function writeScreenshot(runDir: string, name: string, bytes: Buffer): string {
  const rel = `screenshots/${name}`;
  writeFileSync(join(runDir, rel), bytes);
  return rel;
}

export function writeArtifact(runDir: string, name: string, content: string): string {
  const rel = `artifacts/${name}`;
  writeFileSync(join(runDir, rel), content);
  return rel;
}

export function writeCapture(runDir: string, name: string, content: string): string {
  mkdirSync(join(runDir, "captures"), { recursive: true });
  const rel = `captures/${name}`;
  writeFileSync(join(runDir, rel), content);
  return rel;
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Write a file directly under the OS tmpdir — a sibling of any `runDir`
 * `makeRunDir` produces (they're all `mkdtempSync(join(tmpdir(), ...))`),
 * for path-traversal tests (CR-047). The filename carries a random
 * suffix so parallel test workers never collide on the same path.
 * Returns both the run-relative reference a crafted `tool_result` row
 * would use (`../<name>`) and the absolute path, so the caller can
 * register the absolute path with `cleanup`.
 */
export function writeOutsideRunDir(content: string): { rel: string; abs: string } {
  const name = `outside-secret-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const abs = join(tmpdir(), name);
  writeFileSync(abs, content);
  return { rel: `../${name}`, abs };
}

/** Tiny 1x1 PNG (transparent) — for image-rehydration tests. */
export const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAEAAAoAAv/lxKUAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Minimal LLMClient stand-in for rebuildMessages tests. Reuses the real
 * exported anthropicToolResultMessages so tests assert against the
 * provider-native Anthropic shape without depending on an API key.
 * chat() is intentionally absent — these tests never call it.
 */
export function makeFakeAnthropicClient(): {
  userMessage: (content: string) => unknown;
  toolResultMessages: typeof anthropicToolResultMessages;
} {
  return {
    userMessage: (content: string) => ({ role: "user", content }),
    toolResultMessages: anthropicToolResultMessages,
  };
}
