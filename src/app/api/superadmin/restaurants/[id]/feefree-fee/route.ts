import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * POST /api/superadmin/restaurants/[id]/feefree-fee
 * body: { perDeliveryFeeCents: number | null }
 *
 * Sets (or clears) the FLAT FeeFree per-delivery fee OVERRIDE for one restaurant —
 * what FeeFree bills that store per delivered order (platform revenue). A
 * non-negative integer number of CENTS wins over the automatic distance tiers;
 * null reverts to the tiers. Upserts FeeFreeDeliveryConfig so it works even
 * before the store has enabled FeeFree. Superadmin ONLY — this is a
 * platform-pricing lever a restaurant must never set for itself.
 *
 * Frozen onto DeliveryAssignment.platformFeeCents at delivery, so changing it
 * never re-bills past deliveries. (Luigi 2026-07-21.)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: restaurantId } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = body?.perDeliveryFeeCents;

  let feeCents: number | null;
  if (raw === null || raw === undefined) {
    feeCents = null; // revert to the automatic distance tiers
  } else if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100_000) {
    feeCents = Math.round(raw); // 0..$1000 fat-finger guard
  } else {
    return NextResponse.json(
      { error: "perDeliveryFeeCents must be a whole number of cents from 0 to 100000, or null." },
      { status: 400 },
    );
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId },
    update: { perDeliveryFeeCents: feeCents },
    create: { restaurantId, perDeliveryFeeCents: feeCents },
  });

  return NextResponse.json({ ok: true, perDeliveryFeeCents: feeCents });
}
