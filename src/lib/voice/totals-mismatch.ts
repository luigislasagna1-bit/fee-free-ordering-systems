/**
 * quoted ≠ charged — ONE tolerance for the whole platform.
 *
 * `VoiceCall.quotedTotal` is the total READ ALOUD to the caller; `chargedTotal`
 * is what /api/orders actually charged. They must be the same number. The
 * order route's own `expectedTotal` guard refuses a divergence bigger than half
 * a cent (src/app/api/orders/route.ts, `> 0.005`); the admin call page and the
 * superadmin report page used to disagree with each other (`> 0.005` vs
 * `>= 0.01`), so a 0.007 gap showed on one screen and not the other. Zero
 * imports — safe in server components, route handlers and tests alike.
 */
export const TOTALS_MISMATCH_TOLERANCE = 0.005;

/** True only when BOTH numbers exist and differ by more than half a cent —
 *  i.e. by at least one cent once each is rounded to cents, which is how they
 *  are stored (float subtraction alone puts 10.005 − 10 a hair above 0.005). */
export function totalsMismatch(quoted: number | null | undefined, charged: number | null | undefined): boolean {
  if (typeof quoted !== "number" || typeof charged !== "number") return false;
  if (!Number.isFinite(quoted) || !Number.isFinite(charged)) return false;
  return Math.round(quoted * 100) !== Math.round(charged * 100);
}
