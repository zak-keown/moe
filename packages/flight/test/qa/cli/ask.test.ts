import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { parseArgs } from "../../../src/qa/cli/args.js";
import { ask } from "../../../src/qa/cli/ask.js";

describe("parseArgs ask", () => {
  test("parses positional runId", () => {
    const r = parseArgs(["bun", "moe-flight", "ask", "login-001_20260101T000000Z_abcd"]);
    expect(r.command).toBe("ask");
    expect((r as { runId: string }).runId).toBe("login-001_20260101T000000Z_abcd");
  });

  test("parses --turn", () => {
    const r = parseArgs(["bun", "moe-flight", "ask", "rid", "--turn", "5"]);
    expect((r as { upToTurn?: number }).upToTurn).toBe(5);
  });

  test("parses --model as a bare model id", () => {
    const r = parseArgs(["bun", "moe-flight", "ask", "rid", "--model", "claude-opus-4-7"]);
    expect((r as { modelOverride?: string }).modelOverride).toBe("claude-opus-4-7");
  });

  test("rejects unknown flags", () => {
    expect(() => parseArgs(["bun", "moe-flight", "ask", "rid", "--bogus", "x"])).toThrow(
      /Unknown flag/,
    );
  });

  test("requires a runId positional", () => {
    expect(() => parseArgs(["bun", "moe-flight", "ask"])).toThrow(/runId|Usage/);
  });
});

describe("ask error paths", () => {
  const cleanups: string[] = [];
  afterEach(() => {
    while (cleanups.length) {
      const d = cleanups.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  test("returns 1 and logs when the run directory does not exist", async () => {
    const projRoot = mkdtempSync(join(tmpdir(), "moe-flight-ask-"));
    cleanups.push(projRoot);
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...msg: unknown[]) => {
      errors.push(msg.map((m) => String(m)).join(" "));
    };
    try {
      const code = await ask({ command: "ask", runId: "nonexistent_run", cli: {} }, {
        projectRoot: projRoot,
        stateDirName: ".moe-flight",
      } as never);
      expect(code).toBe(1);
      expect(errors.some((e) => e.includes("Run not found"))).toBe(true);
    } finally {
      console.error = origErr;
    }
  });

  test("returns 1 and logs when the run directory exists but run.jsonl is missing", async () => {
    const projRoot = mkdtempSync(join(tmpdir(), "moe-flight-ask-"));
    cleanups.push(projRoot);
    mkdirSync(join(projRoot, ".moe-flight", "results", "empty_run"), { recursive: true });
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...msg: unknown[]) => {
      errors.push(msg.map((m) => String(m)).join(" "));
    };
    try {
      const code = await ask({ command: "ask", runId: "empty_run", cli: {} }, {
        projectRoot: projRoot,
        stateDirName: ".moe-flight",
      } as never);
      expect(code).toBe(1);
      expect(errors.some((e) => e.includes("no run.jsonl"))).toBe(true);
    } finally {
      console.error = origErr;
    }
  });

  // CR-083: peekRecordedModel/peekRecordedDate JSON.parse every non-blank
  // line of run.jsonl with no try/catch, and peekRecordedModel runs before
  // any of ask()'s surrounding try/catch blocks. A truncated/corrupted line
  // ahead of run_start (plausible: this codebase's own shutdown-drain design
  // can interrupt a run mid-write) must not escape as a raw SyntaxError --
  // it should be skipped so the real run_start line downstream is still
  // found, same as ws-handlers.ts already treats the same file per-line.
  test("ask tolerates a corrupt line ahead of run_start in run.jsonl instead of crashing", async () => {
    const projRoot = mkdtempSync(join(tmpdir(), "moe-flight-ask-"));
    cleanups.push(projRoot);
    const runDir = join(projRoot, ".moe-flight", "results", "corrupt_run");
    mkdirSync(runDir, { recursive: true });
    const lines = [
      "not valid json — truncated mid-write",
      JSON.stringify({
        type: "run_start",
        model: "totally-unknown-model",
        ts: "2026-01-01T00:00:00Z",
      }),
    ];
    writeFileSync(join(runDir, "run.jsonl"), `${lines.join("\n")}\n`);
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...msg: unknown[]) => {
      errors.push(msg.map((m) => String(m)).join(" "));
    };
    try {
      const code = await ask({ command: "ask", runId: "corrupt_run", cli: {} }, {
        projectRoot: projRoot,
        stateDirName: ".moe-flight",
      } as never);
      // Returns cleanly (via the existing UnknownModelProviderError path for
      // the recorded model), rather than an uncaught JSON SyntaxError.
      expect(code).toBe(1);
      // The line AFTER the corrupt one was still found and its model used --
      // proof the corrupt line was skipped, not just swallowed into "".
      expect(errors.some((e) => e.includes("totally-unknown-model"))).toBe(true);
      expect(errors.some((e) => /SyntaxError|Unexpected token|JSON/.test(e))).toBe(false);
    } finally {
      console.error = origErr;
    }
  });
});
