import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

const defaultFs = { mkdir, open, readFile, rename, rmdir, unlink, writeFile };
const HARNESSES = new Set(["claude", "codex"]);
const PLAN_FIELDS = [
  "version",
  "harness",
  "createdAt",
  "destination",
  "source",
  "replacement",
  "replacementSha256",
  "selected",
  "restartRequired",
];

/**
 * Write the selected permission material and its complete replacement to a
 * restrictive, source-hash-bound plan.
 */
export async function createBoundPlan({
  harness,
  selected,
  destination,
  sourceBytes,
  replacement,
  now = () => new Date().toISOString(),
  planDir,
  fsOps = defaultFs,
}) {
  const selectedRules = normalizeSelected(selected, harness);
  if (sourceBytes !== null && !ArrayBuffer.isView(sourceBytes)) {
    throw new TypeError("source bytes must be a byte array or null");
  }
  if (typeof replacement !== "string") throw new TypeError("replacement must be a string");
  if (!isSafeAbsolutePath(planDir)) throw new TypeError("plan directory must be absolute");

  const plan = {
    version: 1,
    harness,
    createdAt: now(),
    destination,
    source: {
      exists: sourceBytes !== null,
      sha256: sourceBytes === null ? null : sha256(Buffer.from(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength)),
    },
    replacement,
    replacementSha256: sha256(Buffer.from(replacement, "utf8")),
    selected: selectedRules,
    restartRequired: harness === "codex",
  };
  assertBoundPlan(plan);

  const path = join(planDir, `moe-smoothing-${harness}-${randomUUID()}.json`);
  await fsOps.writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return { ...plan, path };
}

/** Read and validate a plan without accepting extension or evidence fields. */
export async function readBoundPlan(path, fsOps = defaultFs) {
  let parsed;
  try {
    parsed = JSON.parse(await fsOps.readFile(path, "utf8"));
  } catch (error) {
    throw invalidPlan("the plan is not valid JSON", error);
  }
  assertBoundPlan(parsed);
  return { ...parsed, path };
}

/** Render the exact old and replacement bytes as one deterministic full hunk. */
export function formatUnifiedDiff({ destination, sourceBytes, replacement }) {
  if (!isSafeAbsolutePath(destination)) throw new TypeError("destination must be absolute");
  if (sourceBytes !== null && !ArrayBuffer.isView(sourceBytes)) {
    throw new TypeError("source bytes must be a byte array or null");
  }
  if (typeof replacement !== "string") throw new TypeError("replacement must be a string");

  const oldText = sourceBytes === null
    ? ""
    : new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength),
    );
  const oldFile = splitFile(oldText);
  const newFile = splitFile(replacement);
  let diff = `--- ${sourceBytes === null ? "/dev/null" : destination}\n+++ ${destination}\n`;
  diff += `@@ ${unifiedRange("-", oldFile.lines.length)} ${unifiedRange("+", newFile.lines.length)} @@\n`;
  diff += prefixedLines("-", oldFile);
  diff += prefixedLines("+", newFile);
  return diff;
}

/** Apply exactly one confirmed harness plan under an exclusive config lock. */
export async function applyBoundPlan({
  planPath,
  expectedHarness,
  confirmToken,
  validateReplacement,
  createParent = false,
  fsOps = defaultFs,
}) {
  const plan = await readBoundPlan(planPath, fsOps);
  const expectedToken = `apply:${plan.harness}:${plan.replacementSha256}`;
  if (plan.harness !== expectedHarness || confirmToken !== expectedToken) {
    throw new Error("explicit harness confirmation does not match plan");
  }
  if (typeof validateReplacement !== "function") {
    throw new TypeError("replacement validator is required");
  }

  const current = await readOptional(plan.destination, fsOps);
  if (sha256OrNull(current) === plan.replacementSha256) {
    return { status: "already-applied", destination: plan.destination };
  }
  if (sha256OrNull(current) !== plan.source.sha256) throw new Error("stale source config");
  const validation = await validateReplacement(plan.replacement);
  if (validation === false) throw new Error("replacement validation failed");
  const createdParents = [];
  try {
    if (createParent && current === null) {
      await createMissingParentDirectories(dirname(plan.destination), fsOps, createdParents);
    }
    return await withExclusiveLock(`${plan.destination}.moe-smoothing.lock`, fsOps, () =>
      atomicReplace(plan, fsOps),
    );
  } catch (error) {
    await rollbackEmptyDirectories(createdParents, fsOps);
    throw error;
  }
}

async function createMissingParentDirectories(path, fsOps, created) {
  try {
    await fsOps.mkdir(path, { mode: 0o700 });
    created.push(path);
    return;
  } catch (error) {
    if (error?.code === "EEXIST") return;
    if (error?.code !== "ENOENT" || dirname(path) === path) throw error;
  }

  await createMissingParentDirectories(dirname(path), fsOps, created);
  try {
    await fsOps.mkdir(path, { mode: 0o700 });
    created.push(path);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

async function rollbackEmptyDirectories(created, fsOps) {
  for (let index = created.length - 1; index >= 0; index -= 1) {
    try {
      await fsOps.rmdir(created[index]);
    } catch {
      // rmdir is intentionally the gate: it preserves nonempty or replaced paths.
    }
  }
}

function normalizeSelected(selected, harness) {
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new TypeError("selected permission IDs are required");
  }
  const normalized = selected.map((entry) => {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.rule)) {
      throw new TypeError("selected permission IDs are required");
    }
    return { id: entry.id, rule: entry.rule };
  });
  const ids = new Set(normalized.map(({ id }) => id));
  if (ids.size !== normalized.length) throw new TypeError("duplicate selected permission ID");
  if (!HARNESSES.has(harness) || normalized.some(({ id }) => !id.startsWith(`${harness}-`))) {
    throw new TypeError("selected permissions must belong to one harness");
  }
  return normalized;
}

