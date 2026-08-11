import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requireInternalKey } from "@/lib/voice/internal-auth";
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
    select: { id: true, currency: true },
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
  const result = compilePizzaLine(intent as PizzaIntent, item, opts);
  return NextResponse.json(result);
}
