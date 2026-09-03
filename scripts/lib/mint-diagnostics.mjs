/**
 * Render operational Mint failures without losing the recovery contract carried
 * by structured errors. Both recovery-first and generation entry points use
 * this format so operators get the same fields at the point of failure.
 */
export function renderMintFailure(title, error, fallbackCode = "MINT_OPERATION_FAILED") {
  const detail = error instanceof Error ? error : new Error(String(error));
  const lines = [
    `${title} failed`,
    `code: ${typeof detail.code === "string" ? detail.code : fallbackCode}`,
    `message: ${detail.message}`,
  ];
  if (Array.isArray(detail.paths) && detail.paths.length > 0) {
    lines.push(`paths: ${detail.paths.join(", ")}`);
  }
  if (typeof detail.action === "string") lines.push(`action: ${detail.action}`);
  if (detail.cause instanceof Error) lines.push(`cause: ${detail.cause.message}`);
  return lines.join("\n");
}
