/**
 * THE AUTHORITATIVE CART for one phone call.
 *
 * Why this exists (Luigi, 2026-08-15, P0 directive): the language model must
 * NEVER be the memory of what is on the order. Until this module, only pizzas
 * and combos lived server-side (`ctx.basket`); every drink, side and wing was
 * re-listed by the model from prose at quote time, a combo's insides could not
 * be edited (so the model re-added the whole combo and the basket held two),
 * and nothing could say "combo L2 still needs a drink" before the caller was
 * quoted. The last three failed calls all trace to facts the model was asked
 * to remember and could not.
 *
 * Design:
 *   • Every line — item, pizza, combo — is here, with a stable `lineId`
 *     ("L1", "L2", …) that is NEVER reused, even after a remove or a placed
 *     order, so "the second pizza" resolves to the same thing on turn 3 and
 *     turn 30.
 *   • Each line keeps its INTENT (what the caller asked for, in names) as the
 *     source of truth and the COMPILED wire line as a derived artifact. Every
 *     change is merge-into-intent + recompile through the SAME compiler the
 *     add went through — never a patch on the compiled payload (half/half
 *     prefixes, per-unit expansion and preset seeding are compile-time facts).
 *   • An add that the compiler cannot finish still CREATES the line, marked
 *     `needs_info` with the compiler's questions, so the model completes it
 *     with `update_line` instead of adding a second copy (the 2026-08-15
 *     duplicate-combo failure).
 *   • The engine is PURE: no network, no config, no SDK. The compiler is a
 *     port (HTTP to Vercel in production, in-process on fixtures in tests) and
 *     the menu is an index built from the call's own menu snapshot, which is
 *     also the id whitelist — a tool can only ever touch a menuItemId that was
 *     in THIS call's menu.
 *   • It never guesses. Ambiguous targets, ambiguous names, unfinished lines
 *     and duplicate-looking adds all come back as structured questions for the
 *     model to ask the caller.
 */
import { basketSignature, fnv1a } from "./basket-signature";
import { norm, stem, sameName } from "./fuzzy";
import type { MenuIndex, MenuKind } from "./menu-index";
import { spokenOrderText, spokenPriceParts, spokenSurcharge } from "./spoken-money";

/* ────────────────────────────── intent model ───────────────────────────── */

export type Placement = "whole" | "left" | "right";
export type ToppingReq = { name: string; placement: Placement; count?: number };

export type ItemIntent = {
  menuItemId: string;
  quantity: number;
  size?: string | null;
  options: string[];
  notes?: string | null;
};

export type PizzaIntent = {
  menuItemId: string;
  quantity: number;
  size?: string | null;
  crust?: string | null;
  sauce?: string | null;
  cheese?: string | null;
  toppings: ToppingReq[];
  excludeToppings?: string[];
  /** ENGINE-ONLY (stripped before the compiler): which SIDE an exclusion in
   *  `excludeToppings` was taken off, when the caller removed a preset that
   *  lived on one half ("no tomato on the veggie half"). Lets a later "tomatoes
   *  on the OTHER half" stay on that half instead of un-excluding the recipe's
   *  own (2026-08-16, cmsw4s0mz: it un-excluded ⇒ "tomatoes over the whole
   *  pizza" ⇒ "No. No. No. That's wrong."). */
  excludedSides?: Record<string, Placement>;
  /** "Half Philly Steak, half Deluxe": a side built to a NAMED pizza's recipe
   *  (compiler expands presets, merges overlaps, carries the base sauce). */
  halfRecipes?: HalfRecipe[];
  notes?: string | null;
};

export type HalfRecipe = { placement: Placement; menuItemId: string };

/** A topping the COMPILER put on a pizza that the caller never asked for (the
 *  item's standard build, a halfRecipes recipe's toppings) and the side it sits
 *  on — read off the ticket's own "(L.H) / (R.H) / (W)" prefixes. */
export type PresetTopping = { name: string; side: Placement };

export type Pick = {
  /** Engine-assigned, per line, monotonic — "P1", "P2", …; how a pick is addressed later. */
  pickId: string;
  slotLabel?: string | null;
  menuItemId: string;
  size?: string | null;
  options?: string[];
  toppings?: ToppingReq[];
  excludeToppings?: string[];
  /** ENGINE-ONLY — see PizzaIntent.excludedSides. */
  excludedSides?: Record<string, Placement>;
  halfRecipes?: HalfRecipe[];
  crust?: string | null;
  sauce?: string | null;
  cheese?: string | null;
  notes?: string | null;
};

export type ComboIntent = {
  menuItemId: string;
  quantity: number;
  picks: Pick[];
  notes?: string | null;
};

export type LineIntent = ItemIntent | PizzaIntent | ComboIntent;

/** The changes a caller can ask for on an existing line (or on a clone). */
export type LineChanges = {
  quantity?: number;
  size?: string | null;
  notes?: string | null;
  crust?: string | null;
  sauce?: string | null;
  cheese?: string | null;
  replaceWithItemId?: string;
  // simple items
  setOptions?: string[];
  addOptions?: string[];
  removeOptions?: string[];
  // pizzas
  toppings?: ToppingReq[];
  addToppings?: ToppingReq[];
  removeToppings?: Array<{ name: string; placement?: Placement | null }>;
  moveTopping?: { name: string; to: Placement };
  excludeToppings?: string[];
  /** Replace the named-pizza recipes on the halves ("make the other half Hawaiian"). */
  halfRecipes?: HalfRecipe[];
  // combos
  picks?: PickChange[];
  /** Put the line back the way it was BEFORE the last update ("no wait, that
   *  was wrong"). Deterministic — no re-deriving from the conversation. */
  revertLastChange?: boolean;
};

export type PickChange = {
  pickId?: string | null;
  slotLabel?: string | null;
  remove?: boolean;
  menuItemId?: string;
  /** For an APPEND: how many identical picks to add ("four Cokes" in a choose-4 slot). */
  quantity?: number;
  size?: string | null;
  options?: string[];
  toppings?: ToppingReq[];
  addToppings?: ToppingReq[];
  removeToppings?: Array<{ name: string; placement?: Placement | null }>;
  moveTopping?: { name: string; to: Placement };
  excludeToppings?: string[];
  halfRecipes?: HalfRecipe[];
  crust?: string | null;
  sauce?: string | null;
  cheese?: string | null;
  notes?: string | null;
};

export type AddInput = LineChanges & {
  menuItemId?: string;
  /** Combo picks for a NEW combo (add semantics; each becomes a Pick). */
  picks?: any[];
  options?: string[];
  sameAsLineId?: string | null;
  confirmAnother?: boolean;
};

export type Target = { lineId?: string | null; hint?: string | null };

/* ─────────────────────────────── wire shapes ───────────────────────────── */

export type CompiledModifier = { modifierOptionId: string; name: string };
export type CompiledLine = {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  modifiers: CompiledModifier[];
  notes?: string | null;
  isCombo?: true;
  bundleItems?: Array<{ menuItemId: string; variantId: string | null; name: string; modifiers: CompiledModifier[] }>;
};
export type Halves = { left: string[]; right: string[]; whole: string[] };

export type CompileRequest = {
  kind: MenuKind;
  intent: Record<string, unknown>;
  askGroupIds: string[];
  offerDeals?: boolean;
};

export type CompileResponse =
  | {
      ok: true;
      line: CompiledLine | null;
      readBack: string;
      /** The natural spoken form from the compiler (spoken-line.ts on Vercel). Older builds omit it. */
      spoken?: string;
      spokenNoQty?: string;
      pricingNote: string | null;
      /** Raw over-allowance money — spoken here (words, threshold), never read from pricingNote. */
      surcharge?: { amount: number; direction: "extra" | "less" } | null;
      /** Combo only: the per-pick money the combo engine will book (slot
       *  premiums + per-pizza extras). When present it REPLACES surcharge as
       *  the source of the spoken note — see materialize(). */
      priceParts?: Array<{ label: string; amount: number; kind: "slot_upcharge" | "child_extras" }>;
      unresolved: string[];
      halves?: Halves | null;
      lineSubtotal?: number | null;
      notices?: string[];
      toppings?: Array<{ spoken: string; resolved: string; placement: Placement; count: number }>;
      pickSlots?: Array<{ index: number; slotId: string; slotLabel: string }>;
      /** Names of the named pizzas used by halfRecipes (aliases: "the Philly one"). */
      recipeNames?: string[];
      autoAppliedDeal?: { standardItemName: string; dealName: string; dealMenuItemId: string; saving: number } | null;
      switchedTo?: { from: string; to: string; menuItemId?: string; saving: number } | null;
    }
  | { ok: false; code: string; message: string };

export interface Compiler {
  compile(req: CompileRequest): Promise<CompileResponse>;
}

/* ─────────────────────────────── cart model ────────────────────────────── */

export type LineStatus = "complete" | "needs_info";

export type CartLine = {
  lineId: string;
  kind: MenuKind;
  intent: LineIntent;
  compiled: CompiledLine | null;
  /** Ticket string (STATE, timeline). */
  readBack: string;
  /** What the agent SAYS for this line — natural, no SKU jargon (see
   *  spoken-line.ts). Falls back to readBack for lines the compiler could not
   *  finish or for a build-line that predates the field. */
  spoken: string;
  halves: Halves | null;
  pricingNote: string | null;
  status: LineStatus;
  questions: string[];
  aliases: string[];
  /** Whole phrases (item name, resolved option/topping names, pick names) — exact-phrase matches outrank token overlap. */
  aliasPhrases?: string[];
  addedTurn: number;
  lastTouchedTurn: number;
  /** Which slot each pick landed in (combos), from the compiler. */
  pickSlots: Array<{ pickId: string; slotLabel: string }>;
  /** The intent before the most recent update — what `revertLastChange` restores. */
  previousIntent?: LineIntent | null;
  meta: {
    switchedTo?: { from: string; to: string; saving: number } | null;
    autoAppliedDeal?: { standardItemName: string; dealName: string; dealMenuItemId: string; saving: number } | null;
    lineSubtotal?: number | null;
    notices?: string[];
    /** Highest pick number ever issued on this line — pick ids are never reused. */
    maxPickNo?: number;
  };
};

