import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const TASK_SET_HOOK = join(PKG, "hooks/task-set");
const EVIDENCE_HOOK = join(PKG, "hooks/moe-completion-evidence");
const FIXTURES = join(HERE, "fixtures/task-set");
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Copy a fixture plan into a temp directory and return its path. */
function copyFixture(name: string): string {
  const tmp = tempDir("task-set-gov-");
  const dest = join(tmp, name);
  copyFileSync(join(FIXTURES, name), dest);
  return dest;
}

/** Run task-set with the given arguments. */
function runTaskSet(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [TASK_SET_HOOK, ...args], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeSidecar(planPath: string, data: Record<string, unknown>): void {
  writeFileSync(`${planPath}.governance.json`, `${JSON.stringify(data, null, 2)}\n`);
}

function readSidecar(planPath: string): Record<string, unknown> | null {
  const p = `${planPath}.governance.json`;
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// status verb

describe("task-set status verb", () => {
  it("prints a friendly message when no sidecar exists", () => {
    const plan = copyFixture("diamond-plan.md");
    const result = runTaskSet(["status", plan]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("No governance sidecar found.\n");
  });

  it("prints per-task quota usage and per-wave gate state from sidecar", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: {
        "2": { maxToolCalls: 100, maxTokenEstimate: 50000 },
        "3": { maxToolCalls: 50, maxTokenEstimate: 25000 },
      },
      gates: {
        "1": { approved: true, approvedAt: "2026-09-01T00:00:00Z", approvedBy: "human" },
        "2": { approved: false, approvedAt: null, approvedBy: null },
      },
      spend: {
        "2": { toolCalls: 42, tokenEstimate: 12000, lastUpdatedAt: "2026-09-01T01:00:00Z" },
      },
    });

    const result = runTaskSet(["status", plan]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Task quotas");
    expect(result.stdout).toContain("task 2: toolCalls 42/100, tokenEstimate 12000/50000");
    expect(result.stdout).toContain("task 3: toolCalls 0/50, tokenEstimate 0/25000");
    expect(result.stdout).toContain("## Wave gates");
    expect(result.stdout).toContain("wave 1: approved");
    expect(result.stdout).toContain("wave 2: pending");
  });

  it("handles a sidecar with empty sections gracefully", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, { quotas: {}, gates: {}, spend: {} });

    const result = runTaskSet(["status", plan]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Task quotas");
    expect(result.stdout).toContain("## Wave gates");
    // All waves should show "no gate" since gates is empty.
    expect(result.stdout).toContain("no gate");
  });
});

// ---------------------------------------------------------------------------
// gate verb

