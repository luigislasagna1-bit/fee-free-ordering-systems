/**
 * Per-service time-selection styles for scheduled orders (Luigi 2026-07-04).
 *
 * A service offers any COMBINATION of:
 *   - "bands": dropdown of fixed times at the slot interval ("6:00 PM")
 *   - "range": dropdown of fulfilment WINDOWS ("6:00 – 6:15 PM"), width
 *              capped at 15 minutes (Fabrizio cmqqxerxs + Luigi's cap)
 *   - "exact": free time field, any minute within opening hours
 *
 * Stored as serviceSettings.<svc>.slotModes (array). The legacy single-value
 * slotMode ("bands" | "exact" | "both" | "range") is still WRITTEN as a
 * mirror and READ as a fallback, so pre-existing configs keep working.
 * Client-safe: pure functions, no server imports.
 */
export type SlotMode = "bands" | "range" | "exact";

const ORDER: SlotMode[] = ["bands", "range", "exact"];

function isSlotMode(v: unknown): v is SlotMode {
  return v === "bands" || v === "range" || v === "exact";
}

/** Enabled styles for a service config, in canonical order, never empty. */
export function resolveSlotModes(cfg: { slotModes?: unknown; slotMode?: unknown } | null | undefined): SlotMode[] {
  const arr = Array.isArray(cfg?.slotModes) ? (cfg!.slotModes as unknown[]).filter(isSlotMode) : [];
  const dedup = ORDER.filter((m) => arr.includes(m));
  if (dedup.length) return dedup;
  const m = cfg?.slotMode;
  if (m === "exact") return ["exact"];
  if (m === "both") return ["bands", "exact"];
  if (m === "range") return ["range"];
  return ["bands"];
}

/** Legacy single-value mirror written alongside slotModes for back-compat. */
export function legacySlotMode(modes: SlotMode[]): "bands" | "range" | "exact" | "both" {
  if (modes.length === 1) return modes[0];
  if (modes.length === 2 && modes.includes("bands") && modes.includes("exact")) return "both";
  return modes[0] ?? "bands";
}

/** Range windows never exceed 15 minutes (Luigi 2026-07-04): a 10-min
 *  interval gives 10-min windows; 15/30/60 all give 15-min windows. */
export const RANGE_WINDOW_CAP_MIN = 15;
export function rangeWindowMinutes(interval: number | null | undefined): number {
  const iv = typeof interval === "number" && Number.isFinite(interval) && interval > 0 ? interval : 15;
  return Math.max(5, Math.min(RANGE_WINDOW_CAP_MIN, iv));
}
