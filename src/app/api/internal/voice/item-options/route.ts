import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { loadRawItem, loadComboData, shapeItemData } from "@/lib/voice/item-loader";
import { parseComboConfig, comboUpchargeFor } from "@/lib/combo";

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

  // ENVELOPE (contract with services/nabil-voice `get_item_options`, and with
  // the offline snapshot in src/lib/voice/sim/ which stores the same `item` /
  // `combo` shapes per menuItemId):
  //   {
  //     currency: string,            // restaurant.currency, for read-back only
  //     item:     ItemData,          // shapeItemData(raw) — sizes, item ∪ category
  //                                  //   modifier groups (deduped by library id),
  //                                  //   parsed pizzaConfig; NEVER truncated here
  //     combo:    ComboData | null,  // loadComboData(...) — null unless the item
  //                                  //   is a combo; every slot with its eligible
  //                                  //   `choices` (ItemData[]), `choicesTruncated`
  //                                  //   when the 120-item pool cap was hit
  //   }
  // No option-count caps live server-side: the voice service is the only place
  // that trims groups for the model (its `andMore` markers), so what the
  // compiler validates against is always the FULL tree returned here.

  // Per-slot upcharges for the agent to mention premium choices. The combo
  // data only carries choices as ItemData (standalone prices); the actual
  // combo upcharge is in the raw config. Two maps per slot:
  //   itemUpcharges:    itemId → amount (applies to any size of that item)
  //   variantUpcharges: "itemId::variantId" → amount (a specific size costs more)
  let slotUpcharges: Record<string, { items?: Record<string, number>; variants?: Record<string, number> }> | null = null;
  if (combo) {
    const cfg = parseComboConfig((raw as { comboConfig?: string | null }).comboConfig);
    if (cfg) {
      const out: Record<string, { items?: Record<string, number>; variants?: Record<string, number> }> = {};
      for (let i = 0; i < cfg.slots.length && i < combo.slots.length; i++) {
        const rawSlot = cfg.slots[i];
        const voiceSlot = combo.slots[i];
        const items: Record<string, number> = {};
        for (const choice of voiceSlot.choices) {
          const up = rawSlot.upcharges?.[choice.menuItemId];
          if (up && up > 0) items[choice.menuItemId] = up;
        }
        const variants: Record<string, number> = {};
        if (rawSlot.variantUpcharges) {
          for (const [k, v] of Object.entries(rawSlot.variantUpcharges)) {
            if (v > 0) variants[k] = v;
          }
        }
        const entry: { items?: Record<string, number>; variants?: Record<string, number> } = {};
        if (Object.keys(items).length) entry.items = items;
        if (Object.keys(variants).length) entry.variants = variants;
        if (entry.items || entry.variants) out[voiceSlot.id] = entry;
      }
      if (Object.keys(out).length) slotUpcharges = out;
    }
  }

  return NextResponse.json({ currency: restaurant.currency, item, combo, slotUpcharges });
}
