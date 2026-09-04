/**
 * Canonical card-status vocabulary, matching the five values
 * `CardEditor`'s `<select id="card-status">` actually lets a user pick:
 * `draft`, `ready`, `running`, `passed`, `failed`. Nothing server-side
 * normalizes or rejects a card's `status` field, so any UI surface that
 * lists or colors statuses has to independently cover all five or a card
 * assigned one of the uncovered values becomes unfilterable / visually
 * indistinguishable from another status. `CardsList`'s filter dropdown and
 * `StatusBadge`'s color map both consume this list so they can't drift
 * from `CardEditor` (or each other) again.
 */
export const CARD_STATUSES = ["draft", "ready", "running", "passed", "failed"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
};

/**
 * Color classes for the card-status vocabulary. Distinct from
 * `StatusBadge`'s run-verdict vocabulary (`pass`/`fail`/`investigate`/
 * `errored`/`cancelled`) — a card's `status` field and a run's `status`
 * field are different enums that happen to share a rendering component.
 */
export const CARD_STATUS_COLORS: Record<CardStatus, string> = {
  draft: "bg-panel text-slate",
  ready: "bg-teal-wash text-teal-dark",
  running: "bg-yellow-100 text-yellow-800",
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

/** Run-verdict vocabulary — `VerdictResult["status"]`, plus `cancelled`. */
const RUN_STATUS_COLORS: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  investigate: "bg-yellow-100 text-yellow-800",
  // PRI-1507: a run that didn't reach a verdict (today: shutdown
  // interrupted; future: other terminal errors). Red treatment shared
  // with `fail`.
  errored: "bg-red-100 text-red-800",
  cancelled: "bg-panel text-slate",
};

const DEFAULT_STATUS_COLOR = "bg-panel text-slate";

/**
 * `StatusBadge` renders both run-verdict statuses (`pass`/`fail`/...) and
 * card statuses (`draft`/`ready`/`running`/`passed`/`failed`) through one
 * component. Resolve across both vocabularies so a card's `running` /
 * `passed` / `failed` status gets a distinct color instead of falling
 * through to the undifferentiated default.
 */
export function statusColorClass(status: string): string {
  return (
    RUN_STATUS_COLORS[status] ?? CARD_STATUS_COLORS[status as CardStatus] ?? DEFAULT_STATUS_COLOR
  );
}
