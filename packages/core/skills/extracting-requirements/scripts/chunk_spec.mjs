import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function estimateTokens(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.trunc(words * 1.3);
}

export function splitByHeading(content, level) {
  const pattern = new RegExp(`^${"#".repeat(level)} (.+)$`, "gm");
  const matches = [...content.matchAll(pattern)];

  if (matches.length === 0) return [{ heading: null, content }];

  const sections = [];
  if (matches[0].index > 0) {
    const preamble = content.slice(0, matches[0].index).trim();
    if (preamble) sections.push({ heading: "(preamble)", content: preamble });
  }

  for (const [index, match] of matches.entries()) {
    const start = match.index;
    const end = matches[index + 1]?.index ?? content.length;
    sections.push({
      heading: match[1].trim(),
      content: content.slice(start, end).trim(),
    });
  }

  return sections;
}

function lineCount(content) {
  return (content.match(/\n/g) ?? []).length;
}

export function findLineRange(fullContent, sectionContent) {
  const position = fullContent.indexOf(sectionContent.slice(0, 80));
  if (position === -1) return [1, lineCount(fullContent) + 1];

  const startLine = lineCount(fullContent.slice(0, position)) + 1;
  return [startLine, startLine + lineCount(sectionContent)];
}

export function chunkFile(path, maxTokens) {
  const content = readFileSync(path, "utf8");
  const tokens = estimateTokens(content);

  if (tokens <= maxTokens) {
    return [
      {
        source_file: path,
        heading: null,
        start_line: 1,
        end_line: lineCount(content) + 1,
        content,
        estimated_tokens: tokens,
      },
    ];
  }

  const sections = splitByHeading(content, 2);
  const chunks = [];
  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);
    const [startLine, endLine] = findLineRange(content, section.content);

    if (sectionTokens <= maxTokens) {
      chunks.push({
        source_file: path,
        heading: section.heading,
        start_line: startLine,
        end_line: endLine,
        content: section.content,
        estimated_tokens: sectionTokens,
      });
      continue;
    }

    for (const subsection of splitByHeading(section.content, 3)) {
      const subsectionTokens = estimateTokens(subsection.content);
      const [subStart, subEnd] = findLineRange(content, subsection.content);
      const heading =
        subsection.heading && subsection.heading !== "(preamble)"
          ? `${section.heading} > ${subsection.heading}`
          : section.heading;
      chunks.push({
        source_file: path,
        heading,
        start_line: subStart,
        end_line: subEnd,
        content: subsection.content,
        estimated_tokens: subsectionTokens,
      });
    }
  }

  return chunks;
}

function markdownFiles(path) {
  const files = [];
  const entries = readdirSync(path, { withFileTypes: true }).sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });
  for (const entry of entries) {
    const candidate = join(path, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(candidate));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(candidate);
  }
  return files;
}

export function chunkPath(path, maxTokens) {
  if (statSync(path).isFile()) return chunkFile(path, maxTokens);
  if (statSync(path).isDirectory()) return markdownFiles(path).flatMap((file) => chunkFile(file, maxTokens));
  return [];
}

function usage(program) {
  return `usage: ${program} [-h] [--max-tokens MAX_TOKENS] path\n`;
}

function help(program) {
  return [
    usage(program).trimEnd(),
    "",
    "Chunk spec files for extraction",
    "",
    "positional arguments:",
    "  path                  File or directory to chunk",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --max-tokens MAX_TOKENS",
    "                        Max tokens per chunk (default 4000)",
    "",
  ].join("\n");
}

function parseTokenCount(value) {
  if (!/^[-+]?\d+$/.test(value)) return null;
  return Number(value);
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

function parseArgs(args) {
  let path;
  let maxTokens = 4000;
  const unrecognized = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--max-tokens" || arg.startsWith("--max-tokens=")) {
      const value = arg === "--max-tokens" ? args[++index] : arg.slice("--max-tokens=".length);
      if (value === undefined) return { error: "argument --max-tokens: expected one argument" };
      const parsed = parseTokenCount(value);
      if (arg === "--max-tokens" && value.startsWith("-") && parsed === null) {
        return { error: "argument --max-tokens: expected one argument" };
      }
      if (parsed === null) return { error: `argument --max-tokens: invalid int value: '${value}'` };
      maxTokens = parsed;
    } else if (!path && !arg.startsWith("-")) {
      path = arg;
    } else {
      unrecognized.push(arg);
    }
  }

  if (!path) return { error: "the following arguments are required: path" };
  if (unrecognized.length > 0) return { error: `unrecognized arguments: ${unrecognized.join(" ")}` };
  return { path, maxTokens };
}

export async function main(args) {
  const program = basename(process.argv[1] ?? "chunk_spec.mjs");
  const options = parseArgs(args);
  if (options.help) {
    process.stdout.write(help(program));
    return 0;
  }
  if (options.error) {
    process.stderr.write(`${usage(program)}${program}: error: ${options.error}\n`);
    return 2;
  }

  const path = normalizePathSpelling(options.path);

  try {
    statSync(path);
  } catch {
    process.stderr.write(`error: path not found: ${path}\n`);
    return 2;
  }

  process.stdout.write(`${JSON.stringify(chunkPath(path, options.maxTokens), null, 2)}\n`);
  return 0;
}

const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = await main(process.argv.slice(2));
