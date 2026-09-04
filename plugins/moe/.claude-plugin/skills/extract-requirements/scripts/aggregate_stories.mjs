import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  compareCodePoints,
  isNegativeNumber,
  isPlainObject,
  JsonInteger,
  parseJsonLosslessly,
  pythonEqual,
} from "./python_compat.mjs";

function stableJson(value) {
  if (value instanceof JsonInteger) return value.value.toString();
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function loadStories(paths, warn = (message) => process.stderr.write(`${message}\n`)) {
  const stories = [];
  for (const path of paths) {
    const data = parseJsonLosslessly(readFileSync(path, "utf8"));
    if (Array.isArray(data)) stories.push(...data);
    else if (data && typeof data === "object" && Array.isArray(data.stories)) {
      stories.push(...data.stories);
    }
    else warn(`warning: ${path} has unexpected format, skipping`);
  }
  return stories;
}

export function storyBodyKey(story) {
  return [
    (story.i_want ?? "").trim(),
    (story.so_that ?? "").trim(),
    stableJson(story.acceptance_criteria ?? []),
  ];
}

export function dedupStories(stories) {
  const seen = new Map();
  let blankTitleCount = 0;

  for (const story of stories) {
    const title = (story.title ?? "").trim();
    const key = title
      ? stableJson([(story.epic_theme ?? "Uncategorized").trim(), title, storyBodyKey(story)])
      : stableJson(["__no_title__", ++blankTitleCount]);

    const existing = seen.get(key);
    if (existing) {
      for (const source of story.sources ?? []) {
        if (!existing.sources.some((candidate) => pythonEqual(candidate, source))) {
          existing.sources.push(source);
        }
      }
    } else {
      seen.set(key, { ...story, sources: [...(story.sources ?? [])] });
    }
  }

  return [...seen.values()];
}

export function groupIntoEpics(stories) {
  const epics = new Map();
  for (const story of stories) {
    const theme = (story.epic_theme ?? "Uncategorized").trim();
    const grouped = epics.get(theme);
    if (grouped) grouped.push(story);
    else epics.set(theme, [story]);
  }
  return epics;
}

export function assignIds(epics) {
  let storyCounter = 1;
  let epicCounter = 1;
  for (const [theme, stories] of epics) {
    const epicId = `EPIC-${String(epicCounter).padStart(3, "0")}`;
    epicCounter += 1;
    for (const story of stories) {
      story._id = `STORY-${String(storyCounter).padStart(4, "0")}`;
      story._epic_id = epicId;
      story._epic_theme = theme;
      storyCounter += 1;
    }
  }
  return epics;
}

export function formatEpicFile(epicId, theme, stories) {
  const lines = [];
  const primarySources = new Set();
  for (const story of stories) {
    for (const source of story.sources ?? []) {
      if (isPlainObject(source)) primarySources.add(source.file ?? "");
      else if (typeof source === "string") primarySources.add(source);
    }
  }

  lines.push(`# ${epicId} — ${theme}`);
  lines.push("");
  lines.push(`**Summary:** ${theme}`);
  lines.push(`**Stories:** ${stories.map((story) => story._id).join(", ")}`);
  if (primarySources.size > 0) {
    const sources = [...primarySources]
      .filter(Boolean)
      .sort((left, right) => compareCodePoints(String(left), String(right)))
      .map((source) => `\`${source}\``)
      .join(", ");
    lines.push(`**Primary sources:** ${sources}`);
  }
  lines.push(`**Status:** 0/${stories.length} done`);
  lines.push("");

  for (const story of stories) {
    lines.push(`## ${story._id}`);
    lines.push("");
    lines.push(`**Epic:** ${story._epic_id} — ${story._epic_theme}`);
    lines.push(`**Title:** ${story.title ?? "Untitled"}`);
    lines.push("");
    lines.push(`**As a** ${story.as_a ?? "user"}`);
    lines.push(`**I want** ${story.i_want ?? "this feature"}`);
    lines.push(`**So that** ${story.so_that ?? "I can benefit"}`);
    lines.push("");
    lines.push("**Acceptance criteria:**");
    for (const criterion of story.acceptance_criteria ?? []) {
      if (isPlainObject(criterion)) {
        let line = `- ${criterion.id ?? ""}: ${criterion.text ?? ""}`;
        if (criterion.behavioral_impact) line += ` · impact:\`${criterion.behavioral_impact}\``;
        if (criterion.proof_seam) line += ` · seam:\`${criterion.proof_seam}\``;
        lines.push(line);
      } else {
        lines.push(`- ${criterion}`);
      }
    }
    lines.push("");
    lines.push("**Sources:**");
    for (const source of story.sources ?? []) {
      if (isPlainObject(source)) {
        const file = source.file ?? "unknown";
        const reference = source.lines ? `\`${file}:${source.lines}\`` : `\`${file}\``;
        lines.push(`- ${reference}`);
      } else if (typeof source === "string") {
        lines.push(`- \`${source}\``);
      }
    }
    lines.push("");
    lines.push("**Status:** pending");
    lines.push("");
  }

  return lines.join("\n");
}

function usage(program) {
  return `usage: ${program} [-h] -o OUTPUT_DIR json_files [json_files ...]\n`;
}

function help(program) {
  return [
    usage(program).trimEnd(),
    "",
    "Aggregate stories into per-epic files",
    "",
    "positional arguments:",
    "  json_files            Extracted story JSON files",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  -o, --output-dir OUTPUT_DIR",
    "                        Directory to write per-epic files (created if needed)",
    "",
  ].join("\n");
}

function parseArgs(args) {
  let outputDir;
  let outputDirSet = false;
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
      continue;
    }
    if (arg.startsWith("--=")) {
      return { error: `ambiguous option: ${arg} could match --help, --output-dir` };
    }
    if (arg === "-h" || (arg.startsWith("--") && !arg.includes("=") && "--help".startsWith(arg))) {
      return { help: true };
    }
    const optionName = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (arg === "-o" || (arg.startsWith("--") && "--output-dir".startsWith(optionName))) {
      const attached = arg.includes("=");
      const value = attached ? arg.slice(arg.indexOf("=") + 1) : args[++index];
      if (
        value === undefined ||
        (!attached && value.startsWith("-") && !isNegativeNumber(value) && value !== "-")
      ) {
        return { error: "argument -o/--output-dir: expected one argument" };
      }
      outputDir = value;
      outputDirSet = true;
    } else if (arg.startsWith("-o") && arg.length > 2) {
      outputDir = arg.slice(2);
      outputDirSet = true;
    } else if (arg.startsWith("-") && arg !== "-" && !isNegativeNumber(arg)) {
      unrecognized.push(arg);
    } else {
      jsonFiles.push(arg);
    }
  }

  if (unrecognized.length > 0) return { error: `unrecognized arguments: ${unrecognized.join(" ")}` };
  const required = [];
  if (!outputDirSet) required.push("-o/--output-dir");
  if (jsonFiles.length === 0) required.push("json_files");
  if (required.length > 0) {
    return { error: `the following arguments are required: ${required.join(", ")}` };
  }
  return { outputDir, jsonFiles };
}

