import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const runFile = promisify(execFile);
const cli = fileURLToPath(
  new URL("../skills/smoothing-the-experience/scripts/smooth.mjs", import.meta.url),
);
const claudeFixture = new URL(
  "fixtures/smoothing-the-experience/claude/root.jsonl",
  import.meta.url,
);
const codexCurrentFixture = new URL(
  "fixtures/smoothing-the-experience/codex/item-completed.jsonl",
  import.meta.url,
);
const codexLegacyFixture = new URL(
  "fixtures/smoothing-the-experience/codex/legacy-function-call.jsonl",
  import.meta.url,
);

type IsolatedFixture = Awaited<ReturnType<typeof isolatedHome>>;

describe("smoothing helper CLI", () => {
  it("uses exit 2 for malformed invocations and prints no transcript content", async () => {
    const fixture = await isolatedHome();

    for (const args of [
      [],
      ["scan", "--days", "0"],
      ["scan", "--unknown"],
      ["plan", "--all"],
      ["apply", "--plan", "/missing"],
    ]) {
      const failure = await runFailure(fixture, args);
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain("Usage:");
      expect(failure.stderr).not.toContain("discard");
    }
  });

  it("keeps scan read-only while reporting both harnesses and all four evidence classes", async () => {
    const fixture = await isolatedHome();
    const before = await snapshotTree(fixture.home);

    const { stdout, stderr } = await runCli(fixture, ["scan", "--days", "30", "--json"]);
    const report = JSON.parse(stdout) as {
      harnesses: Array<{ harness: string; status: string }>;
      evidenceClasses: string[];
    };

    expect(report.harnesses.map(({ harness }) => harness)).toEqual(["claude", "codex"]);
    expect(report.harnesses.every(({ status }) => status === "ready")).toBe(true);
    expect(new Set(report.evidenceClasses)).toEqual(
      new Set(["shell", "filesystem", "network", "mcp"]),
    );
    expect(await snapshotTree(fixture.home)).toEqual(before);
    expect(`${stdout}${stderr}`).not.toContain("discard");
  });

  it("plans an individual ID, applies one harness, and suppresses that permission on rescan", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const scan = await scanReport(fixture);
    const claude = scan.harnesses.find(({ harness }) => harness === "claude");
    const selected = claude?.suggestions[0];
    expect(selected).toBeDefined();

    const plannedOutput = await runCli(fixture, [
      "plan",
      "--select",
      selected?.id ?? "missing",
      "--json",
    ]);
    const planned = JSON.parse(plannedOutput.stdout) as {
      confirmToken: string;
      diff: string;
      plan: { path: string; mode: string; harness: string; destination: string };
    };
    expect(planned.diff).toContain(selected?.rule);
    expect(planned.plan).toMatchObject({ mode: "0600", harness: "claude" });
    expect((await stat(planned.plan.path)).mode & 0o777).toBe(0o600);
    expect(await readFile(planned.plan.path, "utf8")).not.toContain("discard");

    const applied = await runCli(fixture, [
      "apply",
      "--plan",
      planned.plan.path,
      "--confirm",
      planned.confirmToken,
    ]);
    expect(applied.stdout).toContain("applied");
    const rescanned = await scanReport(fixture);
    expect(
      rescanned.harnesses.find(({ harness }) => harness === "claude")?.suggestions,
    ).not.toContainEqual(expect.objectContaining({ id: selected?.id }));
    expect(`${plannedOutput.stdout}${plannedOutput.stderr}${applied.stdout}`).not.toContain(
      "discard",
    );
  });

  it("rejects unknown, duplicate, select-all, and cross-harness selections", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const scan = await scanReport(fixture);
    const claudeId = scan.harnesses.find(({ harness }) => harness === "claude")?.suggestions[0]?.id;
    const codexId = scan.harnesses.find(({ harness }) => harness === "codex")?.suggestions[0]?.id;
    expect(claudeId).toBeDefined();
    expect(codexId).toBeDefined();

    expect(
      (await runFailure(fixture, ["plan", "--select", "claude-shell-000000000000"])).code,
    ).toBe(3);
    expect((await runFailure(fixture, ["plan", "--select", `${claudeId},${claudeId}`])).code).toBe(
      2,
    );
    expect((await runFailure(fixture, ["plan", "--select", "all"])).code).toBe(2);
    expect((await runFailure(fixture, ["plan", "--select", "*"])).code).toBe(2);
    expect((await runFailure(fixture, ["plan", "--select", `${claudeId},${codexId}`])).code).toBe(
      2,
    );
  });

  it("requires the exact apply confirmation and leaves the destination unchanged on rejection", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const scan = await scanReport(fixture);
    const selected = scan.harnesses.find(({ harness }) => harness === "claude")?.suggestions[0];
    const planned = JSON.parse(
      (await runCli(fixture, ["plan", "--select", selected?.id ?? "missing", "--json"])).stdout,
    ) as { confirmToken: string; plan: { path: string; destination: string } };
    const before = await readFile(planned.plan.destination);

    expect((await runFailure(fixture, ["apply", "--plan", planned.plan.path])).code).toBe(2);
    expect(
      (
        await runFailure(fixture, [
          "apply",
          "--plan",
          planned.plan.path,
          "--confirm",
          `${planned.confirmToken}-wrong`,
        ])
      ).code,
    ).toBe(4);
    expect(await readFile(planned.plan.destination)).toEqual(before);
  });

  it("validates a Codex plan with execpolicy before applying and suppresses it on rescan", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const scan = await scanReport(fixture);
    const selected = scan.harnesses.find(({ harness }) => harness === "codex")?.suggestions[0];
    expect(selected).toBeDefined();
    const planned = JSON.parse(
      (await runCli(fixture, ["plan", "--select", selected?.id ?? "missing", "--json"])).stdout,
    ) as { confirmToken: string; plan: { path: string; destination: string } };

    await runCli(fixture, [
      "apply",
      "--plan",
      planned.plan.path,
      "--confirm",
      planned.confirmToken,
    ]);
    expect(await readFile(planned.plan.destination, "utf8")).toContain(selected?.rule);
    const rescanned = await scanReport(fixture);
    expect(
      rescanned.harnesses.find(({ harness }) => harness === "codex")?.suggestions,
    ).not.toContainEqual(expect.objectContaining({ id: selected?.id }));
  });

  it("isolates a blocked harness and retains the other harness report", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    await writeFile(
      join(fixture.claudeConfig, "settings.json"),
      '{"permissions":{"allow":"malformed"}}\n',
    );

    const report = await scanReport(fixture);
    expect(report.harnesses.find(({ harness }) => harness === "claude")).toMatchObject({
      status: "blocked",
      suggestions: [],
    });
    expect(report.harnesses.find(({ harness }) => harness === "codex")).toMatchObject({
      status: "ready",
    });
  });

  it("human output includes the review fields and restart disposition", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const { stdout } = await runCli(fixture, ["scan", "--all"]);

    for (const label of [
      "ID:",
      "Scope:",
      "Destination:",
      "Rule:",
      "Evidence class:",
      "Root sessions:",
      "Projects:",
      "Last seen:",
      "Confidence:",
      "Approval provenance:",
      "Safety reason:",
      "Dispositions:",
      "Restart required:",
    ]) {
      expect(stdout).toContain(label);
    }
    expect(stdout).not.toContain("discard");
  });
});

