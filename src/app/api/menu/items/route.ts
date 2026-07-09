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

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations can't create items — must customize first.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json();
  const { name, description, price, categoryId, imageUrl, isHidden, isSoldOut,
          forPickup, forDelivery, isCatering, availableDays, availableFrom, availableTo,
          availabilityMode, hasVariants, variants, pizzaConfig, comboConfig, visibility,
          fulfilment, pinnedToTop, isRefundableDeposit, depositAmount } = body;
  if (!name || price === undefined || !categoryId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Scheduled visibility (GloriaFood-style). Overrides isHidden when supplied.
  let visData: Record<string, unknown> = {};
  if (visibility !== undefined) {
    const v = buildVisibilityData(visibility);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    // Json columns can't take plain null in Prisma — DbNull writes SQL NULL
    // (clears the multi-window list when dropping back to 0/1 windows).
    visData = { ...v.data, visibleWindows: v.data.visibleWindows ?? Prisma.DbNull };
  }
  // Phase 2 Fulfilment Time — when supplied, it's the sole order-window system
  // for the item (the legacy availability* fields stay null below).
  let fulfilData: Record<string, unknown> = {};
  if (fulfilment !== undefined) {
    const f = buildFulfilData(fulfilment);
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    // Json columns can't take plain null in Prisma — DbNull writes SQL NULL
    // (clears the multi-window list when the admin drops back to 0/1 windows).
    fulfilData = { ...f.data, fulfilWindows: f.data.fulfilWindows ?? Prisma.DbNull };
  }

  const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Combos are an Advanced Promotions feature — strip comboConfig for
  // restaurants without the entitlement (defense-in-depth vs the UI gate).
  const comboAllowed = comboConfig ? await hasFeature(restaurantId, "advanced_promo_types") : false;
  const safeComboConfig = comboAllowed ? comboConfig : null;

  try {
    const existing = await prisma.menuItem.count({ where: { categoryId } });
    const item = await prisma.menuItem.create({
      data: {
        restaurantId, categoryId, name, description: description || null,
        price: parseFloat(price), imageUrl: imageUrl || null,
        isHidden: isHidden ?? false,
        isSoldOut: isSoldOut ?? false, forPickup: forPickup ?? true,
        forDelivery: forDelivery ?? true, isCatering: !!isCatering,
        // Pin-to-top featured strip (Fabrizio cmr80joh0).
        pinnedToTop: !!pinnedToTop,
        // Refundable deposit (Luigi 2026-07-07): a returnable deposit is never
        // discounted nor Reward-Dollar eligible, so setting the deposit flag
        // force-sets the three exclusions ON — the deposit then rides the same
        // (tested) gift-card exclusion plumbing across engine/preview/earn/redeem.
        // The tax carve-out is handled in the orders route.
        isRefundableDeposit: !!isRefundableDeposit,
        // Per-unit deposit amount (untaxed, added on top). Clamp ≥ 0, coerce
        // NaN/empty → 0; null when the toggle is off so no stale amount lingers.
        depositAmount: isRefundableDeposit
          ? Math.max(0, Number.isFinite(Number(depositAmount)) ? Number(depositAmount) : 0)
          : null,
        ...(isRefundableDeposit
          ? { promoExcluded: true, rewardEarnExcluded: true, rewardRedeemExcluded: true }
          : {}),
        hasVariants: hasVariants ?? false,
        availableDays: availableDays ? JSON.stringify(availableDays) : null,
        availableFrom: availableFrom || null, availableTo: availableTo || null,
        // "show" = stay visible outside the window but block ordering
        // (reseller report cmpxec829); anything else = legacy hide.
        availabilityMode: availabilityMode === "show" ? "show" : null,
        sortOrder: existing,
        pizzaConfig: pizzaConfig ?? null,
        comboConfig: safeComboConfig,
        ...visData,
        ...fulfilData,
      },
    });

    // Create variants if provided
    if (hasVariants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        await prisma.itemVariant.create({
          data: { menuItemId: item.id, name: variants[i].name, price: parseFloat(variants[i].price), sortOrder: i, isDefault: i === 0 },
        });
      }
    }

    // New item — no prior pizzaConfig, so pass null as old.
    await logMenuChange({ user, restaurantId, entityType: "item", entityId: item.id, entityName: item.name, action: "create", summary: `Added "${item.name}"` });
    await syncPizzaConfigAttachments(item.id, restaurantId, pizzaConfig, null);

    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/menu/items]", e);
    return NextResponse.json({ error: e.message ?? "Database error" }, { status: 500 });
  }
}
