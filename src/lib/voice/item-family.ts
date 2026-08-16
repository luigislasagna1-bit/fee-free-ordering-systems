import "server-only";
import prisma from "@/lib/db";
import { isFulfilableAt } from "@/lib/menu-fulfilment";
import { isVisibleNow } from "@/lib/menu-visibility";
import {
  compilePizzaLine,
  normalizeSizeToken,
  splitSizeToken,
  type ItemData,
  type PizzaIntent,
} from "@/lib/voice/order-line-compiler";
import { shapeItemData, VOICE_ITEM_INCLUDE } from "@/lib/voice/item-loader";

/**
 * SIZE FAMILIES — "the same pizza, in the size they actually asked for".
 *
 * Luigi 2026-08-14, after a caller asked for an extra large three times and a
 * Large went to the kitchen:
 *
 *   "why cant it do an extra large? it should be able to! any pizza (even
 *    listed as 1 topping) can add multiple additional toppings if requested!
 *    Also, we have extra large build your own also!"
 *
 * On his menu, size is not always an option on a pizza — it is often the
 * PRODUCT. "Large 1 Topping" ($17.74) and "EXTRA Large 1 Topping" ($21.99) are
 * two separate MenuItems with no variants at all, while "Build Your Own Pizza"
 * carries four real size variants. Both shapes coexist in one category. So
 * "make it extra large" sometimes means changing a variant and sometimes means
 * changing the entire item, and nothing in the system knew the difference.
 *
 * The number in the name is an INCLUDED ALLOWANCE, not a limit: any pizza takes
 * as many toppings as the caller wants and the extras are charged as
 * over-allowance. So "extra large with six toppings" does not need — and on
 * this menu cannot find — a "6 Topping" item. It needs the extra-large price
 * point plus five extras.
 *
 * FOUR RULES, inherited from day-deals.ts because they were learned the hard way:
 *
 * 1. The model never decides. Every candidate is compiled through the SAME
 *    compiler and priced with the SAME engine that charges, and only the
 *    computed subtotal is compared.
 *
 * 2. Equivalence is inferred ONLY under a rule that cannot drift, and is
 *    otherwise owner-declared. day-deals.ts forbids inference outright, and it
 *    is right to for a DEAL — but a size family has a test with no wiggle room:
 *    two items in the same category whose names are IDENTICAL once the size
 *    word is removed. "Large 1 Topping" and "EXTRA Large 1 Topping" both reduce
 *    to "1 topping"; "Medium 2 Topping" reduces to "2 topping" and is excluded.
 *    That is not name similarity, which is how a caller who asked for a Large
 *    gets handed a Medium — it is an exact match on everything except the one
 *    word we are deliberately changing.
 *    Anything that rule cannot see stays owner-declared: Luigi confirmed that
 *    "Build Your Own — X Large" IS the same pizza as "EXTRA Large 1 Topping",
 *    and nothing about those two names says so. That is a fact about his
 *    kitchen and it has to come from him.
 *
 * 3. The SIZE the caller asked for must actually be the size that gets built —
 *    re-checked on the compiled line, not assumed from the item's name.
 *
 * 4. Fails closed, always. No candidate, an ambiguous size, a topping the
 *    sibling can't express, a different day — every one of those returns null
 *    and the caller keeps what they asked for.
 *
 * ⚠️ This is deliberately NOT `variantsCorrespond` (variant-match.ts). That
 * guard demands two items expose the SAME set of sizes, which is right for a
 * day deal and exactly wrong here: a family pairs an item with zero variants
 * against one with four.
 */

export type SizeMatch = {
  /** The item that actually expresses the requested size. */
  menuItemId: string;
  name: string;
  /** Variant to build on, when the size lives in a variant rather than the item. */
  variantId: string | null;
  /** What this order costs there, same engine as the charge. */
  subtotal: number;
  /** Spoken description of the compiled line. */
  readBack: string;
  /**
   * Positive dollars saved versus what the caller originally named. Zero when
   * this is simply the right size at the same money. Luigi's call, 2026-08-14:
   * build the cheapest expression, and SAY SO — never substitute silently.
   */
  saving: number;
};

/** How many siblings we will compile before giving up. A pizza category is a
 *  couple of dozen items; compiling all of them on a live phone call is not a
 *  budget we want to discover the hard way. */
const MAX_CANDIDATES = 12;

/**
 * Find the item that expresses `intent` at the size the caller asked for.
 *
 * Returns null when the item they named is already right, when no sibling can
 * express it, or when anything at all is uncertain.
 *
 * Never throws — a resolver that dies must not take down an order that is
 * otherwise fine.
 */
