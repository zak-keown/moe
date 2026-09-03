/**
 * @typedef {{ command: string } | { argv: string[] } | { action: "read" | "modify", path: string } | { hostname: string } | { toolId: string }} Operation
 */

/**
 * @typedef {object} EvidenceRecord
 * @property {"claude" | "codex"} harness
 * @property {string} rootSessionId
 * @property {string} projectRoot
 * @property {string} observedAt
 * @property {"shell" | "filesystem" | "network" | "mcp"} class
 * @property {Operation} operation
 * @property {"success" | "denied" | "failed" | "unknown"} outcome
 * @property {"explicit" | "existing-rule" | "automatic" | "unknown"} approvalProvenance
 * @property {string} sourceSchema
 */

/**
 * @typedef {object} EvidenceSummary
 * @property {Record<string, number>} counts
 */

const FIELDS = new Set([
  "harness",
  "rootSessionId",
  "projectRoot",
  "observedAt",
  "class",
  "operation",
  "outcome",
  "approvalProvenance",
  "sourceSchema",
]);
const ENUMS = {
  harness: new Set(["claude", "codex"]),
  class: new Set(["shell", "filesystem", "network", "mcp"]),
  outcome: new Set(["success", "denied", "failed", "unknown"]),
  approvalProvenance: new Set([
    "explicit",
    "existing-rule",
    "automatic",
    "unknown",
  ]),
};

/**
 * @param {EvidenceRecord} input
 * @returns {EvidenceRecord}
 */
export function makeEvidence(input) {
  for (const key of Object.keys(input)) {
    if (!FIELDS.has(key)) throw new TypeError(`unknown evidence field: ${key}`);
  }
  for (const [key, values] of Object.entries(ENUMS)) {
    if (!values.has(input[key])) throw new TypeError(`invalid ${key}`);
  }
  if (
    !input.rootSessionId ||
    !input.projectRoot ||
    !input.sourceSchema ||
    !Number.isFinite(Date.parse(input.observedAt))
  ) {
    throw new TypeError("incomplete evidence record");
  }
  return Object.freeze({
    ...input,
    operation: Object.freeze(validateOperation(input.class, input.operation)),
  });
}

function validateOperation(evidenceClass, operation) {
  if (!isPlainObject(operation) || Object.keys(operation).length === 0) {
    throw new TypeError("invalid operation");
  }
  if (evidenceClass === "shell") return validateShellOperation(operation);
  if (evidenceClass === "filesystem") return validateFilesystemOperation(operation);
  if (evidenceClass === "network") return validateNetworkOperation(operation);
  return validateMcpOperation(operation);
}

function validateShellOperation(operation) {
  rejectUnknownOperationFields("shell", operation, new Set(["command", "argv"]));
  if (Object.hasOwn(operation, "command") && hasExactly(operation, ["command"])) {
    if (isNonEmptyString(operation.command)) return { command: operation.command };
  }
  if (Object.hasOwn(operation, "argv") && hasExactly(operation, ["argv"])) {
    if (
      Array.isArray(operation.argv) &&
      operation.argv.length > 0 &&
      operation.argv.every(isNonEmptyString)
    ) {
      return { argv: Object.freeze([...operation.argv]) };
    }
  }
  throw new TypeError("invalid operation");
}

function validateFilesystemOperation(operation) {
  rejectUnknownOperationFields("filesystem", operation, new Set(["action", "path"]));
  if (
    hasExactly(operation, ["action", "path"]) &&
    ["read", "modify"].includes(operation.action) &&
    isNonEmptyString(operation.path)
  ) {
    return { action: operation.action, path: operation.path };
  }
  throw new TypeError("invalid operation");
}

function validateNetworkOperation(operation) {
  rejectUnknownOperationFields("network", operation, new Set(["hostname"]));
  if (hasExactly(operation, ["hostname"]) && isHostname(operation.hostname)) {
    return { hostname: operation.hostname };
  }
  throw new TypeError("invalid operation");
}

function validateMcpOperation(operation) {
  rejectUnknownOperationFields("mcp", operation, new Set(["toolId"]));
  if (hasExactly(operation, ["toolId"]) && isNonEmptyString(operation.toolId)) {
    return { toolId: operation.toolId };
  }
  throw new TypeError("invalid operation");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function rejectUnknownOperationFields(evidenceClass, operation, fields) {
  for (const key of Object.keys(operation)) {
    if (!fields.has(key)) {
      throw new TypeError(`unknown ${evidenceClass} operation field: ${key}`);
    }
  }
}

function hasExactly(operation, fields) {
  return Object.keys(operation).length === fields.length && fields.every((field) => Object.hasOwn(operation, field));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isHostname(value) {
  return isNonEmptyString(value) && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
}

/**
 * @param {EvidenceRecord} record
 * @returns {string}
 */
export function evidenceKey(record) {
  return [
    record.harness,
    record.class,
    JSON.stringify(record.operation, Object.keys(record.operation).sort()),
  ].join("\0");
}

/**
 * @param {EvidenceRecord[]} records
 * @returns {EvidenceSummary}
 */
export function redactedEvidenceSummary(records) {
  const counts = new Map();
  for (const record of records) {
    const key = `${record.harness}:${record.class}:${record.outcome}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
  };
}
