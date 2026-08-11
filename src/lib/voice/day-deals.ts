import "server-only";
import prisma from "@/lib/db";
import { isFulfilableAt } from "@/lib/menu-fulfilment";
import { compilePizzaLine, type ItemData, type PizzaIntent } from "@/lib/voice/order-line-compiler";
import { loadRawItem, shapeItemData, VOICE_ITEM_INCLUDE } from "@/lib/voice/item-loader";

/**
 * DAY DEALS — "the same thing, cheaper, today".
 *
 * Luigi 2026-08-11: his menu carries a "Tuesday - Large Pizza Special" at
 * $11.99 which is the identical pizza to "Large 1 Topping" at $17.74. A caller
 * who asks for a large pepperoni on a Tuesday should hear about it. He tested
 * the system on a Tuesday and paid $5.75 more than his own menu was offering.
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE:
 *
 * 1. The model never decides what is cheaper. Both options are compiled through
 *    the SAME compiler and priced with the SAME pure engine the order route
 *    charges with, and only the computed difference is reported. A language
 *    model comparing prices in its head is how a customer gets told "that saves
 *    you six dollars" about an order that costs more.
 *
 * 2. A deal is only ever offered on the days it actually runs — and that
 *    restriction is read from the deal item's OWN fulfil window via
 *    `isFulfilableAt`, the same helper /api/orders validates with. There is no
 *    second copy of the schedule to drift out of sync, so a suggestion the
 *    caller accepts can never be rejected at checkout for being the wrong day.
 *
 * 3. Which items are equivalent is OWNER-DECLARED (MenuItemDeal), never
 *    inferred. Sizes live in item names on real menus ("Large 1 Topping"), and
 *    guessing them from text is precisely how someone who asked for a Large
 *    gets offered a Medium.
 */

export type BetterDeal = {
  /** The cheaper item to swap to. */
  menuItemId: string;
  name: string;
  /** What the same order costs on the deal item, same engine as the charge. */
  subtotal: number;
  /** Positive dollars saved on this line. */
  saving: number;
  /** Spoken description of the swapped line, for the read-back. */
  readBack: string;
};

/**
 * Is there a cheaper, currently-available equivalent of `standardItemId` for
 * this exact order? Returns null when there is no pairing, the deal doesn't run
 * today, it can't be built the same way, or it isn't actually cheaper.
 *
 * Never throws: a suggestion is a nicety, and a broken nicety must not take
 * down an order that is otherwise fine.
 */
export async function findBetterDeal(args: {
  menuRestaurantId: string;
  standardItemId: string;
  intent: PizzaIntent;
  standardSubtotal: number | null | undefined;
  timezone?: string | null;
  askGroupIds?: string[];
  currency?: string;
  now?: Date;
}): Promise<BetterDeal | null> {
  const { menuRestaurantId, standardItemId, intent, standardSubtotal } = args;
  if (typeof standardSubtotal !== "number" || !Number.isFinite(standardSubtotal)) return null;

  try {
    // ALL pairings, not the first. One standard item can have several deals —
    // Luigi sells "Fish on a Bun" at $7.19 on Thursdays and $6.74 on Fridays,
    // both substituting the same $8.99 item. Picking whichever row came back
    // first would quote the wrong day's price.
    const pairings = await prisma.menuItemDeal.findMany({
      where: { standardItemId, active: true, restaurantId: menuRestaurantId },
      select: { dealItemId: true },
      take: 10,
    });
    if (!pairings.length) return null;

    const candidates = await prisma.menuItem.findMany({
      where: {
        id: { in: pairings.map((p) => p.dealItemId) },
        restaurantId: menuRestaurantId,
        isAvailable: true,
        isSoldOut: false,
      },
      include: VOICE_ITEM_INCLUDE,
    });
    if (!candidates.length) return null;

    const when = args.now ?? new Date();
    let best: BetterDeal | null = null;

    for (const raw of candidates) {
      // THE DAY GATE. Same helper the order route validates with, so we can
      // never offer a Tuesday deal on a Wednesday and have checkout refuse it.
      if (!isFulfilableAt(raw as never, when, args.timezone ?? undefined)) continue;

      const dealItem: ItemData = shapeItemData(raw);

      // Build the caller's SAME order against the deal item. If it can't be
      // built identically — the deal doesn't carry that topping, or needs an
      // answer we don't have — say nothing rather than offer something else.
      const compiled = compilePizzaLine(
        { ...intent, menuItemId: dealItem.menuItemId },
        dealItem,
        { askGroupIds: args.askGroupIds, currency: args.currency, suppressPricingNote: true },
      );
      if (!compiled.line || compiled.unresolved.length) continue;
      if (typeof compiled.lineSubtotal !== "number") continue;

      const saving = Math.round((standardSubtotal - compiled.lineSubtotal) * 100) / 100;
      if (saving <= 0) continue;
      if (best && saving <= best.saving) continue;

      best = {
        menuItemId: dealItem.menuItemId,
        name: dealItem.name,
        subtotal: compiled.lineSubtotal,
        saving,
        readBack: compiled.readBack,
      };
    }

    return best;
  } catch (e) {
    console.error("[day-deals] lookup failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Re-exported so the build-line route can load a deal item the same way. */
export { loadRawItem };
