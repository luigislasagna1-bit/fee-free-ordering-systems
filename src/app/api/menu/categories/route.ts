import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";
import { resolveActiveMenuId } from "@/lib/menu";
import { buildVisibilityData } from "@/lib/menu-visibility";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations read the brand's menu through this endpoint
  // (used by MenuClient.reload() after edits). Resolve up to the parent
  // when applicable so the client sees the same items the customer page sees.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);

  // The editor may target a specific menu version via ?menuId= (Phase 2). We
  // validate it belongs to the menu-source restaurant; otherwise default to the
  // active menu. With one menu this equals all the restaurant's categories.
  const requestedMenuId = req.nextUrl.searchParams.get("menuId");
  let scopeMenuId: string | null = null;
  if (requestedMenuId) {
    const owned = await prisma.menu.findFirst({ where: { id: requestedMenuId, restaurantId: menuRestaurantId }, select: { id: true } });
    scopeMenuId = owned?.id ?? null;
  }
  if (!scopeMenuId) scopeMenuId = await resolveActiveMenuId(menuRestaurantId);

  // Lightweight mode (?minimal=1): only the fields the Reward Dollars earn-
  // exclusion editor needs. Avoids serializing every variant + modifier option
  // (tens of thousands of rows on a large menu) for a screen that just toggles
  // a boolean. Luigi 2026-06-30.
  if (req.nextUrl.searchParams.get("minimal")) {
    const lite = await prisma.menuCategory.findMany({
      where: scopeMenuId ? { menuId: scopeMenuId } : { restaurantId: menuRestaurantId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, rewardEarnExcluded: true, promoExcluded: true, rewardRedeemExcluded: true,
        menuItems: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, rewardEarnExcluded: true, promoExcluded: true, rewardRedeemExcluded: true } },
      },
    });
    return NextResponse.json(lite);
  }

  const cats = await prisma.menuCategory.findMany({
    where: scopeMenuId ? { menuId: scopeMenuId } : { restaurantId: menuRestaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      modifierGroups: {
        where: { menuItemId: null },
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
      menuItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          variants: { orderBy: { sortOrder: "asc" } },
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: { options: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  return NextResponse.json(cats);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations cannot create categories — they must customize first.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json();
  const { name, description, imageUrl, isHidden, isCatering, forPickup, forDelivery, menuId: bodyMenuId, visibility } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  let visData: Record<string, unknown> = {};
  if (visibility !== undefined) {
    const v = buildVisibilityData(visibility);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    visData = v.data;
  }

  // New categories belong to the targeted menu (the one being edited) — or the
  // active menu when none is given — so they show up where expected.
  let targetMenuId: string | null = null;
  if (bodyMenuId) {
    const owned = await prisma.menu.findFirst({ where: { id: bodyMenuId, restaurantId }, select: { id: true } });
    targetMenuId = owned?.id ?? null;
  }
  if (!targetMenuId) targetMenuId = await resolveActiveMenuId(restaurantId);

  const existing = await prisma.menuCategory.count({
    where: targetMenuId ? { menuId: targetMenuId } : { restaurantId },
  });
  const cat = await prisma.menuCategory.create({
    data: {
      restaurantId, menuId: targetMenuId ?? undefined,
      name: name.trim(), description, imageUrl,
      isHidden: isHidden ?? false,
      isCatering: !!isCatering,
      // Category-level service restriction (Fabrizio cmr803ovq); default
      // unrestricted when omitted.
      forPickup: forPickup !== undefined ? !!forPickup : true,
      forDelivery: forDelivery !== undefined ? !!forDelivery : true,
      sortOrder: existing,
      ...visData,
    },
  });
  return NextResponse.json(cat);
}
