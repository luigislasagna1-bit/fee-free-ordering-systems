/**
 * Turn a real Nabil call into a sim SCENARIO (src/lib/voice/sim/scenario-types.ts)
 * — the "Turn this call into a regression case" button on the admin call page.
 * Pure: the route loads the rows, this shapes them, and the download is the
 * JSON. Tested in regression-case.test.ts.
 *
 * Caller turns = the `asr` events in order (synthetic injections excluded —
 * those are the session talking to itself, not the caller). Payloads were
 * redacted at write time, so a phone number in the script is already `***-8405`.
 *
 * Expected cart:
 *  - outcome `order_placed` and the Order is on file → CANONICAL lines from the
 *    OrderItems: item = menuItemId, qty, size = variant name lowercased,
 *    options = modifier names lowercased + sorted, halves from the kitchen
 *    prefixes "(L.H) " / "(R.H) " / "(W) " (isHalfToppingName in
 *    pizza-topping-pricing.ts), "2x mushroom" for doubled toppings, picks
 *    from bundleItems for combos. Unprefixed modifiers on a PIZZA go to
 *    halves.whole (a non-half pizza has no prefixes at all); on anything else
 *    they are options. Crust/sauce/cheese can't be told apart from toppings
 *    here, so pizza lines carry a review note.
 *  - otherwise → best-effort from the LAST `cart` event's line summaries
 *    (no menu ids in a summary, so `item` is empty and the scenario says so).
 */
import { isHalfToppingName } from "@/lib/pizza-topping-pricing";
import type { Scenario, CanonicalLine, CanonicalPick, CanonicalTopping } from "@/lib/voice/sim/scenario-types";

export type RegressionEvent = { seq: number; type: string; turn: number | null; payload: unknown };

export type RegressionOrderItem = {
  menuItemId: string | null;
  name: string;
  variantName: string | null;
  quantity: number;
  modifiers: Array<{ name: string }>;
  bundleItems: unknown;
};

export type RegressionInput = {
  callSid: string;
  startedAt: Date;
  outcome: string | null;
  restaurantSlug: string;
  events: RegressionEvent[];
  order: { type: string | null; items: RegressionOrderItem[] } | null;
  /** MenuItem ids that are pizza-builder items (pizzaConfig set) — decides
   *  whether an unprefixed modifier is a whole-pizza topping or an option. */
  pizzaItemIds: ReadonlySet<string>;
};

/** Kitchen placement prefixes (pizzaCustomizationToModifiers). "(L.H) " and
 *  "(R.H) " are the same length, so one slice serves both halves. */
const LEFT = "(L.H) ";
const WHOLE = "(W) ";

/** "Pepperoni, Light" → "pepperoni" (the amount suffix is a kitchen label only). */
function toppingName(raw: string): string {
  return raw.replace(/,\s*light\s*$/i, "").trim().toLowerCase();
}

