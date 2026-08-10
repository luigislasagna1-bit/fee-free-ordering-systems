import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requirePhoneOrderingAdmin } from "../guard";
import { MAX_NOTE_CHARS, parseSortOrder, upsellCapReached } from "../validators";

export const runtime = "nodejs";

const MENU_ITEM_SELECT = { name: true, price: true, isAvailable: true } as const;

/**
 * Nabil featured upsells (max 5 ACTIVE) — collection API.
 *   GET  /api/admin/phone-ordering/upsells   list w/ menu item name/price/availability
 *   POST /api/admin/phone-ordering/upsells   add (idempotent per menu item)
 *
 * The menu item must belong to the restaurant's SERVING menu
 * (resolveMenuRestaurantId — a brand-menu child features its parent's items,
 * exactly the id the voice agent fetches its catalog from). The active cap is
 * checked inside a transaction so concurrent adds can't exceed 5.
 */

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const upsells = await prisma.voiceUpsell.findMany({
    where: { restaurantId: gate.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { menuItem: { select: MENU_ITEM_SELECT } },
  });
  return NextResponse.json({ upsells });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = await req.json().catch(() => ({}));
  const menuItemId = typeof body.menuItemId === "string" ? body.menuItemId : "";
  if (!menuItemId) {
    return NextResponse.json({ error: "Menu item not found", code: "menu_item_not_found" }, { status: 404 });
  }

  // Never trust the client-supplied id — re-fetch scoped to the menu owner.
  const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, restaurantId: menuOwnerId },
    select: { id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Menu item not found", code: "menu_item_not_found" }, { status: 404 });
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_CHARS) || null : null;
  const sortOrder = parseSortOrder(body.sortOrder) ?? 0;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.voiceUpsell.findUnique({
      where: { restaurantId_menuItemId: { restaurantId, menuItemId } },
      select: { id: true },
    });
    const activeOthers = await tx.voiceUpsell.count({
      where: { restaurantId, active: true, ...(existing ? { NOT: { id: existing.id } } : {}) },
    });
    if (upsellCapReached(activeOthers)) return { limited: true as const };
    const upsell = existing
      ? await tx.voiceUpsell.update({
          where: { id: existing.id },
          data: { active: true, note, sortOrder },
          include: { menuItem: { select: MENU_ITEM_SELECT } },
        })
      : await tx.voiceUpsell.create({
          data: { restaurantId, menuItemId, note, sortOrder },
          include: { menuItem: { select: MENU_ITEM_SELECT } },
        });
    return { upsell };
  });

  if ("limited" in result) {
    return NextResponse.json({ error: "Upsell limit reached", code: "upsell_limit" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, upsell: result.upsell });
}
