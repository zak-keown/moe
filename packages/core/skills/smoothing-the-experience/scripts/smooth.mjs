#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rmdir,
  stat,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import {
  classifyClaudePermission,
  discoverClaude,
  loadClaudePermissions,
  readClaudeSession,
  renderClaudeSettings,
} from "./lib/harnesses/claude.mjs";
import {
  discoverCodex,
  readCodexConfigLayers,
  readCodexSessions,
  renderCodexRules,
  validateCodexReplacement,
} from "./lib/harnesses/codex.mjs";
import { discoverHarnesses } from "./lib/discovery.mjs";
import {
  applyBoundPlan,
  createBoundPlan,
  formatUnifiedDiff,
  readBoundPlan,
} from "./lib/mutation.mjs";
import { buildCandidates } from "./lib/rank.mjs";

const USAGE = `Usage:
  smooth.mjs scan [--days N] [--harness claude,codex] [--all] [--json]
  smooth.mjs plan --select <id,...> [--json]
  smooth.mjs apply --plan <path> --confirm <token>`;
const SUPPORTED_HARNESSES = ["claude", "codex"];
const EVIDENCE_CLASSES = ["shell", "filesystem", "network", "mcp"];
const EMPTY_CLAUDE_PERMISSIONS = { deny: [], ask: [], allow: [] };

async function scanVerb(args) {
  const report = await scan({
    days: args.days,
    harnesses: args.harnesses,
    all: args.all,
  });
  emitScan(report, args.json);
}

async function planVerb(args) {
  const report = await scan({ days: 30, harnesses: SUPPORTED_HARNESSES, all: true });
  const selectable = report.harnesses.flatMap((entry) => entry.suggestions);
  const byId = new Map(selectable.map((candidate) => [candidate.id, candidate]));
  const selected = args.select.map((id) => byId.get(id));
  if (selected.some((candidate) => candidate === undefined)) {
    throw new CliError(3, "one or more selected permission IDs are not currently selectable");
  }
  const harnesses = new Set(selected.map(({ harness }) => harness));
  if (harnesses.size !== 1) throw usageError("selected permissions must belong to one harness");
  const destinations = new Set(selected.map(({ destination }) => destination));
  if (destinations.size !== 1) {
    throw usageError("selected permissions must share one destination");
  }

  const harness = selected[0].harness;
  const destination = selected[0].destination;
  let sourceBytes;
  let replacement;
  let plan;
  try {
    sourceBytes = await readOptional(destination);
    const sourceText = sourceBytes === null ? (harness === "claude" ? "{}\n" : "") : decode(sourceBytes);
    replacement = harness === "claude"
      ? renderClaudeSettings(sourceText, selected.map(({ rule }) => rule))
      : renderCodexRules(sourceText, selected.map(({ id, rule }) => ({ id, rule })));
    const planDir = await mkdtemp(join(tmpdir(), "moe-smoothing-"));
    plan = await createBoundPlan({
      harness,
      selected: selected.map(({ id, rule }) => ({ id, rule })),
      destination,
      sourceBytes,
      replacement,
      planDir,
    });
  } catch {
    throw new CliError(5, "could not create the permission plan");
  }
  const diff = formatUnifiedDiff({ destination, sourceBytes, replacement });
  const confirmToken = `apply:${plan.harness}:${plan.replacementSha256}`;
  const output = {
    plan: {
      path: plan.path,
      mode: "0600",
      harness: plan.harness,
      destination: plan.destination,
      replacementSha256: plan.replacementSha256,
      restartRequired: plan.restartRequired,
    },
    diff,
    confirmToken,
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    process.stdout.write(
      [
        `Plan: ${output.plan.path}`,
        `Harness: ${output.plan.harness}`,
        `Destination: ${output.plan.destination}`,
        `Mode: ${output.plan.mode}`,
        `Restart required: ${output.plan.restartRequired ? "yes" : "no"}`,
        "Diff:",
        output.diff.trimEnd(),
        `Confirm: ${output.confirmToken}`,
        "",
      ].join("\n"),
    );
  }
}

