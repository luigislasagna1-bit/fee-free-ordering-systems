import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requirePhoneOrderingAdmin } from "../../guard";

export const runtime = "nodejs";

const CANDIDATE_CAP = 50;

/**
 * Auto-detect standard-item candidates for a given deal item.
 *   POST /api/admin/phone-ordering/day-deals/auto-detect
 *   Body: { dealItemId }
 *
 * Returns menu items that could be the "standard" counterpart:
 * available, not hidden/sold-out, higher base price, not already paired.
 */

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const body = await req.json().catch(() => ({}));
  const dealItemId = typeof body.dealItemId === "string" ? body.dealItemId : "";
  if (!dealItemId) {
    return NextResponse.json({ error: "dealItemId is required" }, { status: 400 });
  }

  const menuOwnerId = await resolveMenuRestaurantId(gate.restaurantId);
  const dealItem = await prisma.menuItem.findFirst({
    where: { id: dealItemId, restaurantId: menuOwnerId },
    select: { id: true, price: true },
  });
  if (!dealItem) {
    return NextResponse.json({ error: "Deal item not found", code: "deal_item_not_found" }, { status: 404 });
  }

  // Find existing pairings for this deal item so we can exclude them.
  const existingPairings = await prisma.menuItemDeal.findMany({
    where: { dealItemId, restaurantId: gate.restaurantId },
    select: { standardItemId: true },
  });
  const pairedIds = new Set(existingPairings.map((p) => p.standardItemId));
  // Also exclude the deal item itself.
  pairedIds.add(dealItemId);

  const candidates = await prisma.menuItem.findMany({
    where: {
      restaurantId: menuOwnerId,
      isAvailable: true,
      isSoldOut: false,
      isHidden: false,
      price: { gt: dealItem.price },
      id: { notIn: [...pairedIds] },
    },
    select: {
      id: true,
      name: true,
      price: true,
      variants: { select: { id: true, name: true, price: true }, orderBy: { sortOrder: "asc" as const } },
    },
    orderBy: { name: "asc" },
    take: CANDIDATE_CAP,
  });

  return NextResponse.json({
    candidates: candidates.map((c) => ({
      menuItemId: c.id,
      name: c.name,
      price: c.price,
      variants: c.variants,
    })),
  });
}
