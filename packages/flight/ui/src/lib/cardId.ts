/**
 * Card ids are embedded verbatim in a runId
 * (`<cardId>_<YYYYMMDDTHHMMSSZ>_<nonce>`, see
 * `packages/flight/src/qa/util/id.ts#makeRunId`) and parsed back out by
 * `parseRunId`'s `^[a-zA-Z0-9-]+_\d{8}T\d{6}Z_[a-z0-9]{4}$` regex. A card id
 * containing anything outside `[a-zA-Z0-9-]` (spaces, underscores, dots,
 * slashes, ...) breaks that round-trip: `parseRunId` fails to match the
 * composed runId, the WebSocket upgrade for the run's live transcript is
 * silently refused (`decideUpgrade` returns null), and the UI is stuck on
 * "connecting" with no diagnostic pointing back at the id. Validate
 * client-side against the same charset so the failure surfaces at
 * card-creation time instead.
 */
export const CARD_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

export function isValidCardId(id: string): boolean {
  return CARD_ID_PATTERN.test(id);
}
