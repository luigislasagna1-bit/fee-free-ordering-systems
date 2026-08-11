import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { resolveScheduledMenuId } from "@/lib/menu-schedule";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { isFulfilableAt } from "@/lib/menu-fulfilment";

// Prisma can't run on the edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/internal/voice/menu?slug=<slug>
 *
 * The `get_menu` tool. Returns the LIVE menu tree the Nabil voice agent orders
 * from — item / variant / modifier IDs + names + prices only. The agent maps
 * caller speech to these IDs and sends IDs + quantities (never prices) to
 * /api/orders, which re-prices authoritatively (preview==charge). Prices here
 * are for the agent to READ BACK to the caller, not to trust as the charge.
 *
 * Single-sourced on the SAME loaders the customer order page uses
 * (resolveMenuRestaurantId → resolveScheduledMenuId → the category tree), so
 * brand-menu inheritance + daily menu scheduling behave identically.
 *
 * v1: pizza-builder (`isPizza`) and combo (`isCombo`) items are surfaced but
 * flagged — the agent transfers those to a human (serialization is too complex
 * for voice v1). See the plan's v2 roadmap.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const slug = (req.nextUrl.searchParams.get("slug") || "").toLowerCase().trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, currency: true, timezone: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });
  }

  // Brand-menu inheritance + time-of-day menu scheduling, exactly as the
  // customer order page resolves them.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);
  const activeMenuId = await resolveScheduledMenuId(menuRestaurantId);

  const categories = await prisma.menuCategory.findMany({
    where: activeMenuId
      ? { menuId: activeMenuId, isActive: true }
      : { restaurantId: menuRestaurantId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      // Category-level modifier groups (inherited by every item in the category).
      modifierGroups: {
        where: { menuItemId: null, isHidden: false },
        orderBy: { sortOrder: "asc" },
        include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" } } },
      },
      menuItems: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        include: {
          variants: { orderBy: { sortOrder: "asc" } },
          modifierGroups: {
            where: { isHidden: false },
            orderBy: { sortOrder: "asc" },
            include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });

  const serializeGroups = (groups: typeof categories[number]["modifierGroups"]) =>
    groups.map((g) => ({
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      pizzaRole: g.pizzaRole ?? null,
      options: g.options.map((o) => ({
        modifierOptionId: o.id,
        name: o.name,
        priceAdjustment: o.priceAdjustment,
      })),
    }));

  // TODAY'S DEALS. An owner can declare that one item is the same thing as
  // another, cheaper, on certain days ("Tuesday - Large Pizza Special" IS
  // "Large 1 Topping"). Annotate the standard item so the agent can offer the
  // cheaper one — computed HERE, from real prices and each deal's own fulfil
  // window, because a language model comparing prices in its head is how a
  // caller gets told the wrong thing. Only deals that actually run today
  // survive `isFulfilableAt`, the same helper /api/orders validates with.
  const dealPairs = await prisma.menuItemDeal.findMany({
    where: { restaurantId: menuRestaurantId, active: true },
    select: {
      standardItemId: true,
      dealItem: {
        select: {
          id: true, name: true, price: true, isAvailable: true, isSoldOut: true,
          fulfilDays: true, fulfilFrom: true, fulfilTo: true, fulfilWindows: true,
          variants: { select: { name: true, price: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
    take: 100,
  });
  const now = new Date();
  const dealsByStandard = new Map<
    string,
    { dealItemId: string; name: string; price: number; variants: Array<{ name: string; price: number }> }
  >();
  for (const d of dealPairs) {
    const di = d.dealItem;
    if (!di || !di.isAvailable || di.isSoldOut) continue;
    if (!isFulfilableAt(di as never, now, restaurant.timezone ?? undefined)) continue;
    const prev = dealsByStandard.get(d.standardItemId);
    // Cheapest wins when a standard item has more than one deal running.
    if (prev && prev.price <= di.price) continue;
    dealsByStandard.set(d.standardItemId, {
      dealItemId: di.id,
      name: di.name,
      price: di.price,
      variants: di.variants.map((v) => ({ name: v.name, price: v.price })),
    });
  }

  const menu = categories.map((c) => ({
    category: c.name,
    items: c.menuItems.map((it) => {
      const isPizza = !!it.pizzaConfig; // builder item — v1 transfers to human
      const isCombo = !!it.comboConfig; // combo item — v1 transfers to human
      // COST: this payload is the system prompt, re-sent on EVERY turn of every
      // call. Pizza/combo items are transferred to a human in v1, so their
      // variant + topping matrices are pure waste — measured at 66% of Luigi's
      // menu (2,549 modifier options the agent may never sell). We still list
      // the item by name + price so Nabil can recognize it and hand off
      // gracefully ("we do have that — let me put you through"), just without
      // the build tree. Restore these when voice can actually build a pizza.
      const transferOnly = isPizza || isCombo;
      return {
        menuItemId: it.id,
        name: it.name,
        description: it.description ?? null,
        price: it.price,
        isSoldOut: it.isSoldOut,
        isPizza,
        isCombo,
        hasVariants: it.hasVariants,
        variants: transferOnly
          ? []
          : it.variants.map((v) => ({
              variantId: v.id,
              name: v.name,
              price: v.price,
              isDefault: v.isDefault,
            })),
        // A cheaper equivalent running TODAY, if the owner declared one. The
        // agent offers this instead; the authoritative total still comes from
        // quote_order / place_order.
        todayDeal: dealsByStandard.get(it.id) ?? null,
        // Item-level groups PLUS the category-level groups that apply to every
        // item — the /api/orders validator checks against this same union.
        modifierGroups: transferOnly
          ? []
          : [...serializeGroups(it.modifierGroups), ...serializeGroups(c.modifierGroups)],
      };
    }),
  }));

  // Domain-biased ASR data (order-accuracy playbook #2 — the single biggest
  // accuracy lever). The voice service passes these live menu terms to the STT
  // provider (Deepgram keyword/phrase boosting) each call, so menu-specific
  // words, brand names, and modifiers are recognized on noisy phone audio.
  // Because we own the catalog, this list is always current + per-restaurant —
  // an advantage POS-mapping rivals can't match. Names only (no descriptions),
  // deduped, length-capped.
  const hints = new Set<string>();
  for (const c of categories) {
    if (c.name) hints.add(c.name);
    for (const g of c.modifierGroups) for (const o of g.options) if (o.name) hints.add(o.name);
    for (const it of c.menuItems) {
      if (it.name) hints.add(it.name);
      for (const v of it.variants) if (v.name) hints.add(v.name);
      for (const g of it.modifierGroups) for (const o of g.options) if (o.name) hints.add(o.name);
    }
  }
  const speechHints = [...hints].filter((s) => s.length > 1 && s.length <= 40).slice(0, 300);

  return NextResponse.json({
    restaurant: { id: restaurant.id, name: restaurant.name, currency: restaurant.currency },
    menu,
    speechHints,
  });
}
