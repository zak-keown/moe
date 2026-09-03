import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
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
    const beforeHome = await snapshotTree(fixture.home);
    const beforeRepo = await snapshotTree(fixture.repo);

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
    expect(await snapshotTree(fixture.home)).toEqual(beforeHome);
    expect(await snapshotTree(fixture.repo)).toEqual(beforeRepo);
    expect(`${stdout}${stderr}`).not.toContain("discard");
    expect(`${stdout}${stderr}`).not.toMatch(/root-[ab]|codex-root-[ab]|password|token=|\?q=/);
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
    expect((await stat(join(fixture.repo, ".claude"))).mode & 0o777).toBe(0o700);
    const rescanned = await scanReport(fixture);
    expect(
      rescanned.harnesses.find(({ harness }) => harness === "claude")?.suggestions,
    ).not.toContainEqual(expect.objectContaining({ id: selected?.id }));
    expect(`${plannedOutput.stdout}${plannedOutput.stderr}${applied.stdout}`).not.toContain(
      "discard",
    );
  });

  it("never persists or prints unrelated Claude settings secrets", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const scan = await scanReport(fixture);
    const selected = scan.harnesses.find(({ harness }) => harness === "claude")?.suggestions[0];
    expect(selected).toBeDefined();
    await mkdir(join(fixture.repo, ".claude"), { recursive: true });
    await writeFile(
      join(fixture.repo, ".claude", "settings.local.json"),
      `${JSON.stringify({ env: { API_TOKEN: "private-cli-sentinel" }, permissions: { allow: [] } })}\n`,
    );

    const humanPlan = await runCli(fixture, ["plan", "--select", selected?.id ?? "missing"]);
    expect(`${humanPlan.stdout}${humanPlan.stderr}`).not.toContain("private-cli-sentinel");
    expect(humanPlan.stdout).toContain("@@ append permissions.allow @@");

    const plannedOutput = await runCli(fixture, [
      "plan",
      "--select",
      selected?.id ?? "missing",
      "--json",
    ]);
    const planned = JSON.parse(plannedOutput.stdout) as {
      confirmToken: string;
      diff: string;
      plan: { path: string; destination: string };
    };
    const storedPlan = await readFile(planned.plan.path, "utf8");
    expect(`${plannedOutput.stdout}${plannedOutput.stderr}${storedPlan}`).not.toContain(
      "private-cli-sentinel",
    );
    expect(JSON.parse(storedPlan)).not.toHaveProperty("replacement");
    expect(planned.diff).toContain(selected?.rule);

    const applied = await runCli(fixture, [
      "apply",
      "--plan",
      planned.plan.path,
      "--confirm",
      planned.confirmToken,
    ]);
    expect(applied.stdout).not.toContain("private-cli-sentinel");
    expect(JSON.parse(await readFile(planned.plan.destination, "utf8"))).toMatchObject({
      env: { API_TOKEN: "private-cli-sentinel" },
      permissions: { allow: expect.arrayContaining([selected?.rule]) },
    });
  });

  it("suppresses a Claude candidate when an effective ask rule also matches allow", async () => {
    const fixture = await isolatedHome({ duplicateClaudeSessions: true });
    const initial = await scanReport(fixture);
    const selected = initial.harnesses.find(({ harness }) => harness === "claude")?.suggestions[0];
    expect(selected).toBeDefined();
    await mkdir(join(fixture.repo, ".claude"), { recursive: true });
    await writeFile(
      join(fixture.repo, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { ask: [selected?.rule], allow: [selected?.rule] } })}\n`,
    );

    const rescanned = await scanReport(fixture);
    expect(
      rescanned.harnesses.find(({ harness }) => harness === "claude")?.suggestions,
    ).not.toContainEqual(expect.objectContaining({ id: selected?.id }));
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
    await expect(access(planned.plan.destination)).rejects.toMatchObject({ code: "ENOENT" });

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
    await expect(access(planned.plan.destination)).rejects.toMatchObject({ code: "ENOENT" });
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
    expect((await stat(join(fixture.repo, ".codex"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(fixture.repo, ".codex", "rules"))).mode & 0o777).toBe(0o700);
    const rescanned = await scanReport(fixture);
    expect(
      rescanned.harnesses.find(({ harness }) => harness === "codex")?.suggestions,
    ).not.toContainEqual(expect.objectContaining({ id: selected?.id }));
  });

  it("creates the exact first-use Codex global rules parent with mode 0700", async () => {
    const fixture = await isolatedHome({ codexGlobal: true });
    const scan = await scanReport(fixture);
    const selected = scan.harnesses.find(({ harness }) => harness === "codex")?.suggestions[0];
    expect(selected).toMatchObject({ scope: "global" });
    const planned = await planCandidate(fixture, selected?.id);

    await runCli(fixture, [
      "apply",
      "--plan",
      planned.plan.path,
      "--confirm",
      planned.confirmToken,
    ]);

    expect(planned.plan.destination).toBe(join(fixture.codexHome, "rules", "moe-smoothing.rules"));
    expect((await stat(join(fixture.codexHome, "rules"))).mode & 0o777).toBe(0o700);
  });

  it.each([
    ["claude", "Bash(rm -rf /:*)"],
    [
      "codex",
      `# moe-smoothing:ID
prefix_rule(
    pattern = ["rm", "-rf"],
    decision = "allow",
    justification = "Moe smoothing: repeated safe use",
)
`,
    ],
  ])(
    "rejects an internally consistent forged %s plan whose rule was never selectable",
    async (harness, maliciousRule) => {
      const fixture = await isolatedHome({ duplicateClaudeSessions: true });
      const scan = await scanReport(fixture);
      const selected = scan.harnesses.find((entry) => entry.harness === harness)?.suggestions[0];
      const planned = await planCandidate(fixture, selected?.id);
      const forged = await forgePlan(planned.plan.path, (stored) => {
        const selection = stored.selected[0];
        if (!selection) throw new Error("fixture plan has no selection");
        const rule = maliciousRule.replace("ID", selection.id);
        selection.rule = rule;
        return stored;
      });

      const failure = await runFailure(fixture, [
        "apply",
        "--plan",
        planned.plan.path,
        "--confirm",
        forged.confirmToken,
      ]);

      expect(failure.code).toBe(4);
      await expect(access(planned.plan.destination)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("returns 4 for stale plans and 5 for an operational lock failure", async () => {
    const staleFixture = await isolatedHome({ duplicateClaudeSessions: true });
    const staleScan = await scanReport(staleFixture);
    const staleSelected = staleScan.harnesses.find(({ harness }) => harness === "claude")
      ?.suggestions[0];
    const stalePlan = await planCandidate(staleFixture, staleSelected?.id);
    await mkdir(join(staleFixture.repo, ".claude"), { recursive: true });
    await writeFile(stalePlan.plan.destination, '{"changed":true}\n');
    expect(
      (
        await runFailure(staleFixture, [
          "apply",
          "--plan",
          stalePlan.plan.path,
          "--confirm",
          stalePlan.confirmToken,
        ])
      ).code,
    ).toBe(4);
    await expect(readFile(stalePlan.plan.destination, "utf8")).resolves.toBe('{"changed":true}\n');

    const lockedFixture = await isolatedHome({ duplicateClaudeSessions: true });
    const lockedScan = await scanReport(lockedFixture);
    const lockedSelected = lockedScan.harnesses.find(({ harness }) => harness === "claude")
      ?.suggestions[0];
    const lockedPlan = await planCandidate(lockedFixture, lockedSelected?.id);
    await mkdir(join(lockedFixture.repo, ".claude"), { recursive: true });
    await writeFile(`${lockedPlan.plan.destination}.moe-smoothing.lock`, "held\n");
    expect(
      (
        await runFailure(lockedFixture, [
          "apply",
          "--plan",
          lockedPlan.plan.path,
          "--confirm",
          lockedPlan.confirmToken,
        ])
      ).code,
    ).toBe(5);
    await expect(access(lockedPlan.plan.destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["missing", "malformed", "hanging"])(
    "classifies a %s Codex validator process as operational exit 5",
    async (failureMode) => {
      const fixture = await isolatedHome({ duplicateClaudeSessions: true });
      const scan = await scanReport(fixture);
      const selected = scan.harnesses.find(({ harness }) => harness === "codex")?.suggestions[0];
      const planned = await planCandidate(fixture, selected?.id);
      if (failureMode === "missing") {
        fixture.env.FAKE_CODEX_MODE = "exec-missing";
      } else {
        fixture.env.FAKE_CODEX_MODE = failureMode === "malformed" ? "exec-malformed" : "exec-hang";
      }

      const failure = await runFailure(fixture, [
        "apply",
        "--plan",
        planned.plan.path,
        "--confirm",
        planned.confirmToken,
      ]);
      expect(failure.code).toBe(5);
      await expect(access(planned.plan.destination)).rejects.toMatchObject({ code: "ENOENT" });
    },
    10_000,
  );

  it("parses boundaries strictly and filters requested harnesses", async () => {
    const fixture = await isolatedHome();
    for (const args of [
      ["scan", "--days", "0"],
      ["scan", "--days", "366"],
      ["scan", "--days"],
      ["scan", "--harness"],
      ["scan", "--days", "30", "--days", "30"],
      ["scan", "--harness", "claude,claude"],
      ["scan", "--harness", "claude", "--harness", "codex"],
      ["scan", "--all", "--all"],
      ["scan", "--json", "--json"],
      ["plan", "--select"],
      ["plan", "--select", "claude-shell-000000000000", "--select", "claude-shell-000000000000"],
      ["apply", "--plan"],
      ["apply", "--confirm"],
    ]) {
      expect((await runFailure(fixture, args)).code).toBe(2);
    }
    for (const days of ["1", "365"]) {
      expect(
        JSON.parse((await runCli(fixture, ["scan", "--days", days, "--json"])).stdout),
      ).toMatchObject({
        windowDays: Number(days),
      });
    }
    const claudeOnly = JSON.parse(
      (await runCli(fixture, ["scan", "--harness", "claude", "--json"])).stdout,
    );
    const codexOnly = JSON.parse(
      (await runCli(fixture, ["scan", "--harness", "codex", "--json"])).stdout,
    );
    expect(claudeOnly.harnesses.map(({ harness }: { harness: string }) => harness)).toEqual([
      "claude",
    ]);
    expect(codexOnly.harnesses.map(({ harness }: { harness: string }) => harness)).toEqual([
      "codex",
    ]);
  });

  it("caps the default report while plan resolves an ID visible only through --all", async () => {
    const fixture = await isolatedHome({
      duplicateClaudeSessions: true,
      manyClaudeCandidates: true,
    });
    const capped = JSON.parse((await runCli(fixture, ["scan", "--json"])).stdout);
    const uncapped = await scanReport(fixture);
    const cappedClaude = capped.harnesses.find(
      ({ harness }: { harness: string }) => harness === "claude",
    ).suggestions;
    const uncappedClaude =
      uncapped.harnesses.find(({ harness }) => harness === "claude")?.suggestions ?? [];
    expect(cappedClaude.length).toBeLessThanOrEqual(10);
    const perClass = new Map<string, number>();
    for (const candidate of cappedClaude as Array<{ class: string }>) {
      perClass.set(candidate.class, (perClass.get(candidate.class) ?? 0) + 1);
    }
    expect([...perClass.values()].every((count) => count <= 5)).toBe(true);
    expect(uncappedClaude.length).toBeGreaterThan(10);
    const hidden = uncappedClaude.find(
      ({ id }) => !cappedClaude.some((candidate: { id: string }) => candidate.id === id),
    );
    expect(hidden).toBeDefined();
    await expect(planCandidate(fixture, hidden?.id)).resolves.toMatchObject({
      plan: { harness: "claude" },
    });
  });

  it("binds each ruleId while applying more than one Codex rule", async () => {
    const fixture = await isolatedHome({ codexMultiple: true });
    const scan = await scanReport(fixture);
    const selected = scan.harnesses.find(({ harness }) => harness === "codex")?.suggestions ?? [];
    expect(selected).toHaveLength(2);
    const planned = await planCandidate(fixture, selected.map(({ id }) => id).join(","));

    await runCli(fixture, [
      "apply",
      "--plan",
      planned.plan.path,
      "--confirm",
      planned.confirmToken,
    ]);

    const applied = await readFile(planned.plan.destination, "utf8");
    for (const candidate of selected) expect(applied).toContain(`# moe-smoothing:${candidate.id}`);
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

async function isolatedHome({
  codexGlobal = false,
  codexMultiple = false,
  duplicateClaudeSessions = false,
  manyClaudeCandidates = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "moe-smoothing-e2e-"));
  const home = join(root, "home");
  const claudeConfig = join(home, "claude-config");
  const codexHome = join(home, "codex-home");
  const repo = join(root, "repo");
  const repoB = join(root, "repo-b");
  const bin = join(root, "bin");
  await Promise.all([
    mkdir(join(claudeConfig, "projects"), { recursive: true }),
    mkdir(join(codexHome, "sessions"), { recursive: true }),
    mkdir(join(repo, "src"), { recursive: true }),
    mkdir(join(repoB, "src"), { recursive: true }),
    mkdir(bin, { recursive: true }),
  ]);

  const [claudeSource, codexCurrent, codexLegacy] = await Promise.all([
    readFile(claudeFixture, "utf8"),
    readFile(codexCurrentFixture, "utf8"),
    readFile(codexLegacyFixture, "utf8"),
  ]);
  const atRepo = (value: string, destination = repo) =>
    makeCurrent(value.replaceAll("/fixture/repo-a", destination));
  await writeFile(join(claudeConfig, "projects", "root-a.jsonl"), atRepo(claudeSource));
  if (duplicateClaudeSessions) {
    await writeFile(
      join(claudeConfig, "projects", "root-b.jsonl"),
      atRepo(claudeSource).replaceAll("root-a", "root-b"),
    );
  }
  if (manyClaudeCandidates) {
    for (let index = 0; index < 12; index += 1) {
      const command = `git diff --name-only file-${index}.txt`;
      const source = atRepo(claudeSource).replaceAll("git status", command);
      await writeFile(join(claudeConfig, "projects", `many-a-${index}.jsonl`), source);
      await writeFile(
        join(claudeConfig, "projects", `many-b-${index}.jsonl`),
        source.replaceAll("root-a", "root-b"),
      );
    }
  }
  await writeFile(join(codexHome, "sessions", "current.jsonl"), atRepo(codexCurrent));
  await writeFile(
    join(codexHome, "sessions", "legacy.jsonl"),
    atRepo(codexLegacy, codexGlobal ? repoB : repo),
  );
  if (codexMultiple) {
    const addSource = atRepo(codexCurrent)
      .replaceAll("codex-root-a", "codex-root-c")
      .replaceAll("git status", "git add src/index.ts");
    await writeFile(join(codexHome, "sessions", "add-c.jsonl"), addSource);
    await writeFile(
      join(codexHome, "sessions", "add-d.jsonl"),
      addSource.replaceAll("codex-root-c", "codex-root-d"),
    );
  }
  await Promise.all([
    writeFile(join(claudeConfig, "settings.json"), '{"permissions":{"allow":[]}}\n'),
    writeFile(join(repo, "src", "index.ts"), "export const fixture = true;\n"),
    writeFile(join(repoB, "src", "index.ts"), "export const fixture = true;\n"),
  ]);

  const fakeCodex = join(bin, "codex");
  await writeFile(fakeCodex, fakeCodexSource());
  await chmod(fakeCodex, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: claudeConfig,
    CODEX_HOME: codexHome,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  };
  return { root, home, claudeConfig, codexHome, repo, repoB, fakeCodex, env };
}