describe("task-set gate verb", () => {
  it("creates a sidecar when none exists and records approval", () => {
    const plan = copyFixture("diamond-plan.md");
    expect(existsSync(`${plan}.governance.json`)).toBe(false);

    const result = runTaskSet(["gate", plan, "1"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("wave 1 approved");

    const sidecar = readSidecar(plan);
    expect(sidecar).not.toBeNull();
    const gates = sidecar?.gates as Record<
      string,
      { approved: boolean; approvedAt: string; approvedBy: string }
    >;
    expect(gates["1"]?.approved).toBe(true);
    expect(gates["1"]?.approvedBy).toBe("human");
    expect(typeof gates["1"]?.approvedAt).toBe("string");
  });

  it("updates an existing sidecar preserving other data", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: { "1": { maxToolCalls: 10, maxTokenEstimate: 5000 } },
      gates: { "1": { approved: true, approvedAt: "2026-09-01T00:00:00Z", approvedBy: "human" } },
      spend: { "1": { toolCalls: 5, tokenEstimate: 2500, lastUpdatedAt: "2026-09-01T00:00:00Z" } },
    });

    const result = runTaskSet(["gate", plan, "2"]);
    expect(result.status).toBe(0);

    const sidecar = readSidecar(plan);
    // Original quota data preserved.
    const quotas = sidecar?.quotas as Record<string, unknown>;
    expect(quotas["1"]).toEqual({ maxToolCalls: 10, maxTokenEstimate: 5000 });
    // Original gate preserved, new gate added.
    const gates = sidecar?.gates as Record<string, { approved: boolean }>;
    expect(gates["1"]?.approved).toBe(true);
    expect(gates["2"]?.approved).toBe(true);
  });

  it("rejects an invalid wave number", () => {
    const plan = copyFixture("diamond-plan.md");
    const result = runTaskSet(["gate", plan, "abc"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid wave number");
  });
});

// ---------------------------------------------------------------------------
// next verb with governance

describe("task-set next verb with governance", () => {
  it("returns the normal ready set when no sidecar exists", () => {
    // diamond-plan: Task 1 is complete, Tasks 2 and 3 should be ready.
    const plan = copyFixture("diamond-plan.md");
    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(2);
    expect(ready).toContain(3);
    expect(ready).not.toContain(1); // complete
    expect(ready).not.toContain(4); // deps not met
  });

  it("excludes tasks whose toolCalls quota is exhausted", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: { "2": { maxToolCalls: 10, maxTokenEstimate: 99999 } },
      gates: {},
      spend: { "2": { toolCalls: 10, tokenEstimate: 100, lastUpdatedAt: "2026-09-01T00:00:00Z" } },
    });

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(3); // not quota-exhausted
    expect(ready).not.toContain(2); // quota exhausted
  });

  it("excludes tasks whose tokenEstimate quota is exhausted", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: { "3": { maxToolCalls: 999, maxTokenEstimate: 5000 } },
      gates: {},
      spend: { "3": { toolCalls: 1, tokenEstimate: 5000, lastUpdatedAt: "2026-09-01T00:00:00Z" } },
    });

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(2);
    expect(ready).not.toContain(3); // token quota exhausted
  });

  it("excludes tasks in a wave whose gate exists but is not approved", () => {
    // diamond-plan: Task 1 is complete. Tasks 2 and 3 are in wave 2.
    // (Wave 1 = Task 1, Wave 2 = Tasks 2 & 3, Wave 3 = Task 4.)
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: {},
      gates: { "2": { approved: false, approvedAt: null, approvedBy: null } },
      spend: {},
    });

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    // Tasks 2 and 3 are in wave 2, which is gated but not approved.
    const ready = result.stdout.trim().split("\n").filter(Boolean).map(Number);
    expect(ready).not.toContain(2);
    expect(ready).not.toContain(3);
  });

  it("allows tasks in a wave whose gate is approved", () => {
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: {},
      gates: { "2": { approved: true, approvedAt: "2026-09-01T00:00:00Z", approvedBy: "human" } },
      spend: {},
    });

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(2);
    expect(ready).toContain(3);
  });

  it("keeps tasks ready when their wave has no gate entry", () => {
    // A gate entry must exist AND be unapproved to block.
    const plan = copyFixture("diamond-plan.md");
    writeSidecar(plan, {
      quotas: {},
      gates: {}, // no gate entries at all
      spend: {},
    });

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(2);
    expect(ready).toContain(3);
  });

  it("handles a malformed sidecar by ignoring it (fail open)", () => {
    const plan = copyFixture("diamond-plan.md");
    writeFileSync(`${plan}.governance.json`, "not-json{{{");

    const result = runTaskSet(["next", plan]);
    expect(result.status).toBe(0);
    // Should behave as if no sidecar exists.
    const ready = result.stdout.trim().split("\n").map(Number);
    expect(ready).toContain(2);
    expect(ready).toContain(3);
  });
});

// ---------------------------------------------------------------------------
// moe-completion-evidence spend counter

