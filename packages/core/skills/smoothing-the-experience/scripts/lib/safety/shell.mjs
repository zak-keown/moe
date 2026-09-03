import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const PROJECT_SHELL_CATALOG = new Map([
  [
    "git status",
    { prefix: ["git", "status"], suffixSafe: true, globalSafe: true },
  ],
  [
    "git diff",
    { prefix: ["git", "diff"], suffixSafe: false, globalSafe: true },
  ],
  [
    "git log",
    { prefix: ["git", "log"], suffixSafe: false, globalSafe: true },
  ],
  [
    "git show",
    { prefix: ["git", "show"], suffixSafe: false, globalSafe: true },
  ],
  [
    "git add",
    { prefix: ["git", "add"], suffixSafe: true, globalSafe: false },
  ],
]);

export const GLOBAL_SHELL_CATALOG = new Set([
  "git status",
  "git diff",
  "git log",
  "git show",
]);

const WRAPPERS = new Set([
  ".",
  "bash",
  "command",
  "env",
  "eval",
  "fish",
  "sh",
  "source",
  "sudo",
  "xargs",
  "zsh",
]);
const FORBIDDEN = /[\n\r`$|&;<>()[\]{}*?#]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const CLAUDE_EXACT_READ_OPTIONS = new Map([
  [
    "git diff",
    new Set([
      "--cached",
      "--name-only",
      "--name-status",
      "--no-color",
      "--numstat",
      "--shortstat",
      "--staged",
      "--stat",
    ]),
  ],
  [
    "git log",
    new Set([
      "--decorate",
      "--first-parent",
      "--name-only",
      "--name-status",
      "--no-color",
      "--no-decorate",
      "--oneline",
      "--stat",
    ]),
  ],
  [
    "git show",
    new Set([
      "--decorate",
      "--name-only",
      "--name-status",
      "--no-color",
      "--no-decorate",
      "--oneline",
      "--stat",
    ]),
  ],
]);

/**
 * Tokenize only shell text whose meaning does not depend on expansion or shell
 * control syntax, then retain only commands represented by this policy.
 *
 * @param {unknown} command
 * @returns {string[] | null}
 */
export function parseConservativeShell(command) {
  const argv = tokenize(command);
  if (!argv || !tokensAreConservative(argv)) return null;
  if (catalogEntry(argv) || hasSafeExactReadSuffix(argv) || isExactCopy(argv)) {
    return argv;
  }
  return null;
}

/**
 * @param {unknown} operation
 * @param {{ projectRoot: string, harness: "claude" | "codex", realpath?: (path: string) => string }} context
 */
export function classifyShell(operation, context) {
  const argv = operationArgv(operation);
  if (!argv) return declined("operation is not a conservative shell command");

  const entry = catalogEntry(argv);
  if (entry) {
    return {
      eligible: true,
      normalized: { argv: [...argv] },
      globalSafe: entry.globalSafe,
      reason: entry.globalSafe
        ? "command is in the global read-only catalog"
        : "command is in the project shell catalog",
    };
  }

  if (context?.harness === "claude" && hasSafeExactReadSuffix(argv)) {
    return {
      eligible: true,
      normalized: { argv: [...argv] },
      globalSafe: false,
      reason: "exact Claude command uses only allowlisted read arguments",
    };
  }

  if (!isExactCopy(argv)) return declined("command is not in a safe catalog");
  if (context?.harness !== "claude") {
    return declined("cp -n is unsafe as a Codex prefix rule");
  }
  const paths = canonicalCopyPaths(argv, context);
  if (!paths) return declined("cp -n paths are not contained in one project");
  return {
    eligible: true,
    normalized: { argv: ["cp", "-n", ...paths] },
    globalSafe: false,
    reason: "exact Claude cp -n paths stay inside the project",
  };
}

function operationArgv(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return null;
  }
  const keys = Object.keys(operation);
  if (
    keys.length === 1 &&
    keys[0] === "argv" &&
    Array.isArray(operation.argv) &&
    operation.argv.length > 0 &&
    operation.argv.every(
      (token) => typeof token === "string" && token.length > 0 && !token.includes("\0"),
    )
  ) {
    const argv = [...operation.argv];
    return tokensAreConservative(argv) ? argv : null;
  }
  if (keys.length === 1 && keys[0] === "command") {
    return parseConservativeShell(operation.command);
  }
  return null;
}

function tokensAreConservative(argv) {
  return (
    !WRAPPERS.has(argv[0]) &&
    argv.every((token) => !FORBIDDEN.test(token) && !ASSIGNMENT.test(token))
  );
}

function tokenize(command) {
  if (typeof command !== "string" || command.trim() === "" || FORBIDDEN.test(command)) {
    return null;
  }
  const tokens = [];
  let token = "";
  let quote = null;
  let started = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (character === "\\" && quote === '"') {
        index += 1;
        if (index >= command.length) return null;
        token += command[index];
      } else {
        token += character;
      }
      started = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        if (token.length === 0) return null;
        tokens.push(token);
        token = "";
        started = false;
      }
    } else if (character === "\\") {
      index += 1;
      if (index >= command.length) return null;
      token += command[index];
      started = true;
    } else {
      token += character;
      started = true;
    }
  }
  if (quote || !started) return quote ? null : tokens;
  if (token.length === 0) return null;
  tokens.push(token);
  return tokens;
}

function catalogEntry(argv) {
  const entry = catalogPrefix(argv);
  if (!entry || argv.length < entry.prefix.length) return null;
  if (!entry.suffixSafe && argv.length !== entry.prefix.length) return null;
  return entry;
}

function catalogPrefix(argv) {
  const entry = PROJECT_SHELL_CATALOG.get(argv.slice(0, 2).join(" "));
  if (!entry || !entry.prefix.every((token, index) => argv[index] === token)) {
    return null;
  }
  return entry;
}

function hasSafeExactReadSuffix(argv) {
  const command = argv.slice(0, 2).join(" ");
  const options = CLAUDE_EXACT_READ_OPTIONS.get(command);
  if (!options || argv.length === 2) return false;
  let operandsOnly = false;
  return argv.slice(2).every((token) => {
    if (token === "--") {
      operandsOnly = true;
      return true;
    }
    if (operandsOnly || !token.startsWith("-")) return true;
    return options.has(token);
  });
}

function isExactCopy(argv) {
  return argv.length === 4 && argv[0] === "cp" && argv[1] === "-n";
}

function canonicalCopyPaths(argv, context) {
  if (typeof context?.projectRoot !== "string" || context.projectRoot.length === 0) {
    return null;
  }
  const canonicalize = context.realpath ?? realpathSync;
  try {
    const root = resolve(context.projectRoot);
    return argv.slice(2).map((path) => {
      const target = canonicalize(isAbsolute(path) ? path : resolve(root, path));
      const projectPath = relative(root, target);
      if (!isContained(projectPath)) throw new Error("outside project");
      return projectPath.split(sep).join("/");
    });
  } catch {
    return null;
  }
}

function isContained(projectPath) {
  return (
    projectPath.length > 0 &&
    projectPath !== ".." &&
    !projectPath.startsWith(`..${sep}`) &&
    !isAbsolute(projectPath)
  );
}

function declined(reason) {
  return { eligible: false, globalSafe: false, reason };
}