async function isolatedHome({ duplicateClaudeSessions = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "moe-smoothing-e2e-"));
  const home = join(root, "home");
  const claudeConfig = join(home, "claude-config");
  const codexHome = join(home, "codex-home");
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  await Promise.all([
    mkdir(join(claudeConfig, "projects"), { recursive: true }),
    mkdir(join(codexHome, "sessions"), { recursive: true }),
    mkdir(join(codexHome, "rules"), { recursive: true }),
    mkdir(join(repo, ".claude"), { recursive: true }),
    mkdir(join(repo, ".codex", "rules"), { recursive: true }),
    mkdir(join(repo, "src"), { recursive: true }),
    mkdir(bin, { recursive: true }),
  ]);

  const [claudeSource, codexCurrent, codexLegacy] = await Promise.all([
    readFile(claudeFixture, "utf8"),
    readFile(codexCurrentFixture, "utf8"),
    readFile(codexLegacyFixture, "utf8"),
  ]);
  const atRepo = (value: string) => value.replaceAll("/fixture/repo-a", repo);
  await writeFile(join(claudeConfig, "projects", "root-a.jsonl"), atRepo(claudeSource));
  if (duplicateClaudeSessions) {
    await writeFile(
      join(claudeConfig, "projects", "root-b.jsonl"),
      atRepo(claudeSource).replaceAll("root-a", "root-b"),
    );
  }
  await writeFile(join(codexHome, "sessions", "current.jsonl"), atRepo(codexCurrent));
  await writeFile(join(codexHome, "sessions", "legacy.jsonl"), atRepo(codexLegacy));
  await Promise.all([
    writeFile(join(claudeConfig, "settings.json"), '{"permissions":{"allow":[]}}\n'),
    writeFile(join(repo, ".claude", "settings.json"), '{"permissions":{"allow":[]}}\n'),
    writeFile(join(repo, ".claude", "settings.local.json"), '{"permissions":{"allow":[]}}\n'),
    writeFile(join(repo, "src", "index.ts"), "export const fixture = true;\n"),
  ]);

  const fakeCodex = join(bin, "codex");
  await writeFile(fakeCodex, fakeCodexSource());
  await chmod(fakeCodex, 0o755);
  const env = {
    ...process.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: claudeConfig,
    CODEX_HOME: codexHome,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  };
  return { root, home, claudeConfig, codexHome, repo, env };
}

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";

