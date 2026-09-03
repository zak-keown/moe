import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ITERATION_PATTERN = /^## ITER-(\p{Nd}+)/gmu;
const REQUIRED_FIELDS = [
  "**Completed:**",
  "**Stories delivered:**",
  "**Tasks executed:**",
  "**Scenarios:**",
  "**Summary:**",
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

export function validateIterationLog(content) {
  const errors = [];
  const iterations = [...content.matchAll(ITERATION_PATTERN)];
  if (iterations.length === 0) {
    return ["no iteration sections found (expected at least one '## ITER-NNNN')"];
  }

  for (const [index, iteration] of iterations.entries()) {
    const iterationId = `ITER-${iteration[1]}`;
    const start = iteration.index + iteration[0].length;
    const end = iterations[index + 1]?.index ?? content.length;
    const section = content.slice(start, end);
    for (const required of REQUIRED_FIELDS) {
      if (!section.includes(required)) {
        errors.push(`${iterationId}: missing required field ${required}`);
      }
    }
  }
  return errors;
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 1) {
    process.stderr.write("usage: validate_iteration_log.mjs <file>\n");
    return 2;
  }
  const path = normalizePathSpelling(args[0]);
  if (!existsSync(path)) {
    process.stderr.write(`error: file not found: ${path}\n`);
    return 2;
  }

  const errors = validateIterationLog(readFileSync(path, "utf8"));
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