export type FulfilmentState = {
  type: "pickup" | "delivery" | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  /** Coordinates the address check resolved for THIS address (keyed by addressKey). */
  pin: { lat: number; lng: number; forAddress: string } | null;
  check: {
    located: boolean | null;
    inside?: boolean | null;
    fee?: number | null;
    minimumOrder?: number | null;
    zoneName?: string | null;
    /** Free delivery over this subtotal (0 = always) — from the store's live promo, spoken with the fee. */
    freeDeliveryOver?: number | null;
    forAddress: string;
  } | null;
};

export type CartState = {
  lines: CartLine[];
  nextLineNo: number;
  turn: number;
  fulfilment: FulfilmentState;
  customer: { name: string | null; phone: string | null; phoneSource: "caller_id" | "spoken" | null };
  focusLineId: string | null;
  lastQuote: { total: number; signature: string; discountNames: string[] } | null;
  orderNotes: string | null;
  placedOrders: Array<{ signature: string; orderId: string | null; orderNumber: string; total: number }>;
};

export type Problem = { code: string; lineId?: string; message: string; blocking: boolean; questions?: string[] };

export type LineSummary = {
  lineId: string;
  kind: MenuKind;
  quantity: number;
  description: string;
  status: LineStatus;
  questions?: string[];
  halves?: Halves | null;
  picks?: Array<{ pickId: string; slotLabel: string | null; description: string }>;
};

export type OrderState = {
  turn: number;
  fulfilment: { type: "pickup" | "delivery" | null; address?: string; verified?: boolean; fee?: number | null; freeDeliveryOver?: number | null };
  customer: { name: string | null; phone: string | null; phoneSource: "caller_id" | "spoken" | null };
  lines: LineSummary[];
  focusLineId: string | null;
  incomplete: string[];
  problems: Problem[];
  quote: { total: number; stale: boolean } | null;
  placed: Array<{ orderNumber: string; total: number }>;
  cartHash: string;
};

export type MutationResult =
  | {
      ok: true;
      lineId: string;
      line: LineSummary;
      speakExactly: string;
      pricingNote: string | null;
      halves?: Halves | null;
      notices?: string[];
      /** false = the requested change touched NOTHING (a topping that wasn't
       *  there, a placement that had nothing to move). The line, the quote and
       *  the undo history are untouched. Never silent: `notices` say why. */
      changed?: boolean;
      autoAppliedDeal?: { standardItemName: string; dealName: string; dealMenuItemId: string; saving: number } | null;
      switchedTo?: { from: string; to: string; saving: number } | null;
      state: OrderState;
    }
  | {
      ok: false;
      /** needsInfo means "ask the caller" — the system working, not a failure. */
      needsInfo?: true;
      error?: true;
      code: string;
      message: string;
      lineId?: string;
      questions?: string[];
      candidates?: Array<{ lineId: string; description: string }>;
      state: OrderState;
    };

/* ─────────────────────────────── constants ─────────────────────────────── */

/** Sanity ceilings — the "18,000 cups of water" guard. A phone order that
 *  genuinely exceeds these is a catering order and belongs with a person. */
export const MAX_QTY_PER_LINE = 25;
export const MAX_LINES = 40;
export const MAX_NOTE_CHARS = 200;
/** How many turns back an identical add still counts as "probably the same one". */
const DUP_WINDOW_TURNS = 2;

const ORDINALS: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const DEICTIC = new Set(["that", "this", "it", "one", "the", "same"]);
const HINT_STOP = new Set(["the", "a", "an", "of", "with", "on", "to", "and", "for", "my", "please", "order", "line"]);

/** Normalized key for "is this the same address I verified?" (mirrors tools.ts). */
export function addressKey(street?: string | null, city?: string | null, zip?: string | null): string {
  const words = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tight = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [words(street), words(city), tight(zip)].filter(Boolean).join("|");
}

const cleanNote = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  // Control characters out (they have no place in a kitchen note or a prompt).
  const t = s
    .split("")
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE_CHARS);
  return t || null;
};
const clampQty = (q: unknown, fallback = 1): number => {
  const n = Math.floor(Number(q));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_QTY_PER_LINE, n);
};
const cleanTopping = (t: any): ToppingReq | null => {
  const name = typeof t?.name === "string" ? t.name.trim() : "";
  if (!name) return null;
  const placement: Placement = t?.placement === "left" || t?.placement === "right" ? t.placement : "whole";
  const count = Math.max(1, Math.min(10, Math.floor(Number(t?.count) || 1)));
  return count > 1 ? { name, placement, count } : { name, placement };
};
const cleanStrings = (xs: unknown): string[] =>
  Array.isArray(xs) ? xs.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean) : [];

/** halfRecipes as sent by the model → validated shape (ids are checked against the menu by the caller). */
const cleanHalfRecipes = (xs: unknown): HalfRecipe[] =>
  Array.isArray(xs)
    ? xs
        .map((r: any) => ({
          placement: (r?.placement === "left" || r?.placement === "right" ? r.placement : "whole") as Placement,
          menuItemId: String(r?.menuItemId ?? "").trim(),
        }))
        .filter((r) => r.menuItemId)
        .slice(0, 3)
    : [];

/* ─────────────────────────────── the engine ────────────────────────────── */

export class CartEngine {
  private state: CartState;

  constructor(
    private deps: {
      compiler: Compiler;
      menu: MenuIndex;
      askGroupIds?: string[];
      offerDeals?: boolean;
      allowPizzaCombo?: boolean;
      callerId?: string | null;
      knownName?: string | null;
    },
  ) {
    this.state = {
      lines: [],
      nextLineNo: 1,
      turn: 0,
      fulfilment: { type: null, pin: null, check: null },
      customer: {
        name: deps.knownName?.trim() || null,
        phone: deps.callerId || null,
        phoneSource: deps.callerId ? "caller_id" : null,
      },
      focusLineId: null,
      lastQuote: null,
      orderNotes: null,
      placedOrders: [],
    };
  }

  /* ── turn bookkeeping ─────────────────────────────────────────────────── */

  beginTurn(): number {
    this.state.turn++;
    return this.state.turn;
  }
  get turn(): number {
    return this.state.turn;
  }

  /* ── reads ────────────────────────────────────────────────────────────── */

  lines(): CartLine[] {
    return this.state.lines;
  }
  getLine(lineId: string): CartLine | undefined {
    return this.state.lines.find((l) => l.lineId === lineId);
  }
  fulfilment(): FulfilmentState {
    return this.state.fulfilment;
  }
  customer() {
    return this.state.customer;
  }
  focusLineId(): string | null {
    return this.state.focusLineId;
  }
  placedOrders() {
    return this.state.placedOrders;
  }
  orderNotes(): string | null {
    return this.state.orderNotes;
  }
  setOrderNotes(n: unknown) {
    this.state.orderNotes = cleanNote(n);
  }
  isEmpty(): boolean {
    return this.state.lines.length === 0;
  }

  /** Deep-copied state, for tests, events and the canonical comparison. */
  snapshot(): CartState {
    return JSON.parse(JSON.stringify(this.state));
  }
  restore(s: CartState) {
    this.state = JSON.parse(JSON.stringify(s));
  }

  /** The wire items exactly as /api/orders wants them. Only meaningful when
   *  validate() reports no blocking problem — incomplete lines are skipped. */
  wireItems(): CompiledLine[] {
    return this.state.lines.filter((l) => l.status === "complete" && l.compiled).map((l) => ({ ...l.compiled! }));
  }

  /** Canonical basket signature — the dedupe / idempotency identity. */
  signature(): string {
    return basketSignature({ type: this.state.fulfilment.type ?? "", items: this.wireItems() });
  }

  /** A short hash of everything that matters to the caller — lines, fulfilment,
   *  customer — so a turn can tell "did the cart change under me". */
  cartHash(): string {
    const f = this.state.fulfilment;
    return fnv1a(
      JSON.stringify({
        s: this.signature(),
        n: this.state.lines.map((l) => [l.lineId, l.status, l.readBack]),
        f: [f.type, addressKey(f.street, f.city, f.zip)],
        c: [this.state.customer.name, this.state.customer.phone],
      }),
    );
  }

  /* ── customer / fulfilment ────────────────────────────────────────────── */

  setCustomer(c: { name?: string | null; phone?: string | null }): { phoneChanged: boolean; nameChanged: boolean } {
    let phoneChanged = false;
    let nameChanged = false;
    if (typeof c.name === "string" && c.name.trim()) {
      const n = c.name.trim().slice(0, 80);
      nameChanged = n !== this.state.customer.name;
      this.state.customer.name = n;
    }
    if (typeof c.phone === "string" && c.phone.trim()) {
      const p = c.phone.trim();
      // A DIFFERENT number is a different customer to the promo engine, so any
      // quote priced for the old identity is retired (Roya, 2026-08-13).
      phoneChanged = !!this.state.customer.phone && this.state.customer.phone !== p;
      this.state.customer.phone = p;
      this.state.customer.phoneSource = "spoken";
      if (phoneChanged) this.retireQuote();
    }
    return { phoneChanged, nameChanged };
  }

  /** Set pickup/delivery + address. Clears a stale pin the moment the address
   *  text changes (the web AddressBook rule): coordinates for a different
   *  street must never ride along. */
  setFulfilment(f: {
    type?: "pickup" | "delivery" | null;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
  }): { changed: boolean; addressKey: string; addressChanged: boolean } {
    const before = this.state.fulfilment;
    const type = f.type === "pickup" || f.type === "delivery" ? f.type : before.type;
    const street = f.street !== undefined ? cleanNote(f.street) : (before.street ?? null);
    const city = f.city !== undefined ? cleanNote(f.city) : (before.city ?? null);
    const zip = f.zip !== undefined ? cleanNote(f.zip) : (before.zip ?? null);
    const key = addressKey(street, city, zip);
    const oldKey = addressKey(before.street, before.city, before.zip);
    const addressChanged = key !== oldKey;
    const changed = addressChanged || type !== before.type;
    this.state.fulfilment = {
      type,
      street,
      city,
      zip,
      pin: addressChanged ? null : before.pin,
      check: addressChanged ? null : before.check,
    };
    if (changed) this.retireQuote();
    return { changed, addressKey: key, addressChanged };
  }

