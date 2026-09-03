import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PYTHON_WHITESPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STORY_PATTERN = new RegExp(`^## STORY-(\\p{Nd}+)[${PYTHON_WHITESPACE}]*$`, "gmu");
const MALFORMED_STORY_PATTERN = new RegExp(
  `^## STORY-[${PYTHON_WHITESPACE}]*$`,
  "mu",
);
const NEXT_H2_PATTERN = /^## /m;
const REQUIRED_FIELDS = [
  "**Epic:**",
  "**Title:**",
  "**Acceptance criteria:**",
  "**Sources:**",
  "**Status:**",
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

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function validateContent(content, sourceName) {
  const errors = [];

  if (MALFORMED_STORY_PATTERN.test(content)) {
    errors.push(`${sourceName}: found malformed story id: STORY- header is missing digits`);
  }

  const matches = [...content.matchAll(STORY_PATTERN)];
  if (matches.length === 0) {
    errors.push(`${sourceName}: no valid STORY-NNNN headers found`);
    return errors;
  }

  for (const match of matches) {
    const storyId = `STORY-${match[1]}`;
    const start = match.index + match[0].length;
    const remainder = content.slice(start);
    const nextH2 = remainder.match(NEXT_H2_PATTERN);
    const section = remainder.slice(0, nextH2?.index ?? remainder.length);

    for (const required of REQUIRED_FIELDS) {
      if (!section.includes(required)) {
        errors.push(`${sourceName}: ${storyId}: missing required field ${required}`);
      }
    }
  }

  return errors;
}

export function validatePath(path) {
  const errors = [];
  if (statSync(path).isDirectory()) {
    const markdownFiles = readdirSync(path)
      .filter((name) => name.endsWith(".md"))
      .sort(compareCodePoints);
    if (markdownFiles.length === 0) return { emptyDirectory: true, errors };
    for (const name of markdownFiles) {
      errors.push(...validateContent(readFileSync(join(path, name), "utf8"), name));
    }
  } else {
    errors.push(...validateContent(readFileSync(path, "utf8"), basename(path)));
  }
  return { emptyDirectory: false, errors };
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 1) {
    process.stderr.write("usage: validate_requirements_index.mjs <path>\n");
    return 2;
  }

  const path = normalizePathSpelling(args[0]);
  if (!existsSync(path)) {
    process.stderr.write(`error: not found: ${path}\n`);
    return 2;
  }

  const { emptyDirectory, errors } = validatePath(path);
  if (emptyDirectory) {
    process.stderr.write(`error: no .md files found in ${path}\n`);
    return 1;
  }
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
    return (
      realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
  }
}

const isDirect = isDirectEntry();
if (isDirect) process.exitCode = main();
