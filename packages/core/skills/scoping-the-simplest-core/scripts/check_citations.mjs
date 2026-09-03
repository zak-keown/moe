import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CITED_STORY_PATTERN = /STORY-\p{Nd}+/gu;
const DEFINED_STORY_PATTERN = /^## (STORY-\p{Nd}+)/gmu;

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

export function extractCitedStories(content) {
  return new Set(content.match(CITED_STORY_PATTERN) ?? []);
}

export function extractDefinedStories(content) {
  return new Set([...content.matchAll(DEFINED_STORY_PATTERN)].map((match) => match[1]));
}

export function loadDefinedStories(requirementsPath) {
  const defined = new Set();
  const files = statSync(requirementsPath).isDirectory()
    ? readdirSync(requirementsPath)
        .filter((name) => name.endsWith(".md"))
        .sort(compareCodePoints)
        .map((name) => join(requirementsPath, name))
    : [requirementsPath];
  for (const file of files) {
    for (const story of extractDefinedStories(readFileSync(file, "utf8"))) defined.add(story);
  }
  return defined;
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: check_citations.mjs <roadmap.md> <requirements-dir-or-file>\n",
    );
    return 2;
  }

  const roadmapPath = normalizePathSpelling(args[0]);
  const requirementsPath = normalizePathSpelling(args[1]);
  if (!existsSync(roadmapPath)) {
    process.stderr.write(`error: file not found: ${roadmapPath}\n`);
    return 2;
  }
  if (!existsSync(requirementsPath)) {
    process.stderr.write(`error: not found: ${requirementsPath}\n`);
    return 2;
  }

  const cited = extractCitedStories(readFileSync(roadmapPath, "utf8"));
  const defined = loadDefinedStories(requirementsPath);
  const missing = [...cited].filter((story) => !defined.has(story)).sort(compareCodePoints);
  if (missing.length > 0) {
    for (const story of missing) {
      process.stderr.write(`error: ${story} cited in roadmap but not found in requirements\n`);
    }
    return 1;
  }

  process.stdout.write(`OK: all ${cited.size} cited stories exist in requirements\n`);
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

if (isDirectEntry()) process.exitCode = main();