function makeCurrent(contents: string) {
  const fixtureEpoch = Date.parse("2026-09-01T00:00:00.000Z");
  const currentEpoch = Date.now() - 86_400_000;
  return contents.replace(/2026-09-[0-9]{2}T[0-9:.]+Z/g, (timestamp) =>
    new Date(currentEpoch + Date.parse(timestamp) - fixtureEpoch).toISOString(),
  );
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
        process.stdout.write(JSON.stringify({ id: 1, result: {
          userAgent: "codex_cli_rs/0.1.0",
          codexHome: process.env.CODEX_HOME,
          platformFamily: "unix",
          platformOs: "macos"
        } }) + "\\n");
      } else if (request.method === "initialized") {
        continue;
      } else if (request.id === 2) {
        process.stdout.write(JSON.stringify({ id: 2, result: { config: {}, origins: {}, layers: [
          {
            name: { type: "user", file: process.env.CODEX_HOME + "/config.toml", profile: null },
            version: "sha256:${"a".repeat(64)}",
            config: {}
          },
          {
            name: { type: "project", dotCodexFolder: process.cwd() + "/.codex" },
            version: "sha256:${"b".repeat(64)}",
            config: {}
          }
        ] } }) + "\\n");
      }
    }
  });
} else if (process.argv[2] === "execpolicy" && process.argv[3] === "check") {
  if (process.env.FAKE_CODEX_MODE === "exec-missing") {
    process.stderr.write("execpolicy unavailable\\n");
    process.exit(127);
  }
  if (process.env.FAKE_CODEX_MODE === "exec-malformed") {
    process.stdout.write("not-json");
    process.exit(0);
  }
  if (process.env.FAKE_CODEX_MODE === "exec-hang") {
    setInterval(() => {}, 1000);
  }
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
      suggestions: Array<{ id: string; rule: string; scope: string }>;
    }>;
  };
}