  recordAddressCheck(res: {
    located?: boolean | null;
    inside?: boolean | null;
    lat?: number | null;
    lng?: number | null;
    fee?: number | null;
    deliveryFee?: number | null;
    minimumOrder?: number | null;
    zoneName?: string | null;
    freeDeliveryOver?: number | null;
  }) {
    const f = this.state.fulfilment;
    const key = addressKey(f.street, f.city, f.zip);
    const located = res.located === true;
    if (located && typeof res.lat === "number" && typeof res.lng === "number") {
      f.pin = { lat: res.lat, lng: res.lng, forAddress: key };
    } else {
      f.pin = null;
    }
    f.check = {
      located: typeof res.located === "boolean" ? res.located : null,
      inside: typeof res.inside === "boolean" ? res.inside : null,
      fee: typeof res.fee === "number" ? res.fee : typeof res.deliveryFee === "number" ? res.deliveryFee : null,
      minimumOrder: typeof res.minimumOrder === "number" ? res.minimumOrder : null,
      zoneName: res.zoneName ?? null,
      freeDeliveryOver: typeof res.freeDeliveryOver === "number" ? res.freeDeliveryOver : null,
      forAddress: key,
    };
  }

  /** The verified pin for the CURRENT address, or null. */
  deliveryPin(): { lat: number; lng: number } | null {
    const f = this.state.fulfilment;
    if (!f.pin) return null;
    return f.pin.forAddress === addressKey(f.street, f.city, f.zip) ? { lat: f.pin.lat, lng: f.pin.lng } : null;
  }

  /* ── quotes / placement ───────────────────────────────────────────────── */

  recordQuote(q: { total: number; discountNames?: string[] }) {
    this.state.lastQuote = {
      total: q.total,
      signature: this.signature(),
      discountNames: Array.isArray(q.discountNames) ? q.discountNames.slice() : [],
    };
  }
  retireQuote() {
    this.state.lastQuote = null;
  }
  lastQuote() {
    return this.state.lastQuote;
  }
  quoteStillApplies(): boolean {
    return !!this.state.lastQuote && this.state.lastQuote.signature === this.signature();
  }

  recordPlaced(o: { orderId: string | null; orderNumber: string; total: number }) {
    this.state.placedOrders.push({ signature: this.signature(), ...o });
    // The placed lines are done; anything after this is a new order. lineIds
    // are NOT reused — nextLineNo keeps counting.
    this.state.lines = [];
    this.state.focusLineId = null;
    this.state.lastQuote = null;
    this.state.orderNotes = null;
  }

  /* ── validation ───────────────────────────────────────────────────────── */

  validate(): Problem[] {
    const problems: Problem[] = [];
    const s = this.state;
    if (!s.lines.length) problems.push({ code: "cart_empty", message: "Nothing has been added to the order yet.", blocking: true });
    for (const l of s.lines) {
      if (l.status === "needs_info") {
        problems.push({
          code: "line_incomplete",
          lineId: l.lineId,
          message: l.questions[0] ?? `${l.readBack} is not finished.`,
          questions: l.questions,
          blocking: true,
        });
      }
    }
    if (!s.fulfilment.type) {
      problems.push({ code: "fulfilment_missing", message: "Pickup or delivery has not been settled.", blocking: true });
    } else if (s.fulfilment.type === "delivery") {
      if (!s.fulfilment.street) {
        problems.push({ code: "address_missing", message: "Delivery needs a street address.", blocking: true });
      } else if (!s.fulfilment.check || s.fulfilment.check.located !== true) {
        problems.push({
          code: "address_unverified",
          message: "The delivery address could not be verified against the delivery zones — the store will confirm it.",
          blocking: false,
        });
      } else if (s.fulfilment.check.inside === false) {
        // NOT blocking: out-of-zone is not a refusal (Luigi 2026-06-08) — the
        // dry-run/order route is the authority (acceptOutsideZoneOrders); the
        // model just tells the caller plainly.
        problems.push({
          code: "outside_delivery_area",
          message: "That address is outside the delivery zones — the store decides whether to take it; the quote will say.",
          blocking: false,
        });
      }
      const min = s.fulfilment.check?.minimumOrder;
      const subtotal = this.subtotalHint();
      if (typeof min === "number" && subtotal !== null && subtotal < min) {
        problems.push({
          code: "below_minimum",
          message: `The delivery minimum is ${min}; the food so far comes to about ${subtotal.toFixed(2)}.`,
          blocking: false,
        });
      }
    }
    if (!s.customer.name) {
      problems.push({ code: "customer_name_missing", message: "The order needs a name.", blocking: true });
    }
    return problems;
  }

  /** Sum of the compiler's per-line subtotals — a HINT only (no tax, no fees,
   *  no promos). The real number always comes from /api/orders. */
  subtotalHint(): number | null {
    let sum = 0;
    let any = false;
    for (const l of this.state.lines) {
      if (typeof l.meta.lineSubtotal === "number") {
        sum += l.meta.lineSubtotal;
        any = true;
      }
    }
    return any ? sum : null;
  }

  /* ── target resolution ────────────────────────────────────────────────── */

  /**
   * Which line does the caller mean?
   *
   * `lineId` wins when it is the ONLY thing given. When the model also passes
   * `hint` (the caller's own words — the tool schema asks for it every time),
   * the hint is resolved independently and must AGREE: a lineId chosen by the
   * model for "that one" while two similar pizzas were just added in one breath
   * is a guess, and the whole point of this engine is that guesses become
   * questions (T15, 2026-08-15). `scope`, when given, narrows candidates to
   * lines the requested change could apply to (e.g. lines that HAVE the topping
   * being removed) — one survivor is not ambiguous.
   */
  resolveTarget(
    t: Target,
    scope?: (l: CartLine) => boolean,
  ): { line: CartLine } | { error: "no_such_line" | "ambiguous_line"; candidates: Array<{ lineId: string; description: string }> } {
    const all = this.state.lines;
    const cands = (xs: CartLine[] = all) => xs.map((l) => ({ lineId: l.lineId, description: l.readBack }));
    const rawId = typeof t.lineId === "string" ? t.lineId.trim() : "";
    const hint = typeof t.hint === "string" ? norm(t.hint) : "";
    if (rawId) {
      const id = /^\d+$/.test(rawId) ? `L${rawId}` : rawId.toUpperCase();
      const line = all.find((l) => l.lineId === id);
      if (!line) return { error: "no_such_line", candidates: cands() };
      if (!hint) return { line };
      // Cross-check the caller's words against the model's pick. The words
      // VETO the id only when they clearly point elsewhere: content words that
      // fit a different single line and NOT the pick, an ordinal that lands on
      // another line, or pure deixis among lines that arrived together (T15).
      // Words that are consistent with the pick — even if they would ALSO fit
      // another line — never veto: the model resolved them from context we
      // don't have (bench T25, 2026-08-15: "pepperoni on both halves — the
      // meat lovers half…" with lineId L3 was refused as ambiguous with L1
      // because L1 also carries pepperoni; and "that combo pizza" after the
      // caller's "yes, that's right" was refused because deixis pointed at the
      // focus line — the caller was transferred over it).
      const byHint = this.resolveTarget({ hint }, scope);
      if (this.isPureDeixis(hint)) {
        // "that one" + an id: only sibling ambiguity (lines that arrived in
        // the same breath) is a question; a lone focus line is not a veto.
        if ("error" in byHint && byHint.error === "ambiguous_line") return byHint;
        return { line };
      }
      const contentWords = hint.split(" ").filter((w) => w && !HINT_STOP.has(w) && !DEICTIC.has(w) && !ORDINALS[w] && w !== "last" && w !== "latest" && w !== "previous");
      const aliasSet = new Set(line.aliases.map(stem));
      const fits =
        contentWords.some((w) => aliasSet.has(stem(w))) ||
        (line.aliasPhrases ?? []).some((p) => stem(p) === stem(contentWords.join(" ")));
      if ("line" in byHint) return byHint.line === line || (fits && contentWords.length > 0) ? { line } : { error: "ambiguous_line", candidates: cands([line, byHint.line]) };
      if (byHint.error === "ambiguous_line" && !fits && !byHint.candidates.some((c) => c.lineId === line.lineId)) return byHint;
      // The words matched nothing (a description the aliases don't carry), or
      // matched the pick among others — trust the id.
      return { line };
    }
    if (!hint) {
      // No target at all: the focus line, if there is exactly one line or a focus.
      if (all.length === 1) return { line: all[0] };
      const focus = this.state.focusLineId ? all.find((l) => l.lineId === this.state.focusLineId) : undefined;
      if (focus && all.length) return { line: focus };
      return { error: all.length ? "ambiguous_line" : "no_such_line", candidates: cands() };
    }
    if (!all.length) return { error: "no_such_line", candidates: [] };
    const words = hint.split(" ").filter((w) => w && !HINT_STOP.has(w));
    // "L2" / "line 2" inside a hint.
    for (const w of words) {
      const m = /^l(\d+)$/.exec(w);
      if (m) {
        const line = all.find((l) => l.lineId === `L${m[1]}`);
        if (line) return { line };
      }
    }
    let ordinal: number | null = null;
    let last = false;
    const rest: string[] = [];
    for (const w of words) {
      if (ORDINALS[w]) ordinal = ORDINALS[w];
      else if (w === "last" || w === "latest" || w === "previous") last = true;
      else if (!DEICTIC.has(w)) rest.push(w);
    }
    // Score by alias-token overlap; a hint that IS one of a line's whole
    // phrases (an option name, an item name) outranks partial overlap, so
    // "the Coke" is the Coke and not the Diet Coke.
    let pool = scope ? all.filter(scope) : all;
    if (!pool.length) pool = all;
    if (rest.length) {
      const restPhrase = rest.join(" ");
      const scored = pool.map((l) => {
        const aliasSet = new Set(l.aliases.map(stem));
        let hits = rest.filter((w) => aliasSet.has(stem(w))).length;
        if ((l.aliasPhrases ?? []).some((p) => stem(p) === stem(restPhrase))) hits += 2;
        return { l, hits };
      });
      const best = Math.max(...scored.map((s) => s.hits));
      if (best === 0) return { error: "no_such_line", candidates: cands() };
      pool = scored.filter((s) => s.hits === best).map((s) => s.l);
    }
    if (ordinal !== null) {
      const line = pool[ordinal - 1];
      return line ? { line } : { error: "no_such_line", candidates: cands() };
    }
    if (last) return { line: pool[pool.length - 1] };
    if (pool.length === 1) return { line: pool[0] };
    if (!rest.length) {
      // Pure deixis ("that one") → the focus line — UNLESS other lines arrived
      // in the same breath (same turn) and could equally be meant. Then it is
      // a question, not a pick.
      const focus = this.state.focusLineId ? pool.find((l) => l.lineId === this.state.focusLineId) : undefined;
      if (focus) {
        const siblings = pool.filter((l) => l !== focus && l.addedTurn === focus.addedTurn);
        if (!siblings.length) return { line: focus };
        return { error: "ambiguous_line", candidates: cands([focus, ...siblings]) };
      }
    }
    return { error: "ambiguous_line", candidates: cands(pool) };
  }

