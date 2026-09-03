import { realpath as nativeRealpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const POLICY_SEGMENTS = new Set([
  ".aws",
  ".claude",
  ".codex",
  ".git",
  ".gnupg",
  ".ssh",
  "secrets",
]);

/**
 * @param {unknown} operation
 * @param {{ projectRoot: string, anchorProven: boolean, realpath?: (path: string) => Promise<string> }} context
 */
export async function classifyFilesystem(operation, context) {
  if (!isOperation(operation)) return declined("invalid filesystem operation");
  if (!context?.anchorProven) return declined("project anchor was not proven");
  if (typeof context.projectRoot !== "string" || context.projectRoot.length === 0) {
    return declined("project root is missing");
  }

  const root = resolve(context.projectRoot);
  const lexicalTarget = isAbsolute(operation.path)
    ? operation.path
    : resolve(root, operation.path);
  const lexicalPath = relative(root, lexicalTarget);
  if (!isContained(lexicalPath) || hasSecretOrPolicySegment(lexicalPath)) {
    return declined("path escapes the project or names a protected segment");
  }

  try {
    const canonicalize = context.realpath ?? nativeRealpath;
    const canonicalTarget = await canonicalize(lexicalTarget);
    const projectPath = relative(root, canonicalTarget);
    if (!isContained(projectPath) || hasSecretOrPolicySegment(projectPath)) {
      return declined("canonical path escapes the project or names a protected segment");
    }
    return {
      eligible: true,
      normalized: {
        action: operation.action,
        path: projectPath.split(sep).join("/"),
      },
      globalSafe: false,
      reason: "exact path is canonically contained in the proven project",
    };
  } catch {
    return declined("path could not be canonicalized");
  }
}

function isOperation(operation) {
  return (
    operation !== null &&
    typeof operation === "object" &&
    !Array.isArray(operation) &&
    Object.keys(operation).length === 2 &&
    Object.hasOwn(operation, "action") &&
    Object.hasOwn(operation, "path") &&
    (operation.action === "read" || operation.action === "modify") &&
    typeof operation.path === "string" &&
    operation.path.length > 0 &&
    !operation.path.includes("\0")
  );
}

function isContained(projectPath) {
  return (
    projectPath.length > 0 &&
    projectPath !== ".." &&
    !projectPath.startsWith(`..${sep}`) &&
    !isAbsolute(projectPath)
  );
}

function hasSecretOrPolicySegment(projectPath) {
  return projectPath.split(sep).some((segment) => {
    const folded = segment.toLowerCase();
    return (
      POLICY_SEGMENTS.has(folded) ||
      folded === ".env" ||
      folded.startsWith(".env.")
    );
  });
}

function declined(reason) {
  return { eligible: false, globalSafe: false, reason };
}
