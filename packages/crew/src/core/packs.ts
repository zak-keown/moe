import { existsSync, readFileSync } from "node:fs";
import type { HarnessId } from "../harness/driver.js";
import { isHarnessId } from "../harness/registry.js";

/**
 * A single worker definition inside a pack. Harness-agnostic data: the YAML
 * carries the role prompt and an optional harness override; the CLI maps each
 * entry to a `cmdLaunch` + `cmdSend` pair.
 */
export interface PackWorker {
  /** Prefix for the worker's tmux session name (suffixed with `-<index>`). */
  namePrefix: string;
  /** Harness override for this worker; it outranks every default source. */
  harness?: HarnessId | undefined;
  /** Extra CLI args forwarded to the harness binary (the tokens after `--`). */
  harnessArgs?: string[] | undefined;
  /** The initial prompt sent to the worker after launch. */
  rolePrompt: string;
}

/**
 * A pack definition: a named set of workers launched together as a unit.
 * Packs are harness-agnostic YAML — the HarnessDriver abstraction already
 * supports per-worker harness selection via --harness.
 */
export interface PackDefinition {
  name: string;
  description?: string | undefined;
  /** Pack-local default, below `--harness` and above the environment default. */
  defaultHarness?: HarnessId | undefined;
  workers: PackWorker[];
}

/**
 * Minimal YAML subset parser for pack files. Handles the flat key/value
 * scalars, block sequences of mappings, and YAML block-scalar (`|`) multiline
 * strings that pack files use. Does NOT handle the full YAML spec — pack files
 * are intentionally simple. Falls back to JSON when the file extension is
 * `.json`.
 */
export function parsePackYaml(text: string): unknown {
  const lines = text.split("\n");
  const root: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip blank lines and comments.
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }

    // Top-level key: value
    const topMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1]!;
    const inlineValue = topMatch[2]!.trim();

    // Block scalar (`|` or `|+` or `|-`)
    if (/^\|[+-]?\s*$/.test(inlineValue)) {
      const { value, nextLine } = readBlockScalar(lines, i + 1, 2);
      root[key] = value;
      i = nextLine;
      continue;
    }

    // Inline scalar value.
    if (inlineValue.length > 0) {
      root[key] = parseScalar(inlineValue);
      i++;
      continue;
    }

    // No inline value — check for a sequence or nested mapping on the next line.
    const nextNonBlank = peekNonBlank(lines, i + 1);
    if (nextNonBlank !== null && lines[nextNonBlank]!.match(/^\s+-\s/)) {
      // It's a sequence of mappings (workers:).
      const { items, nextLine } = readSequence(lines, i + 1);
      root[key] = items;
      i = nextLine;
    } else {
      root[key] = "";
      i++;
    }
  }

  return root;
}

/** Read a YAML block-scalar body (lines after `|`). */
function readBlockScalar(
  lines: string[],
  start: number,
  minIndent: number,
): { value: string; nextLine: number } {
  const collected: string[] = [];
  let i = start;

  // Determine the actual indent of the first content line.
  let bodyIndent = minIndent;
  while (i < lines.length && /^\s*$/.test(lines[i]!)) {
    collected.push("");
    i++;
  }
  if (i < lines.length) {
    const m = lines[i]!.match(/^(\s*)/);
    bodyIndent = m ? m[1]!.length : minIndent;
    if (bodyIndent < minIndent) bodyIndent = minIndent;
  }

  while (i < lines.length) {
    const line = lines[i]!;
    // A blank line is part of the block scalar.
    if (/^\s*$/.test(line)) {
      collected.push("");
      i++;
      continue;
    }
    // A line with less indent than the body ends the block.
    const indent = line.match(/^(\s*)/)![1]!.length;
    if (indent < bodyIndent) break;
    collected.push(line.slice(bodyIndent));
    i++;
  }

  // Trim trailing blank lines (default `clip` chomping).
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  return { value: collected.join("\n") + (collected.length > 0 ? "\n" : ""), nextLine: i };
}