  private isPureDeixis(hint: string): boolean {
    const words = norm(hint).split(" ").filter((w) => w && !HINT_STOP.has(w));
    return words.length > 0 && words.every((w) => DEICTIC.has(w) || ORDINALS[w] === undefined && (w === "one" || w === "that" || w === "it" || w === "this"));
  }

  /* ── mutations ────────────────────────────────────────────────────────── */

  async addLine(input: AddInput): Promise<MutationResult> {
    const menu = this.deps.menu;
    let base: CartLine | null = null;
    if (input.sameAsLineId) {
      const r = this.resolveTarget({ lineId: input.sameAsLineId });
      if ("error" in r) return this.fail(r.error, "There is no such line to copy.", { candidates: r.candidates });
      base = r.line;
    }
    const menuItemId = String(input.menuItemId ?? base?.intent.menuItemId ?? "").trim();
    if (!menuItemId) return this.fail("missing_item", "Say which menu item to add (menuItemId).");
    if (!menu.has(menuItemId)) {
      return this.fail("unknown_item", "That isn't an item on this restaurant's menu. Use find_menu_item to look it up.");
    }
    const entry = menu.get(menuItemId)!;
    if (entry.soldOut) return this.fail("sold_out", `${entry.name} is sold out today.`, { needsInfo: true });
    const kind = entry.kind;
    if (kind !== "item" && this.deps.allowPizzaCombo === false) {
      return this.fail("builder_disabled", "Pizzas and combos can't be customised by phone right now — offer to text the online ordering link, or take the rest of the order and suggest they add this item online.");
    }
    if (this.state.lines.length >= MAX_LINES) {
      return this.fail("too_many_lines", "This order is too large to take by phone — connect the caller to a person.");
    }
    if (kind === "combo" && !input.sameAsLineId && !Array.isArray(input.picks)) {
      // A combo with no picks is fine — it will come back needs_info with the slot questions.
    }

    // Build the intent: clone-then-change, or fresh from the input.
    let intent: LineIntent;
    if (base) {
      intent = JSON.parse(JSON.stringify(base.intent));
      intent.menuItemId = menuItemId;
      intent.quantity = input.quantity !== undefined ? clampQty(input.quantity) : 1;
      if (kind === "combo") {
        (intent as ComboIntent).picks = (intent as ComboIntent).picks.map((p) => ({ ...p, pickId: "" }));
        this.renumberPicks(intent as ComboIntent, "fresh");
      }
      intent = this.applyChanges(intent, kind, { ...input, quantity: undefined }, "clone");
    } else {
      intent = this.freshIntent(kind, menuItemId, input);
    }
    // Every id inside a combo must be on this menu too — and every named-pizza
    // recipe referenced by a half.
    if (kind === "combo") {
      for (const p of (intent as ComboIntent).picks) {
        if (!menu.has(p.menuItemId)) return this.fail("unknown_item", `"${p.menuItemId}" isn't on this menu — use the ids from get_item_options.`);
        for (const hr of p.halfRecipes ?? []) if (!menu.has(hr.menuItemId)) return this.fail("unknown_item", `Recipe pizza "${hr.menuItemId}" isn't on this menu — use find_menu_item.`);
      }
    }
    if (kind === "pizza") {
      for (const hr of (intent as PizzaIntent).halfRecipes ?? []) if (!menu.has(hr.menuItemId)) return this.fail("unknown_item", `Recipe pizza "${hr.menuItemId}" isn't on this menu — use find_menu_item.`);
    }

    // Duplicate-add guard.
    if (!input.confirmAnother && !input.sameAsLineId) {
      const dup = this.findLikelyDuplicate(menuItemId, intent);
      if (dup) {
        return this.fail(
          "possible_duplicate",
          `${dup.readBack} (${dup.lineId}) is already on the order${dup.status === "needs_info" ? " and isn't finished yet" : ""}. ` +
            `Is this a change to ${dup.lineId}, or an additional one? If a change, call update_line with lineId "${dup.lineId}". ` +
            `If the caller confirms they want another, call add_to_order again with confirmAnother: true.`,
          { needsInfo: true, lineId: dup.lineId },
        );
      }
    }

    const res = await this.compile(kind, intent, { offerDeals: this.deps.offerDeals === true });
    if (!res.ok) return this.fail(res.code || "compile_failed", res.message || "I couldn't add that.", { error: true });

    const lineId = `L${this.state.nextLineNo++}`;
    const line = this.materialize(lineId, kind, intent, res, this.state.turn);
    this.state.lines.push(line);
    this.state.focusLineId = lineId;
    this.retireQuote();
    return this.okResult(line, res);
  }

  async updateLine(target: Target, changes: LineChanges): Promise<MutationResult> {
    // Narrow "which line" by what the change could apply to: removing
    // mushrooms can only mean a line that HAS mushrooms.
    const removeNames = [
      ...(changes.removeToppings ?? []).map((t) => String(t?.name ?? "")),
      ...(changes.removeOptions ?? []).map(String),
      ...(changes.picks ?? []).flatMap((p) => (p.removeToppings ?? []).map((t) => String(t?.name ?? ""))),
    ].filter(Boolean);
    const scope = removeNames.length
      ? (l: CartLine) => removeNames.every((n) => l.aliases.some((a) => sameName(a, n)))
      : undefined;
    const r = this.resolveTarget(target, scope);
    if ("error" in r) {
      return r.error === "ambiguous_line"
        ? this.fail("ambiguous_line", "Several lines could be the one meant — ask the caller which.", { needsInfo: true, candidates: r.candidates })
        : this.fail("no_such_line", "There's no such line on the order.", { candidates: r.candidates });
    }
    const line = r.line;
    let kind = line.kind;
    let intent: LineIntent = JSON.parse(JSON.stringify(line.intent));
    if (changes.revertLastChange) {
      if (!line.previousIntent) {
        return this.fail("nothing_to_revert", `${line.lineId} has not been changed since it was added — there is nothing to undo.`, { needsInfo: true, lineId: line.lineId });
      }
      intent = JSON.parse(JSON.stringify(line.previousIntent));
      kind = this.deps.menu.kindOf(intent.menuItemId) ?? kind;
      const res0 = await this.compile(kind, intent, { offerDeals: false });
      if (!res0.ok) return this.fail(res0.code || "compile_failed", res0.message || "I couldn't undo that.", { error: true, lineId: line.lineId });
      const idx0 = this.state.lines.indexOf(line);
      const rebuilt0 = this.materialize(line.lineId, kind, intent, res0, line.addedTurn);
      rebuilt0.previousIntent = null;
      this.state.lines[idx0] = rebuilt0;
      this.state.focusLineId = line.lineId;
      this.retireQuote();
      return this.okResult(rebuilt0, res0);
    }
    if (changes.replaceWithItemId) {
      const id = String(changes.replaceWithItemId).trim();
      if (!this.deps.menu.has(id)) return this.fail("unknown_item", "That replacement isn't on this menu.");
      const newKind = this.deps.menu.kindOf(id)!;
      if (newKind !== kind) {
        // Kind change: rebuild a fresh intent of the new kind, carrying what fits.
        intent = this.freshIntent(newKind, id, { quantity: intent.quantity, notes: intent.notes ?? undefined, size: (intent as any).size });
        kind = newKind;
      } else {
        intent.menuItemId = id;
      }
    }
    if (kind === "combo") {
      for (const pc of changes.picks ?? []) {
        if (pc.menuItemId && !this.deps.menu.has(String(pc.menuItemId))) {
          return this.fail("unknown_item", `"${pc.menuItemId}" isn't on this menu — use the ids from get_item_options.`);
        }
      }
    }
    let applied: LineIntent;
    const changeNotices: string[] = [];
    try {
      applied = this.applyChanges(intent, kind, changes, "update", line, changeNotices);
    } catch (e) {
      const err = e as { code?: string; message?: string; candidates?: any };
      return this.fail(err.code || "bad_change", err.message || "I couldn't apply that change.", {
        needsInfo: true,
        lineId: line.lineId,
        candidates: err.candidates,
      });
    }
    // NEVER a silent no-op. If the change touched nothing (a topping that
    // wasn't there, a placement with nothing to move), say so — the line, the
    // quote and the undo history stay exactly as they are. Before 2026-08-16
    // (call cmsw4s0mz) this recompiled the same intent and answered `ok`, so
    // the model told the caller "that's fixed now" about a pizza that hadn't
    // moved — twice.
    if (canonicalIntentKey(applied) === canonicalIntentKey(line.intent) && !changes.revertLastChange) {
      const same = this.okResult(line, { ok: true, line: line.compiled, readBack: line.readBack, pricingNote: null, unresolved: line.questions.slice() });
      if (!same.ok) return same;
      return {
        ...same,
        changed: false,
        notices: [...(changeNotices.length ? changeNotices : ["Nothing on the line matched that change — nothing changed"]), ...(same.notices ?? [])],
      };
    }
    const res = await this.compile(kind, applied, { offerDeals: false });
    if (!res.ok) return this.fail(res.code || "compile_failed", res.message || "I couldn't change that.", { error: true, lineId: line.lineId });

    const unresolved = res.unresolved ?? [];
    // A change that only TAKES things away (a pick removed, a topping removed)
    // is exactly what the caller asked for even if it leaves the line
    // unfinished — "no Coke in the combo" legitimately means "which drink
    // instead?". Every other unresolved recompile keeps the old line intact.
    const subtractive =
      (changes.picks ?? []).some((p) => p.remove) &&
      !changes.replaceWithItemId &&
      !(changes.picks ?? []).some((p) => !p.remove && p.menuItemId);
    if ((!res.line || unresolved.length) && line.status === "complete" && !subtractive) {
      // The old line stays exactly as it was — a half-applied change is worse than none.
      return this.fail("needs_info", unresolved[0] ?? "I need one more detail before I can change that.", {
        needsInfo: true,
        lineId: line.lineId,
        questions: unresolved,
      });
    }
    const idx = this.state.lines.indexOf(line);
    const rebuilt = this.materialize(line.lineId, kind, applied, res, line.addedTurn);
    rebuilt.previousIntent = JSON.parse(JSON.stringify(line.intent));
    this.state.lines[idx] = rebuilt;
    this.state.focusLineId = line.lineId;
    this.retireQuote();
    return this.okResult(rebuilt, res);
  }

