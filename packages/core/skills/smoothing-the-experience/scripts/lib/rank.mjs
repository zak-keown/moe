import { createHash } from "node:crypto";
import { renderClaudeCandidate } from "./harnesses/claude.mjs";
import { renderCodexPermission, renderCodexPermissionBody } from "./harnesses/codex.mjs";
import { classifyFilesystem } from "./safety/filesystem.mjs";
import { classifyMcp } from "./safety/mcp.mjs";
import { classifyNetwork } from "./safety/network.mjs";
import { classifyShell } from "./safety/shell.mjs";

const CONFIDENCE = { high: 3, medium: 2, low: 1 };
const PROVENANCE = { explicit: 3, unknown: 2, automatic: 1 };

/**
 * Derive an opaque stable identifier from public candidate identity. Project
 * paths are one-way hashed and ephemeral evidence counts never participate.
 *
 * @param {object} candidate
 */
export function candidateId(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("candidate is required");
  if (!["claude", "codex"].includes(candidate.harness)) throw new TypeError("candidate harness is required");
  if (!["shell", "filesystem", "network", "mcp"].includes(candidate.class)) {
    throw new TypeError("candidate class is required");
  }
  if (!["project", "global"].includes(candidate.scope)) throw new TypeError("candidate scope is required");
  if (candidate.scope === "project" && typeof candidate.projectRoot !== "string") {
    throw new TypeError("project candidates require a project root");
  }
  const projectIdentity = candidate.scope === "project"
    ? createHash("sha256").update(candidate.projectRoot).digest("hex")
    : null;
  const rule = canonicalRule(candidate.rule);
  const publicIdentity = JSON.stringify({
    harness: candidate.harness,
    class: candidate.class,
    scope: candidate.scope,
    projectIdentity,
    rule,
  });
  return `${candidate.harness}-${candidate.class}-${createHash("sha256").update(publicIdentity).digest("hex").slice(0, 12)}`;
}

function canonicalRule(rule) {
  if (typeof rule !== "string" || rule.length === 0) throw new TypeError("candidate rule is required");
  return rule.replace(/^# moe-smoothing:[^\n]+\n/, "");
}

/**
 * Rank candidates without mutating caller input.
 *
 * @param {object[]} candidates
 * @param {{all?: boolean}} [options]
 */
export function rankCandidates(candidates, { all = false } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
  const sorted = [...candidates].sort(compareCandidates);
  if (all) return sorted;
  const perClass = new Map();
  return sorted.filter((candidate) => {
    if ((perClass.get(candidate.class) ?? 0) >= 5) return false;
    perClass.set(candidate.class, (perClass.get(candidate.class) ?? 0) + 1);
    return true;
  }).slice(0, 10);
}

function compareCandidates(left, right) {
  return (
    (CONFIDENCE[right.confidence] ?? 0) - (CONFIDENCE[left.confidence] ?? 0) ||
    (right.rootSessionCount ?? 0) - (left.rootSessionCount ?? 0) ||
    Date.parse(right.lastSeen ?? 0) - Date.parse(left.lastSeen ?? 0) ||
    (right.successfulObservationCount ?? 0) - (left.successfulObservationCount ?? 0) ||
    compareCodeUnits(canonicalRule(left.rule), canonicalRule(right.rule)) ||
    compareCodeUnits(String(left.id ?? ""), String(right.id ?? ""))
  );
}

/**
 * Aggregate normalized evidence into scoped, rendered candidates.
 *
 * @param {object[]} records
 * @param {object} [context]
 */
export async function buildCandidates(records, context = {}) {
  if (!Array.isArray(records)) throw new TypeError("evidence records must be an array");
  const classified = [];
  for (const record of [...records].sort(compareEvidence)) {
    const policy = await classifyRecord(record, context);
    if (policy?.eligible) classified.push({ record, policy });
  }

  const projectGroups = groupClassifiedByAuthority(classified, "project", context);
  const candidates = [];
  const dispositions = [];
  const operationHasProjectCandidate = new Set();
  for (const [, group] of [...projectGroups].sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (isSuppressed(group)) continue;
    const successful = group.filter(({ record }) => record.outcome === "success");
    if (distinct(successful, ({ record }) => record.rootSessionId).size < 2) continue;
    operationHasProjectCandidate.add(authorityKey(group[0], "global", context, false));
    addRenderedCandidate(candidates, dispositions, candidateFor(successful, group[0].policy, "project"), context);
  }

  const operationGroups = groupClassifiedByAuthority(classified, "global", context);
  for (const [groupKey, group] of [...operationGroups].sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (operationHasProjectCandidate.has(groupKey) || !group.every(({ policy }) => policy.globalSafe)) continue;
    if (isSuppressed(group)) continue;
    const successful = group.filter(({ record }) => record.outcome === "success");
    if (
      distinct(successful, ({ record }) => record.projectRoot).size < 2 ||
      distinct(successful, ({ record }) => record.rootSessionId).size < 2
    ) {
      continue;
    }
    addRenderedCandidate(candidates, dispositions, candidateFor(successful, group[0].policy, "global"), context);
  }

  const suggestions = [];
  for (const harness of ["claude", "codex"]) {
    suggestions.push(
      ...rankCandidates(
        candidates.filter((candidate) => candidate.harness === harness),
        { all: context.all === true },
      ),
    );
  }
  dispositions.sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right)));
  return { suggestions, dispositions };
}