function assertBoundPlan(plan) {
  try {
    if (!isPlainObject(plan) || !hasExactFields(plan, PLAN_FIELDS)) throw new Error();
    if (plan.version !== 1 || !HARNESSES.has(plan.harness)) throw new Error();
    if (!isTimestamp(plan.createdAt) || !isSafeAbsolutePath(plan.destination)) throw new Error();
    if (!isPlainObject(plan.source) || !hasExactFields(plan.source, ["exists", "sha256"])) {
      throw new Error();
    }
    if (typeof plan.source.exists !== "boolean") throw new Error();
    if (plan.source.exists ? !isSha256(plan.source.sha256) : plan.source.sha256 !== null) {
      throw new Error();
    }
    if (typeof plan.replacement !== "string" || !isSha256(plan.replacementSha256)) {
      throw new Error();
    }
    if (sha256(Buffer.from(plan.replacement, "utf8")) !== plan.replacementSha256) throw new Error();
    const selected = validateStoredSelected(plan.selected, plan.harness);
    if (selected.length !== plan.selected.length) throw new Error();
    if (plan.restartRequired !== (plan.harness === "codex")) throw new Error();
  } catch (error) {
    if (error?.message?.startsWith("invalid bound plan")) throw error;
    throw invalidPlan("schema validation failed", error);
  }
}

function validateStoredSelected(selected, harness) {
  if (!Array.isArray(selected) || selected.length === 0) throw new Error();
  const ids = new Set();
  for (const entry of selected) {
    if (
      !isPlainObject(entry) ||
      !hasExactFields(entry, ["id", "rule"]) ||
      !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.rule) ||
      !entry.id.startsWith(`${harness}-`) ||
      ids.has(entry.id)
    ) {
      throw new Error();
    }
    ids.add(entry.id);
  }
  return selected;
}

async function withExclusiveLock(lockPath, fsOps, action) {
  let lockHandle;
  try {
    lockHandle = await fsOps.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("config mutation lock is held", { cause: error });
    throw error;
  }

  let actionFailed = false;
  try {
    return await action();
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    const releaseError = await releaseLock(lockHandle, lockPath, fsOps);
    if (!actionFailed && releaseError) throw releaseError;
  }
}

async function releaseLock(lockHandle, lockPath, fsOps) {
  let releaseError;
  try {
    await lockHandle.close();
  } catch (error) {
    releaseError = error;
  }
  try {
    await fsOps.unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT" && releaseError === undefined) releaseError = error;
  }
  return releaseError;
}

async function atomicReplace(plan, fsOps) {
  const current = await readOptional(plan.destination, fsOps);
  if (sha256OrNull(current) === plan.replacementSha256) {
    return { status: "already-applied", destination: plan.destination };
  }
  if (sha256OrNull(current) !== plan.source.sha256) throw new Error("stale source config");

  const temporaryPath = join(
    dirname(plan.destination),
    `.${basename(plan.destination)}.moe-smoothing-${randomUUID()}.tmp`,
  );
  let handle;
  let temporaryOwned = false;
  let renamed = false;
  let operationError;
  try {
    handle = await fsOps.open(temporaryPath, "wx", 0o600);
    temporaryOwned = true;
    await handle.writeFile(plan.replacement, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fsOps.rename(temporaryPath, plan.destination);
    renamed = true;
    const applied = await readOptional(plan.destination, fsOps);
    if (sha256OrNull(applied) !== plan.replacementSha256) {
      throw new Error("applied config hash verification failed");
    }
    return { status: "applied", destination: plan.destination };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const cleanupError = await cleanupTemporary(
      handle,
      temporaryOwned,
      renamed,
      temporaryPath,
      fsOps,
    );
    if (operationError === undefined && cleanupError) throw cleanupError;
  }
}

async function cleanupTemporary(handle, temporaryOwned, renamed, temporaryPath, fsOps) {
  let cleanupError;
  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      cleanupError = error;
    }
  }
  if (temporaryOwned && !renamed) {
    try {
      await fsOps.unlink(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT" && cleanupError === undefined) cleanupError = error;
    }
  }
  return cleanupError;
}

async function readOptional(path, fsOps) {
  try {
    const value = await fsOps.readFile(path);
    if (typeof value === "string") return Buffer.from(value, "utf8");
    if (!ArrayBuffer.isView(value)) throw new TypeError("filesystem read did not return bytes");
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sha256OrNull(value) {
  return value === null ? null : sha256(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitFile(contents) {
  if (contents === "") return { lines: [], endsWithNewline: true };
  const endsWithNewline = contents.endsWith("\n");
  const lines = contents.split("\n");
  if (endsWithNewline) lines.pop();
  return { lines, endsWithNewline };
}

function prefixedLines(prefix, file) {
  return file.lines
    .map((line, index) => {
      const marker = index === file.lines.length - 1 && !file.endsWithNewline
        ? "\\ No newline at end of file\n"
        : "";
      return `${prefix}${line}\n${marker}`;
    })
    .join("");
}

function unifiedRange(prefix, count) {
  if (count === 0) return `${prefix}0,0`;
  if (count === 1) return `${prefix}1`;
  return `${prefix}1,${count}`;
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeAbsolutePath(value) {
  return typeof value === "string" && isAbsolute(value) && !/[\0\r\n]/.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value, fields) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function invalidPlan(reason, cause) {
  return new Error(`invalid bound plan: ${reason}`, { cause });
}