  removeLine(target: Target): MutationResult {
    const r = this.resolveTarget(target);
    if ("error" in r) {
      return r.error === "ambiguous_line"
        ? this.fail("ambiguous_line", "Several lines could be the one meant — ask the caller which.", { needsInfo: true, candidates: r.candidates })
        : this.fail("no_such_line", "There's no such line on the order.", { candidates: r.candidates });
    }
    const line = r.line;
    this.state.lines = this.state.lines.filter((l) => l !== line);
    if (this.state.focusLineId === line.lineId) {
      this.state.focusLineId = this.state.lines.length ? this.state.lines[this.state.lines.length - 1].lineId : null;
    }
    this.retireQuote();
    return {
      ok: true,
      lineId: line.lineId,
      line: this.summarize(line),
      speakExactly: `Took off ${line.spoken}.`,
      pricingNote: null,
      state: this.stateForModel(),
    };
  }

  /* ── state for the model ──────────────────────────────────────────────── */

  stateForModel(): OrderState {
    const s = this.state;
    const f = s.fulfilment;
    const address = [f.street, f.city, f.zip].filter(Boolean).join(", ");
    return {
      turn: s.turn,
      fulfilment: {
        type: f.type,
        ...(f.type === "delivery" ? { address: address || undefined, verified: f.check?.located === true, fee: f.check?.fee ?? null, ...(typeof f.check?.freeDeliveryOver === "number" ? { freeDeliveryOver: f.check.freeDeliveryOver } : {}) } : {}),
      },
      customer: { ...s.customer },
      lines: s.lines.map((l) => this.summarize(l)),
      focusLineId: s.focusLineId,
      incomplete: s.lines.filter((l) => l.status === "needs_info").map((l) => l.lineId),
      problems: this.validate(),
      quote: s.lastQuote ? { total: s.lastQuote.total, stale: !this.quoteStillApplies() } : null,
      placed: s.placedOrders.map((p) => ({ orderNumber: p.orderNumber, total: p.total })),
      cartHash: this.cartHash(),
    };
  }

  /** The whole order as TICKET lines, numbered — for get_order_state / debugging. */
  fullReadBack(): string {
    const lines = this.state.lines;
    if (!lines.length) return "Nothing is on the order yet.";
    return lines.map((l, i) => `${i + 1}. ${l.readBack}${l.status === "needs_info" ? " (not finished)" : ""}`).join(" ");
  }

  /** The whole order as a person would SAY it before quoting: "So that's a
   *  large pizza, half …, twenty piece Chicken Wings, hot mixed, and two
   *  Dipping Sauce, garlic." Unfinished lines say so. */
  spokenOrder(): string {
    return spokenOrderText(this.state.lines.map((l) => (l.status === "needs_info" ? `${l.spoken}, which isn't finished yet` : l.spoken)));
  }

  /* ── internals ────────────────────────────────────────────────────────── */

  private summarize(l: CartLine): LineSummary {
    const base: LineSummary = {
      lineId: l.lineId,
      kind: l.kind,
      quantity: l.intent.quantity,
      description: l.readBack,
      status: l.status,
    };
    if (l.status === "needs_info" && l.questions.length) base.questions = l.questions;
    if (l.halves) base.halves = l.halves;
    if (l.kind === "combo") {
      const picks = (l.intent as ComboIntent).picks;
      base.picks = picks.map((p) => ({
        pickId: p.pickId,
        slotLabel: l.pickSlots.find((ps) => ps.pickId === p.pickId)?.slotLabel ?? p.slotLabel ?? null,
        description: this.describePick(p),
      }));
    }
    return base;
  }

  private describePick(p: Pick): string {
    const name = this.deps.menu.get(p.menuItemId)?.name ?? p.menuItemId;
    const bits: string[] = [];
    if (p.size) bits.push(p.size);
    if (p.toppings?.length) {
      const by = (pl: Placement) => p.toppings!.filter((t) => t.placement === pl).map((t) => (t.count && t.count > 1 ? `${t.count}x ${t.name}` : t.name));
      const w = by("whole"), l = by("left"), r = by("right");
      if (l.length || r.length) {
        if (l.length) bits.push(`left: ${l.join(", ")}`);
        if (r.length) bits.push(`right: ${r.join(", ")}`);
        if (w.length) bits.push(`whole: ${w.join(", ")}`);
      } else if (w.length) bits.push(w.join(", "));
    }
    if (p.excludeToppings?.length) bits.push(`no ${p.excludeToppings.join(", no ")}`);
    if (p.options?.length) bits.push(p.options.join(", "));
    return bits.length ? `${name} (${bits.join("; ")})` : name;
  }

  private fail(
    code: string,
    message: string,
    extra: { needsInfo?: boolean; error?: boolean; lineId?: string; questions?: string[]; candidates?: any } = {},
  ): MutationResult {
    return {
      ok: false,
      ...(extra.needsInfo ? { needsInfo: true } : {}),
      ...(extra.error || (!extra.needsInfo && code !== "possible_duplicate") ? { error: true } : {}),
      code,
      message,
      ...(extra.lineId ? { lineId: extra.lineId } : {}),
      ...(extra.questions ? { questions: extra.questions } : {}),
      ...(extra.candidates ? { candidates: extra.candidates } : {}),
      state: this.stateForModel(),
    };
  }

  private okResult(line: CartLine, res: Extract<CompileResponse, { ok: true }>): MutationResult {
    return {
      ok: true,
      lineId: line.lineId,
      line: this.summarize(line),
      // An unfinished line has nothing to recap yet — the model ASKS the first
      // question (instruction + `line.questions`); handing it the ticket
      // string here got it read aloud ("1× Chicken Wings (not finished) —
      // still need: …"), which is exactly the machine voice Luigi heard.
      speakExactly: line.status === "needs_info" ? "" : line.spoken,
      pricingNote: line.pricingNote,
      ...(line.halves ? { halves: line.halves } : {}),
      ...(res.notices?.length ? { notices: res.notices } : {}),
      ...(line.meta.autoAppliedDeal ? { autoAppliedDeal: line.meta.autoAppliedDeal } : {}),
      ...(line.meta.switchedTo ? { switchedTo: line.meta.switchedTo } : {}),
      state: this.stateForModel(),
    };
  }

  private freshIntent(kind: MenuKind, menuItemId: string, input: AddInput | LineChanges & { size?: any; notes?: any; quantity?: any; options?: any; picks?: any }): LineIntent {
    const quantity = clampQty((input as any).quantity);
    const notes = cleanNote((input as any).notes);
    if (kind === "item") {
      return { menuItemId, quantity, size: cleanNote((input as any).size), options: cleanStrings((input as any).options ?? (input as any).setOptions), notes };
    }
    if (kind === "pizza") {
      const toppings = (Array.isArray((input as any).toppings) ? (input as any).toppings : []).map(cleanTopping).filter(Boolean) as ToppingReq[];
      const extra = (Array.isArray((input as any).addToppings) ? (input as any).addToppings : []).map(cleanTopping).filter(Boolean) as ToppingReq[];
      return {
        menuItemId,
        quantity,
        size: cleanNote((input as any).size),
        crust: cleanNote((input as any).crust),
        sauce: cleanNote((input as any).sauce),
        cheese: cleanNote((input as any).cheese),
        toppings: dedupeToppings([...toppings, ...extra]),
        excludeToppings: cleanStrings((input as any).excludeToppings),
        ...(cleanHalfRecipes((input as any).halfRecipes).length ? { halfRecipes: cleanHalfRecipes((input as any).halfRecipes) } : {}),
        notes,
      };
    }
    const combo: ComboIntent = { menuItemId, quantity, picks: [], notes };
    for (const raw of Array.isArray((input as any).picks) ? (input as any).picks : []) {
      const id = String(raw?.menuItemId ?? "").trim();
      if (!id) continue;
      const n = Math.max(1, Math.min(12, Math.floor(Number(raw?.quantity) || 1)));
      for (let i = 0; i < n; i++) combo.picks.push(this.cleanPick({ ...raw, menuItemId: id }, ""));
    }
    this.renumberPicks(combo, "fresh");
    return combo;
  }

  private cleanPick(raw: any, pickId: string): Pick {
    const toppings = (Array.isArray(raw?.toppings) ? raw.toppings : []).map(cleanTopping).filter(Boolean) as ToppingReq[];
    const p: Pick = { pickId, menuItemId: String(raw.menuItemId) };
    if (raw.slotLabel) p.slotLabel = String(raw.slotLabel);
    if (raw.size) p.size = cleanNote(raw.size);
    const options = cleanStrings(raw.options ?? raw.setOptions);
    if (options.length) p.options = options;
    if (toppings.length) p.toppings = dedupeToppings(toppings);
    const ex = cleanStrings(raw.excludeToppings);
    if (ex.length) p.excludeToppings = ex;
    const hr = cleanHalfRecipes(raw.halfRecipes);
    if (hr.length) p.halfRecipes = hr;
    for (const k of ["crust", "sauce", "cheese", "notes"] as const) {
      const v = cleanNote(raw[k]);
      if (v) p[k] = v;
    }
    return p;
  }

