/**
 * build-line CORE — the glue between a spoken intent and a compiled line,
 * with every data source injected.
 *
 * `/api/internal/voice/build-line` used to hold this logic inline against
 * Prisma. Pulling it out means the size-family swap, the day-deal check and
 * the kind/shape gates can be exercised with in-memory loaders, and any other
 * caller (a batch re-compile, a test harness) gets exactly the route's
 * behaviour rather than a re-implementation that drifts.
 *
 * PURE — no prisma, no next. Only `import type` from the server-only modules,
 * which TypeScript erases.
 */

import type { BetterDeal } from "@/lib/voice/day-deals";
import type { SizeMatch } from "@/lib/voice/item-family";
import {
  compileComboLine,
  compileItemLine,
  compilePizzaLine,
  type ComboData,
  type ComboIntent,
  type CompileResult,
  type ItemData,
  type ItemIntent,
  type PizzaIntent,
} from "@/lib/voice/order-line-compiler";

export type BuildLineKind = "item" | "pizza" | "combo";

export type BuildLineInput = {
  kind: BuildLineKind;
  /** The intent as the model sent it. Validated for `menuItemId` here; the
   *  compilers tolerate the rest. */
  intent: unknown;
  askGroupIds: string[];
  /** Auto-apply day deals when the same item is cheaper today. */
  offerDeals?: boolean;
  currency: string;
  timezone: string;
};

export type SwitchedTo = { from: string; to: string; saving: number };

export type AutoAppliedDeal = {
  standardItemName: string;
  dealName: string;
  dealMenuItemId: string;
  saving: number;
};

export type BuildLineLoaders = {
  /** The item in compiler shape, or null when it doesn't exist / isn't orderable. */
  item: (menuItemId: string) => Promise<ItemData | null>;
  /** The combo in compiler shape, or null when the item isn't a combo. */
  combo: (menuItemId: string) => Promise<ComboData | null>;
  /** Size-family resolver (item-family.ts) — the sibling that expresses the
   *  size the caller asked for. Optional: omit and no swap is attempted. */
  sizeMatch?: (args: {
    item: ItemData;
    intent: PizzaIntent;
    namedSubtotal: number | null | undefined;
    timezone: string;
  }) => Promise<SizeMatch | null>;
  /** Day-deal finder (day-deals.ts). Optional: omit and no deal is checked. */
  betterDeal?: (args: {
    standardItemId: string;
    kind: "pizza" | "item";
    intent: PizzaIntent | ItemIntent;
    standardSubtotal: number | null | undefined;
    standardVariants: ItemData["variants"];
    standardVariantId: string | null;
    timezone: string;
    askGroupIds: string[];
    currency: string;
  }) => Promise<BetterDeal | null>;
};

export type BuildLineOk = CompileResult & {
  /** Auto-applied day deal — the line is already at the deal price. */
  autoAppliedDeal?: AutoAppliedDeal | null;
  switchedTo?: SwitchedTo | null;
};

export type BuildLineError = {
  error: string;
  code: "bad_kind" | "missing_item" | "item_not_found" | "not_a_pizza" | "not_a_combo" | "wrong_kind";
  /** `wrong_kind` only — what the item actually is, so the agent can re-call
   *  with the right tool instead of guessing. */
  actualKind?: "pizza" | "combo";
};

export type BuildLineOutcome =
  | { status: 200; body: BuildLineOk }
  | { status: 400 | 404; body: BuildLineError };

const isKind = (k: unknown): k is BuildLineKind => k === "item" || k === "pizza" || k === "combo";

/**
 * Compile one spoken line. Never touches a database — everything comes
 * through `loaders`.
 *
 * Response shapes, per kind:
 *  - pizza: `CompileResult & { autoAppliedDeal, switchedTo }` — includes the
 *    size-family swap and day-deal auto-substitution.
 *  - combo: the bare `CompileResult`.
 *  - item:  `CompileResult & { autoAppliedDeal }` — day-deal auto-substitution
 *    for non-pizza items (sandwiches, wings, etc.).
 */