export async function main(args) {
  const program = basename(process.argv[1] ?? "aggregate_stories.mjs");
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
  const outputDirectory = normalizePathSpelling(options.outputDir);
  for (const path of jsonFiles) {
    if (!existsSync(path)) {
      process.stderr.write(`error: file not found: ${path}\n`);
      return 2;
    }
  }

  const stories = loadStories(jsonFiles);
  if (stories.length === 0) {
    process.stderr.write("error: no stories found in input files\n");
    return 1;
  }

  const epics = assignIds(groupIntoEpics(dedupStories(stories)));
  const outputDirectoryPath = outputDirectory || ".";
  mkdirSync(outputDirectoryPath, { recursive: true });
  for (const name of readdirSync(outputDirectoryPath)) {
    if (/^EPIC-.*\.md$/.test(name)) unlinkSync(join(outputDirectoryPath, name));
  }

  for (const [theme, epicStories] of epics) {
    const epicId = epicStories[0]._epic_id;
    const outputPath = join(outputDirectory, `${epicId}.md`);
    writeFileSync(outputPath, formatEpicFile(epicId, theme, epicStories));
    process.stdout.write(`wrote ${outputPath} (${epicStories.length} stories)\n`);
  }
  const total = [...epics.values()].reduce((count, storiesInEpic) => count + storiesInEpic.length, 0);
  process.stdout.write(`OK: ${epics.size} epics, ${total} stories\n`);
  return 0;
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

function isDirectEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
  }
}

const isDirect = isDirectEntry();
if (isDirect) process.exitCode = await main(process.argv.slice(2));