  private renumberPicks(combo: ComboIntent, mode: "fresh" | "keep", line?: CartLine) {
    // Pick ids are per LINE — "P1" in L2 and "P1" in L5 are different picks. A
    // fresh combo numbers from 1; later appends continue from the line's
    // high-water mark, so a removed pick's id is never reused (same rule as
    // lineIds: "P3" means the same thing for the whole call).
    if (mode === "fresh") {
      combo.picks.forEach((p, i) => (p.pickId = `P${i + 1}`));
      return;
    }
    let max = line?.meta.maxPickNo ?? 0;
    for (const p of combo.picks) {
      const m = /^P(\d+)$/.exec(p.pickId ?? "");
      if (m) max = Math.max(max, Number(m[1]));
    }
    for (const p of combo.picks) if (!p.pickId) p.pickId = `P${++max}`;
  }

  /** Merge caller-requested changes into a COPY of an intent. Throws
   *  `{code, message}` on a change that cannot be expressed. Anything that
   *  matched nothing (a topping that wasn't there) is written to `notices`
   *  rather than dropped on the floor — the caller of this decides whether the
   *  whole change was a no-op. */
  private applyChanges(intent: LineIntent, kind: MenuKind, ch: LineChanges | AddInput, mode: "update" | "clone", line?: CartLine, notices: string[] = []): LineIntent {
    const out: any = JSON.parse(JSON.stringify(intent));
    if (ch.quantity !== undefined) out.quantity = clampQty(ch.quantity, out.quantity);
    if (ch.notes !== undefined) out.notes = cleanNote(ch.notes);
    if (ch.size !== undefined) out.size = cleanNote(ch.size);
    if (kind === "item") {
      if (Array.isArray(ch.setOptions)) out.options = cleanStrings(ch.setOptions);
      else if (mode === "clone" && Array.isArray((ch as AddInput).options)) out.options = cleanStrings((ch as AddInput).options);
      if (Array.isArray(ch.removeOptions)) {
        const drop = cleanStrings(ch.removeOptions);
        out.options = (out.options as string[]).filter((o) => !drop.some((d) => sameName(d, o)));
      }
      if (Array.isArray(ch.addOptions)) {
        for (const o of cleanStrings(ch.addOptions)) if (!(out.options as string[]).some((x) => sameName(x, o))) out.options.push(o);
      }
      return out;
    }
    if (kind === "pizza") {
      for (const k of ["crust", "sauce", "cheese"] as const) if (ch[k] !== undefined) out[k] = cleanNote(ch[k]);
      if (ch.halfRecipes !== undefined) {
        const hr = cleanHalfRecipes(ch.halfRecipes);
        if (hr.length) out.halfRecipes = hr;
        else delete out.halfRecipes;
      }
      applyToppingChanges(out, ch, line?.halves ?? null, this.presetsOf(line), notices);
      return out;
    }
    // combo
    // A size addressed at the combo itself ("make the pizza extra large") goes
    // to the one pizza pick, else the one pick at all; several ⇒ ask which.
    if (ch.size !== undefined) {
      delete out.size;
      const picks = out.picks as Pick[];
      const pizzaPicks = picks.filter((p) => this.deps.menu.kindOf(p.menuItemId) === "pizza");
      const target = pizzaPicks.length === 1 ? pizzaPicks[0] : picks.length === 1 ? picks[0] : null;
      if (!target) {
        throw {
          code: "ambiguous_pick",
          message: "Say which pick in the combo the size is for (pickId).",
          candidates: (pizzaPicks.length ? pizzaPicks : picks).map((p) => ({ lineId: p.pickId, description: this.describePick(p) })),
        };
      }
      target.size = cleanNote(ch.size);
    }
    // Option changes addressed at the combo itself ("make the wings hot") go
    // to the ONE non-pizza pick that takes options; several ⇒ ask which.
    if (Array.isArray(ch.setOptions) || Array.isArray(ch.addOptions) || Array.isArray(ch.removeOptions)) {
      const itemPicks = (out.picks as Pick[]).filter((p) => this.deps.menu.kindOf(p.menuItemId) === "item");
      if (itemPicks.length === 1) {
        const p = itemPicks[0];
        let opts = Array.isArray(ch.setOptions) ? cleanStrings(ch.setOptions) : (p.options ?? []).slice();
        if (Array.isArray(ch.removeOptions)) {
          const drop = cleanStrings(ch.removeOptions);
          opts = opts.filter((o) => !drop.some((d) => sameName(d, o)));
        }
        for (const o of cleanStrings(ch.addOptions ?? [])) if (!opts.some((x) => sameName(x, o))) opts.push(o);
        p.options = opts;
      } else if (itemPicks.length > 1) {
        throw {
          code: "ambiguous_pick",
          message: "Several picks in this combo take options — say which one (pickId).",
          candidates: itemPicks.map((p) => ({ lineId: p.pickId, description: this.describePick(p) })),
        };
      } else {
        throw { code: "no_such_pick", message: "Nothing in this combo takes those options — use picks[] with a pickId." };
      }
    }
    for (const k of ["crust", "sauce", "cheese"] as const) if ((ch as any)[k] !== undefined) {
      // A crust/sauce/cheese on the combo itself is meaningless — apply to the only pizza pick if there is exactly one.
      const pizzaPicks = (out.picks as Pick[]).filter((p) => this.deps.menu.kindOf(p.menuItemId) === "pizza");
      if (pizzaPicks.length === 1) pizzaPicks[0][k] = cleanNote((ch as any)[k]);
      else throw { code: "ambiguous_pick", message: "Say which pizza in the combo that applies to (pickId)." };
    }
    if (ch.toppings || ch.addToppings || ch.removeToppings || ch.moveTopping || ch.excludeToppings) {
      // Topping changes addressed at a combo without a pick: apply to the single pizza pick, else ask.
      const pizzaPicks = (out.picks as Pick[]).filter((p) => this.deps.menu.kindOf(p.menuItemId) === "pizza");
      if (pizzaPicks.length === 1) {
        applyToppingChanges(pizzaPicks[0], ch, null, this.presetsOf(line, pizzaPicks[0].pickId), notices);
      } else if (pizzaPicks.length > 1) {
        throw {
          code: "ambiguous_pick",
          message: "This combo has more than one pizza — say which one (pickId) the topping change is for.",
          candidates: pizzaPicks.map((p) => ({ lineId: p.pickId, description: this.describePick(p) })),
        };
      } else {
        throw { code: "no_pizza_in_combo", message: "There is no pizza in this combo to put toppings on." };
      }
    }
    for (const pc of ch.picks ?? []) {
      const picks = out.picks as Pick[];
      let targetPick: Pick | undefined;
      if (pc.pickId) {
        targetPick = picks.find((p) => p.pickId.toUpperCase() === String(pc.pickId).toUpperCase());
        if (!targetPick) throw { code: "no_such_pick", message: `There is no ${pc.pickId} in this combo.`, candidates: picks.map((p) => ({ lineId: p.pickId, description: this.describePick(p) })) };
      } else if (pc.slotLabel) {
        // Exact label first ("Drink" is "Drink"); a partial match ("Pizza" vs
        // "Pizza 1") only edits when it is unambiguous AND the change is not
        // swapping in a different KIND of item — otherwise it is an append and
        // the compiler's slot rules decide whether that fits.
        const label = norm(pc.slotLabel);
        const labelOf = (p: Pick) => norm(line?.pickSlots.find((ps) => ps.pickId === p.pickId)?.slotLabel ?? p.slotLabel ?? "");
        const exact = picks.filter((p) => labelOf(p) === label);
        const partial = exact.length ? [] : picks.filter((p) => labelOf(p).includes(label));
        const cands = (xs: Pick[]) => xs.map((p) => ({ lineId: p.pickId, description: this.describePick(p) }));
        // A slot that takes SEVERAL picks (choose 4 pop): a new pick for the
        // same item is another one, not a change to the first — the caller
        // said "four Cokes", and one Coke changed four times is still one Coke
        // (T07, 2026-08-15). Only a change WITHOUT a menuItemId, or one that
        // names a different item for a slot holding exactly one pick, edits.
        const sameItem = (p: Pick) => !!pc.menuItemId && String(pc.menuItemId) === p.menuItemId;
        if (exact.length >= 1 && pc.menuItemId && exact.some(sameItem)) {
          // append below (leave targetPick undefined)
        } else if (exact.length > 1) throw { code: "ambiguous_pick", message: `Several picks are in the ${pc.slotLabel} slot — say which (pickId).`, candidates: cands(exact) };
        else if (exact.length === 1) targetPick = exact[0];
        else if (partial.length === 1 && !pc.menuItemId) {
          // A pure edit ("the drink → diet") on the one pick that partially matches.
          targetPick = partial[0];
          // With a menuItemId, a partial label is an APPEND ("Pizza" when the
          // slots are "Pizza 1"/"Pizza 2"): the compiler's slot rules decide
          // whether it fits, and the model uses pickId to replace one.
        } else if (partial.length > 1 && !pc.menuItemId) {
          throw { code: "ambiguous_pick", message: `Several picks could be "${pc.slotLabel}" — say which (pickId).`, candidates: cands(partial) };
        }
      }
      if (pc.remove) {
        if (!targetPick) throw { code: "no_such_pick", message: "Say which pick to remove (pickId)." };
        out.picks = picks.filter((p) => p !== targetPick);
        continue;
      }
      if (!targetPick) {
        // Append new pick(s) (for the named slot, if given).
        if (!pc.menuItemId) throw { code: "missing_item", message: "A new pick needs a menuItemId (use pickId to change an existing pick)." };
        const n = Math.max(1, Math.min(12, Math.floor(Number(pc.quantity) || 1)));
        for (let i = 0; i < n; i++) picks.push(this.cleanPick({ ...pc, menuItemId: String(pc.menuItemId) }, ""));
        this.renumberPicks(out, "keep", line);
        continue;
      }
      // Edit in place.
      if (pc.menuItemId && String(pc.menuItemId) !== targetPick.menuItemId) {
        const oldKind = this.deps.menu.kindOf(targetPick.menuItemId);
        const newKind = this.deps.menu.kindOf(String(pc.menuItemId));
        targetPick.menuItemId = String(pc.menuItemId);
        if (oldKind !== newKind) {
          delete targetPick.toppings;
          delete targetPick.excludeToppings;
          delete targetPick.crust;
          delete targetPick.sauce;
          delete targetPick.cheese;
          delete targetPick.options;
          delete targetPick.size;
        }
      }
      if (pc.size !== undefined) targetPick.size = cleanNote(pc.size);
      if (pc.notes !== undefined) targetPick.notes = cleanNote(pc.notes) ?? undefined;
      for (const k of ["crust", "sauce", "cheese"] as const) if (pc[k] !== undefined) targetPick[k] = cleanNote(pc[k]) ?? undefined;
      if (Array.isArray(pc.options)) targetPick.options = cleanStrings(pc.options);
      if (pc.slotLabel && !targetPick.slotLabel) targetPick.slotLabel = pc.slotLabel;
      if (pc.halfRecipes !== undefined) {
        const hr = cleanHalfRecipes(pc.halfRecipes);
        if (hr.length) targetPick.halfRecipes = hr;
        else delete targetPick.halfRecipes;
      }
      if (pc.toppings || pc.addToppings || pc.removeToppings || pc.moveTopping || pc.excludeToppings) {
        // Presets are read off the line as it stands (this pick, BEFORE this
        // change) — a pick that swapped to a different item in this same change
        // has no compiled presets yet.
        const original = line && line.kind === "combo" ? (line.intent as ComboIntent).picks.find((p) => p.pickId === targetPick!.pickId) : undefined;
        const swapped = !!original && original.menuItemId !== targetPick.menuItemId;
        applyToppingChanges(targetPick, pc, null, swapped ? [] : this.presetsOf(line, targetPick.pickId), notices);
      }
    }
    return out;
  }