/** Read a YAML sequence of mappings (each item starts with `- `). */
function readSequence(
  lines: string[],
  start: number,
): { items: Record<string, unknown>[]; nextLine: number } {
  const items: Record<string, unknown>[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip blanks and comments.
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }

    // Sequence item: `  - key: value` or `  - key:`
    const dashMatch = line.match(/^(\s*)-\s+(.*)/);
    if (!dashMatch) break; // End of sequence.

    const dashIndent = dashMatch[1]!.length;
    const firstContent = dashMatch[2]!;

    const item: Record<string, unknown> = {};
    // Parse the first key: value on the dash line.
    const kvMatch = firstContent.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (kvMatch) {
      const k = kvMatch[1]!;
      const v = kvMatch[2]!.trim();
      if (/^\|[+-]?\s*$/.test(v)) {
        const { value, nextLine } = readBlockScalar(lines, i + 1, dashIndent + 4);
        item[k] = value;
        i = nextLine;
      } else if (v.length > 0) {
        item[k] = parseScalar(v);
        i++;
      } else {
        // Check for sub-sequence (harnessArgs: followed by list items).
        const peek = peekNonBlank(lines, i + 1);
        if (peek !== null && lines[peek]!.match(/^\s+-\s/)) {
          const { scalarItems, nextLine } = readScalarSequence(lines, i + 1, dashIndent + 4);
          item[k] = scalarItems;
          i = nextLine;
        } else {
          item[k] = "";
          i++;
        }
      }
    } else {
      i++;
      continue;
    }

    // Read continuation keys at the same item (indented deeper than the dash).
    while (i < lines.length) {
      const cLine = lines[i]!;
      if (/^\s*$/.test(cLine) || /^\s*#/.test(cLine)) {
        i++;
        continue;
      }
      // If indent is <= dashIndent, we're out of this item.
      const cIndent = cLine.match(/^(\s*)/)![1]!.length;
      if (cIndent <= dashIndent) break;
      // Must be within the item (indented past the dash).
      if (cIndent <= dashIndent + 1) break;

      const ckMatch = cLine.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
      if (!ckMatch) break;

      const ck = ckMatch[1]!;
      const cv = ckMatch[2]!.trim();
      if (/^\|[+-]?\s*$/.test(cv)) {
        const { value, nextLine } = readBlockScalar(lines, i + 1, cIndent + 2);
        item[ck] = value;
        i = nextLine;
      } else if (cv.length > 0) {
        item[ck] = parseScalar(cv);
        i++;
      } else {
        // Sub-sequence (harnessArgs: followed by - items).
        const peek = peekNonBlank(lines, i + 1);
        if (peek !== null && lines[peek]!.match(/^\s+-\s/)) {
          const { scalarItems, nextLine } = readScalarSequence(lines, i + 1, cIndent + 2);
          item[ck] = scalarItems;
          i = nextLine;
        } else {
          item[ck] = "";
          i++;
        }
      }
    }

    items.push(item);
  }

  return { items, nextLine: i };
}

/** Read a sequence of scalar values (e.g. harnessArgs: list of strings). */
function readScalarSequence(
  lines: string[],
  start: number,
  minIndent: number,
): { scalarItems: string[]; nextLine: number } {
  const scalarItems: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const dm = line.match(/^(\s*)-\s+(.*)/);
    if (!dm || dm[1]!.length < minIndent) break;
    scalarItems.push(parseScalar(dm[2]!.trim()) as string);
    i++;
  }
  return { scalarItems, nextLine: i };
}

