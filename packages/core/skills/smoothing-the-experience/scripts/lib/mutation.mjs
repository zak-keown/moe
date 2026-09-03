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
  "mutation",
  "intentSha256",
  "selected",
  "restartRequired",
];
const MUTATIONS = Object.freeze({
  claude: "append-permissions-allow",
  codex: "append-managed-prefix-rules",
});

/**
 * Write only selected permission material and source-bound mutation intent to
 * a restrictive plan. Source and replacement contents never enter the plan.
 */
export async function createBoundPlan({
  harness,
  selected,
  destination,
  sourceBytes,
  now = () => new Date().toISOString(),
  planDir,
  fsOps = defaultFs,
}) {
  const selectedRules = normalizeSelected(selected, harness);
  if (sourceBytes !== null && !ArrayBuffer.isView(sourceBytes)) {
    throw new TypeError("source bytes must be a byte array or null");
  }
  if (!isSafeAbsolutePath(planDir)) throw new TypeError("plan directory must be absolute");

  const source = {
    exists: sourceBytes !== null,
    sha256: sourceBytes === null ? null : sha256(Buffer.from(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength)),
  };
  const mutation = { operation: MUTATIONS[harness] };
  const intent = {
    version: 2,
    harness,
    destination,
    source,
    mutation,
    selected: selectedRules,
    restartRequired: harness === "codex",
  };
  const plan = {
    ...intent,
    createdAt: now(),
    intentSha256: sha256(Buffer.from(JSON.stringify(intent), "utf8")),
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

/** Render only the selected semantic additions, never unrelated source bytes. */
export function formatUnifiedDiff({ plan }) {
  const stored = withoutPath(plan);
  assertBoundPlan(stored);
  const hunk = stored.harness === "claude"
    ? "append permissions.allow"
    : "append managed prefix_rule blocks";
  const additions = stored.selected
    .flatMap(({ rule }) => rule.trimEnd().split("\n"))
    .map((line) => `+${line}\n`)
    .join("");
  return `--- ${stored.destination} (selected permissions)\n+++ ${stored.destination} (selected permissions)\n@@ ${hunk} @@\n${additions}`;
}

/** Apply exactly one confirmed harness plan under an exclusive config lock. */
export async function applyBoundPlan({
  planPath,
  expectedHarness,
  confirmToken,
  deriveReplacement,
  isAlreadyApplied,
  validatePlan,
  validateReplacement,
  createParent = false,
  fsOps = defaultFs,
}) {
  const plan = await readBoundPlan(planPath, fsOps);
  const expectedToken = `apply:${plan.harness}:${plan.intentSha256}`;
  if (plan.harness !== expectedHarness || confirmToken !== expectedToken) {
    throw new Error("explicit harness confirmation does not match plan");
  }
  if (typeof validateReplacement !== "function") {
    throw new TypeError("replacement validator is required");
  }
  if (typeof deriveReplacement !== "function" || typeof isAlreadyApplied !== "function") {
    throw new TypeError("replacement derivation and semantic idempotency checks are required");
  }
  if (typeof validatePlan !== "function") throw new TypeError("plan validator is required");
  const createdParents = [];
  try {
    if (createParent && !plan.source.exists) {
      await createMissingParentDirectories(dirname(plan.destination), fsOps, createdParents);
    }
    return await withExclusiveLock(`${plan.destination}.moe-smoothing.lock`, fsOps, () =>
      deriveValidateAndReplace(
        plan,
        { deriveReplacement, isAlreadyApplied, validatePlan, validateReplacement },
        fsOps,
      ),
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
    if (plan.version !== 2 || !HARNESSES.has(plan.harness)) throw new Error();
    if (!isTimestamp(plan.createdAt) || !isSafeAbsolutePath(plan.destination)) throw new Error();
    if (!isPlainObject(plan.source) || !hasExactFields(plan.source, ["exists", "sha256"])) {
      throw new Error();
    }
    if (typeof plan.source.exists !== "boolean") throw new Error();
    if (plan.source.exists ? !isSha256(plan.source.sha256) : plan.source.sha256 !== null) {
      throw new Error();
    }
    if (
      !isPlainObject(plan.mutation) ||
      !hasExactFields(plan.mutation, ["operation"]) ||
      plan.mutation.operation !== MUTATIONS[plan.harness] ||
      !isSha256(plan.intentSha256)
    ) {
      throw new Error();
    }
    const selected = validateStoredSelected(plan.selected, plan.harness);
    if (selected.length !== plan.selected.length) throw new Error();
    if (plan.restartRequired !== (plan.harness === "codex")) throw new Error();
    const intent = {
      version: plan.version,
      harness: plan.harness,
      destination: plan.destination,
      source: plan.source,
      mutation: plan.mutation,
      selected: plan.selected,
      restartRequired: plan.restartRequired,
    };
    if (sha256(Buffer.from(JSON.stringify(intent), "utf8")) !== plan.intentSha256) throw new Error();
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

async function deriveValidateAndReplace(plan, callbacks, fsOps) {
  const observed = await readOptional(plan.destination, fsOps);
  if (sha256OrNull(observed) !== plan.source.sha256) {
    if (await callbacks.isAlreadyApplied(observed, plan)) {
      return { status: "already-applied", destination: plan.destination };
    }
    throw new Error("stale source config");
  }
  const planValidation = await callbacks.validatePlan(plan);
  if (planValidation === false) throw new Error("plan validation failed");
  const current = await readOptional(plan.destination, fsOps);
  if (sha256OrNull(current) !== plan.source.sha256) throw new Error("stale source config");
  const replacement = await callbacks.deriveReplacement(current, plan);
  if (typeof replacement !== "string") throw new TypeError("replacement derivation must return a string");
  const replacementBytes = Buffer.from(replacement, "utf8");
  if (current !== null && replacementBytes.equals(current)) {
    return { status: "already-applied", destination: plan.destination };
  }
  const validation = await callbacks.validateReplacement(replacement, current, plan);
  if (validation === false) throw new Error("replacement validation failed");
  const replacementSha256 = sha256(replacementBytes);

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
    await handle.writeFile(replacement, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fsOps.rename(temporaryPath, plan.destination);
    renamed = true;
    const applied = await readOptional(plan.destination, fsOps);
    if (sha256OrNull(applied) !== replacementSha256) {
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

function withoutPath(plan) {
  if (!isPlainObject(plan)) return plan;
  const { path: _path, ...stored } = plan;
  return stored;
}

function invalidPlan(reason, cause) {
  return new Error(`invalid bound plan: ${reason}`, { cause });
}
