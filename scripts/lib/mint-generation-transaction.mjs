import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NONCE = "[A-Za-z0-9][A-Za-z0-9_-]{0,127}";
const JOURNAL_NAME = new RegExp(`^\\.moe-mint-generation-(${NONCE})\\.json$`);

/**
 * The portable, checked-in journal state. Paths are intentionally relative to
 * the repository root: an interrupted swap can be recovered after a checkout
 * moves, and the journal cannot redirect recovery outside that root.
 */

export class GenerationTransactionError extends Error {
  constructor(code, message, { paths = [], action, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "GenerationTransactionError";
    this.code = code;
    this.paths = paths;
    this.action = action;
  }
}

function transactionError(code, message, options) {
  return new GenerationTransactionError(code, message, options);
}

function portableParts(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.isAbsolute(value)
  ) {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      `${label} must be a non-absolute portable relative path`,
      { paths: [String(value)] },
    );
  }
  const parts = value.split("/");
  if (
    parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes("\0"))
  ) {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      `${label} must not contain empty, dot, or parent path segments`,
      { paths: [value] },
    );
  }
  return parts;
}

function parentOf(relativePath) {
  const parts = portableParts(relativePath, "path");
  return parts.length === 1 ? "." : parts.slice(0, -1).join("/");
}

function expectedTargets(nonce) {
  return [
    {
      kind: "directory",
      current: "plugins",
      next: `plugins.next-${nonce}`,
      backup: `plugins.backup-${nonce}`,
    },
    {
      kind: "file",
      current: ".claude-plugin/marketplace.json",
      next: `.claude-plugin/marketplace.next-${nonce}.json`,
      backup: `.claude-plugin/marketplace.backup-${nonce}.json`,
    },
    {
      kind: "file",
      current: "docs/moe/generated/plugin-catalog.md",
      next: `docs/moe/generated/plugin-catalog.next-${nonce}.md`,
      backup: `docs/moe/generated/plugin-catalog.backup-${nonce}.md`,
    },
  ];
}

function sameTarget(left, right) {
  return (
    left.kind === right.kind &&
    left.current === right.current &&
    left.next === right.next &&
    left.backup === right.backup
  );
}

function validateJournalPath(journalPath) {
  portableParts(journalPath, "journalPath");
  const journalMatch = JOURNAL_NAME.exec(journalPath);
  if (journalMatch === null) {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      "journalPath must be .moe-mint-generation-<nonce>.json at the repository root",
      { paths: [journalPath] },
    );
  }
  return journalMatch[1];
}

function validateShape({ journalPath, journal }) {
  const nonce = validateJournalPath(journalPath);
  if (
    !isRecord(journal) ||
    journal.schema !== 1 ||
    journal.transactionId !== nonce ||
    !Array.isArray(journal.targets)
  ) {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      "generation journal must have schema 1, matching transactionId, and targets",
      { paths: [journalPath] },
    );
  }
  if (journal.targets.length !== 3) {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      "generation journal must contain exactly three output targets",
      { paths: [journalPath] },
    );
  }
  const expected = expectedTargets(nonce);
  const seen = new Set();
  for (const target of journal.targets) {
    if (!isRecord(target) || (target.kind !== "file" && target.kind !== "directory")) {
      throw transactionError(
        "GENERATION_TRANSACTION_INVALID",
        "generation journal target has an invalid kind",
        { paths: [journalPath] },
      );
    }
    for (const key of ["current", "next", "backup"]) {
      portableParts(target[key], `target.${key}`);
      if (seen.has(target[key])) {
        throw transactionError(
          "GENERATION_TRANSACTION_INVALID",
          "generation journal paths must be unique",
          { paths: [target[key]] },
        );
      }
      seen.add(target[key]);
    }
  }
  for (const wanted of expected) {
    if (!journal.targets.some((target) => sameTarget(target, wanted))) {
      throw transactionError(
        "GENERATION_TRANSACTION_INVALID",
        `generation journal target ${wanted.current} does not match the required nonce sibling grammar`,
        { paths: [journalPath] },
      );
    }
  }
  return { journalPath, journal: { schema: 1, transactionId: nonce, targets: expected } };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function assertSymlinkFreeAncestry(fs, relativePath) {
  const parts = portableParts(relativePath, "path");
  let cursor = ".";
  const rootState = await fs.pathState(cursor);
  if (rootState === "symlink" || rootState !== "directory") {
    throw transactionError(
      "GENERATION_TRANSACTION_UNSAFE_PATH",
      "repository root must be a real directory",
      { paths: [cursor] },
    );
  }
  for (const part of parts) {
    cursor = cursor === "." ? part : `${cursor}/${part}`;
    const state = await fs.pathState(cursor);
    if (state === "symlink") {
      throw transactionError(
        "GENERATION_TRANSACTION_UNSAFE_PATH",
        "generation transaction refuses symlinked paths or ancestry",
        { paths: [cursor] },
      );
    }
  }
}