async function applyVerb(args) {
  let plan;
  try {
    plan = await readBoundPlan(args.plan);
  } catch {
    throw new CliError(4, "the permission plan is missing or invalid");
  }
  const expectedToken = `apply:${plan.harness}:${plan.replacementSha256}`;
  if (args.confirm !== expectedToken) {
    throw new CliError(4, "confirmation does not match the permission plan");
  }

  const validateReplacement = plan.harness === "claude"
    ? async (replacement) => validateClaudeReplacement(plan, replacement)
    : async (replacement) => validateCodexReplacementForPlan(plan, replacement);
  let result;
  try {
    result = await applyBoundPlan({
      planPath: args.plan,
      expectedHarness: plan.harness,
      confirmToken: args.confirm,
      validateReplacement,
    });
  } catch (error) {
    if (error instanceof InvalidPlanError || /stale source config/.test(error?.message ?? "")) {
      throw new CliError(4, "the permission plan is stale or invalid");
    }
    throw new CliError(5, `the ${plan.harness} permission file could not be written`);
  }
  process.stdout.write(
    `${JSON.stringify({ harness: plan.harness, ...result, restartRequired: plan.restartRequired })}\n`,
  );
}

async function scan({ days, harnesses, all }) {
  const env = process.env;
  const homeDir = env.HOME || homedir();
  const cwd = await realpath(process.cwd());
  const discovery = await discoverHarnesses({ env, homeDir, cwd, days });
  const discovered = new Map(discovery.harnesses.map((entry) => [entry.harness, entry]));
  const reports = [];
  for (const harness of SUPPORTED_HARNESSES) {
    if (!harnesses.includes(harness)) continue;
    if (!discovered.has(harness)) {
      reports.push({
        harness,
        status: "not-evaluated",
        reason: "harness sessions were not found",
        suggestions: [],
        dispositions: [],
      });
      continue;
    }
    try {
      reports.push(
        harness === "claude"
          ? await scanClaude({ env, homeDir, cwd, cutoffMs: discovery.cutoffMs, all })
          : await scanCodex({ env, homeDir, cwd, cutoffMs: discovery.cutoffMs, all }),
      );
    } catch {
      reports.push({
        harness,
        status: "blocked",
        reason: "session or permission configuration could not be evaluated safely",
        suggestions: [],
        dispositions: [],
      });
    }
  }
  return { windowDays: days, evidenceClasses: EVIDENCE_CLASSES, harnesses: reports };
}

async function scanClaude({ env, homeDir, cwd, cutoffMs, all }) {
  const configDir = resolve(env.CLAUDE_CONFIG_DIR || join(homeDir, ".claude"));
  const canonicalConfigDir = await realpath(configDir);
  const discovery = await discoverClaude({ env, homeDir, cwd, cutoffMs });
  const evidence = [];
  for (const file of discovery.files) {
    const result = await readClaudeSession(file, {
      cutoffMs,
      resolveProjectRoot,
      realpath,
      effectivePermissions: EMPTY_CLAUDE_PERMISSIONS,
    });
    evidence.push(...result.evidence);
  }

  const permissionStates = new Map();
  for (const projectRoot of new Set(evidence.map((record) => record.projectRoot))) {
    permissionStates.set(
      projectRoot,
      await loadClaudePermissions({
        configDir: canonicalConfigDir,
        projectRoot,
        primaryCwd: projectRoot,
        fsOps: { readFile, realpath },
      }),
    );
  }
  const classifiedEvidence = evidence.map((record) => {
    const state = permissionStates.get(record.projectRoot);
    const permission = classifyClaudePermission(
      { class: record.class, ...record.operation },
      state,
    );
    if (permission === "existing-rule") {
      return { ...record, approvalProvenance: "existing-rule" };
    }
    if (permission === "denied") return { ...record, outcome: "denied" };
    return record;
  });
  const candidateReport = await buildCandidates(classifiedEvidence, {
    all,
    realpath,
    claude: { anchorProven: true, configDir: canonicalConfigDir },
  });
  return harnessReport("claude", classifiedEvidence, candidateReport);
}

