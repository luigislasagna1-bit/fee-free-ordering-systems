/**
 * Prime the no-DB Twilio safety net (src/lib/voice/twiml-safety-net.ts) with
 * EVERY store's own fallback number, from the database, on the healthy path.
 *
 * Luigi 2026-08-16: "this number may be different for each restaurant (phone
 * number, call back number, store contact number) — set it up that way." The
 * safety net itself may not touch Prisma (Prisma being unreachable is why it
 * runs), so it can only dial what it has already been told. Until now that was
 * a hand-typed NABIL_FALLBACK_MAP env plus whatever the current instance had
 * learned from its own calls. This closes the gap: every ~15 minutes, in the
 * background of a normal call, the instance reads all non-released Nabil
 * numbers with their store's numbers (same precedence as the handoff route
 * and the Fly feed: transferToNumber → alertPhone → phone) and remembers them.
 * A newly provisioned store is covered the moment it exists — no env edit.
 *
 * Never awaited on the request path; never throws.
 */
import prisma from "@/lib/db";
import { rememberFallbackNumber } from "@/lib/voice/twiml-safety-net";

export const PRIME_INTERVAL_MS = 15 * 60 * 1000;

let lastPrimedAt = 0;
let inFlight: Promise<number> | null = null;

/** Same precedence as /api/twilio/voice/handoff and /api/internal/voice/fallback-map. */
export function storeFallbackDial(r: {
  phone: string | null;
  alertPhone: string | null;
  voiceAgentConfig: { transferToNumber: string | null } | null;
} | null): string | null {
  // Trim per field: a whitespace-only transferToNumber must fall through to
  // the alert phone, not win the precedence and then dial nothing.
  const transfer = (r?.voiceAgentConfig?.transferToNumber || "").trim();
  const alert = (r?.alertPhone || "").trim();
  const phone = (r?.phone || "").trim();
  return transfer || alert || phone || null;
}

/** Returns how many numbers were (re)learned; 0 when throttled or on error. */
export async function primeFallbackNumbers(now: number = Date.now()): Promise<number> {
  if (now - lastPrimedAt < PRIME_INTERVAL_MS) return 0;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rows = await prisma.voiceNumber.findMany({
        where: { status: { not: "released" } },
        select: {
          phoneNumber: true,
          restaurant: {
            select: { phone: true, alertPhone: true, voiceAgentConfig: { select: { transferToNumber: true } } },
          },
        },
        take: 20000,
      });
      let n = 0;
      for (const row of rows) {
        const dial = storeFallbackDial(row.restaurant);
        if (!dial) continue;
        rememberFallbackNumber(row.phoneNumber, dial);
        n++;
      }
      lastPrimedAt = now;
      return n;
    } catch (e) {
      // The healthy path must never fail because the safety net could not be
      // primed; the env floor + per-call learning still apply.
      console.error("[fallback-memo-prime] failed", e instanceof Error ? e.message : e);
      return 0;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Test seam. */
export function _resetFallbackPrime(): void {
  lastPrimedAt = 0;
  inFlight = null;
}