/** ["mushroom","mushroom","olives"] → ["2x mushroom","olives"] (sorted). */
function foldDoubles(names: string[]): CanonicalTopping[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${c}x ${n}` : n)).sort();
}

type Split = { options: string[]; halves: { left: CanonicalTopping[]; right: CanonicalTopping[]; whole: CanonicalTopping[] } | undefined };

/** Split one item's modifier names into options vs halves. */
function splitModifiers(names: string[], isPizza: boolean): Split {
  const left: string[] = [];
  const right: string[] = [];
  const whole: string[] = [];
  const options: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (isHalfToppingName(raw)) {
      (raw.startsWith(LEFT) ? left : right).push(toppingName(raw.slice(LEFT.length)));
    } else if (raw.startsWith(WHOLE)) {
      whole.push(toppingName(raw.slice(WHOLE.length)));
    } else if (isPizza) {
      whole.push(toppingName(raw));
    } else {
      options.push(raw.trim().toLowerCase());
    }
  }
  const anyHalves = isPizza || left.length || right.length || whole.length;
  return {
    options: options.sort(),
    halves: anyHalves ? { left: foldDoubles(left), right: foldDoubles(right), whole: foldDoubles(whole) } : undefined,
  };
}

const PIZZA_NOTE = "pizza line: crust/sauce/cheese are folded into halves.whole with the toppings — review";

function pickFromChild(child: Record<string, unknown>, pizzaItemIds: ReadonlySet<string>): CanonicalPick {
  const item = typeof child.menuItemId === "string" ? child.menuItemId : "";
  const mods = Array.isArray(child.modifiers)
    ? (child.modifiers as Array<Record<string, unknown>>).map((m) => (m && typeof m.name === "string" ? m.name : "")).filter(Boolean)
    : [];
  const split = splitModifiers(mods, pizzaItemIds.has(item));
  const slotRaw = child.slotLabel ?? child.slotName ?? child.slot;
  const size = typeof child.variantName === "string" && child.variantName.trim() ? child.variantName.trim().toLowerCase() : undefined;
  return {
    slot: typeof slotRaw === "string" ? slotRaw.toLowerCase() : "",
    item,
    ...(typeof child.name === "string" ? { name: child.name } : {}),
    ...(size ? { size } : {}),
    options: split.options,
    ...(split.halves ? { halves: split.halves } : {}),
  };
}

/** One OrderItem → one canonical line. */
export function lineFromOrderItem(it: RegressionOrderItem, pizzaItemIds: ReadonlySet<string>): CanonicalLine {
  const item = it.menuItemId ?? "";
  const isPizza = pizzaItemIds.has(item);
  const split = splitModifiers(it.modifiers.map((m) => m.name), isPizza);
  const size = it.variantName?.trim() ? it.variantName.trim().toLowerCase() : undefined;
  const picks = Array.isArray(it.bundleItems)
    ? (it.bundleItems as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => pickFromChild(c, pizzaItemIds))
    : [];
  return {
    item,
    name: it.name,
    ...(size ? { size } : {}),
    qty: Math.max(1, Math.floor(it.quantity || 1)),
    options: split.options,
    ...(split.halves ? { halves: split.halves } : {}),
    ...(picks.length ? { picks } : {}),
    ...(isPizza ? { note: PIZZA_NOTE } : {}),
  };
}

const CART_NOTE = "expected cart approximated from last cart event — review";

/** Best-effort lines from a `cart` event's LineSummary[] (no menu ids). */
function linesFromCartEvent(payload: unknown): CanonicalLine[] {
  const lines = payload && typeof payload === "object" ? (payload as Record<string, unknown>).lines : null;
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => {
      const h = l.halves && typeof l.halves === "object" ? (l.halves as Record<string, unknown>) : null;
      const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()).sort() : []);
      const picks = Array.isArray(l.picks)
        ? (l.picks as Array<Record<string, unknown>>).map((p) => ({
            slot: typeof p?.slotLabel === "string" ? p.slotLabel.toLowerCase() : "",
            item: "",
            ...(typeof p?.description === "string" ? { name: p.description } : {}),
            options: [] as string[],
          }))
        : [];
      return {
        item: "",
        ...(typeof l.description === "string" ? { name: l.description } : {}),
        qty: typeof l.quantity === "number" && l.quantity > 0 ? Math.floor(l.quantity) : 1,
        options: [],
        ...(h ? { halves: { left: arr(h.left), right: arr(h.right), whole: arr(h.whole) } } : {}),
        ...(picks.length ? { picks } : {}),
        note: CART_NOTE,
      };
    });
}

/** Caller turns from the asr events, in seq order, synthetic ones excluded. */
export function callerTurnsFromEvents(events: RegressionEvent[]): string[] {
  return [...events]
    .filter((e) => e.type === "asr")
    .sort((a, b) => a.seq - b.seq)
    .map((e) => (e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : null))
    .filter((p): p is Record<string, unknown> => !!p && p.synthetic !== true && typeof p.text === "string" && p.text.trim().length > 0)
    .map((p) => (p.text as string).trim());
}

export function buildRegressionScenario(input: RegressionInput): Scenario {
  const tail = input.callSid.slice(-8);
  const date = input.startedAt.toISOString().slice(0, 10);
  const placed = input.outcome === "order_placed";

  let cartLines: CanonicalLine[] = [];
  let fulfilmentType: "pickup" | "delivery" | null = null;
  let approximated = false;

  if (placed && input.order && input.order.items.length) {
    cartLines = input.order.items.map((it) => lineFromOrderItem(it, input.pizzaItemIds));
    fulfilmentType = input.order.type === "delivery" ? "delivery" : input.order.type === "pickup" ? "pickup" : null;
  } else {
    const lastCart = [...input.events].filter((e) => e.type === "cart").sort((a, b) => b.seq - a.seq)[0];
    if (lastCart) {
      cartLines = linesFromCartEvent(lastCart.payload);
      approximated = true;
      const f = lastCart.payload && typeof lastCart.payload === "object" ? (lastCart.payload as Record<string, unknown>).fulfilment : null;
      const ft = f && typeof f === "object" ? (f as Record<string, unknown>).type : null;
      fulfilmentType = ft === "delivery" || ft === "pickup" ? ft : null;
    }
  }

  const scenario: Scenario = {
    id: `R_${tail}`,
    title: `Regression from call ${date}`,
    suite: ["regression"],
    restaurant: input.restaurantSlug,
    taxonomy: ["regression"],
    caller: { mode: "script", turns: callerTurnsFromEvents(input.events) },
    expected: {
      cart: { lines: cartLines },
      ...(fulfilmentType ? { fulfilment: { type: fulfilmentType } } : {}),
      mustPlace: placed,
    },
  };
  if (approximated) {
    // Scenario has no top-level note field; the per-line notes carry it and
    // the title says so too, so a reviewer can't miss it.
    scenario.title += " (expected cart approximated from last cart event — review)";
  }
  return scenario;
}
