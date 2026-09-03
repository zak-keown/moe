import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

class JsonInteger {
  constructor(source) {
    this.value = BigInt(source);
  }

  toString() {
    return this.value.toString();
  }
}

function parseJsonLosslessly(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (
      typeof value === "number" &&
      context?.source &&
      !context.source.includes(".") &&
      !context.source.includes("e") &&
      !context.source.includes("E") &&
      !Number.isSafeInteger(value)
    ) {
      return new JsonInteger(context.source);
    }
    return value;
  });
}

function pythonEqual(left, right) {
  if (left instanceof JsonInteger || right instanceof JsonInteger) {
    if (left instanceof JsonInteger && right instanceof JsonInteger) {
      return left.value === right.value;
    }
    const integer = left instanceof JsonInteger ? left : right;
    const number = left instanceof JsonInteger ? right : left;
    return typeof number === "number" && Number.isInteger(number) && integer.value === BigInt(number);
  }
  if (typeof left === "boolean" || typeof right === "boolean") return left === right;
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => pythonEqual(value, right[index]))
    );
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) => Object.hasOwn(right, key) && pythonEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

function pathParts(path, separatorPattern) {
  return path.split(separatorPattern).filter((part) => part && part !== ".");
}

function normalizeWindowsPathSpelling(path) {
  const windowsPath = path.replaceAll("/", "\\");
  const unc = windowsPath.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\|$)/);
  if (unc) {
    const root = `\\\\${unc[1]}\\${unc[2]}\\`;
    const parts = pathParts(windowsPath.slice(unc[0].length), /\\+/);
    return parts.length > 0 ? `${root}${parts.join("\\")}` : root;
  }
  const drive = windowsPath.match(/^([A-Za-z]:)(\\?)/);
  if (drive) {
    const rooted = drive[2] === "\\";
    const parts = pathParts(windowsPath.slice(drive[1].length + (rooted ? 1 : 0)), /\\+/);
    if (rooted) return parts.length > 0 ? `${drive[1]}\\${parts.join("\\")}` : `${drive[1]}\\`;
    return parts.length > 0 ? `${drive[1]}${parts.join("\\")}` : drive[1];
  }
  const rooted = windowsPath.startsWith("\\");
  const parts = pathParts(windowsPath.slice(rooted ? 1 : 0), /\\+/);
  if (rooted) return parts.length > 0 ? `\\${parts.join("\\")}` : "\\";
  return parts.length > 0 ? parts.join("\\") : ".";
}

function normalizePathSpelling(path) {
  if (sep === "\\") return normalizeWindowsPathSpelling(path);
  const doubleSlashRoot = path.startsWith("//") && !path.startsWith("///");
  const root = doubleSlashRoot ? "//" : path.startsWith("/") ? "/" : "";
  const parts = pathParts(path, /\/+/);
  if (root) return parts.length > 0 ? `${root}${parts.join("/")}` : root;
  return parts.length > 0 ? parts.join("/") : ".";
}

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function loadScenarios(paths) {
  const scenarios = [];
  for (const path of paths) {
    let data;
    try {
      data = parseJsonLosslessly(readFileSync(path, "utf8"));
    } catch (error) {
      error.invalidJsonPath = path;
      throw error;
    }
    if (Array.isArray(data)) scenarios.push(...data);
    else if (data && typeof data === "object" && Object.hasOwn(data, "scenarios")) {
      if (Array.isArray(data.scenarios) || typeof data.scenarios === "string") {
        scenarios.push(...data.scenarios);
      } else {
        throw new TypeError("scenarios is not iterable");
      }
    }
  }
  return scenarios;
}

export function loadStoryTitleToId(storiesDirectory) {
  const titleMap = new Map();
  const epicFiles = readdirSync(storiesDirectory)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort(compareCodePoints);

  for (const name of epicFiles) {
    let currentId;
    for (const line of readFileSync(join(storiesDirectory, name), "utf8").split(/\r?\n/)) {
      const idMatch = line.match(/^## (STORY-\p{Nd}+)/u);
      if (idMatch) currentId = idMatch[1];
      const titleMatch = line.match(/^\*\*Title:\*\* (.+)/);
      if (titleMatch && currentId) {
        titleMap.set(titleMatch[1].trim(), currentId);
        currentId = undefined;
      }
    }
  }
  return titleMap;
}

export function dedupScenarios(scenarios) {
  const seen = new Map();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      throw new TypeError("scenario is not an object");
    }
    const title = (scenario.title ?? "").trim();
    const existing = seen.get(title);
    if (!existing) {
      seen.set(title, {
        ...scenario,
        ...(scenario.owning_story_titles
          ? { owning_story_titles: [...scenario.owning_story_titles] }
          : {}),
        ...(scenario.sources ? { sources: [...scenario.sources] } : {}),
      });
      continue;
    }

    for (const owner of scenario.owning_story_titles ?? []) {
      const owners = existing.owning_story_titles ?? [];
      if (!owners.some((value) => pythonEqual(value, owner))) {
        if (!existing.owning_story_titles) existing.owning_story_titles = [];
        existing.owning_story_titles.push(owner);
      }
    }
    for (const source of scenario.sources ?? []) {
      const sources = existing.sources ?? [];
      if (!sources.some((value) => pythonEqual(value, source))) {
        if (!existing.sources) existing.sources = [];
        existing.sources.push(source);
      }
    }
  }
  return [...seen.values()];
}

