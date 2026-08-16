import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { resolveScheduledMenuId } from "@/lib/menu-schedule";
import { fulfilWindowLabel, hasFulfilWindow, isFulfilableAt } from "@/lib/menu-fulfilment";
import { isVisibleNow, type VisibilityFields } from "@/lib/menu-visibility";
import { variantsCorrespond } from "@/lib/voice/variant-match";

/**
 * The `get_menu` tool payload — extracted verbatim from
 * `/api/internal/voice/menu/route.ts` so the SAME builder feeds the live route
 * AND the offline snapshot / simulator (`scripts/nabil-snapshot-menu.ts`).
 * The route is a thin wrapper: auth + parse + call + NextResponse.json.
 *
 * Returns the LIVE menu tree the Nabil voice agent orders from — item /
 * variant / modifier IDs + names + prices only. The agent maps caller speech
 * to these IDs and sends IDs + quantities (never prices) to /api/orders, which
 * re-prices authoritatively (preview==charge). Prices here are for the agent
 * to READ BACK to the caller, not to trust as the charge.
 *
 * Single-sourced on the SAME loaders the customer order page uses
 * (resolveMenuRestaurantId → resolveScheduledMenuId → the category tree), so
 * brand-menu inheritance + daily menu scheduling behave identically.
 *
 * v1: pizza-builder (`isPizza`) and combo (`isCombo`) items are surfaced but
 * flagged — the agent transfers those to a human (serialization is too complex
 * for voice v1). See the plan's v2 roadmap.
 */

/** Budget for the names-only view of a pizza/combo's choices. This exists so a
 *  store with a hundred toppings can't reintroduce the payload cost that
 *  stripping the build trees removed ($5.08 → $0.28 per call). Names are for
 *  ANSWERING questions; anything the agent builds with still comes from
 *  get_item_options. */
export const VOICE_MENU_MAX_CHOICE_GROUPS = 4;
export const VOICE_MENU_MAX_OPTION_NAMES = 12;

/* ─────────────────────────────── types ─────────────────────────────────── */

export type VoiceMenuOption = {
  modifierOptionId: string;
  name: string;
  priceAdjustment: number;
};

export type VoiceMenuGroup = {
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  pizzaRole: string | null;
  options: VoiceMenuOption[];
};

export type VoiceMenuVariant = {
  variantId: string;
  name: string;
  price: number;
  isDefault: boolean;
};

/** Names-only view of one choice group on a pizza/combo. `andMore` is present
 *  ONLY when the group was capped at VOICE_MENU_MAX_OPTION_NAMES, and says how
 *  many names were left out — so the model can never read a truncated list as
 *  the whole list (2026-08-15: it read 12 toppings as "all the toppings" and
 *  told a caller red onion didn't exist). */
export type VoiceChoiceNameGroup = {
  name: string;
  options: string[];
  andMore?: number;
};

export type VoiceMenuTodayDeal = {
  dealItemId: string;
  name: string;
  price: number;
  variants: Array<{ variantId: string; name: string; price: number }>;
};

export type VoiceMenuItem = {
  menuItemId: string;
  name: string;
  description: string | null;
  price: number;
  isSoldOut: boolean;
  isPizza: boolean;
  isCombo: boolean;
  hasVariants: boolean;
  variants: VoiceMenuVariant[];
  /** Pizza/combo only, and only when the item has variants. Names, no ids. */
  sizeNames?: string[];
  /** Pizza/combo only, and only when at least one group has options. */
  choiceNames?: VoiceChoiceNameGroup[];
  /** Present ONLY when `choiceNames` was capped at VOICE_MENU_MAX_CHOICE_GROUPS:
   *  the number of non-empty groups that were dropped. */
  choiceGroupsOmitted?: number;
  todayDeal: VoiceMenuTodayDeal | null;
  modifierGroups: VoiceMenuGroup[];
};

export type VoiceMenuCategory = {
  category: string;
  items: VoiceMenuItem[];
};