function compareEvidence(left, right) {
  return compareCodeUnits(stableJson(left), stableJson(right));
}

async function classifyRecord(record, context) {
  if (!record || typeof record !== "object" || !["claude", "codex"].includes(record.harness)) {
    return null;
  }
  const specific = harnessContext(context, record.harness, record.projectRoot);
  if (record.class === "shell") return classifyShell(record.operation, specific);
  if (record.class === "filesystem") return classifyFilesystem(record.operation, specific);
  if (record.class === "network") return classifyNetwork(record.operation);
  if (record.class === "mcp") return classifyMcp(record.operation);
  return null;
}

function harnessContext(context, harness, projectRoot) {
  const specific = context[harness] ?? context.harnesses?.[harness] ?? {};
  return {
    ...context,
    ...specific,
    harness,
    projectRoot,
    realpath: specific.realpath ?? context.realpath,
  };
}

function groupClassifiedByAuthority(classified, scope, context) {
  const groups = new Map();
  for (const item of classified) {
    const key = authorityKey(item, scope, context, scope === "project");
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function authorityKey(item, scope, context, includeProject) {
  const authority = canonicalAuthorityRule(item, scope, context) ??
    `unrenderable:${stableJson(item.policy.normalized)}`;
  return [
    item.record.harness,
    item.record.class,
    scope,
    authority,
    ...(includeProject ? [item.record.projectRoot] : []),
  ].join("\0");
}

function canonicalAuthorityRule({ record, policy }, scope, context) {
  const candidate = {
    harness: record.harness,
    class: record.class,
    scope,
    ...(scope === "project" ? { projectRoot: record.projectRoot } : {}),
    operation: policy.normalized,
  };
  const renderContext = harnessContext(context, record.harness, record.projectRoot);
  if (record.harness === "claude") {
    return renderClaudeCandidate(candidate, renderContext)?.rule ?? null;
  }
  return renderCodexPermissionBody(candidate, renderContext);
}

function isSuppressed(group) {
  return group.some(
    ({ record }) => record.outcome === "denied" || record.approvalProvenance === "existing-rule",
  );
}

function candidateFor(successful, policy, scope) {
  const records = successful.map(({ record }) => record);
  const exemplar = records[0];
  const approvalProvenance = records
    .map((record) => record.approvalProvenance)
    .filter((value) => Object.hasOwn(PROVENANCE, value))
    .sort((left, right) => PROVENANCE[right] - PROVENANCE[left])[0] ?? "automatic";
  return {
    harness: exemplar.harness,
    class: exemplar.class,
    scope,
    ...(scope === "project" ? { projectRoot: exemplar.projectRoot } : {}),
    operation: policy.normalized,
    rootSessionCount: distinct(successful, ({ record }) => record.rootSessionId).size,
    projectCount: distinct(successful, ({ record }) => record.projectRoot).size,
    successfulObservationCount: records.length,
    lastSeen: records.map((record) => record.observedAt).sort().at(-1),
    approvalProvenance,
    confidence: approvalProvenance === "explicit"
      ? "high"
      : approvalProvenance === "unknown"
        ? "medium"
        : "low",
    reason: policy.reason,
  };
}

function addRenderedCandidate(candidates, dispositions, candidate, context) {
  const renderContext = harnessContext(
    context,
    candidate.harness,
    candidate.projectRoot ?? context.projectRoot ?? "",
  );
  const canonicalRuleValue = candidate.harness === "claude"
    ? renderClaudeCandidate(candidate, renderContext)?.rule
    : renderCodexPermissionBody(candidate, renderContext);
  if (!canonicalRuleValue) {
    dispositions.push({
      harness: candidate.harness,
      class: candidate.class,
      scope: candidate.scope,
      disposition: "no narrow renderer",
    });
    return;
  }
  const id = candidateId({ ...candidate, rule: canonicalRuleValue });
  const rendered = candidate.harness === "claude"
    ? renderClaudeCandidate({ ...candidate, id }, renderContext)
    : renderCodexPermission({ ...candidate, id }, renderContext);
  if (rendered) {
    candidates.push(rendered);
  } else {
    dispositions.push({
      harness: candidate.harness,
      class: candidate.class,
      scope: candidate.scope,
      disposition: "no narrow renderer",
    });
  }
}

function distinct(values, select) {
  return new Set(values.map(select));
}

function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
