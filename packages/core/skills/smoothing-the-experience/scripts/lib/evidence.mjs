/**
 * @typedef {object} Operation
 * @property {string} [action]
 * @property {string} [path]
 * @property {string} [hostname]
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
  return Object.freeze({ ...input, operation: Object.freeze({ ...input.operation }) });
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