async function scanCodex({ env, homeDir, cwd, cutoffMs, all }) {
  const codexHome = resolve(env.CODEX_HOME || join(homeDir, ".codex"));
  const discovery = await discoverCodex({ env, homeDir, cutoffMs });
  if (discovery.status !== "ready") throw new Error("Codex sessions are unavailable");
  const layerState = await readCodexConfigLayers({
    codexBin: "codex",
    cwd,
    spawnProcess: spawn,
  });
  const reader = await readCodexSessions({
    files: discovery.files,
    cutoffMs,
    resolveProjectRoot,
    existingPrefixes: [],
  });
  const globalPrefixes = await readManagedPrefixes(join(codexHome, "rules"));
  const perProject = new Map();
  for (const projectRoot of new Set(reader.evidence.map((record) => record.projectRoot))) {
    perProject.set(
      projectRoot,
      await readManagedPrefixes(join(projectRoot, ".codex", "rules")),
    );
  }
  const evidence = reader.evidence.map((record) =>
    record.class === "shell" &&
      matchesAnyPrefix(record.operation, [
        ...globalPrefixes,
        ...(perProject.get(record.projectRoot) ?? []),
      ])
      ? { ...record, approvalProvenance: "existing-rule" }
      : record,
  );
  const candidateReport = await buildCandidates(evidence, {
    all,
    realpath,
    codex: { codexHome, layerState },
  });
  return harnessReport("codex", evidence, candidateReport);
}

function harnessReport(harness, evidence, candidateReport) {
  const counts = Object.fromEntries(
    EVIDENCE_CLASSES.map((evidenceClass) => [
      evidenceClass,
      evidence.filter((record) => record.class === evidenceClass).length,
    ]),
  );
  return {
    harness,
    status: "ready",
    evidenceCounts: counts,
    suggestions: candidateReport.suggestions.map(publicCandidate),
    dispositions: candidateReport.dispositions,
  };
}

function publicCandidate(candidate) {
  return {
    id: candidate.id,
    harness: candidate.harness,
    class: candidate.class,
    scope: candidate.scope,
    destination: candidate.destination,
    rule: candidate.rule,
    rootSessionCount: candidate.rootSessionCount,
    projectCount: candidate.projectCount,
    successfulObservationCount: candidate.successfulObservationCount,
    lastSeen: candidate.lastSeen,
    approvalProvenance: candidate.approvalProvenance,
    confidence: candidate.confidence,
    reason: candidate.reason,
    restartRequired: candidate.restartRequired,
  };
}

function emitScan(report, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  const lines = [
    `Evidence classes: ${report.evidenceClasses.join(", ")}`,
    `Window: ${report.windowDays} days`,
  ];
  for (const entry of report.harnesses) {
    lines.push("", `${entry.harness}: ${entry.status}`);
    if (entry.reason) lines.push(`Reason: ${entry.reason}`);
    for (const candidate of entry.suggestions) {
      lines.push(
        `ID: ${candidate.id}`,
        `Scope: ${candidate.scope}`,
        `Destination: ${candidate.destination}`,
        `Rule: ${candidate.rule.trimEnd()}`,
        `Evidence class: ${candidate.class}`,
        `Root sessions: ${candidate.rootSessionCount}`,
        `Projects: ${candidate.projectCount}`,
        `Last seen: ${candidate.lastSeen}`,
        `Confidence: ${candidate.confidence}`,
        `Approval provenance: ${candidate.approvalProvenance}`,
        `Safety reason: ${candidate.reason}`,
        `Restart required: ${candidate.restartRequired ? "yes" : "no"}`,
        "",
      );
    }
    lines.push("Dispositions:");
    if (entry.dispositions.length === 0) lines.push("  none");
    for (const disposition of entry.dispositions) {
      lines.push(
        `  ${disposition.class}/${disposition.scope}: ${disposition.disposition}`,
      );
    }
  }
  process.stdout.write(`${lines.join("\n").trimEnd()}\n`);
}

