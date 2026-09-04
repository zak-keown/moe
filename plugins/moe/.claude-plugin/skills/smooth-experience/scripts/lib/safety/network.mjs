import { isIP } from "node:net";
import { domainToASCII } from "node:url";

/**
 * Classify the already-redacted hostname emitted by native read-oriented web
 * evidence readers. Raw URLs are deliberately outside this module's boundary.
 *
 * @param {unknown} operation
 */
export function classifyNetwork(operation) {
  if (
    !operation ||
    typeof operation !== "object" ||
    Array.isArray(operation) ||
    Object.keys(operation).length !== 1 ||
    !Object.hasOwn(operation, "hostname") ||
    typeof operation.hostname !== "string"
  ) {
    return declined("invalid hostname operation");
  }
  const original = operation.hostname;
  if (
    original.length === 0 ||
    original.endsWith(".") ||
    original.includes("*") ||
    original.includes("\0")
  ) {
    return declined("hostname is not exact");
  }

  const hostname = domainToASCII(original).toLowerCase();
  const labels = hostname.split(".");
  if (
    !hostname ||
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return declined("hostname is invalid");
  }
  if (
    isIP(hostname) !== 0 ||
    labels.every((label) => /^\d+$/.test(label)) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return declined("local, private, and IP targets are not eligible");
  }
  return {
    eligible: true,
    normalized: { hostname },
    globalSafe: true,
    reason: "exact public hostname from native web evidence",
  };
}

function declined(reason) {
  return { eligible: false, globalSafe: false, reason };
}
