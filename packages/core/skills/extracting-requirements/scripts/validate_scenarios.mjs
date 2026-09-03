import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

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

function splitLines(text) {
  return text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
}

export function loadStoryIds(requirementsDirectory) {
  const ids = new Set();
  const epicFiles = readdirSync(requirementsDirectory)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort(compareCodePoints);

  for (const name of epicFiles) {
    for (const line of splitLines(readFileSync(join(requirementsDirectory, name), "utf8"))) {
      const match = line.match(/^## (STORY-\p{Nd}+)/u);
      if (match) ids.add(match[1]);
    }
  }
  return ids;
}

export function validateScenarios(scenariosPath, requirementsDirectory) {
  const errors = [];
  const lines = splitLines(readFileSync(scenariosPath, "utf8"));
  const knownStories = loadStoryIds(requirementsDirectory);
  const seenIds = new Set();

  let currentId;
  let currentKind;
  let hasSteps = false;
  let hasOwning = false;
  let hasSeam = false;

  function flush() {
    if (currentId === undefined) return;
    if (!hasOwning) errors.push(`${currentId}: missing 'Owning stories' field`);
    if (!hasSeam) errors.push(`${currentId}: missing 'Proof seam' field`);
    if (currentKind === "journey" && !hasSteps) {
      errors.push(`${currentId}: journey scenario has no steps`);
    }
    currentId = undefined;
    currentKind = undefined;
    hasSteps = false;
    hasOwning = false;
    hasSeam = false;
  }

  for (const [index, line] of lines.entries()) {
    const idMatch = line.match(/^## (SCENARIO-\p{Nd}+|JOURNEY-\p{Nd}+)/u);
    if (idMatch) {
      flush();
      currentId = idMatch[1];
      if (seenIds.has(currentId)) {
        errors.push(`line ${index + 1}: duplicate scenario ID ${currentId}`);
      }
      seenIds.add(currentId);
    }

    if (currentId !== undefined) {
      if (line.startsWith("**Kind:**")) {
        currentKind = line.split(":**")[1].trim().toLowerCase();
      }
      if (line.startsWith("**Proof seam:**")) hasSeam = true;
      if (line.startsWith("**Owning stories:**")) {
        hasOwning = true;
        const references = line.split(":**")[1].trim();
        for (const match of references.matchAll(/STORY-\p{Nd}+/gu)) {
          if (!knownStories.has(match[0])) {
            errors.push(`${currentId}: references unknown ${match[0]}`);
          }
        }
        for (const match of references.matchAll(/UNRESOLVED\([^)]+\)/g)) {
          errors.push(`${currentId}: has ${match[0]}`);
        }
      }
      if (/^\p{Nd}+\./u.test(line.trim())) hasSteps = true;
    }
  }

  flush();
  if (seenIds.size === 0) errors.push("no scenarios found in file");
  return errors;
}

export const validate = validateScenarios;

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2) {
    process.stderr.write(`usage: ${process.argv[1]} <scenarios-file> <requirements-dir>\n`);
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

  const errors = validateScenarios(scenariosPath, requirementsDirectory);
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
    process.stdout.write(`FAIL: ${errors.length} error(s)\n`);
    return 1;
  }

  process.stdout.write("OK: scenarios valid\n");
  return 0;
}

const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = main();
