import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { loadRawItem, loadComboData, shapeItemData } from "@/lib/voice/item-loader";

// Prisma can't run on the edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/internal/voice/item-options?slug=<slug>&itemId=<menuItemId>
 *
 * The `get_item_options` tool — full build detail for ONE item: sizes, modifier
 * groups (with pizzaRole), the pizza engine's rules, and for a combo every slot
 * with its eligible picks. This is what Nabil reads from when a caller asks
 * "what crusts do you have?".
 *
 * WHY ON DEMAND. The base `get_menu` payload deliberately strips pizza/combo
 * build trees — 2,549 modifier options, 66% of Luigi's menu, re-sent on EVERY
 * turn inside the cached system prompt ($5.08 for one 135s call). Fetching one
 * item's detail only when a caller actually orders it keeps the system prompt
 * small; the result lands in a tool-result MESSAGE, never in the cached block.
 *
 * Shares its loader with /api/internal/voice/build-line, so the options a
 * caller is offered and the payload that gets built can never disagree.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || "").toLowerCase().trim();
  const itemId = (sp.get("itemId") || "").trim();
  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!itemId) return NextResponse.json({ error: "Missing itemId", code: "missing_item" }, { status: 400 });

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

  const item = shapeItemData(raw);
  const combo = await loadComboData(menuRestaurantId, raw);

  return NextResponse.json({ currency: restaurant.currency, item, combo });
}
