import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { syncPizzaConfigAttachments } from "@/lib/pizza-config";
import { blockIfInheritingMenu } from "@/lib/brand";
import { hasFeature } from "@/lib/entitlements";
import { buildVisibilityData } from "@/lib/menu-visibility";
import { buildFulfilData } from "@/lib/menu-fulfilment";

async function getRestaurantId() {
  const user = await getSessionUser();
  return user?.restaurantId;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  const body = await req.json();
  const { name, description, price, categoryId, imageUrl, isAvailable, isFeatured, isHidden,
          isSoldOut, forPickup, forDelivery, isCatering, availableDays, availableFrom, availableTo,
          availabilityMode, hasVariants, sortOrder, variants, pizzaConfig, comboConfig, visibility,
          fulfilment, rewardEarnExcluded, promoExcluded, rewardRedeemExcluded } = body;

  const updateData: any = {};
  // GloriaFood-style scheduled visibility (Luigi 2026-06-12). When present,
  // overrides the legacy isHidden toggle and sets the full mode + sub-fields.
  if (visibility !== undefined) {
    const vis = buildVisibilityData(visibility);
    if (!vis.ok) return NextResponse.json({ error: vis.error }, { status: 400 });
    Object.assign(updateData, vis.data);
  }
  // Phase 2 Fulfilment Time — the days/times the item can be ordered FOR
  // (visible always; forces scheduling). Replaces the legacy availabilityMode
  // "show" path; sending fulfilment also clears the legacy fields so only one
  // restriction system is ever active on a given item.
  if (fulfilment !== undefined) {
    const f = buildFulfilData(fulfilment);
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    Object.assign(updateData, f.data);
    updateData.availableDays = null;
    updateData.availableFrom = null;
    updateData.availableTo = null;
    updateData.availabilityMode = null;
  }
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description || null;
  if (price !== undefined) updateData.price = parseFloat(price);
  if (categoryId !== undefined) {
    // Never trust a client-supplied category id — re-fetch and require it to
    // belong to THIS restaurant, or an item could be re-homed into another
    // tenant's menu (drag-to-move exposes categoryId in the client).
    const targetCat = await prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: { id: true },
    });
    if (!targetCat) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    updateData.categoryId = categoryId;
  }
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
  if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
  if (isHidden !== undefined) updateData.isHidden = isHidden;
  if (isSoldOut !== undefined) updateData.isSoldOut = isSoldOut;
  if (rewardEarnExcluded !== undefined) updateData.rewardEarnExcluded = !!rewardEarnExcluded;
  if (promoExcluded !== undefined) updateData.promoExcluded = !!promoExcluded;
  if (rewardRedeemExcluded !== undefined) updateData.rewardRedeemExcluded = !!rewardRedeemExcluded;
  if (forPickup !== undefined) updateData.forPickup = forPickup;
  if (forDelivery !== undefined) updateData.forDelivery = forDelivery;
  if (isCatering !== undefined) updateData.isCatering = !!isCatering;
  if (availableDays !== undefined) updateData.availableDays = availableDays ? JSON.stringify(availableDays) : null;
  if (availableFrom !== undefined) updateData.availableFrom = availableFrom;
  if (availableTo !== undefined) updateData.availableTo = availableTo;
  // "show" = visible-but-purchase-restricted outside the window
  // (reseller report cmpxec829); anything else = legacy hide.
  if (availabilityMode !== undefined) updateData.availabilityMode = availabilityMode === "show" ? "show" : null;
  if (hasVariants !== undefined) updateData.hasVariants = hasVariants;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  // pizzaConfig: null clears the pizza builder; a JSON string enables it
  if (pizzaConfig !== undefined) updateData.pizzaConfig = pizzaConfig;
  // comboConfig: null clears the combo; a JSON string makes this a combo item.
  // Combos are an Advanced Promotions feature — only honour a non-null value
  // when the restaurant is entitled (defense-in-depth vs the UI gate).
  if (comboConfig !== undefined) {
    updateData.comboConfig = comboConfig
      ? ((await hasFeature(restaurantId, "advanced_promo_types")) ? comboConfig : null)
      : null;
  }

  // Snapshot the previous pizzaConfig BEFORE the update so the
  // attachment sync below can diff old-vs-new and detach groups the
  // owner just removed from a dropdown. Without this, switching the
  // Crust dropdown from "Pizza 1 Crust" to "Thin Crust" leaves the
  // old "Pizza 1 Crust" attached forever.
  let priorPizzaConfig: string | null = null;
  if (pizzaConfig !== undefined) {
    const prior = await prisma.menuItem.findFirst({
      where: { id, restaurantId },
      select: { pizzaConfig: true },
    });
    priorPizzaConfig = prior?.pizzaConfig ?? null;
  }

  try {
    await prisma.menuItem.updateMany({ where: { id, restaurantId }, data: updateData });

    // Sync variants if provided
    if (hasVariants && Array.isArray(variants)) {
      await prisma.itemVariant.deleteMany({ where: { menuItemId: id } });
      for (let i = 0; i < variants.length; i++) {
        await prisma.itemVariant.create({
          data: { menuItemId: id, name: variants[i].name, price: parseFloat(variants[i].price), sortOrder: i, isDefault: i === 0 },
        });
      }
    }

    if (pizzaConfig !== undefined) {
      const { cleanupDuplicateInheritedAttachments } = await import("@/lib/pizza-config");
      // Belt-and-suspenders cleanup: any pre-existing item-level attachment
      // that duplicates a category-level inheritance gets removed before
      // sync. Idempotent; only acts when dupes exist.
      await cleanupDuplicateInheritedAttachments(id, restaurantId);
      await syncPizzaConfigAttachments(id, restaurantId, pizzaConfig, priorPizzaConfig);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /api/menu/items/:id]", e);
    return NextResponse.json({ error: e.message ?? "Database error" }, { status: 500 });
  }
}

// Full update (same as PATCH but semantically a full replace)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return PATCH(req, { params });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    await prisma.menuItem.deleteMany({ where: { id, restaurantId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/menu/items/:id]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
