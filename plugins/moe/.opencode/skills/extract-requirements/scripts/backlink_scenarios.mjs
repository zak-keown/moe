import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareCodePoints, splitLines } from "./python_compat.mjs";

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

export function parseScenarioToStories(content) {
  const storyToScenarios = new Map();
  let currentId;
  for (const line of splitLines(content)) {
    const idMatch = line.match(/^## (SCENARIO-\p{Nd}+|JOURNEY-\p{Nd}+)/u);
    if (idMatch) currentId = idMatch[1];
    if (currentId && line.startsWith("**Owning stories:**")) {
      const refsText = line.split(":**", 2)[1].trim();
      for (const storyId of refsText.match(/STORY-\p{Nd}+/gu) ?? []) {
        const scenarioIds = storyToScenarios.get(storyId) ?? [];
        scenarioIds.push(currentId);
        storyToScenarios.set(storyId, scenarioIds);
      }
    }
  }
  return storyToScenarios;
}

export function backlinkEpicContent(content, storyToScenarios) {
  const lines = splitLines(content);
  let updated = 0;
  let skipped = 0;
  let currentStoryId;
  const newLines = [];
  for (let line of lines) {
    const storyMatch = line.match(/^## (STORY-\p{Nd}+)/u);
    if (storyMatch) currentStoryId = storyMatch[1];
    if (
      currentStoryId &&
      storyToScenarios.has(currentStoryId) &&
      /^- AC-\p{Nd}+:/u.test(line)
    ) {
      if (line.toLowerCase().includes("scenario:")) skipped += 1;
      else if (!line.includes("impact:`none`")) {
        line = `${line} · scenario:\`${storyToScenarios.get(currentStoryId)[0]}\``;
        updated += 1;
      }
    }
    newLines.push(line);
  }
  return { content: newLines.join("\n"), updated, skipped };
}

export function backlinkEpicFile(epicPath, storyToScenarios) {
  const result = backlinkEpicContent(readFileSync(epicPath, "utf8"), storyToScenarios);
  if (result.updated > 0) writeFileSync(epicPath, result.content);
  return result;
}

export async function main(args) {
  const program = process.argv[1] ?? "backlink_scenarios.mjs";
  if (args.length !== 2) {
    process.stderr.write(`usage: ${program} <scenarios-file> <requirements-dir>\n`);
    return 2;
  }
  const scenariosPath = normalizePathSpelling(args[0]);
  const requirementsDirectory = normalizePathSpelling(args[1]);
  if (!existsSync(scenariosPath)) {
    process.stderr.write(`error: file not found: ${scenariosPath}\n`);
    return 2;
  }
  if (!existsSync(requirementsDirectory) || !statSync(requirementsDirectory).isDirectory()) {
    process.stderr.write(`error: directory not found: ${requirementsDirectory}\n`);
    return 2;
  }

  const storyToScenarios = parseScenarioToStories(readFileSync(scenariosPath, "utf8"));
  if (storyToScenarios.size === 0) {
    process.stderr.write("warning: no scenario-to-story mappings found\n");
    return 0;
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  const epicFiles = readdirSync(requirementsDirectory)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort(compareCodePoints);
  for (const name of epicFiles) {
    const result = backlinkEpicFile(join(requirementsDirectory, name), storyToScenarios);
    if (result.updated > 0) process.stdout.write(`${name}: ${result.updated} AC(s) linked\n`);
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }
  process.stdout.write(`OK: ${totalUpdated} AC(s) linked, ${totalSkipped} already linked\n`);
  return 0;
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