export async function buildLineCore(
  input: BuildLineInput,
  loaders: BuildLineLoaders,
): Promise<BuildLineOutcome> {
  if (!isKind(input.kind)) {
    return { status: 400, body: { error: "kind must be item|pizza|combo", code: "bad_kind" } };
  }
  const intent = (input.intent && typeof input.intent === "object" ? input.intent : {}) as Record<string, unknown>;
  const itemId = String(intent.menuItemId ?? "").trim();
  if (!itemId) return { status: 400, body: { error: "Missing menuItemId", code: "missing_item" } };

  const askGroupIds = Array.isArray(input.askGroupIds)
    ? input.askGroupIds.filter((x): x is string => typeof x === "string")
    : [];

  const item = await loaders.item(itemId);
  if (!item) return { status: 404, body: { error: "Item not found", code: "item_not_found" } };

  // "Half Philly Steak, half Deluxe": the recipe pizzas named by halfRecipes
  // (on the pizza itself, or on any combo pick) are loaded here so the
  // compiler can expand their presets and carry their base sauce.
  const recipeIds = new Set<string>();
  const collect = (o: unknown) => {
    for (const hr of Array.isArray((o as { halfRecipes?: unknown })?.halfRecipes) ? ((o as { halfRecipes: unknown[] }).halfRecipes as unknown[]) : []) {
      const id = String((hr as { menuItemId?: unknown })?.menuItemId ?? "").trim();
      if (id) recipeIds.add(id);
    }
  };
  collect(intent);
  for (const pick of Array.isArray(intent.picks) ? (intent.picks as unknown[]) : []) collect(pick);
  const recipes: Record<string, ItemData> = {};
  for (const id of recipeIds) {
    const r = await loaders.item(id);
    if (r) recipes[id] = r;
  }
  const opts = { askGroupIds, currency: input.currency, ...(recipeIds.size ? { recipes } : {}) };

  // ── combo ──────────────────────────────────────────────────────────────
  if (input.kind === "combo") {
    const combo = await loaders.combo(itemId);
    if (!combo) return { status: 400, body: { error: "That item isn't a combo", code: "not_a_combo" } };
    return { status: 200, body: compileComboLine(intent as unknown as ComboIntent, combo, opts) };
  }

  // ── simple item ────────────────────────────────────────────────────────
  let result: CompileResult;
  let switchedTo: SwitchedTo | null = null;

  if (input.kind === "item") {
    if (item.pizzaConfig) {
      return {
        status: 400,
        body: { error: "That item is a pizza builder — use the pizza tool", code: "wrong_kind", actualKind: "pizza" },
      };
    }
    if (await loaders.combo(itemId)) {
      return {
        status: 400,
        body: { error: "That item is a combo — use the combo tool", code: "wrong_kind", actualKind: "combo" },
      };
    }
    result = compileItemLine(intent as unknown as ItemIntent, item, opts);

  // ── pizza ──────────────────────────────────────────────────────────────
  } else {
    if (!item.pizzaConfig) {
      return { status: 400, body: { error: "That item isn't a pizza builder", code: "not_a_pizza" } };
    }
    const pizzaIntent = intent as unknown as PizzaIntent;
    result = compilePizzaLine(pizzaIntent, item, opts);

    // ── The caller asked for a size this item cannot be ──────────────────
    //
    // On menus where each size is its own product, "make it extra large" means
    // building a DIFFERENT item. The compiler refuses rather than silently
    // dropping the size (which is how a Large reached the kitchen on
    // 2026-08-14), but refusing is not the answer the caller wants.
    //
    // Resolve it HERE, server-side, in the same hop. The model never picks the
    // SKU and never sees this happen.
    if (loaders.sizeMatch) {
      const sizeMatch = await loaders.sizeMatch({
        item,
        intent: pizzaIntent,
        namedSubtotal: result.lineSubtotal,
        timezone: input.timezone,
      });
      if (sizeMatch) {
        const swappedItem = await loaders.item(sizeMatch.menuItemId);
        if (swappedItem) {
          const recompiled = compilePizzaLine({ ...pizzaIntent, menuItemId: sizeMatch.menuItemId }, swappedItem, opts);
          if (recompiled.line && !recompiled.unresolved.length) {
            result = recompiled;
            switchedTo = { from: item.name, to: swappedItem.name, saving: sizeMatch.saving };
          }
        }
      }
    }
  }

  // ── SHARED: day deal auto-substitution ────────────────────────────────
  //
  // Is the SAME item cheaper today under one of the store's day deals? When
  // found, the deal's compilation REPLACES the standard one — the line goes on
  // the order at the deal price automatically. The agent announces the savings
  // but never asks permission; refusing a lower price makes no sense.
  let autoAppliedDeal: AutoAppliedDeal | null = null;
  if (input.offerDeals === true && result.line && loaders.betterDeal) {
    const deal = await loaders.betterDeal({
      standardItemId: itemId,
      kind: input.kind as "pizza" | "item",
      intent: input.kind === "pizza"
        ? (intent as unknown as PizzaIntent)
        : (intent as unknown as ItemIntent),
      standardSubtotal: result.lineSubtotal,
      standardVariants: item.variants,
      standardVariantId: result.line.variantId,
      timezone: input.timezone,
      askGroupIds,
      currency: input.currency,
    });
    if (deal) {
      result = deal.compiled;
      autoAppliedDeal = {
        standardItemName: item.name,
        dealName: deal.name,
        dealMenuItemId: deal.menuItemId,
        saving: deal.saving,
      };
    }
  }

  return { status: 200, body: { ...result, autoAppliedDeal, switchedTo } };
}