async function validateSafePaths(operation, fs) {
  const validated = validateShape(operation);
  await assertSymlinkFreeAncestry(fs, validated.journalPath);
  for (const target of validated.journal.targets) {
    for (const candidate of [target.current, target.next, target.backup]) {
      await assertSymlinkFreeAncestry(fs, candidate);
    }
  }
  return validated;
}

async function assertInitialState(operation, fs) {
  const validated = await validateSafePaths(operation, fs);
  if ((await fs.pathState(validated.journalPath)) !== "missing") {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      "refusing to overwrite an existing generation journal",
      { paths: [validated.journalPath] },
    );
  }
  for (const target of validated.journal.targets) {
    if (
      (await fs.pathState(target.current)) !== target.kind ||
      (await fs.pathState(target.next)) !== target.kind ||
      (await fs.pathState(target.backup)) !== "missing"
    ) {
      throw transactionError(
        "GENERATION_TRANSACTION_INVALID",
        "generation swap requires complete current and next outputs with no backup",
        {
          paths: [target.current, target.next, target.backup],
        },
      );
    }
  }
  return validated;
}

function byteJournal(journal) {
  return encoder.encode(`${JSON.stringify(journal)}\n`);
}

/** Write a file through a same-directory durable temporary sibling. */
export async function writeDurableFile(filePath, bytes) {
  const directory = path.dirname(filePath);
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    await fsyncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function fsyncDirectory(directory) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export const nodeSwapFs = {
  writeDurableFile,
  readFile,
  async pathState(filePath) {
    try {
      const stat = await lstat(filePath);
      if (stat.isSymbolicLink()) return "symlink";
      if (stat.isFile()) return "file";
      if (stat.isDirectory()) return "directory";
      return "other";
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") return "missing";
      throw error;
    }
  },
  rename,
  async remove(filePath) {
    await rm(filePath, { recursive: true, force: false });
  },
  fsyncDirectory,
};

async function syncParent(fs, relativePath) {
  await fs.fsyncDirectory(parentOf(relativePath));
}

async function removeAndSync(fs, relativePath) {
  await fs.remove(relativePath);
  await syncParent(fs, relativePath);
}

/**
 * Replace the three checked-in generation outputs. The caller owns and has
 * already selected the journal path; this module only accepts the exact
 * repository-relative grammar so its state remains portable and contained.
 */
export async function replaceGeneratedOutputs(operation, fs = nodeSwapFs) {
  const validated = await assertInitialState(operation, fs);
  let journalDurable = false;
  try {
    await fs.writeDurableFile(validated.journalPath, byteJournal(validated.journal));
    journalDurable = true;
    for (const target of validated.journal.targets) {
      await fs.rename(target.current, target.backup);
      await syncParent(fs, target.current);
      await fs.rename(target.next, target.current);
      await syncParent(fs, target.current);
    }
    for (const target of validated.journal.targets) {
      await removeAndSync(fs, target.backup);
    }
    await removeAndSync(fs, validated.journalPath);
  } catch (error) {
    if (!journalDurable) throw error;
    try {
      await recoverGeneratedOutputs({ journalPath: validated.journalPath }, fs);
    } catch (recoveryError) {
      throw transactionError(
        "GENERATION_TRANSACTION_RECOVERY_FAILED",
        `generation swap failed and recovery could not complete: ${recoveryError.message}`,
        {
          paths: [validated.journalPath],
          action:
            "preserve the journal and surviving paths; inspect the named recovery failure before retrying",
          cause: recoveryError,
        },
      );
    }
    throw transactionError(
      "GENERATION_TRANSACTION_SWAP_FAILED",
      `generation swap failed after durable journal: ${error.message}`,
      {
        paths: [validated.journalPath],
        action:
          "the previous complete generation was restored; fix the filesystem error and rerun Mint",
        cause: error,
      },
    );
  }
}

async function readJournal(operation, fs) {
  let bytes;
  try {
    bytes = await fs.readFile(operation.journalPath);
  } catch (error) {
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      `cannot read generation journal ${operation.journalPath}: ${error.message}`,
      {
        paths: [operation.journalPath],
        action: "preserve the journal and outputs; restore a known-good journal before retrying",
        cause: error,
      },
    );
  }
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch (error) {
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      `generation journal ${operation.journalPath} is malformed JSON`,
      {
        paths: [operation.journalPath],
        action: "preserve the journal and outputs; repair or remove it only after manual recovery",
        cause: error,
      },
    );
  }
}

