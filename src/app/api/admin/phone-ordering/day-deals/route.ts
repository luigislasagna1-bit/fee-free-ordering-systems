import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requirePhoneOrderingAdmin } from "../guard";

export const runtime = "nodejs";

const DEAL_ITEM_SELECT = {
  name: true,
  price: true,
  fulfilDays: true,
  variants: { select: { id: true, name: true, price: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

/**
 * Day-deal pairings (MenuItemDeal) -- collection API.
 *   GET  /api/admin/phone-ordering/day-deals   list w/ deal + standard item details
 *   POST /api/admin/phone-ordering/day-deals   add (idempotent per dealItemId+standardItemId)
 *
 * Both items must belong to the restaurant's SERVING menu
 * (resolveMenuRestaurantId -- a brand-menu child features its parent's items).
 */

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const menuOwnerId = await resolveMenuRestaurantId(gate.restaurantId);

  const [deals, dealCandidates] = await Promise.all([
    prisma.menuItemDeal.findMany({
      where: { restaurantId: gate.restaurantId },
      orderBy: { createdAt: "asc" },
      include: {
        dealItem: { select: DEAL_ITEM_SELECT },
        standardItem: { select: DEAL_ITEM_SELECT },
      },
    }),
    prisma.menuItem.findMany({
      where: {
        restaurantId: menuOwnerId,
        isAvailable: true,
        isSoldOut: false,
        isHidden: false,
        fulfilDays: { not: null },
      },
      select: { id: true, name: true, price: true, fulfilDays: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  const parseDays = (raw: string | null): number[] => {
    if (!raw) return [];
    try { const d = JSON.parse(raw); return Array.isArray(d) ? d : []; }
    catch { return []; }
  };

  const pairings = deals.map((d) => ({
    id: d.id,
    dealItemId: d.dealItemId,
    dealItemName: d.dealItem.name,
    dealFulfilDays: parseDays(d.dealItem.fulfilDays),
    standardItemId: d.standardItemId,
    standardItemName: d.standardItem.name,
    standardPrice: d.standardItem.price,
    dealPrice: d.dealItem.price,
    saving: Math.max(0, d.standardItem.price - d.dealItem.price),
    active: d.active,
  }));

  const dealItems = dealCandidates.map((m) => ({
    menuItemId: m.id,
    name: m.name,
    price: m.price,
    fulfilDays: parseDays(m.fulfilDays),
  }));

  return NextResponse.json({ pairings, dealItems });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = await req.json().catch(() => ({}));
  const dealItemId = typeof body.dealItemId === "string" ? body.dealItemId : "";
  const standardItemId = typeof body.standardItemId === "string" ? body.standardItemId : "";
  if (!dealItemId || !standardItemId) {
    return NextResponse.json({ error: "Both dealItemId and standardItemId are required" }, { status: 400 });
  }
  if (dealItemId === standardItemId) {
    return NextResponse.json({ error: "Deal item and standard item must be different" }, { status: 400 });
  }

  // Never trust the client-supplied ids -- re-fetch scoped to the menu owner.
  const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
  const [dealItem, standardItem] = await Promise.all([
    prisma.menuItem.findFirst({ where: { id: dealItemId, restaurantId: menuOwnerId }, select: { id: true } }),
    prisma.menuItem.findFirst({ where: { id: standardItemId, restaurantId: menuOwnerId }, select: { id: true } }),
  ]);
  if (!dealItem) {
    return NextResponse.json({ error: "Deal item not found", code: "deal_item_not_found" }, { status: 404 });
  }
  if (!standardItem) {
    return NextResponse.json({ error: "Standard item not found", code: "standard_item_not_found" }, { status: 404 });
  }

  const deal = await prisma.menuItemDeal.upsert({
    where: { dealItemId_standardItemId: { dealItemId, standardItemId } },
    create: { restaurantId, dealItemId, standardItemId },
    update: { active: true },
    include: {
      dealItem: { select: DEAL_ITEM_SELECT },
      standardItem: { select: DEAL_ITEM_SELECT },
    },
  });
  return NextResponse.json({ ok: true, deal });
}