  /**
   * Preset toppings on a pizza LINE, or on one pizza PICK of a combo = what the
   * compiler put on that the caller never asked for (the item's standard build,
   * a halfRecipes recipe's toppings), each with the SIDE it sits on. Read off
   * the COMPILED modifiers — the ticket's own "(L.H) / (R.H) / (W)" prefixes —
   * so "remove onions" on a Hawaiian becomes an exclusion, and "no tomato on
   * the veggie half" can tell a recipe-half topping from a whole-pizza one.
   *
   * Combo picks were `[]` here until 2026-08-16 (call cmsw4s0mz): removing a
   * recipe topping from the combo's pizza matched nothing, returned ok, and
   * changed nothing — twice, 13 s of silence, "Hello?".
   */
  private presetsOf(line?: CartLine, pickId?: string): PresetTopping[] {
    if (!line || !line.compiled) return [];
    let mods: CompiledModifier[] | null = null;
    let asked: ToppingReq[] = [];
    if (line.kind === "pizza") {
      mods = line.compiled.modifiers;
      asked = (line.intent as PizzaIntent).toppings ?? [];
    } else if (line.kind === "combo" && pickId) {
      // bundleItems are emitted in pick order (one child per pick) on a
      // COMPLETE combo — `compiled` is null otherwise, handled above.
      const picks = (line.intent as ComboIntent).picks;
      const idx = picks.findIndex((p) => p.pickId.toUpperCase() === pickId.toUpperCase());
      const child = idx >= 0 ? line.compiled.bundleItems?.[idx] : undefined;
      if (!child || child.menuItemId !== picks[idx].menuItemId) return [];
      mods = child.modifiers;
      asked = picks[idx].toppings ?? [];
    }
    if (!mods) return [];
    const out: PresetTopping[] = [];
    for (const m of mods) {
      const side: Placement = m.name.startsWith("(L.H) ") ? "left" : m.name.startsWith("(R.H) ") ? "right" : "whole";
      const bare = m.name.replace(/^\((L\.H|R\.H|W)\)\s*/, "");
      // Only names that came from the compiler and NOT from the caller are presets.
      if (asked.some((a) => sameName(a.name, bare))) continue;
      if (!out.some((p) => p.side === side && sameName(p.name, bare))) out.push({ name: bare, side });
    }
    return out;
  }

  private findLikelyDuplicate(menuItemId: string, intent: LineIntent): CartLine | null {
    const recent = this.state.lines.filter((l) => l.intent.menuItemId === menuItemId);
    for (const l of recent) {
      if (l.status === "needs_info") return l;
      if (this.state.turn - l.lastTouchedTurn <= DUP_WINDOW_TURNS && sameIntentIgnoringQty(l.intent, intent)) return l;
    }
    return null;
  }

  private async compile(kind: MenuKind, intent: LineIntent, opts: { offerDeals: boolean }): Promise<CompileResponse> {
    const wire = JSON.parse(JSON.stringify(intent));
    // Engine-only bookkeeping never crosses the wire.
    delete wire.excludedSides;
    if (kind === "combo") {
      // The compiler doesn't know pickIds; strip them but keep order (which is
      // how pickSlots come back aligned).
      wire.picks = (wire.picks as Pick[]).map(({ pickId: _p, excludedSides: _s, ...rest }) => rest);
    }
    try {
      return await this.deps.compiler.compile({
        kind,
        intent: wire,
        askGroupIds: this.deps.askGroupIds ?? [],
        ...(opts.offerDeals ? { offerDeals: true } : {}),
      });
    } catch (e) {
      return { ok: false, code: "compiler_unavailable", message: "I couldn't reach the menu just now." };
    }
  }

  private materialize(lineId: string, kind: MenuKind, intent: LineIntent, res: Extract<CompileResponse, { ok: true }>, addedTurn: number): CartLine {
    const unresolved = res.unresolved ?? [];
    const complete = !!res.line && unresolved.length === 0;
    const entry = this.deps.menu.get(intent.menuItemId);
    // Canonicalise the caller's spoken topping names to what the compiler
    // resolved, so a later "remove mushrooms" finds "Mushroom" exactly.
    if (kind === "pizza" && Array.isArray(res.toppings) && res.toppings.length) {
      const pi = intent as PizzaIntent;
      pi.toppings = pi.toppings.map((t) => {
        const hit = res.toppings!.find((rt) => rt.placement === t.placement && sameName(rt.spoken, t.name));
        return hit ? { ...t, name: hit.resolved } : t;
      });
    }
    // If the server built a different item to give the caller the size they
    // asked for, remember THAT id so recompiles are stable.
    if (res.switchedTo?.menuItemId && this.deps.menu.has(res.switchedTo.menuItemId)) {
      intent.menuItemId = res.switchedTo.menuItemId;
    }
    const pickSlots: Array<{ pickId: string; slotLabel: string }> = [];
    if (kind === "combo" && Array.isArray(res.pickSlots)) {
      const picks = (intent as ComboIntent).picks;
      for (const ps of res.pickSlots) {
        const p = picks[ps.index];
        if (p) pickSlots.push({ pickId: p.pickId, slotLabel: ps.slotLabel });
      }
    }
    const readBack = complete
      ? res.readBack || `${intent.quantity}× ${entry?.name ?? "item"}`
      : res.readBack || `${intent.quantity}× ${entry?.name ?? "item"} (not finished)`;
    const spoken = complete && res.spoken ? res.spoken : readBack;
    return {
      lineId,
      kind,
      intent,
      compiled: complete ? res.line : null,
      readBack,
      spoken,
      halves: res.halves ?? null,
      // A combo's priceParts decompose its money (slot premium vs pizza
      // extras) — when present they OWN the spoken note; lumping the combined
      // surcharge into "extra toppings add…" would mis-name a slot premium.
      pricingNote: Array.isArray(res.priceParts)
        ? spokenPriceParts(res.priceParts)
        : spokenSurcharge(res.surcharge, res.pricingNote ?? null),
      status: complete ? "complete" : "needs_info",
      questions: unresolved.slice(),
      aliases: buildAliases(kind, intent, entry?.name ?? "", res, this.deps.menu),
      aliasPhrases: buildAliasPhrases(kind, intent, entry?.name ?? "", res, this.deps.menu),
      addedTurn,
      lastTouchedTurn: this.state.turn,
      pickSlots,
      meta: {
        switchedTo: res.switchedTo ? { from: res.switchedTo.from, to: res.switchedTo.to, saving: res.switchedTo.saving } : null,
        autoAppliedDeal: res.autoAppliedDeal ?? null,
        lineSubtotal: typeof res.lineSubtotal === "number" ? res.lineSubtotal : null,
        notices: res.notices ?? [],
        maxPickNo:
          kind === "combo"
            ? Math.max(
                this.getLine(lineId)?.meta.maxPickNo ?? 0,
                ...(intent as ComboIntent).picks.map((p) => Number(/^P(\d+)$/.exec(p.pickId)?.[1] ?? 0)),
              )
            : undefined,
      },
    };
  }
}

/* ─────────────────────────────── helpers ───────────────────────────────── */

function dedupeToppings(list: ToppingReq[]): ToppingReq[] {
  const out: ToppingReq[] = [];
  for (const t of list) {
    const i = out.findIndex((x) => x.placement === t.placement && sameName(x.name, t.name));
    if (i >= 0) out[i] = { ...out[i], ...(t.count ? { count: t.count } : {}) };
    else out.push(t);
  }
  return out;
}

/**
 * Apply topping edits to a pizza-shaped object (a PizzaIntent or a Pick).
 *
 * `presets` = what the compiler put on that the caller never asked for, with
 * the side each sits on (see presetsOf). Rules, in the caller's terms:
 *  - removing a topping the caller ADDED: filtered out (a whole topping taken
 *    off one half stays on the other);
 *  - removing a PRESET that sits on the WHOLE pizza: an exclusion — but not
 *    "off one half only" (the kitchen can't; ask the caller);
 *  - removing a PRESET that sits on ONE half (a halfRecipes recipe's topping,
 *    "no tomato on the veggie half"): an exclusion, remembered with its side;
 *  - removing something that is on NEITHER: nothing happens — and that is
 *    written to `notices`, never swallowed. On 2026-08-16 (call cmsw4s0mz) a
 *    silent no-op here returned ok twice; the model believed it, the caller
 *    heard 13 s of silence and said "Hello?".
 */