export function assignIds(scenarios) {
  let scenarioCounter = 1;
  let journeyCounter = 1;
  for (const scenario of scenarios) {
    if (scenario.kind === "journey") {
      scenario._id = `JOURNEY-${String(journeyCounter).padStart(4, "0")}`;
      journeyCounter += 1;
    } else {
      scenario._id = `SCENARIO-${String(scenarioCounter).padStart(4, "0")}`;
      scenarioCounter += 1;
    }
  }
}

export function resolveStoryRefs(scenarios, titleMap) {
  for (const scenario of scenarios) {
    scenario._owning_stories = (scenario.owning_story_titles ?? []).map((title) => {
      const storyId = titleMap.get(title.trim());
      return storyId ?? `UNRESOLVED(${title})`;
    });
  }
}

export function formatScenario(scenario) {
  const lines = [];
  const kind = scenario.kind ?? "surface";
  lines.push(`## ${scenario._id} — ${scenario.title ?? "Untitled"}`);
  lines.push("");
  if (kind === "journey") {
    lines.push("**Kind:** journey");
    lines.push("**Proof seam:** e2e");
  } else {
    lines.push(`**Kind:** ${kind}`);
    lines.push(`**Proof seam:** ${scenario.proof_seam ?? "unknown"}`);
  }
  lines.push(`**Owning stories:** ${(scenario._owning_stories ?? []).join(", ")}`);
  lines.push("");
  lines.push("**Preconditions:**");
  for (const precondition of scenario.preconditions ?? []) lines.push(`- ${precondition}`);
  lines.push("");

  if (kind === "journey") {
    lines.push("**Steps:**");
    for (const [index, step] of (scenario.steps ?? []).entries()) {
      lines.push(`${index + 1}. ${step.action ?? ""}`);
      for (const expected of step.expected ?? []) lines.push(`   → ${expected}`);
    }
    lines.push("");
    lines.push("**Final observables:**");
    for (const observable of scenario.final_observables ?? []) lines.push(`- ${observable}`);
  } else {
    lines.push("**Action:**");
    for (const step of scenario.steps ?? []) lines.push(`- ${step.action ?? ""}`);
    lines.push("");
    lines.push("**Expected observables:**");
    for (const step of scenario.steps ?? []) {
      for (const expected of step.expected ?? []) lines.push(`- ${expected}`);
    }
    for (const observable of scenario.final_observables ?? []) lines.push(`- ${observable}`);
  }
  lines.push("");
  lines.push("**Automation status:** pending");
  lines.push("**Execution command:** TBD");
  lines.push("");
  lines.push("**Sources:**");
  for (const source of scenario.sources ?? []) {
    if (source && typeof source === "object") {
      const file = source.file ?? "";
      lines.push(source.lines ? `- \`${file}:${source.lines}\`` : `- \`${file}\``);
    } else if (typeof source === "string") lines.push(`- \`${source}\``);
  }
  lines.push("");
  return lines.join("\n");
}

export function formatScenarioDocument(scenarios) {
  const journeys = scenarios.filter((scenario) => scenario.kind === "journey");
  const surfaces = scenarios.filter((scenario) => scenario.kind !== "journey");
  if (journeys.length === 0 && surfaces.length === 0) {
    return {
      content: "# Behavior Scenarios\n\nNo scenarios extracted.\n",
      journeys: 0,
      surfaces: 0,
    };
  }
  const lines = ["# Behavior Scenarios", ""];
  if (journeys.length > 0) {
    lines.push("## Journey Scenarios", "");
    for (const scenario of journeys) lines.push(formatScenario(scenario));
  }
  if (surfaces.length > 0) {
    lines.push("## Surface Scenarios", "");
    for (const scenario of surfaces) lines.push(formatScenario(scenario));
  }
  return { content: lines.join("\n"), journeys: journeys.length, surfaces: surfaces.length };
}

