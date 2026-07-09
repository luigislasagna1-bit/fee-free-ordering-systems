import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { syncPizzaConfigAttachments } from "@/lib/pizza-config";
import { blockIfInheritingMenu } from "@/lib/brand";
import { hasFeature } from "@/lib/entitlements";
import { buildVisibilityData } from "@/lib/menu-visibility";
import { buildFulfilData } from "@/lib/menu-fulfilment";
import { logMenuChange } from "@/lib/menu-change-log";

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
          fulfilment, rewardEarnExcluded, promoExcluded, rewardRedeemExcluded, pinnedToTop,
          isRefundableDeposit, depositAmount } = body;

  const updateData: any = {};
  // GloriaFood-style scheduled visibility (Luigi 2026-06-12). When present,
  // overrides the legacy isHidden toggle and sets the full mode + sub-fields.
  if (visibility !== undefined) {
    const vis = buildVisibilityData(visibility);
    if (!vis.ok) return NextResponse.json({ error: vis.error }, { status: 400 });
    // Json columns can't take plain null in Prisma — DbNull writes SQL NULL
    // (clears the multi-window list when dropping back to 0/1 windows).
    Object.assign(updateData, vis.data, { visibleWindows: vis.data.visibleWindows ?? Prisma.DbNull });
  }
  // Phase 2 Fulfilment Time — the days/times the item can be ordered FOR
  // (visible always; forces scheduling). Replaces the legacy availabilityMode
  // "show" path; sending fulfilment also clears the legacy fields so only one
  // restriction system is ever active on a given item.
  if (fulfilment !== undefined) {
    const f = buildFulfilData(fulfilment);
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    // Json columns can't take plain null in Prisma — DbNull writes SQL NULL
    // (clears the multi-window list when the admin drops back to 0/1 windows).
    Object.assign(updateData, f.data, { fulfilWindows: f.data.fulfilWindows ?? Prisma.DbNull });
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
  // Pin-to-top featured strip (Fabrizio cmr80joh0).
  if (pinnedToTop !== undefined) updateData.pinnedToTop = !!pinnedToTop;
  if (isHidden !== undefined) updateData.isHidden = isHidden;
  if (isSoldOut !== undefined) updateData.isSoldOut = isSoldOut;
  if (rewardEarnExcluded !== undefined) updateData.rewardEarnExcluded = !!rewardEarnExcluded;
  if (promoExcluded !== undefined) updateData.promoExcluded = !!promoExcluded;
  if (rewardRedeemExcluded !== undefined) updateData.rewardRedeemExcluded = !!rewardRedeemExcluded;
  // Refundable deposit (Luigi 2026-07-07). Turning it ON force-sets the three
  // exclusions (a deposit is never discounted / Reward-Dollar eligible) so it
  // rides the existing gift-card plumbing; applied AFTER the individual flags
  // above so the deposit always wins. The tax carve-out lives in the orders route.
  if (isRefundableDeposit !== undefined) {
    updateData.isRefundableDeposit = !!isRefundableDeposit;
    // Per-unit deposit amount (untaxed, added on top). ≥ 0, NaN/empty → 0; null
    // when the toggle is off so no stale amount lingers. Luigi 2026-07-08.
    updateData.depositAmount = isRefundableDeposit
      ? Math.max(0, Number.isFinite(Number(depositAmount)) ? Number(depositAmount) : 0)
      : null;
    if (isRefundableDeposit) {
      updateData.promoExcluded = true;
      updateData.rewardEarnExcluded = true;
      updateData.rewardRedeemExcluded = true;
    }
  }
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

    // Audit log is best-effort — its own guard so a name-snapshot / session read
    // can never turn a committed update into a 500 (review fix).
    try {
      const u = await getSessionUser();
      if (u) {
        const nm = (await prisma.menuItem.findFirst({ where: { id, restaurantId }, select: { name: true } }))?.name ?? null;
        await logMenuChange({ user: u, restaurantId, entityType: "item", entityId: id, entityName: nm, action: "update", summary: `Updated "${nm ?? id}"` });
      }
    } catch (logErr) { console.error("[menu update log]", logErr); }
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    // Promo delete-guard (Luigi 2026-07-05): a deleted dish has no lineage
    // twin anywhere, so any promo targeting it silently breaks. Refuse with
    // the promo names unless the owner explicitly forces — server-enforced
    // so a stale tab can't slip past the warning dialog.
    if (req.nextUrl.searchParams.get("force") !== "1") {
      const { promosReferencing } = await import("@/lib/menu");
      // Include the item's size variants — a promo can target a specific
      // variant only (e.g. 20%-off Large), and deleting the dish cascade-deletes
      // those variants, so the guard must see them too. Red-team fix 2026-07-06.
      const variants = await prisma.itemVariant.findMany({ where: { menuItemId: id }, select: { id: true } });
      const promos = await promosReferencing(restaurantId, { itemIds: [id], variantIds: variants.map((v) => v.id) });
      if (promos.length > 0) {
        return NextResponse.json(
          { error: "referenced_by_promos", promoNames: promos.map((p) => p.name).slice(0, 8), promoCount: promos.length },
          { status: 409 },
        );
      }
    }
    // Snapshot the name BEFORE deleting so the log still reads afterward.
    const gone = await prisma.menuItem.findFirst({ where: { id, restaurantId }, select: { name: true } });
    await prisma.menuItem.deleteMany({ where: { id, restaurantId } });
    // Best-effort audit — its own guard so it can never 500 a committed delete.
    try {
      const u = await getSessionUser();
      if (u) await logMenuChange({ user: u, restaurantId, entityType: "item", entityId: id, entityName: gone?.name ?? null, action: "delete", summary: `Deleted "${gone?.name ?? id}"` });
    } catch (logErr) { console.error("[menu delete log]", logErr); }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/menu/items/:id]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