function applyToppingChanges(
  target: { toppings?: ToppingReq[]; excludeToppings?: string[]; excludedSides?: Record<string, Placement> },
  ch: { toppings?: ToppingReq[]; addToppings?: ToppingReq[]; removeToppings?: Array<{ name: string; placement?: Placement | null }>; moveTopping?: { name: string; to: Placement }; excludeToppings?: string[] },
  halves: Halves | null,
  presets: PresetTopping[],
  notices: string[] = [],
) {
  let toppings: ToppingReq[] = Array.isArray(target.toppings) ? target.toppings.slice() : [];
  const excludes = new Set(target.excludeToppings ?? []);
  const excludedSides: Record<string, Placement> = { ...(target.excludedSides ?? {}) };
  const sideWord = (s: Placement) => (s === "whole" ? "the whole pizza" : `the ${s} half`);
  if (Array.isArray(ch.toppings)) {
    toppings = dedupeToppings(ch.toppings.map(cleanTopping).filter(Boolean) as ToppingReq[]);
  }
  for (const rm of ch.removeToppings ?? []) {
    const name = String(rm?.name ?? "").trim();
    if (!name) continue;
    const pl = rm.placement === "left" || rm.placement === "right" || rm.placement === "whole" ? rm.placement : null;
    const before = toppings.length;
    // Taking a WHOLE topping off ONE half leaves it on the other half.
    if (pl && pl !== "whole") {
      const wholeIdx = toppings.findIndex((t) => t.placement === "whole" && sameName(t.name, name));
      if (wholeIdx >= 0) {
        toppings[wholeIdx] = { ...toppings[wholeIdx], placement: pl === "left" ? "right" : "left" };
        continue;
      }
    }
    toppings = toppings.filter((t) => !(sameName(t.name, name) && (pl === null || t.placement === pl)));
    if (toppings.length !== before) continue;
    // Not something the caller added — is it a preset the compiler put on?
    const hits = presets.filter((p) => sameName(p.name, name));
    if (!hits.length) {
      // Already excluded? Then the caller is repeating themselves — fine, say so.
      const already = [...excludes].find((ex) => sameName(ex, name));
      notices.push(already ? `${already} was already left off — nothing changed` : `${name} isn't on that pizza — nothing changed`);
      continue;
    }
    const preset = hits[0].name;
    const onWhole = hits.some((h) => h.side === "whole");
    if (pl && pl !== "whole") {
      if (onWhole) {
        throw {
          code: "preset_half_remove_unsupported",
          message: `${preset} comes on the whole pizza as part of the recipe; the kitchen can leave it off the whole pizza, but not off one half. Ask the caller whether to leave it off entirely.`,
        };
      }
      const onThisHalf = hits.find((h) => h.side === pl);
      if (!onThisHalf) {
        // "No tomato on the left" when the recipe's tomato is only on the right.
        notices.push(`${preset} is only on ${sideWord(hits[0].side)} — nothing changed`);
        continue;
      }
      // A recipe-half topping comes off that half by exclusion; remember the
      // side so a later add on the OTHER half doesn't bring it back here.
      excludes.add(preset);
      excludedSides[preset] = pl;
      continue;
    }
    excludes.add(preset);
    excludedSides[preset] = onWhole ? "whole" : hits[0].side;
  }
  if (Array.isArray(ch.addToppings)) {
    for (const raw of ch.addToppings) {
      const t = cleanTopping(raw);
      if (!t) continue;
      // Adding back something previously excluded un-excludes it — unless the
      // exclusion is known to belong to the OTHER half (a recipe-half preset
      // taken off) and the caller is adding it to THIS half only: then this
      // half gets it and the recipe half stays without it.
      for (const ex of [...excludes]) {
        if (!sameName(ex, t.name)) continue;
        const exSide = excludedSides[ex];
        const otherHalfOnly = t.placement !== "whole" && (exSide === "left" || exSide === "right") && exSide !== t.placement;
        if (otherHalfOnly) continue;
        excludes.delete(ex);
        delete excludedSides[ex];
      }
      // "Green peppers on the right half" when green peppers are on the WHOLE
      // pizza is a MOVE, not a second helping (the caller is splitting the
      // pizza in stages). Likewise a topping on the opposite half that is now
      // asked for on this half becomes whole.
      const wholeIdx = t.placement !== "whole" ? toppings.findIndex((x) => x.placement === "whole" && sameName(x.name, t.name)) : -1;
      if (wholeIdx >= 0) {
        toppings[wholeIdx] = { ...toppings[wholeIdx], placement: t.placement, ...(t.count ? { count: t.count } : {}) };
        continue;
      }
      const otherHalf: Placement | null = t.placement === "left" ? "right" : t.placement === "right" ? "left" : null;
      const oppIdx = otherHalf ? toppings.findIndex((x) => x.placement === otherHalf && sameName(x.name, t.name)) : -1;
      if (oppIdx >= 0) {
        toppings[oppIdx] = { ...toppings[oppIdx], placement: "whole", ...(t.count ? { count: t.count } : {}) };
        continue;
      }
      const i = toppings.findIndex((x) => x.placement === t.placement && sameName(x.name, t.name));
      if (i >= 0) toppings[i] = { ...toppings[i], ...(t.count ? { count: t.count } : {}) };
      else toppings.push(t);
    }
  }
  if (ch.moveTopping?.name) {
    const to: Placement = ch.moveTopping.to === "left" || ch.moveTopping.to === "right" ? ch.moveTopping.to : "whole";
    const moved = toppings.filter((t) => sameName(t.name, ch.moveTopping!.name));
    if (moved.length) {
      toppings = toppings.filter((t) => !sameName(t.name, ch.moveTopping!.name));
      const count = Math.max(...moved.map((m) => m.count ?? 1));
      toppings.push({ name: moved[0].name, placement: to, ...(count > 1 ? { count } : {}) });
    } else {
      const preset = presets.find((p) => sameName(p.name, ch.moveTopping!.name));
      if (preset && to !== "whole" && preset.side === "whole") {
        throw { code: "preset_half_remove_unsupported", message: `${preset.name} is part of the recipe on the whole pizza and can't be moved to one half.` };
      }
      if (!preset) notices.push(`${ch.moveTopping.name} isn't on that pizza — nothing moved`);
    }
  }
  for (const ex of cleanStrings(ch.excludeToppings)) {
    excludes.add(ex);
    toppings = toppings.filter((t) => !sameName(t.name, ex));
  }
  target.toppings = dedupeToppings(toppings);
  if (excludes.size) target.excludeToppings = [...excludes];
  else delete target.excludeToppings;
  // Keep only sides for exclusions that still exist (engine-only bookkeeping).
  for (const k of Object.keys(excludedSides)) if (![...excludes].some((ex) => sameName(ex, k))) delete excludedSides[k];
  if (Object.keys(excludedSides).length) target.excludedSides = excludedSides;
  else delete target.excludedSides;
}

/** One string per intent for "did this change touch anything?" — an empty
 *  `excludeToppings` / `excludedSides` and an absent one are the same pizza. */
function canonicalIntentKey(x: LineIntent): string {
  const c: any = JSON.parse(JSON.stringify(x));
  const scrub = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.excludeToppings) && !o.excludeToppings.length) delete o.excludeToppings;
    if (o.excludedSides && typeof o.excludedSides === "object" && !Object.keys(o.excludedSides).length) delete o.excludedSides;
    if (Array.isArray(o.toppings) && !o.toppings.length) delete o.toppings;
    if (Array.isArray(o.picks)) o.picks.forEach(scrub);
  };
  scrub(c);
  return JSON.stringify(sortKeys(c));
}

function sameIntentIgnoringQty(a: LineIntent, b: LineIntent): boolean {
  const strip = (x: LineIntent) => {
    const c: any = JSON.parse(JSON.stringify(x));
    delete c.quantity;
    if (Array.isArray(c.picks)) c.picks = c.picks.map((p: any) => ({ ...p, pickId: undefined }));
    return JSON.stringify(sortKeys(c));
  };
  return strip(a) === strip(b);
}

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}

function buildAliases(kind: MenuKind, intent: LineIntent, itemName: string, res: Extract<CompileResponse, { ok: true }>, menu: MenuIndex): string[] {
  const words = new Set<string>();
  const add = (s: string | null | undefined) => {
    for (const w of norm(s ?? "").split(" ")) if (w && !HINT_STOP.has(w)) words.add(w);
  };
  add(itemName);
  words.add(kind);
  if (kind === "pizza") words.add("pizza");
  for (const rn of res.recipeNames ?? []) add(rn);
  if (kind === "combo") {
    words.add("combo");
    words.add("deal");
  }
  const anyIntent = intent as any;
  add(anyIntent.size);
  if (kind === "pizza") {
    for (const t of (intent as PizzaIntent).toppings) add(t.name);
    add(anyIntent.crust);
    add(anyIntent.sauce);
    add(anyIntent.cheese);
    if (res.halves) {
      for (const n of [...res.halves.left, ...res.halves.right, ...res.halves.whole]) add(n);
      if (res.halves.left.length || res.halves.right.length) {
        words.add("half");
        words.add("split");
      }
    }
  } else if (kind === "item") {
    for (const o of (intent as ItemIntent).options) add(o);
    if (res.line?.variantId) add(anyIntent.size);
  } else {
    for (const p of (intent as ComboIntent).picks) {
      add(menu.get(p.menuItemId)?.name);
      add(p.size);
      for (const t of p.toppings ?? []) add(t.name);
      if (menu.kindOf(p.menuItemId) === "pizza") words.add("pizza");
      for (const o of p.options ?? []) add(o);
    }
  }
  return [...words];
}

function buildAliasPhrases(kind: MenuKind, intent: LineIntent, itemName: string, res: Extract<CompileResponse, { ok: true }>, menu: MenuIndex): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = norm(s ?? "");
    if (n) out.add(n);
  };
  add(itemName);
  for (const rn of res.recipeNames ?? []) add(rn);
  const anyIntent = intent as any;
  if (kind === "pizza") {
    for (const t of (intent as PizzaIntent).toppings) add(t.name);
    if (res.halves) for (const n of [...res.halves.left, ...res.halves.right, ...res.halves.whole]) add(n);
  } else if (kind === "item") {
    for (const o of (intent as ItemIntent).options) add(o);
    for (const m of res.line?.modifiers ?? []) add(m.name);
    add(anyIntent.size);
  } else {
    for (const p of (intent as ComboIntent).picks) {
      add(menu.get(p.menuItemId)?.name);
      for (const o of p.options ?? []) add(o);
      for (const t of p.toppings ?? []) add(t.name);
    }
  }
  return [...out];
}
