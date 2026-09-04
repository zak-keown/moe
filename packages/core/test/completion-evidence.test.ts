import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SOURCE_HOOK = join(PKG, "hooks/moe-completion-evidence");
const temporaryRoots: string[] = [];

interface Fixture {
  root: string;
  nested: string;
  hook: string;
  transcript: string;
  home: string;
}

interface Evidence {
  command: string;
  output: string | null;
  is_error: boolean | null;
  exit_code: number | null;
}

interface AuditPayload {
  verification_commands: Evidence[];
  warning: string | null;
}

// realpathSync matters here: on macOS os.tmpdir() returns an unresolved
// /var/... path while `git rev-parse --show-toplevel` (what the hook keys
// on) reports the resolved /private/var/... path. Fixtures must be built
// from the resolved path or the test's expected key won't match the hook's.
function tempRoot(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function fixtureAt(parent: string, name: string): Fixture {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const nested = join(root, "packages/example");
  const bin = join(root, "test-bin");
  const home = join(root, "test-home");
  mkdirSync(nested, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  const hook = join(bin, "moe-completion-evidence");
  copyFileSync(SOURCE_HOOK, hook);
  return { root, nested, hook, transcript: join(root, "transcript.jsonl"), home };
}

function fixture(): Fixture {
  return fixtureAt(tempRoot("moe-completion-evidence-"), "repo");
}

// Mirrors the hook's own sanitization: the git-toplevel absolute path with
// every non [A-Za-z0-9_.-] run collapsed to a single "-", so tests can
// compute the expected key without hardcoding the hook's internals.
function projectKey(absPath: string): string {
  return absPath.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "root";
}

function defaultAuditDir(f: Fixture): string {
  return join(f.home, ".config", "moe", "core", "audit", projectKey(f.root));
}

function human(text: string) {
  return { type: "user", message: { role: "user", content: text } };
}

function assistant(content: Array<Record<string, unknown>>) {
  return { type: "assistant", message: { role: "assistant", content } };
}

function toolResult(
  id: string,
  content: string,
  options: { isError?: boolean; exitCode?: number } = {},
) {
  const item: Record<string, unknown> = { type: "tool_result", tool_use_id: id, content };
  if (options.isError !== undefined) item.is_error = options.isError;
  const row: Record<string, unknown> = {
    type: "user",
    message: { role: "user", content: [item] },
  };
  if (options.exitCode !== undefined) row.toolUseResult = { exitCode: options.exitCode };
  return row;
}

function writeTranscript(target: string, rows: Array<Record<string, unknown>> | string): void {
  const text = typeof rows === "string" ? rows : rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(target, `${text}\n`);
}

function runHook(
  f: Fixture,
  options: {
    cwd?: string;
    input?: string;
    env?: Record<string, string>;
    sessionId?: string;
  } = {},
) {
  const input =
    options.input ??
    JSON.stringify({ session_id: options.sessionId ?? "session", transcript_path: f.transcript });
  return spawnSync(process.execPath, [f.hook], {
    cwd: options.cwd ?? f.nested,
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: f.home,
      USERPROFILE: f.home,
      MOE_EVIDENCE_DISABLED: "",
      MOE_EVIDENCE_CONFIG_DIR: "",
      MOE_DATA_DIR: "",
      XDG_CONFIG_HOME: "",
      ...options.env,
    },
  });
}

function auditPayloads(auditDir: string): AuditPayload[] {
  return readdirSync(auditDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith("-firing.json"))
    .map((name) => JSON.parse(readFileSync(join(auditDir, name), "utf8")) as AuditPayload);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("moe-completion-evidence", () => {
  it("uses the human prompt boundary and writes complete evidence into the home audit store", () => {
    const f = fixture();
    writeTranscript(f.transcript, [
      human("Run the checks."),
      assistant([
        { type: "tool_use", id: "bash-1", name: "Bash", input: { command: "pnpm test" } },
      ]),
      toolResult("bash-1", "all green", { isError: false, exitCode: 0 }),
      assistant([{ type: "text", text: "Tests pass." }]),
    ]);

    const result = runHook(f);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(existsSync(join(f.nested, ".audit"))).toBe(false);
    expect(existsSync(join(f.root, ".audit"))).toBe(false);
    const [payload] = auditPayloads(defaultAuditDir(f));
    expect(payload?.verification_commands).toEqual([
      { command: "pnpm test", output: "all green", is_error: false, exit_code: 0 },
    ]);
    expect(payload?.warning).toBeNull();
  });

  it("records null for result fields the transcript does not know", () => {
    const f = fixture();
    writeTranscript(f.transcript, [
      human("Typecheck it."),
      assistant([
        {
          type: "tool_use",
          id: "bash-missing",
          name: "Bash",
          input: { command: "pnpm typecheck" },
        },
      ]),
    ]);

    expect(runHook(f).status).toBe(0);
    const [payload] = auditPayloads(defaultAuditDir(f));
    expect(payload?.verification_commands).toEqual([
      { command: "pnpm typecheck", output: null, is_error: null, exit_code: null },
    ]);
  });

  it("isolates the current turn and warns without blocking when its claim has no evidence", () => {
    const f = fixture();
    writeTranscript(f.transcript, [
      human("First request."),
      assistant([
        { type: "tool_use", id: "old-bash", name: "Bash", input: { command: "pnpm check" } },
      ]),
      toolResult("old-bash", "old success", { isError: false, exitCode: 0 }),
      human("Now do something else."),
      assistant([{ type: "text", text: "The tests pass." }]),
    ]);

    const result = runHook(f);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("completion-claim without matching verification command");
    const [payload] = auditPayloads(defaultAuditDir(f));
    expect(payload?.verification_commands).toEqual([]);
    expect(payload?.warning).toContain("completion-claim without matching verification command");
  });

  it("deduplicates Skill tool-use IDs when Stop fires repeatedly", () => {
    const f = fixture();
    const firstRows = [
      human("Use the relevant skill."),
      assistant([{ type: "tool_use", id: "skill-1", name: "Skill", input: { skill: "testing" } }]),
    ];
    writeTranscript(f.transcript, firstRows);

    expect(runHook(f).status).toBe(0);
    expect(runHook(f).status).toBe(0);
    writeTranscript(f.transcript, [
      ...firstRows,
      assistant([
        { type: "tool_use", id: "skill-2", name: "Skill", input: { skill: "verification" } },
      ]),
    ]);
    expect(runHook(f).status).toBe(0);

    const firing = JSON.parse(
      readFileSync(join(defaultAuditDir(f), "session-firing.json"), "utf8"),
    ) as {
      skill_tool_uses: number;
      skills: string[];
      skill_tool_use_ids: string[];
    };
    expect(firing.skill_tool_uses).toBe(2);
    expect(firing.skills).toEqual(["testing", "verification"]);
    expect(firing.skill_tool_use_ids).toEqual(["skill-1", "skill-2"]);
  });

  it("keeps current Claude skill expansions inside the active human turn", () => {
    const f = fixture();
    writeTranscript(f.transcript, [
      human("Use verify-completion and run the test."),
      assistant([
        {
          type: "tool_use",
          id: "skill-live",
          name: "Skill",
          input: { skill: "moe-core:verify-completion" },
        },
      ]),
      {
        type: "user",
        isMeta: true,
        turnCompanion: true,
        sourceToolUseID: "skill-live",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Base directory for this skill: /plugin/skills/verification" },
          ],
        },
      },
      assistant([
        { type: "tool_use", id: "bash-live", name: "Bash", input: { command: "pnpm test" } },
      ]),
      toolResult("bash-live", "one test passed", { isError: false }),
      assistant([{ type: "text", text: "Tests pass, but the user goal is not met." }]),
    ]);

    expect(runHook(f, { sessionId: "live-schema" }).status).toBe(0);
    const [payload] = auditPayloads(defaultAuditDir(f));
    expect(payload?.verification_commands).toEqual([
      { command: "pnpm test", output: "one test passed", is_error: false, exit_code: 0 },
    ]);
    const firing = JSON.parse(
      readFileSync(join(defaultAuditDir(f), "live-schema-firing.json"), "utf8"),
    ) as { skill_tool_uses: number; skills: string[] };
    expect(firing).toMatchObject({
      skill_tool_uses: 1,
      skills: ["moe-core:verify-completion"],
    });
  });

  it("honors MOE_EVIDENCE_CONFIG_DIR as a direct override, skipping project keying", () => {
    const f = fixture();
    const configDir = join(f.root, "explicit-audit-dir");
    writeTranscript(f.transcript, [
      human("Capture this."),
      assistant([{ type: "text", text: "Working." }]),
    ]);

    expect(runHook(f, { env: { MOE_EVIDENCE_CONFIG_DIR: configDir } }).status).toBe(0);

    expect(existsSync(defaultAuditDir(f))).toBe(false);
    expect(auditPayloads(configDir)).toHaveLength(1);
  });

  it("honors MOE_DATA_DIR, nesting under core/audit/<project-key>", () => {
    const f = fixture();
    const dataDir = join(f.root, "shared-data-root");
    writeTranscript(f.transcript, [
      human("Capture this."),
      assistant([{ type: "text", text: "Working." }]),
    ]);

    expect(runHook(f, { env: { MOE_DATA_DIR: dataDir } }).status).toBe(0);

    expect(existsSync(defaultAuditDir(f))).toBe(false);
    const expected = join(dataDir, "core", "audit", projectKey(f.root));
    expect(auditPayloads(expected)).toHaveLength(1);
  });

  it("honors XDG_CONFIG_HOME when MOE_DATA_DIR is unset", () => {
    const f = fixture();
    const xdgDir = join(f.root, "xdg-config");
    writeTranscript(f.transcript, [
      human("Capture this."),
      assistant([{ type: "text", text: "Working." }]),
    ]);

    expect(runHook(f, { env: { XDG_CONFIG_HOME: xdgDir } }).status).toBe(0);

    expect(existsSync(defaultAuditDir(f))).toBe(false);
    const expected = join(xdgDir, "moe", "core", "audit", projectKey(f.root));
    expect(auditPayloads(expected)).toHaveLength(1);
  });

  it("keys the audit dir by full repo path so same-named sibling repos do not collide", () => {
    const parent = tempRoot("moe-completion-evidence-siblings-");
    const a = fixtureAt(join(parent, "team-a"), "moe");
    const b = fixtureAt(join(parent, "team-b"), "moe");

    writeTranscript(a.transcript, [
      human("Work in repo A."),
      assistant([{ type: "text", text: "Working in A." }]),
    ]);
    writeTranscript(b.transcript, [
      human("Work in repo B."),
      assistant([{ type: "text", text: "Working in B." }]),
    ]);

    expect(runHook(a, { env: { HOME: a.home, USERPROFILE: a.home } }).status).toBe(0);
    expect(runHook(b, { env: { HOME: b.home, USERPROFILE: b.home } }).status).toBe(0);

    const dirA = defaultAuditDir(a);
    const dirB = defaultAuditDir(b);
    expect(dirA).not.toBe(dirB);
    expect(auditPayloads(dirA)).toHaveLength(1);
    expect(auditPayloads(dirB)).toHaveLength(1);
  });

  it("fails open for malformed events, transcript rows, and prior counters", () => {
    const f = fixture();
    expect(runHook(f, { input: "{" }).status).toBe(0);
    expect(existsSync(defaultAuditDir(f))).toBe(false);

    writeTranscript(
      f.transcript,
      `{not-json}\n${JSON.stringify(human("Continue."))}\n${JSON.stringify(
        assistant([
          { type: "tool_use", id: "skill-ok", name: "Skill", input: { skill: "debugging" } },
        ]),
      )}`,
    );
    mkdirSync(defaultAuditDir(f), { recursive: true });
    writeFileSync(join(defaultAuditDir(f), "session-firing.json"), "null\n");

    const result = runHook(f);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