export async function findSizeMatch(args: {
  menuRestaurantId: string;
  /** The item the caller named. */
  item: ItemData;
  /** Its raw row, for the categoryId that scopes the sibling search. */
  raw?: { categoryId?: string | null } | null;
  intent: PizzaIntent;
  /** What the caller's order costs on the item they named, if it compiled. */
  namedSubtotal: number | null | undefined;
  when?: Date;
  timezone?: string;
}): Promise<SizeMatch | null> {
  const { menuRestaurantId, item, intent, namedSubtotal, raw } = args;
  try {
    const wantSize = normalizeSizeToken(intent.size);
    if (!wantSize) return null; // no size named, or one we can't read — nothing to resolve

    // Already the right item? Two ways that can be true, and both mean "leave
    // it alone": the size is in this item's own name, or it resolves to one of
    // this item's variants.
    if (normalizeSizeToken(item.name) === wantSize) return null;
    if (item.hasVariants && item.variants.some((v) => normalizeSizeToken(v.name) === wantSize)) return null;

    // ── Candidates, from two sources ───────────────────────────────────────
    //
    // (1) INFERRED, but only under a rule strong enough not to be a guess: two
    //     items in the SAME CATEGORY whose names are identical once the size
    //     word is removed. "Large 1 Topping" and "EXTRA Large 1 Topping" both
    //     reduce to "1 topping"; "Medium 2 Topping" reduces to "2 topping" and
    //     is correctly excluded. This is what makes the feature work on a real
    //     menu today — Luigi has no size pairings declared anywhere, and asking
    //     him to hand-declare a 4×4 lattice before his phone works would be a
    //     poor trade.
    //
    // (2) DECLARED, via the existing MenuItemDeal relation, for equivalences no
    //     rule could ever infer. Luigi confirmed that "Build Your Own — X Large"
    //     IS the same pizza as "EXTRA Large 1 Topping"; nothing about those two
    //     names says so. That is a fact about his kitchen, and it has to come
    //     from him.
    //
    // Both feed the SAME gauntlet below — recompile, verify the landed size,
    // compare computed money — so an inferred candidate is never trusted more
    // than a declared one.
    const { rest: familyKey } = splitSizeToken(item.name);
    const declared = await prisma.menuItemDeal.findMany({
      where: {
        restaurantId: menuRestaurantId,
        active: true,
        OR: [{ standardItemId: item.menuItemId }, { dealItemId: item.menuItemId }],
      },
      select: { standardItemId: true, dealItemId: true },
      take: MAX_CANDIDATES,
    });
    const declaredIds = declared
      .flatMap((p) => [p.standardItemId, p.dealItemId])
      .filter((id) => id && id !== item.menuItemId);

    // Category is the cheap candidate set — indexed, and a pizza category is a
    // couple of dozen rows. The name rule does the actual discriminating.
    const categoryPeers = raw?.categoryId
      ? await prisma.menuItem.findMany({
          where: {
            categoryId: raw.categoryId,
            restaurantId: menuRestaurantId,
            isAvailable: true,
            isSoldOut: false,
            id: { not: item.menuItemId },
          },
          select: { id: true, name: true },
          take: 60,
        })
      : [];
    const inferredIds = familyKey
      ? categoryPeers
          .filter((p) => {
            const split = splitSizeToken(p.name);
            // Must name a size, and must be the SAME product once it is removed.
            return split.token !== null && split.rest === familyKey;
          })
          .map((p) => p.id)
      : [];

    const siblingIds = [...new Set([...inferredIds, ...declaredIds])].slice(0, MAX_CANDIDATES);
    if (!siblingIds.length) return null;

    const raws = await prisma.menuItem.findMany({
      where: { id: { in: siblingIds }, isAvailable: true, isSoldOut: false },
      include: VOICE_ITEM_INCLUDE,
    });
    if (!raws.length) return null;

    let best: SizeMatch | null = null;
    for (const raw of raws) {
      // A size sibling the owner hid from the customer menu is not offered by
      // phone either (same rule as the menu payload and the deal path).
      if (!isVisibleNow(raw as never, args.when ?? new Date(), args.timezone)) continue;
      // Same day gate the order route validates with, so a size we offer can
      // never be refused at checkout for not running today.
      if (!isFulfilableAt(raw as never, args.when ?? new Date(), args.timezone)) continue;

      const candidate = shapeItemData(raw as never);

      // Does this sibling actually express the size? Either in its own name
      // (a separate-item menu) or as one of its variants (Build Your Own).
      const nameIsSize = normalizeSizeToken(candidate.name) === wantSize;
      const hasSizeVariant =
        candidate.hasVariants && candidate.variants.some((v) => normalizeSizeToken(v.name) === wantSize);
      if (!nameIsSize && !hasSizeVariant) continue;

      // Recompile the caller's ACTUAL order against it. Anything the sibling
      // cannot build — a topping it doesn't carry, a required group it wants
      // asked — disqualifies it rather than silently changing the food.
      const compiled = compilePizzaLine(
        { ...intent, menuItemId: candidate.menuItemId },
        candidate,
        { suppressPricingNote: true },
      );
      if (!compiled.line || compiled.unresolved.length || typeof compiled.lineSubtotal !== "number") continue;

      // Rule 3: verify the size that LANDED, not the one we hoped for. On a
      // variant item the compiler picks the variant, and a default could
      // quietly win.
      const landed = compiled.line.variantId
        ? candidate.variants.find((v) => v.variantId === compiled.line!.variantId)?.name
        : candidate.name;
      if (normalizeSizeToken(landed) !== wantSize) continue;

      // Cheapest wins (Luigi 2026-08-14). Every candidate here is the correct
      // size by construction, so price is the only thing left to choose on.
      if (!best || compiled.lineSubtotal < best.subtotal) {
        best = {
          menuItemId: candidate.menuItemId,
          name: candidate.name,
          variantId: compiled.line.variantId ?? null,
          subtotal: compiled.lineSubtotal,
          readBack: compiled.readBack,
          saving:
            typeof namedSubtotal === "number"
              ? Math.max(0, Math.round((namedSubtotal - compiled.lineSubtotal) * 100) / 100)
              : 0,
        };
      }
    }
    return best;
  } catch (e) {
    console.error("[item-family] findSizeMatch failed", e);
    return null;
  }
}
