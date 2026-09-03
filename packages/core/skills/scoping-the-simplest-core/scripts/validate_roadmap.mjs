import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WALKING_SKELETON_HEADING = "## Walking skeleton (ITER-0000)";
const ITERATION_LIST_HEADING = "## Iteration list";
const REQUIRED_FIELDS = [
  "**Intent:**",
  "**Status:**",
  "**Stories committed:**",
  "**Journey scenario:**",
];

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

export function validateRoadmap(content) {
  const errors = [];
  if (!content.includes(WALKING_SKELETON_HEADING)) {
    errors.push(
      "missing walking skeleton section (expected '## Walking skeleton (ITER-0000)')",
    );
  }
  if (!content.includes(ITERATION_LIST_HEADING)) {
    errors.push("missing iteration list section (expected '## Iteration list')");
  }

  const walkingSkeletonStart = content.indexOf(WALKING_SKELETON_HEADING);
  if (walkingSkeletonStart !== -1) {
    const nextH2 = content.indexOf("\n## ", walkingSkeletonStart + 1);
    const section = content.slice(
      walkingSkeletonStart,
      nextH2 === -1 ? content.length : nextH2,
    );
    for (const required of REQUIRED_FIELDS) {
      if (!section.includes(required)) {
        errors.push(`walking skeleton: missing required field ${required}`);
      }
    }
  }
  return errors;
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 1) {
    process.stderr.write("usage: validate_roadmap.mjs <file>\n");
    return 2;
  }
  const path = normalizePathSpelling(args[0]);
  if (!existsSync(path)) {
    process.stderr.write(`error: file not found: ${path}\n`);
    return 2;
  }

  const errors = validateRoadmap(readFileSync(path, "utf8"));
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`error: ${error}\n`);
    return 1;
  }
  process.stdout.write(`OK: ${path}\n`);
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