/** Peek ahead to the next non-blank, non-comment line. */
function peekNonBlank(lines: string[], start: number): number | null {
  for (let i = start; i < lines.length; i++) {
    if (!/^\s*$/.test(lines[i]!) && !/^\s*#/.test(lines[i]!)) return i;
  }
  return null;
}

/** Parse a scalar value: booleans, numbers, null, or strings (with optional quotes). */
function parseScalar(raw: string): string | number | boolean | null {
  // Remove inline comment.
  const stripped = raw.replace(/\s+#.*$/, "").trim();
  if (stripped === "true" || stripped === "True" || stripped === "TRUE") return true;
  if (stripped === "false" || stripped === "False" || stripped === "FALSE") return false;
  if (stripped === "null" || stripped === "Null" || stripped === "NULL" || stripped === "~")
    return null;
  // Quoted string.
  if (
    (stripped.startsWith('"') && stripped.endsWith('"')) ||
    (stripped.startsWith("'") && stripped.endsWith("'"))
  ) {
    return stripped.slice(1, -1);
  }
  // Number.
  const n = Number(stripped);
  if (stripped.length > 0 && !Number.isNaN(n) && /^-?[0-9]/.test(stripped)) return n;
  return stripped;
}

/**
 * Validate and coerce a parsed YAML object into a PackDefinition.
 * Throws a descriptive error for invalid input.
 */
function validatePack(raw: unknown): PackDefinition {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid pack file: expected a YAML mapping at the top level");
  }
  const obj = raw as Record<string, unknown>;

  const name = obj.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Invalid pack file: 'name' is required and must be a non-empty string");
  }

  const description = obj.description;
  if (description !== undefined && typeof description !== "string") {
    throw new Error("Invalid pack file: 'description' must be a string");
  }

  const defaultHarness = obj.defaultHarness;
  if (defaultHarness !== undefined && !isHarnessId(defaultHarness)) {
    throw new Error(`Invalid pack file: 'defaultHarness' must be one of claude, codex, pi`);
  }

  const workers = obj.workers;
  if (!Array.isArray(workers) || workers.length === 0) {
    throw new Error("Invalid pack file: 'workers' is required and must be a non-empty array");
  }

  const validated: PackWorker[] = [];
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i] as Record<string, unknown>;
    if (typeof w !== "object" || w === null) {
      throw new Error(`Invalid pack file: workers[${i}] must be a mapping`);
    }
    if (typeof w.namePrefix !== "string" || w.namePrefix.trim().length === 0) {
      throw new Error(
        `Invalid pack file: workers[${i}].namePrefix is required and must be a non-empty string`,
      );
    }
    if (typeof w.rolePrompt !== "string" || w.rolePrompt.trim().length === 0) {
      throw new Error(
        `Invalid pack file: workers[${i}].rolePrompt is required and must be a non-empty string`,
      );
    }
    const pw: PackWorker = {
      namePrefix: w.namePrefix as string,
      rolePrompt: w.rolePrompt as string,
    };
    if (w.harness !== undefined) {
      if (!isHarnessId(w.harness)) {
        throw new Error(
          `Invalid pack file: workers[${i}].harness must be one of claude, codex, pi`,
        );
      }
      pw.harness = w.harness;
    }
    if (w.harnessArgs !== undefined) {
      if (!Array.isArray(w.harnessArgs)) {
        throw new Error(`Invalid pack file: workers[${i}].harnessArgs must be an array`);
      }
      pw.harnessArgs = (w.harnessArgs as unknown[]).map(String);
    }
    validated.push(pw);
  }

  return {
    name: name.trim(),
    description: description !== undefined ? (description as string) : undefined,
    defaultHarness,
    workers: validated,
  };
}

/**
 * Load and validate a pack definition from a YAML (or JSON) file.
 * Throws on missing file, parse errors, or validation failures.
 */
export function loadPack(path: string): PackDefinition {
  if (!existsSync(path)) {
    throw new Error(`Pack file not found: ${path}`);
  }
  const text = readFileSync(path, "utf8");

  let parsed: unknown;
  if (path.endsWith(".json")) {
    parsed = JSON.parse(text);
  } else {
    parsed = parsePackYaml(text);
  }

  return validatePack(parsed);
}