export type VoiceMenuPayload = {
  restaurant: { id: string; name: string; currency: string };
  menu: VoiceMenuCategory[];
  /** Real items that exist but can't be ordered right now. Name + day only. */
  notToday: Array<{ name: string; available: string }>;
  speechHints: string[];
};

export type VoiceMenuError = { error: string; code: "missing_slug" | "not_found" };

export type VoiceMenuResult =
  | { status: 200; body: VoiceMenuPayload }
  | { status: 400 | 404; body: VoiceMenuError };

/* ─────────────────────── pure serialisation helper ─────────────────────── */

/**
 * The names-only choice view for a pizza/combo item, with HONEST truncation
 * markers. Pure, so the marker logic is unit-testable without Prisma.
 *
 *   - each group's option names are capped at VOICE_MENU_MAX_OPTION_NAMES;
 *     a capped group carries `andMore: <names omitted>`
 *   - groups with no options are dropped (they cost prompt tokens and answer
 *     nothing) and do NOT count as omitted
 *   - the group list is capped at VOICE_MENU_MAX_CHOICE_GROUPS; when groups
 *     were dropped, `choiceGroupsOmitted: <groups dropped>` is returned so the
 *     caller spreads it as a sibling of `choiceNames`
 *
 * Returns null when nothing survives, so the caller can spread `{}` and keep
 * the historical "no `choiceNames` key at all" shape.
 */
export function serializeChoiceNames(
  groups: ReadonlyArray<{ name: string; options?: ReadonlyArray<{ name: string }> | null }>,
): { choiceNames: VoiceChoiceNameGroup[]; choiceGroupsOmitted?: number } | null {
  const nonEmpty = groups
    .map((g) => {
      const all = g.options ?? [];
      const options = all.slice(0, VOICE_MENU_MAX_OPTION_NAMES).map((o) => o.name);
      const omitted = all.length - options.length;
      return omitted > 0 ? { name: g.name, options, andMore: omitted } : { name: g.name, options };
    })
    .filter((g) => g.options.length);
  if (!nonEmpty.length) return null;
  const choiceNames = nonEmpty.slice(0, VOICE_MENU_MAX_CHOICE_GROUPS);
  const choiceGroupsOmitted = nonEmpty.length - choiceNames.length;
  return choiceGroupsOmitted > 0 ? { choiceNames, choiceGroupsOmitted } : { choiceNames };
}

/**
 * VISIBILITY (Roya's call, 2026-08-16 11:41): the payload used to filter items
 * on `isAvailable` alone. A row that the owner had HIDDEN from the customer
 * menu (`visibilityMode: "hide_from_menu"` — an un-dated lineage copy of the
 * Monday special) was therefore in the prompt, and Nabil offered it as "today's
 * deal" on a Sunday. The website hides it; the phone must too. Same helper the
 * customer page uses (`isVisibleNow`, restaurant timezone), applied to
 * categories AND items, before anything else looks at the tree. Pure + exported
 * for the test.
 */
export function visibleMenuTree<C extends VisibilityFields & { menuItems: I[] }, I extends VisibilityFields>(
  categories: C[],
  now: Date,
  timezone: string | undefined,
): C[] {
  return categories
    .filter((c) => isVisibleNow(c, now, timezone))
    .map((c) => ({ ...c, menuItems: c.menuItems.filter((it) => isVisibleNow(it, now, timezone)) }));
}

/* ─────────────────────────────── builder ───────────────────────────────── */