function parseScanArgs(argv) {
  let days = 30;
  let harnesses = SUPPORTED_HARNESSES;
  let all = false;
  let json = false;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--days", "--harness", "--all", "--json"].includes(option) || seen.has(option)) {
      throw usageError("invalid scan arguments");
    }
    seen.add(option);
    if (option === "--days") {
      const value = argv[++index];
      if (!/^[1-9][0-9]*$/.test(value ?? "")) throw usageError("days must be an integer");
      days = Number(value);
      if (days > 365) throw usageError("days must be from 1 to 365");
    } else if (option === "--harness") {
      const value = argv[++index];
      harnesses = value?.split(",") ?? [];
      if (
        harnesses.length === 0 ||
        new Set(harnesses).size !== harnesses.length ||
        harnesses.some((harness) => !SUPPORTED_HARNESSES.includes(harness))
      ) {
        throw usageError("harness must be claude, codex, or both");
      }
    } else if (option === "--all") all = true;
    else json = true;
  }
  return { days, harnesses, all, json };
}

function parsePlanArgs(argv) {
  let select;
  let json = false;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--select", "--json"].includes(option) || seen.has(option)) {
      throw usageError("invalid plan arguments");
    }
    seen.add(option);
    if (option === "--select") select = argv[++index];
    else json = true;
  }
  if (!select) throw usageError("plan requires individual permission IDs");
  const ids = select.split(",");
  if (
    ids.length === 0 ||
    ids.some(
      (id) =>
        !/^(?:claude|codex)-(?:shell|filesystem|network|mcp)-[0-9a-f]{12}$/.test(id),
    ) ||
    new Set(ids).size !== ids.length
  ) {
    throw usageError("plan requires unique individual permission IDs");
  }
  return { select: ids, json };
}

function parseApplyArgs(argv) {
  let plan;
  let confirm;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--plan", "--confirm"].includes(option) || seen.has(option)) {
      throw usageError("invalid apply arguments");
    }
    seen.add(option);
    if (option === "--plan") plan = argv[++index];
    else confirm = argv[++index];
  }
  if (!plan || !confirm) throw usageError("apply requires a plan and its exact confirmation");
  return { plan: resolve(plan), confirm };
}