describe("moe-completion-evidence governance spend counter", () => {
  interface EvidenceFixture {
    root: string;
    hook: string;
    transcript: string;
    home: string;
  }

  function evidenceFixture(): EvidenceFixture {
    const root = mkdtempSync(join(tmpdir(), "moe-evidence-gov-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "test-home"), { recursive: true });
    // Need a git repo for the hook's gitTopLevel().
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    const hook = join(root, "moe-completion-evidence");
    copyFileSync(EVIDENCE_HOOK, hook);
    return {
      root,
      hook,
      transcript: join(root, "transcript.jsonl"),
      home: join(root, "test-home"),
    };
  }

  function writeTranscript(target: string, rows: Array<Record<string, unknown>>): void {
    writeFileSync(target, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  }

  function runEvidence(
    f: EvidenceFixture,
    opts: { plan?: string; task?: string } = {},
  ): { status: number | null; stdout: string; stderr: string } {
    const input = JSON.stringify({ session_id: "gov-session", transcript_path: f.transcript });
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: f.home,
      USERPROFILE: f.home,
      MOE_EVIDENCE_DISABLED: "",
      MOE_EVIDENCE_CONFIG_DIR: join(f.root, "audit-out"),
      MOE_DATA_DIR: "",
      XDG_CONFIG_HOME: "",
    };
    if (opts.plan) env.MOE_CURRENT_PLAN = opts.plan;
    if (opts.task) env.MOE_CURRENT_TASK = opts.task;
    const result = spawnSync(process.execPath, [f.hook], {
      cwd: f.root,
      input,
      encoding: "utf8",
      env,
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("increments the sidecar spend counter for the active task", () => {
    const f = evidenceFixture();
    // Create a plan file and sidecar in the temp root.
    const planPath = join(f.root, "plan.md");
    writeFileSync(planPath, "# Plan\n### Task 1: Foo\n");
    writeSidecar(planPath, {
      quotas: { "1": { maxToolCalls: 100, maxTokenEstimate: 50000 } },
      gates: {},
      spend: { "1": { toolCalls: 5, tokenEstimate: 1000, lastUpdatedAt: "2026-09-01T00:00:00Z" } },
    });

    // Transcript with 3 tool_use items this turn.
    writeTranscript(f.transcript, [
      { type: "user", message: { role: "user", content: "Do something." } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/tmp/a" } },
            { type: "tool_use", id: "t2", name: "Edit", input: {} },
            { type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
    ]);

    const result = runEvidence(f, { plan: planPath, task: "1" });
    expect(result.status).toBe(0);

    const sidecar = readSidecar(planPath)!;
    const spend = sidecar.spend as Record<string, { toolCalls: number; tokenEstimate: number }>;
    // 5 prior + 3 this turn = 8.
    expect(spend["1"]?.toolCalls).toBe(8);
    // tokenEstimate unchanged (hook only increments toolCalls).
    expect(spend["1"]?.tokenEstimate).toBe(1000);
  });

  it("does nothing when MOE_CURRENT_PLAN is not set", () => {
    const f = evidenceFixture();
    const planPath = join(f.root, "plan.md");
    writeFileSync(planPath, "# Plan\n### Task 1: Foo\n");
    writeSidecar(planPath, {
      quotas: {},
      gates: {},
      spend: { "1": { toolCalls: 5, tokenEstimate: 0, lastUpdatedAt: "2026-09-01T00:00:00Z" } },
    });

    writeTranscript(f.transcript, [
      { type: "user", message: { role: "user", content: "Do something." } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
        },
      },
    ]);

    // No MOE_CURRENT_PLAN set.
    const result = runEvidence(f);
    expect(result.status).toBe(0);

    // Spend counter unchanged.
    const sidecar = readSidecar(planPath)!;
    const spend = sidecar.spend as Record<string, { toolCalls: number }>;
    expect(spend["1"]?.toolCalls).toBe(5);
  });

  it("does nothing when sidecar file does not exist", () => {
    const f = evidenceFixture();
    const planPath = join(f.root, "plan.md");
    writeFileSync(planPath, "# Plan\n### Task 1: Foo\n");
    // No sidecar created.

    writeTranscript(f.transcript, [
      { type: "user", message: { role: "user", content: "Do something." } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
        },
      },
    ]);

    const result = runEvidence(f, { plan: planPath, task: "1" });
    expect(result.status).toBe(0);
    // No sidecar should have been created.
    expect(existsSync(`${planPath}.governance.json`)).toBe(false);
  });

  it("initializes spend entry when task has no prior spend", () => {
    const f = evidenceFixture();
    const planPath = join(f.root, "plan.md");
    writeFileSync(planPath, "# Plan\n### Task 2: Bar\n");
    writeSidecar(planPath, { quotas: {}, gates: {}, spend: {} });

    writeTranscript(f.transcript, [
      { type: "user", message: { role: "user", content: "Do it." } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo hi" } },
            { type: "tool_use", id: "t2", name: "Read", input: {} },
          ],
        },
      },
    ]);

    const result = runEvidence(f, { plan: planPath, task: "2" });
    expect(result.status).toBe(0);

    const sidecar = readSidecar(planPath)!;
    const spend = sidecar.spend as Record<
      string,
      { toolCalls: number; tokenEstimate: number; lastUpdatedAt: string }
    >;
    expect(spend["2"]?.toolCalls).toBe(2);
    expect(spend["2"]?.tokenEstimate).toBe(0);
    expect(typeof spend["2"]?.lastUpdatedAt).toBe("string");
  });
});