export async function buildVoiceMenuPayload(rawSlug: string): Promise<VoiceMenuResult> {
  const slug = (rawSlug || "").toLowerCase().trim();
  if (!slug) {
    return { status: 400, body: { error: "Missing slug", code: "missing_slug" } };
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, currency: true, timezone: true, hoursFormat: true },
  });
  if (!restaurant) {
    return { status: 404, body: { error: "Restaurant not found", code: "not_found" } };
  }

  // Brand-menu inheritance + time-of-day menu scheduling, exactly as the
  // customer order page resolves them.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);
  const activeMenuId = await resolveScheduledMenuId(menuRestaurantId);

  const fetchedCategories = await prisma.menuCategory.findMany({
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

  // Hidden categories/items never reach the prompt (see visibleMenuTree).
  const now = new Date();
  const tz = restaurant.timezone ?? undefined;
  const categories = visibleMenuTree(fetchedCategories, now, tz);

  const serializeGroups = (groups: typeof categories[number]["modifierGroups"]): VoiceMenuGroup[] =>
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
          isHidden: true, visibilityMode: true, visibleUntil: true, visibleStartDate: true, visibleEndDate: true,
          visibleDays: true, visibleFrom: true, visibleTo: true, visibleWindows: true,
          // variantId too: the agent orders the DEAL item's own size, and
          // making it cross-reference ids between two parts of the prompt is a
          // guess waiting to happen on a money path.
          variants: { select: { id: true, name: true, price: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
    take: 100,
  });
  const dealsByStandard = new Map<string, VoiceMenuTodayDeal>();
  // Sizes on the standard items, to check each pairing against.
  const standardVariants = new Map<string, Array<{ name: string }>>();
  for (const c of categories) for (const it of c.menuItems) standardVariants.set(it.id, it.variants);

  for (const d of dealPairs) {
    const di = d.dealItem;
    if (!di || !di.isAvailable || di.isSoldOut) continue;
    // A deal the owner hid from the menu is not offered on the phone either.
    if (!isVisibleNow(di, now, tz)) continue;
    if (!isFulfilableAt(di as never, now, tz)) continue;
    // THE SIZE GATE. Only annotate when the deal offers the identical set of
    // sizes — otherwise the agent would read out a 6" price to someone buying
    // a 12". Checked per pairing, so a mismatched cheap deal doesn't suppress
    // a sound one on the same item.
    if (!variantsCorrespond(standardVariants.get(d.standardItemId) ?? [], di.variants)) continue;
    const prev = dealsByStandard.get(d.standardItemId);
    // Cheapest wins when a standard item has more than one deal running.
    if (prev && prev.price <= di.price) continue;
    dealsByStandard.set(d.standardItemId, {
      dealItemId: di.id,
      name: di.name,
      price: di.price,
      variants: di.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price })),
    });
  }

  // ── "ONLY ON CERTAIN DAYS" ────────────────────────────────────────────────
  // Luigi 2026-08-11: "certain specials are only available on certain days,
  // ensure those are offered only on those days not other days."
  //
  // The menu payload IS the agent's prompt. Leaving a Thursday special in it on
  // a Monday means Nabil can offer it, the caller can accept it, and /api/orders
  // then refuses the whole order — the caller is told "yes" and then "no", which
  // is worse than never offering it. So items outside their window are removed
  // here, against the same `isFulfilableAt` + item-AND-category intersection the
  // order route enforces, so the two can never disagree.
  //
  // They're not hidden entirely: each one is listed by name and day in
  // `notToday`, with no id and no build tree, so Nabil can answer "that's a
  // Thursday special" honestly without being able to sell it today. Dropping
  // the trees also shrinks the prompt on every non-deal day.
  const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const dayName = (dow: number) => DAY_NAMES[dow] ?? String(dow);
  const formatTime = (hhmm: string) => {
    if (restaurant.hoursFormat !== "12h") return hhmm;
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h)) return hhmm;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m ?? 0).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
  };
  const notToday: Array<{ name: string; available: string }> = [];
  const seenNotToday = new Set<string>();

  const menu: VoiceMenuCategory[] = categories.map((c) => {
    const catBlocked = hasFulfilWindow(c as never) && !isFulfilableAt(c as never, now, tz);
    return {
    category: c.name,
    items: c.menuItems.filter((it) => {
      const itemBlocked = hasFulfilWindow(it as never) && !isFulfilableAt(it as never, now, tz);
      if (!itemBlocked && !catBlocked) return true;
      if (!seenNotToday.has(it.name) && notToday.length < 25) {
        seenNotToday.add(it.name);
        notToday.push({
          name: it.name,
          available: fulfilWindowLabel(itemBlocked ? (it as never) : (c as never), dayName, formatTime),
        });
      }
      return false;
    }).map((it): VoiceMenuItem => {
      const isPizza = !!it.pizzaConfig; // builder item — v1 transfers to human
      const isCombo = !!it.comboConfig; // combo item — v1 transfers to human
      // COST: this payload is the system prompt, re-sent on EVERY turn of every
      // call. A pizza/combo build tree is 66% of Luigi's menu (2,549 modifier
      // options) and was costing $5.08 a call before it was stripped — the
      // heavy matrices stay behind get_item_options, always. That win is not
      // negotiable and this must never become "send everything again".
      //
      // But stripping them to NOTHING left the agent unable to answer the most
      // ordinary question a pizzeria gets. On 2026-08-13 a caller asked for a
      // thin-crust pizza and Nabil said "we don't have thin crust" — a GUESS,
      // asserted before any lookup, which happened to be right. Meanwhile this
      // same route ships every crust and topping name to the STT layer as
      // speechHints, so we hear the word perfectly and hand it to an agent that
      // has never seen it.
      //
      // So: NAMES ONLY for pizzas and combos. No ids, no prices — a few dozen
      // tokens, enough for the agent to know what exists and to answer "what
      // crusts do you have?" without a round trip. Anything it needs to BUILD
      // with still comes from get_item_options.
      const buildable = isPizza || isCombo;
      return {
        menuItemId: it.id,
        name: it.name,
        description: it.description ?? null,
        price: it.price,
        isSoldOut: it.isSoldOut,
        isPizza,
        isCombo,
        hasVariants: it.hasVariants,
        variants: buildable
          ? []
          : it.variants.map((v) => ({
              variantId: v.id,
              name: v.name,
              price: v.price,
              isDefault: v.isDefault,
            })),
        // Sizes a caller can ASK about, by name. Deliberately not `variants`:
        // no ids and no prices, so nothing here can reach an order payload or
        // be quoted — the agent must still go through get_item_options.
        ...(buildable && it.variants.length
          ? { sizeNames: it.variants.map((v) => v.name) }
          : {}),
        // Same idea for the choices callers actually ask about by name. Capped
        // so a store with a hundred toppings can't quietly reintroduce the cost
        // problem this strip exists to solve — and every cap is MARKED
        // (`andMore` per group, `choiceGroupsOmitted` per item) so a capped
        // list can never be mistaken for the whole list. 2026-08-15: the model
        // read the first 12 toppings as all of them and told a caller red onion
        // didn't exist. A truncated list without a marker is a lie by omission.
        ...(buildable
          ? (serializeChoiceNames([...serializeGroups(it.modifierGroups), ...serializeGroups(c.modifierGroups)]) ?? {})
          : {}),
        // A cheaper equivalent running TODAY, if the owner declared one. The
        // agent offers this instead; the authoritative total still comes from
        // quote_order / place_order.
        todayDeal: dealsByStandard.get(it.id) ?? null,
        // Item-level groups PLUS the category-level groups that apply to every
        // item — the /api/orders validator checks against this same union.
        modifierGroups: buildable
          ? []
          : [...serializeGroups(it.modifierGroups), ...serializeGroups(c.modifierGroups)],
      };
    }),
    };
  }).filter((c) => c.items.length > 0); // an emptied category is pure prompt cost

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

  return {
    status: 200,
    body: {
      restaurant: { id: restaurant.id, name: restaurant.name, currency: restaurant.currency },
      menu,
      // Real items that exist but can't be ordered right now. Name + day only —
      // no ids, so the agent can talk about them and cannot sell them today.
      // (Speech hints below deliberately still cover them, so a caller asking for
      // "the Thursday smash burger" on a Monday is heard correctly and told when
      // it runs, rather than being misheard as something else.)
      notToday,
      speechHints,
    },
  };
}
