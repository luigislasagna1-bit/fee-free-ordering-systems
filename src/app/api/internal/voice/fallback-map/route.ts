import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/voice/fallback-map
 *
 * Feeds the Fly voice service's Twilio VoiceFallbackUrl handler: for every live
 * Nabil number, the human phone to ring when our own webhook has failed.
 *
 * WHY IT LIVES ON FLY AND NOT HERE (2026-08-15). Twilio calls the fallback URL
 * precisely when the primary handler failed. If the reason it failed is that
 * Vercel or the database is down, then a fallback hosted on Vercel is down too —
 * so the fallback itself must run on different infrastructure. Fly already runs
 * the always-on voice service, so that is where it goes, and this endpoint is
 * how it learns the numbers.
 *
 * ⚠️ CACHING CONTRACT: the service bulk-loads this on boot and refreshes every
 * ~15 minutes, and it must keep the LAST GOOD copy forever if a refresh fails.
 * An empty answer from here must never be allowed to empty that cache — this
 * endpoint being unreachable is the exact scenario the fallback exists for.
 *
 * Not filtered on `enabled` or on the entitlement on purpose: a restaurant whose
 * agent is switched off, or whose add-on lapsed, still has a phone worth ringing.
 * The only exclusion is a released number, which is no longer ours.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  // Scale note: one row per provisioned number platform-wide. At 10k restaurants
  // this is a few hundred KB every 15 minutes from a handful of machines. If it
  // ever matters, add an ETag — do not paginate, since a partial map is a map
  // with silent dead-air holes in it.
  const rows = await prisma.voiceNumber.findMany({
    where: { status: { not: "released" } },
    select: {
      phoneNumber: true,
      restaurant: {
        select: {
          phone: true,
          alertPhone: true,
          voiceAgentConfig: { select: { transferToNumber: true } },
        },
      },
    },
    take: 20000,
  });

  const numbers = rows
    .map((r) => {
      // Same precedence as the handoff route, so a caller who lands on the
      // fallback reaches the same person a normal transfer would have.
      const dial = (
        r.restaurant?.voiceAgentConfig?.transferToNumber ||
        r.restaurant?.alertPhone ||
        r.restaurant?.phone ||
        ""
      ).trim();
      return dial ? { to: r.phoneNumber, dial } : null;
    })
    .filter((x): x is { to: string; dial: string } => x !== null);

  return NextResponse.json(
    { numbers, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