async function planCandidate(fixture: IsolatedFixture, id: string | undefined) {
  return JSON.parse(
    (await runCli(fixture, ["plan", "--select", id ?? "missing", "--json"])).stdout,
  ) as {
    confirmToken: string;
    plan: { path: string; harness: string; destination: string };
  };
}

async function forgePlan(
  path: string,
  mutate: (stored: {
    version: number;
    harness: string;
    destination: string;
    source: { exists: boolean; sha256: string | null };
    mutation: { operation: string };
    selected: Array<{ id: string; rule: string }>;
    restartRequired: boolean;
    intentSha256: string;
  }) => {
    version: number;
    harness: string;
    destination: string;
    source: { exists: boolean; sha256: string | null };
    mutation: { operation: string };
    selected: Array<{ id: string; rule: string }>;
    restartRequired: boolean;
    intentSha256: string;
  },
) {
  const stored = mutate(JSON.parse(await readFile(path, "utf8")));
  const intent = {
    version: stored.version,
    harness: stored.harness,
    destination: stored.destination,
    source: stored.source,
    mutation: stored.mutation,
    selected: stored.selected,
    restartRequired: stored.restartRequired,
  };
  stored.intentSha256 = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`);
  return { confirmToken: `apply:${stored.harness}:${stored.intentSha256}` };
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