async function resolveProjectRoot(cwd) {
  let current = await realpath(cwd);
  const fallback = current;
  while (true) {
    try {
      await stat(join(current, ".git"));
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return fallback;
    current = parent;
  }
}

async function readManagedPrefixes(rulesDir) {
  let names;
  try {
    names = await readdir(rulesDir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const prefixes = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".rules") || name.includes("/") || name.includes("\\")) continue;
    const contents = await readFile(join(rulesDir, name), "utf8");
    for (const match of contents.matchAll(
      /# moe-smoothing:[^\n]+\nprefix_rule\(\n    pattern = \[([^\]]+)\],/g,
    )) {
      const tokens = [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((token) =>
        JSON.parse(`"${token[1]}"`),
      );
      if (tokens.length > 0 && tokens.every((token) => typeof token === "string")) {
        prefixes.push(tokens);
      }
    }
  }
  return prefixes;
}

function matchesAnyPrefix(operation, prefixes) {
  const argv = Array.isArray(operation?.argv)
    ? operation.argv
    : typeof operation?.command === "string" &&
        operation.command.length > 0 &&
        !/[;|&$><`\\"']/.test(operation.command)
      ? operation.command.split(/\s+/)
      : null;
  return argv && prefixes.some((prefix) => prefix.every((token, index) => argv[index] === token));
}

async function validateClaudeReplacement(plan, replacement) {
  const sourceBytes = await readOptional(plan.destination);
  const sourceText = sourceBytes === null ? "{}\n" : decode(sourceBytes);
  let expected;
  try {
    expected = renderClaudeSettings(
      sourceText,
      plan.selected.map(({ rule }) => rule),
    );
  } catch {
    throw new InvalidPlanError();
  }
  if (replacement !== expected) throw new InvalidPlanError();
  let settings;
  try {
    settings = JSON.parse(replacement);
  } catch {
    throw new InvalidPlanError();
  }
  if (!isPlainObject(settings) || !isPlainObject(settings.permissions)) {
    throw new InvalidPlanError();
  }
  for (const kind of ["deny", "ask", "allow"]) {
    const rules = settings.permissions[kind];
    if (rules !== undefined && (!Array.isArray(rules) || !rules.every(isString))) {
      throw new InvalidPlanError();
    }
  }
  const allow = settings.permissions.allow;
  if (
    !Array.isArray(allow) ||
    plan.selected.some(
      ({ rule }) => rule.startsWith("Write(") || allow.filter((entry) => entry === rule).length !== 1,
    )
  ) {
    throw new InvalidPlanError();
  }
  return true;
}

async function validateCodexReplacementForPlan(plan, replacement) {
  const sourceBytes = await readOptional(plan.destination);
  const sourceText = sourceBytes === null ? "" : decode(sourceBytes);
  let expected;
  try {
    expected = renderCodexRules(sourceText, plan.selected);
  } catch {
    throw new InvalidPlanError();
  }
  if (replacement !== expected) throw new InvalidPlanError();
  const witnesses = plan.selected.flatMap(({ id, rule }) => {
    const pattern = parseCodexPattern(id, rule);
    return [
      { ruleId: id, argv: pattern, expectation: "match" },
      {
        ruleId: id,
        argv: [pattern[0], "moe-smoothing-negative"],
        expectation: "not_match",
      },
    ];
  });
  const tempDir = await mkdtemp(join(tmpdir(), "moe-smoothing-validation-"));
  try {
    const ruleFiles = await activeCodexRuleFiles(plan.destination);
    await validateCodexReplacement({
      contents: replacement,
      ruleFiles,
      witnesses,
      codexBin: "codex",
      tempDir,
    });
  } catch {
    throw new InvalidPlanError();
  } finally {
    try {
      await rmdir(tempDir);
    } catch {
      // The validator owns its temporary children and reports cleanup failures.
    }
  }
  return true;
}

async function activeCodexRuleFiles(destination) {
  const homeDir = process.env.HOME || homedir();
  const codexHome = resolve(process.env.CODEX_HOME || join(homeDir, ".codex"));
  const projectRoot = await resolveProjectRoot(process.cwd());
  const directories = new Set([
    dirname(destination),
    join(codexHome, "rules"),
    join(projectRoot, ".codex", "rules"),
  ]);
  const paths = [];
  for (const directory of directories) paths.push(...(await listRuleFiles(directory)));
  return [...new Set(paths)].filter((path) => path !== destination).sort();
}

function parseCodexPattern(id, rule) {
  if (!rule.startsWith(`# moe-smoothing:${id}\n`)) throw new InvalidPlanError();
  const match = /pattern = \[([^\]]+)\],/.exec(rule);
  if (!match) throw new InvalidPlanError();
  try {
    const tokens = [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((token) =>
      JSON.parse(`"${token[1]}"`),
    );
    if (tokens.length < 2 || !tokens.every(isString)) throw new Error();
    return tokens;
  } catch {
    throw new InvalidPlanError();
  }
}

async function listRuleFiles(rulesDir) {
  let names;
  try {
    names = await readdir(rulesDir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.endsWith(".rules") && !name.includes("/") && !name.includes("\\"))
    .sort()
    .map((name) => join(rulesDir, name));
}

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function decode(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string";
}

function usageError(message) {
  return new CliError(2, message, true);
}

function publicFailure(error) {
  if (error instanceof CliError) return error;
  return new CliError(5, "the smoothing operation could not be completed");
}

class CliError extends Error {
  constructor(code, message, usage = false) {
    super(message);
    this.code = code;
    this.usage = usage;
  }
}

class InvalidPlanError extends Error {}

const [verb, ...argv] = process.argv.slice(2);
try {
  if (verb === "scan") await scanVerb(parseScanArgs(argv));
  else if (verb === "plan") await planVerb(parsePlanArgs(argv));
  else if (verb === "apply") await applyVerb(parseApplyArgs(argv));
  else throw usageError("choose scan, plan, or apply");
} catch (error) {
  const failure = publicFailure(error);
  process.stderr.write(`${failure.message}\n${failure.usage ? `${USAGE}\n` : ""}`);
  process.exitCode = failure.code;
}
