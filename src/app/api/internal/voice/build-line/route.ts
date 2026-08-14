import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { findBetterDeal } from "@/lib/voice/day-deals";
import { findSizeMatch } from "@/lib/voice/item-family";
import { loadRawItem, loadComboData, shapeItemData } from "@/lib/voice/item-loader";
import {
  compilePizzaLine,
  compileComboLine,
  type ComboIntent,
  type PizzaIntent,
} from "@/lib/voice/order-line-compiler";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/build-line
 *
 * Turns a spoken INTENT into a validated `/api/orders` line.
 *
 * The language model never hand-assembles the wire format. It says what the
 * caller wants — "large, pepperoni on the left half, double mushroom" — and the
 * compiler here writes the payload, including the "(L.H) " prefixes whose
 * trailing space the pricing engine matches on, the per-unit expansion for
 * doubles, the preset toppings that stop a preset pizza billing below list, and
 * the required-group defaults the order route never enforces.
 *
 * Anything it can't resolve confidently comes back in `unresolved[]` so the
 * agent ASKS instead of guessing — an invented option id is a hard 400 on the
 * item path and is silently dropped on a combo child.
 *
 * Body: { slug, kind: "pizza" | "combo", intent, askGroupIds? }
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "bad_json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").toLowerCase().trim();
  const kind = String(body.kind ?? "");
  const intent = (body.intent ?? {}) as PizzaIntent & ComboIntent;
  const askGroupIds = Array.isArray(body.askGroupIds)
    ? (body.askGroupIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (kind !== "pizza" && kind !== "combo") {
    return NextResponse.json({ error: "kind must be pizza|combo", code: "bad_kind" }, { status: 400 });
  }
  const itemId = String(intent.menuItemId ?? "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "Missing menuItemId", code: "missing_item" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, currency: true, timezone: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });
  }

  const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);
  const raw = await loadRawItem(menuRestaurantId, itemId);
  if (!raw) {
    return NextResponse.json({ error: "Item not found", code: "item_not_found" }, { status: 404 });
  }

  const opts = { askGroupIds, currency: restaurant.currency };

  if (kind === "combo") {
    const combo = await loadComboData(menuRestaurantId, raw);
    if (!combo) {
      return NextResponse.json(
        { error: "That item isn't a combo", code: "not_a_combo" },
        { status: 400 },
      );
    }
    const result = compileComboLine(intent as ComboIntent, combo, opts);
    return NextResponse.json(result);
  }

  const item = shapeItemData(raw);
  if (!item.pizzaConfig) {
    return NextResponse.json(
      { error: "That item isn't a pizza builder", code: "not_a_pizza" },
      { status: 400 },
    );
  }
  let result = compilePizzaLine(intent as PizzaIntent, item, opts);
  let switchedTo: { from: string; to: string; saving: number } | null = null;

  // ── The caller asked for a size this item cannot be ────────────────────
  //
  // On menus where each size is its own product, "make it extra large" means
  // building a DIFFERENT item. The compiler refuses rather than silently
  // dropping the size (which is how a Large reached the kitchen on
  // 2026-08-14), but refusing is not the answer the caller wants: Luigi —
  // "why cant it do an extra large? it should be able to!"
  //
  // So resolve it HERE, server-side, in the same hop. The model never picks the
  // SKU and never sees this happen; it stated an intent and gets back a
  // compiled line at the size it asked for. Doing it on the model's side would
  // cost three more round trips, which is where the dead air came from.
  const sizeMatch = await findSizeMatch({
    menuRestaurantId,
    item,
    raw,
    intent: intent as PizzaIntent,
    namedSubtotal: result.lineSubtotal,
    timezone: restaurant.timezone,
  });
  if (sizeMatch) {
    const swapped = await loadRawItem(menuRestaurantId, sizeMatch.menuItemId);
    if (swapped) {
      const swappedItem = shapeItemData(swapped);
      const recompiled = compilePizzaLine(
        { ...(intent as PizzaIntent), menuItemId: sizeMatch.menuItemId },
        swappedItem,
        opts,
      );
      // Only take the swap if it fully compiles. A half-resolved swap is worse
      // than the honest refusal it replaces.
      if (recompiled.line && !recompiled.unresolved.length) {
        result = recompiled;
        switchedTo = { from: item.name, to: swappedItem.name, saving: sizeMatch.saving };
      }
    }
  }

  // Is the SAME pizza cheaper today under one of the store's day deals? Only
  // asked when the owner turned it on, and only when we have a line to compare
  // against — a suggestion is a nicety and must never delay a broken order.
  const betterDeal =
    body.offerDeals === true && result.line
      ? await findBetterDeal({
          menuRestaurantId,
          standardItemId: itemId,
          intent: intent as PizzaIntent,
          standardSubtotal: result.lineSubtotal,
          // The size guard: the deal must offer the same sizes, and must land
          // on the same one this line landed on.
          standardVariants: item.variants,
          standardVariantId: result.line.variantId,
          timezone: restaurant.timezone,
          askGroupIds,
          currency: restaurant.currency,
        })
      : null;

  return NextResponse.json({ ...result, betterDeal, switchedTo });
}