if (process.argv[2] === "app-server") {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\\n")) >= 0) {
      const request = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (request.id === 1) {
        process.stdout.write(JSON.stringify({ id: 1, result: { protocolVersion: "1" } }) + "\\n");
      } else if (request.id === 2) {
        process.stdout.write(JSON.stringify({ id: 2, result: { layers: [
          { scope: "user", enabled: true },
          { scope: "project", root: process.cwd(), enabled: true, trusted: true }
        ] } }) + "\\n");
      }
    }
  });
} else if (process.argv[2] === "execpolicy" && process.argv[3] === "check") {
  const separator = process.argv.indexOf("--");
  const argv = process.argv.slice(separator + 1);
  const ruleFiles = [];
  for (let index = 4; index < separator; index += 1) {
    if (process.argv[index] === "--rules") ruleFiles.push(process.argv[index + 1]);
  }
  const patterns = ruleFiles.flatMap((path) => {
    const contents = readFileSync(path, "utf8");
    return [...contents.matchAll(/pattern = \\[([^\\]]+)\\]/g)].map((match) =>
      [...match[1].matchAll(/"((?:\\\\.|[^"\\\\])*)"/g)].map((part) => JSON.parse('"' + part[1] + '"'))
    );
  });
  const matched = patterns.find((pattern) => pattern.every((token, index) => argv[index] === token));
  process.stdout.write(JSON.stringify(matched ? {
    decision: "allow",
    matchedRules: [{ prefixRuleMatch: { matchedPrefix: matched, decision: "allow", justification: "fixture" } }]
  } : { matchedRules: [] }));
} else {
  process.exitCode = 64;
}
`;
}

async function runCli(fixture: IsolatedFixture, args: string[]) {
  return runFile(process.execPath, [cli, ...args], {
    cwd: fixture.repo,
    env: fixture.env,
    maxBuffer: 1024 * 1024,
  });
}

async function runFailure(fixture: IsolatedFixture, args: string[]) {
  try {
    await runCli(fixture, args);
    throw new Error(`expected CLI failure for ${args.join(" ")}`);
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    if (failure.message.startsWith("expected CLI failure")) throw failure;
    return {
      code: failure.code,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function scanReport(fixture: IsolatedFixture) {
  return JSON.parse((await runCli(fixture, ["scan", "--all", "--json"])).stdout) as {
    harnesses: Array<{
      harness: string;
      status: string;
      suggestions: Array<{ id: string; rule: string }>;
    }>;
  };
}

async function snapshotTree(root: string) {
  const entries: Array<{ path: string; mode: number; contents?: string }> = [];
  async function visit(path: string, relativePath: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      const child = join(relativePath, entry.name);
      const info = await stat(absolute);
      if (entry.isDirectory()) {
        entries.push({ path: `${child}/`, mode: info.mode & 0o777 });
        await visit(absolute, child);
      } else {
        entries.push({
          path: child,
          mode: info.mode & 0o777,
          contents: (await readFile(absolute)).toString("base64"),
        });
      }
    }
  }
  await visit(root, ".");
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}
