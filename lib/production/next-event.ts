// ----------------------------------------------------------------------------
// next-event.ts
//
// Smart "what's the next event?" resolver for the production kanban. Given
// a job's last logged production_event and its physical layout
// (gmps.board_side), returns the canonical next event the operator is
// most likely to log — single-tap advance.
//
// Off-path events (aoi_failed, touchup, washing only when needed, etc.)
// are reachable via the "+" menu on the kanban card, not via this
// auto-advance.
//
// Single-sided boards skip the SMT bottom passes entirely:
//   smt_top_end → reflow_start (single)   vs   smt_top_end → smt_bottom_start (double)
// ----------------------------------------------------------------------------

export type ProductionEventType =
  | "materials_received"
  | "setup_started"
  | "smt_top_start"
  | "smt_top_end"
  | "smt_bottom_start"
  | "smt_bottom_end"
  | "reflow_start"
  | "reflow_end"
  | "aoi_start"
  | "aoi_passed"
  | "aoi_failed"
  | "through_hole_start"
  | "through_hole_end"
  | "touchup"
  | "washing"
  | "packing"
  | "ready_to_ship";

export const ALL_EVENT_TYPES: ProductionEventType[] = [
  "materials_received",
  "setup_started",
  "smt_top_start",
  "smt_top_end",
  "smt_bottom_start",
  "smt_bottom_end",
  "reflow_start",
  "reflow_end",
  "aoi_start",
  "aoi_passed",
  "aoi_failed",
  "through_hole_start",
  "through_hole_end",
  "touchup",
  "washing",
  "packing",
  "ready_to_ship",
];

// Canonical advance map for double-sided boards. Empty-string key is the
// "no events yet" entry-point. `null` means terminal — no auto-suggestion.
const NEXT_DOUBLE: Record<string, ProductionEventType | null> = {
  "": "materials_received",
  materials_received: "setup_started",
  setup_started: "smt_top_start",
  smt_top_start: "smt_top_end",
  smt_top_end: "smt_bottom_start",
  smt_bottom_start: "smt_bottom_end",
  smt_bottom_end: "reflow_start",
  reflow_start: "reflow_end",
  reflow_end: "aoi_start",
  aoi_start: "aoi_passed",
  aoi_passed: "through_hole_start",
  aoi_failed: null, // off-path: rework decision is human
  through_hole_start: "through_hole_end",
  through_hole_end: "packing", // touchup / washing are optional inserts
  touchup: "washing",
  washing: "packing",
  packing: "ready_to_ship",
  ready_to_ship: null,
};

// Single-sided boards skip the SMT bottom pair.
const NEXT_SINGLE: Record<string, ProductionEventType | null> = {
  ...NEXT_DOUBLE,
  smt_top_end: "reflow_start",
  // The bottom-pass entries stay in the map in case an operator manually
  // logs them via the "+" menu — they then advance to reflow normally.
  smt_bottom_end: "reflow_start",
};

/**
 * Given a job's most recent event type (or null/empty for "nothing logged
 * yet") and the board's physical side, return the canonical next event
 * to suggest. Returns null when the job is at a terminal or off-path
 * state where the next step is human-judgement.
 */
export function getNextEvent(
  lastEventType: string | null | undefined,
  boardSide: string | null | undefined
): ProductionEventType | null {
  const map = boardSide === "single" ? NEXT_SINGLE : NEXT_DOUBLE;
  const key = lastEventType ?? "";
  // Defend against unknown event strings — fall back to terminal.
  if (!(key in map) && key !== "") return null;
  return map[key] ?? null;
}

/** Pretty-print "smt_top_start" → "SMT Top Start". */
export function formatEventLabel(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bSmt\b/g, "SMT")
    .replace(/\bAoi\b/g, "AOI")
    .replace(/\bTh\b/g, "TH");
}

// Grouped layout for the "+" off-path menu on each kanban card. Keep in
// sync with components/production/event-logger.tsx.
export const EVENT_GROUPS: {
  label: string;
  events: { type: ProductionEventType; label: string }[];
}[] = [
  {
    label: "Setup",
    events: [
      { type: "materials_received", label: "Materials Received" },
      { type: "setup_started", label: "Setup Started" },
    ],
  },
  {
    label: "SMT Top",
    events: [
      { type: "smt_top_start", label: "SMT Top Start" },
      { type: "smt_top_end", label: "SMT Top End" },
    ],
  },
  {
    label: "SMT Bottom",
    events: [
      { type: "smt_bottom_start", label: "SMT Bottom Start" },
      { type: "smt_bottom_end", label: "SMT Bottom End" },
    ],
  },
  {
    label: "Reflow",
    events: [
      { type: "reflow_start", label: "Reflow Start" },
      { type: "reflow_end", label: "Reflow End" },
    ],
  },
  {
    label: "AOI",
    events: [
      { type: "aoi_start", label: "AOI Start" },
      { type: "aoi_passed", label: "AOI Passed" },
      { type: "aoi_failed", label: "AOI Failed" },
    ],
  },
  {
    label: "Through Hole",
    events: [
      { type: "through_hole_start", label: "TH Start" },
      { type: "through_hole_end", label: "TH End" },
    ],
  },
  {
    label: "Final",
    events: [
      { type: "touchup", label: "Touchup" },
      { type: "washing", label: "Washing" },
      { type: "packing", label: "Packing" },
      { type: "ready_to_ship", label: "Ready to Ship" },
    ],
  },
];