function usage(program) {
  return (
    `usage: ${program} [-h] -o OUTPUT --stories-dir STORIES_DIR\n` +
    "                               json_files [json_files ...]\n"
  );
}

function help(program) {
  return [
    usage(program).trimEnd(),
    "",
    "Aggregate scenarios into behavior-scenarios.md",
    "",
    "positional arguments:",
    "  json_files            Extracted scenario JSON files",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  -o, --output OUTPUT   Output file path",
    "  --stories-dir STORIES_DIR",
    "                        Requirements directory for resolving story title -> ID",
    "",
  ].join("\n");
}

function parseArgs(args) {
  let output;
  let storiesDirectory;
  let optionsEnded = false;
  const jsonFiles = [];
  const unrecognized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (optionsEnded) {
      jsonFiles.push(arg);
      continue;
    }
    if (arg === "--") {
      optionsEnded = true;
    } else if (arg === "-h" || (arg.startsWith("--") && "--help".startsWith(arg))) {
      return { help: true };
    } else if (
      arg === "-o" ||
      (arg.startsWith("--") && !arg.includes("=") && "--output".startsWith(arg))
    ) {
      const value = args[++index];
      if (value === undefined || (value !== "-" && value.startsWith("-"))) {
        return { error: "argument -o/--output: expected one argument" };
      }
      output = value;
    } else if (
      arg.startsWith("--") &&
      arg.includes("=") &&
      "--output".startsWith(arg.slice(0, arg.indexOf("=")))
    ) {
      output = arg.slice(arg.indexOf("=") + 1);
    } else if (arg.startsWith("-o") && arg.length > 2) {
      output = arg.slice(2);
    } else if (
      arg.startsWith("--") &&
      !arg.includes("=") &&
      "--stories-dir".startsWith(arg)
    ) {
      const value = args[++index];
      if (value === undefined || (value !== "-" && value.startsWith("-"))) {
        return { error: "argument --stories-dir: expected one argument" };
      }
      storiesDirectory = value;
    } else if (
      arg.startsWith("--") &&
      arg.includes("=") &&
      "--stories-dir".startsWith(arg.slice(0, arg.indexOf("=")))
    ) {
      storiesDirectory = arg.slice(arg.indexOf("=") + 1);
    } else if (arg.startsWith("-")) {
      unrecognized.push(arg);
    } else {
      jsonFiles.push(arg);
    }
  }
  if (unrecognized.length > 0) return { error: `unrecognized arguments: ${unrecognized.join(" ")}` };
  const required = [];
  if (output === undefined) required.push("-o/--output");
  if (storiesDirectory === undefined) required.push("--stories-dir");
  if (jsonFiles.length === 0) required.push("json_files");
  if (required.length > 0) {
    return { error: `the following arguments are required: ${required.join(", ")}` };
  }
  return { output, storiesDirectory, jsonFiles };
}

export async function main(args) {
  const program = basename(process.argv[1] ?? "aggregate_scenarios.mjs");
  const options = parseArgs(args);
  if (options.help) {
    process.stdout.write(help(program));
    return 0;
  }
  if (options.error) {
    process.stderr.write(`${usage(program)}${program}: error: ${options.error}\n`);
    return 2;
  }
  const jsonFiles = options.jsonFiles.map(normalizePathSpelling);
  const storiesDirectory = normalizePathSpelling(options.storiesDirectory);
  const output = normalizePathSpelling(options.output);
  for (const path of jsonFiles) {
    if (!existsSync(path)) {
      process.stderr.write(`error: file not found: ${path}\n`);
      return 2;
    }
  }
  if (!existsSync(storiesDirectory) || !statSync(storiesDirectory).isDirectory()) {
    process.stderr.write(`error: stories directory not found: ${storiesDirectory}\n`);
    return 2;
  }

  let scenarios;
  try {
    scenarios = loadScenarios(jsonFiles);
  } catch (error) {
    if (error.invalidJsonPath) {
      process.stderr.write(`error: invalid JSON in ${error.invalidJsonPath}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  if (scenarios.length === 0) {
    process.stderr.write("warning: no scenarios found in input files\n");
    writeFileSync(output, formatScenarioDocument([]).content);
    return 0;
  }

  const deduped = dedupScenarios(scenarios);
  assignIds(deduped);
  resolveStoryRefs(deduped, loadStoryTitleToId(storiesDirectory));
  const document = formatScenarioDocument(deduped);
  writeFileSync(output, document.content);
  process.stdout.write(
    `OK: ${document.journeys} journey scenarios, ${document.surfaces} surface scenarios\n`,
  );
  return 0;
}

const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = await main(process.argv.slice(2));
