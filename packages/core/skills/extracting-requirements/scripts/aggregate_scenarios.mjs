import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function pythonEqual(left, right) {
  if (left === right) return true;
  if (
    (typeof left === "boolean" && typeof right === "number") ||
    (typeof left === "number" && typeof right === "boolean")
  ) {
    return Number(left) === Number(right);
  }
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

export function loadScenarios(paths) {
  const scenarios = [];
  for (const path of paths) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(data)) scenarios.push(...data);
    else if (data && typeof data === "object" && Array.isArray(data.scenarios)) {
      scenarios.push(...data.scenarios);
    }
  }
  return scenarios;
}

export function loadStoryTitleToId(storiesDirectory) {
  const titleMap = new Map();
  const epicFiles = readdirSync(storiesDirectory)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort();

  for (const name of epicFiles) {
    let currentId;
    for (const line of readFileSync(join(storiesDirectory, name), "utf8").split(/\r?\n/)) {
      const idMatch = line.match(/^## (STORY-\d+)/);
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
    } else if (arg === "-h" || arg === "--help") {
      return { help: true };
    } else if (arg === "-o" || arg === "--output") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-")) {
        return { error: "argument -o/--output: expected one argument" };
      }
      output = value;
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg.startsWith("-o") && arg.length > 2) {
      output = arg.slice(2);
    } else if (arg === "--stories-dir") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-")) {
        return { error: "argument --stories-dir: expected one argument" };
      }
      storiesDirectory = value;
    } else if (arg.startsWith("--stories-dir=")) {
      storiesDirectory = arg.slice("--stories-dir=".length);
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
  for (const path of options.jsonFiles) {
    if (!existsSync(path)) {
      process.stderr.write(`error: file not found: ${path}\n`);
      return 2;
    }
  }
  if (!existsSync(options.storiesDirectory) || !statSync(options.storiesDirectory).isDirectory()) {
    process.stderr.write(`error: stories directory not found: ${options.storiesDirectory}\n`);
    return 2;
  }

  let scenarios;
  try {
    scenarios = loadScenarios(options.jsonFiles);
  } catch (error) {
    const path = options.jsonFiles.find((candidate) => {
      try {
        JSON.parse(readFileSync(candidate, "utf8"));
        return false;
      } catch {
        return true;
      }
    });
    process.stderr.write(`error: invalid JSON in ${path}: ${error.message}\n`);
    return 1;
  }
  if (scenarios.length === 0) {
    process.stderr.write("warning: no scenarios found in input files\n");
    writeFileSync(options.output, "# Behavior Scenarios\n\nNo scenarios extracted.\n");
    return 0;
  }

  const deduped = dedupScenarios(scenarios);
  assignIds(deduped);
  resolveStoryRefs(deduped, loadStoryTitleToId(options.storiesDirectory));
  const document = formatScenarioDocument(deduped);
  writeFileSync(options.output, document.content);
  process.stdout.write(
    `OK: ${document.journeys} journey scenarios, ${document.surfaces} surface scenarios\n`,
  );
  return 0;
}

const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = await main(process.argv.slice(2));
