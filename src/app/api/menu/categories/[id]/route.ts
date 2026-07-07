import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { buildVisibilityData } from "@/lib/menu-visibility";
import { Prisma } from "@/generated/prisma/client";

async function getOwned(id: string, restaurantId: string) {
  return prisma.menuCategory.findFirst({ where: { id, restaurantId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  if (!await getOwned(id, restaurantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, imageUrl, isActive, isHidden, isCatering, sortOrder, visibility, rewardEarnExcluded, promoExcluded, rewardRedeemExcluded, forPickup, forDelivery, accentColor, pinnedToTop } = body;
  let visData: Record<string, unknown> = {};
  if (visibility !== undefined) {
    const v = buildVisibilityData(visibility);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    // Json columns can't take plain null in Prisma — DbNull writes SQL NULL
    // (clears the multi-window list when dropping back to 0/1 windows).
    visData = { ...v.data, visibleWindows: v.data.visibleWindows ?? Prisma.DbNull };
  }
  const cat = await prisma.menuCategory.update({
    where: { id },
    data: {
      name, description, imageUrl, isActive, isHidden, sortOrder,
      // Only assign when caller sent the field — undefined preserves
      // the existing value (matches Prisma's update semantics for the
      // other optional flags above).
      ...(isCatering !== undefined ? { isCatering: !!isCatering } : {}),
      ...(rewardEarnExcluded !== undefined ? { rewardEarnExcluded: !!rewardEarnExcluded } : {}),
      ...(promoExcluded !== undefined ? { promoExcluded: !!promoExcluded } : {}),
      ...(rewardRedeemExcluded !== undefined ? { rewardRedeemExcluded: !!rewardRedeemExcluded } : {}),
      // Category-level service restriction (Fabrizio cmr803ovq).
      ...(forPickup !== undefined ? { forPickup: !!forPickup } : {}),
      ...(forDelivery !== undefined ? { forDelivery: !!forDelivery } : {}),
      // Optional header accent color (Fabrizio cmr80joh0) — hex or null to clear.
      ...(accentColor !== undefined
        ? { accentColor: typeof accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : null }
        : {}),
      // Pin the category to the order-page "Featured" strip (Fabrizio cmr80joh0).
      ...(pinnedToTop !== undefined ? { pinnedToTop: !!pinnedToTop } : {}),
      ...visData,
    },
  });
  return NextResponse.json(cat);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  if (!await getOwned(id, restaurantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Promo delete-guard (Luigi 2026-07-05): deleting a category kills every
    // dish inside it too — refuse with the promo names when the category OR
    // any of its dishes is targeted by a promotion, unless explicitly forced.
    if (req.nextUrl.searchParams.get("force") !== "1") {
      const { promosReferencing } = await import("@/lib/menu");
      const items = await prisma.menuItem.findMany({ where: { categoryId: id }, select: { id: true } });
      // Size-variant-only promos target a variant, not the item/category — the
      // cascade delete nukes those variants too, so feed them to the guard.
      const variants = items.length
        ? await prisma.itemVariant.findMany({ where: { menuItemId: { in: items.map((i) => i.id) } }, select: { id: true } })
        : [];
      const promos = await promosReferencing(restaurantId, { itemIds: items.map((i) => i.id), categoryIds: [id], variantIds: variants.map((v) => v.id) });
      if (promos.length > 0) {
        return NextResponse.json(
          { error: "referenced_by_promos", promoNames: promos.map((p) => p.name).slice(0, 8), promoCount: promos.length },
          { status: 409 },
        );
      }
    }
    // Delete all items in the category first (menuItemId on OrderItem is now nullable/SetNull)
    await prisma.menuItem.deleteMany({ where: { categoryId: id } });
    await prisma.menuCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[DELETE /api/menu/categories/:id]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