async function stateFor(target, fs) {
  const [current, next, backup] = await Promise.all([
    fs.pathState(target.current),
    fs.pathState(target.next),
    fs.pathState(target.backup),
  ]);
  if ([current, next, backup].includes("symlink") || [current, next, backup].includes("other")) {
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      "generation transaction found an unsupported target state",
      {
        paths: [target.current, target.next, target.backup],
        action: "preserve every survivor and resolve the unsupported path manually",
      },
    );
  }
  const required = target.kind;
  const present = (state) => state === required;
  if (
    (current !== "missing" && !present(current)) ||
    (next !== "missing" && !present(next)) ||
    (backup !== "missing" && !present(backup))
  ) {
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      "generation transaction target kind does not match its journal",
      {
        paths: [target.current, target.next, target.backup],
        action: "preserve every survivor and resolve the mismatched target manually",
      },
    );
  }
  if (present(current) && present(next) && backup === "missing") return "unstarted";
  if (current === "missing" && present(next) && present(backup)) return "backed-up";
  if (present(current) && next === "missing" && present(backup)) return "committed";
  if (present(current) && next === "missing" && backup === "missing") return "clean";
  throw transactionError(
    "GENERATION_TRANSACTION_UNRECOVERABLE",
    "generation transaction is ambiguous and will not mutate any output",
    {
      paths: [target.current, target.next, target.backup],
      action: "preserve the journal and outputs; restore one complete generation manually",
    },
  );
}

async function restoreOld(validated, states, fs) {
  for (let index = 0; index < validated.journal.targets.length; index += 1) {
    const target = validated.journal.targets[index];
    const state = states[index];
    if (state === "committed") {
      await fs.rename(target.current, target.next);
      await syncParent(fs, target.current);
      await fs.rename(target.backup, target.current);
      await syncParent(fs, target.current);
    } else if (state === "backed-up") {
      await fs.rename(target.backup, target.current);
      await syncParent(fs, target.current);
    }
  }
  for (const target of validated.journal.targets) {
    if ((await fs.pathState(target.next)) !== "missing") await removeAndSync(fs, target.next);
    if ((await fs.pathState(target.backup)) !== "missing") await removeAndSync(fs, target.backup);
  }
  await removeAndSync(fs, validated.journalPath);
}

async function finishNew(validated, fs) {
  for (const target of validated.journal.targets) {
    if ((await fs.pathState(target.backup)) !== "missing") await removeAndSync(fs, target.backup);
  }
  await removeAndSync(fs, validated.journalPath);
}

/**
 * Recover an existing durable journal. It validates every path before any
 * mutation, then chooses one complete generation for all three outputs.
 */
export async function recoverGeneratedOutputs(operation, fs = nodeSwapFs) {
  if (!operation || typeof operation.journalPath !== "string") {
    throw transactionError(
      "GENERATION_TRANSACTION_INVALID",
      "recovery requires a caller-owned journalPath",
      { action: "supply the exact durable journal path" },
    );
  }
  validateJournalPath(operation.journalPath);
  if ((await fs.pathState(operation.journalPath)) === "missing") return { generation: "none" };
  const journal = await readJournal(operation, fs);
  let validated;
  try {
    validated = await validateSafePaths({ journalPath: operation.journalPath, journal }, fs);
  } catch (error) {
    if (error instanceof GenerationTransactionError) throw error;
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      `cannot validate generation journal: ${error.message}`,
      { paths: [operation.journalPath], cause: error },
    );
  }
  const states = [];
  for (const target of validated.journal.targets) states.push(await stateFor(target, fs));
  const paths = [
    validated.journalPath,
    ...validated.journal.targets.flatMap((target) => [target.current, target.next, target.backup]),
  ];
  let generation;
  let operationToRun;
  if (states.every((state) => state === "committed" || state === "clean")) {
    generation = "new";
    operationToRun = () => finishNew(validated, fs);
  } else if (
    states.every((state) => state === "unstarted" || state === "backed-up" || state === "committed")
  ) {
    generation = "old";
    operationToRun = () => restoreOld(validated, states, fs);
  } else {
    throw transactionError(
      "GENERATION_TRANSACTION_UNRECOVERABLE",
      "generation transaction cannot produce one coherent old or new generation",
      {
        paths,
        action: "preserve the journal and outputs; recover one generation manually",
      },
    );
  }
  try {
    await operationToRun();
  } catch (error) {
    throw transactionError(
      "GENERATION_TRANSACTION_RECOVERY_FAILED",
      `generation recovery could not complete ${generation} generation: ${error.message}`,
      {
        paths,
        action:
          "preserve the journal and every surviving output; correct the named filesystem failure and retry recovery",
        cause: error,
      },
    );
  }
  return { generation };
}
