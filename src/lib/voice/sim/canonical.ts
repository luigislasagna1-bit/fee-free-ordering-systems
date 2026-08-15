/**
 * CANONICAL CART — the one shape a scenario's `expected` and the session's
 * actual cart are both reduced to before comparison.
 *
 * Two sources reduce to it:
 *  • `toCanonicalFromCart`   — the engine's `CartState` (what the agent holds
 *                              when the call ends without placing);
 *  • `toCanonicalFromPlaced` — the `/api/orders` body that was actually sent
 *                              (what the kitchen would have received).
 *
 * Both read the COMPILED wire line, never the intent, so the comparison is
 * against the food the kitchen would make — the whole point of the harness.
 *
 * Rules (the scenario authors write `expected` to these; keep them stable):
 *  • `item`  = menuItemId of the wire line (after any size-family swap).
 *  • `size`  = the variant's NAME, lowercased; absent when the line has none.
 *  • `qty`   = wire quantity.
 *  • simple item `options` = ALL compiled modifier names, lowercased, sorted
 *    (Luigi's simple items carry no auto-filled defaults; if a store's do,
 *    they appear here too — a default is still on the ticket).
 *  • pizza `options` = [] — crust / sauce / cheese / garnish are NOT compared
 *    (the critical suite is written to that; see the report for the reason).
 *  • pizza `halves` = toppings by side, read off the "(L.H) "/"(R.H) "/"(W) "
 *    prefixes; a pizza that isn't split has everything under `whole`. Names
 *    are the resolved menu names lowercased with the prefix stripped, and a
 *    topping present N>1 times on the same side becomes "Nx name". Preset
 *    toppings the compiler seeded ARE included (they are on the ticket).
 *  • `excluded` = the "NO X" segments the compiler wrote into the notes
 *    (resolved preset names, lowercased) — same for both sources.
 *  • `note`     = the remaining free-text note, if any.
 *  • combo `picks` = one per bundle child: `slot` = the slot label lowercased
 *    (from the engine's pickSlots when we have them, else re-derived by the
 *    compiler's first-fit rule against the snapshot's combo slots), then the
 *    same item/size/options/halves/excluded rules as a top-level line.
 *
 * `normalizeCanonical` sorts everything, merges identical lines (summing qty)
 * and orders lines by a stable key, so two carts built in different orders
 * compare equal.
 */
import { isHalfToppingName } from "@/lib/pizza-topping-pricing";
import type { CompiledLine, CompiledModifier, ItemData } from "@/lib/voice/order-line-compiler";
import type { CartLine, CartState } from "../../../../services/nabil-voice/src/cart-engine";
import type { CanonicalCart, CanonicalLine, CanonicalPick, CanonicalTopping } from "./scenario-types";
import type { MenuSnapshot } from "./snapshot-types";
import { toppingGroupIds } from "./fake-pricer";

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const stripPrefix = (name: string): { side: "left" | "right" | "whole"; bare: string } => {
  if (name.startsWith("(L.H) ")) return { side: "left", bare: name.slice(6) };
  if (name.startsWith("(R.H) ")) return { side: "right", bare: name.slice(6) };
  if (name.startsWith("(W) ")) return { side: "whole", bare: name.slice(4) };
  return { side: "whole", bare: name };
};

/** "pepperoni, pepperoni" → ["2x pepperoni"]. Counted by option id per side. */
function countToppings(entries: Array<{ id: string; name: string }>): CanonicalTopping[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const e of entries) {
    const key = e.id || e.name;
    const cur = counts.get(key);
    if (cur) cur.n++;
    else counts.set(key, { name: lower(e.name), n: 1 });
  }
  return [...counts.values()].map((c) => (c.n > 1 ? `${c.n}x ${c.name}` : c.name)).sort();
}

/** Split a compiled line's notes into the compiler's "NO X" markers and the rest. */
export function parseNotes(notes: string | null | undefined): { excluded: string[]; note: string | null; childExcluded: Map<string, string[]> } {
  const excluded: string[] = [];
  const childExcluded = new Map<string, string[]>();
  const rest: string[] = [];
  for (const seg of String(notes ?? "").split(";")) {
    const s = seg.trim();
    if (!s) continue;
    let m = /^NO\s+(.+)$/i.exec(s);
    if (m) {
      excluded.push(lower(m[1]));
      continue;
    }
    // Combo children: "<child name>: NO Ham" (hoisted by compileComboLine).
    m = /^(.+?):\s*NO\s+(.+)$/i.exec(s);
    if (m) {
      const k = lower(m[1]);
      childExcluded.set(k, [...(childExcluded.get(k) ?? []), lower(m[2])]);
      continue;
    }
    rest.push(s);
  }
  return { excluded, note: rest.length ? rest.join("; ") : null, childExcluded };
}

function sizeOf(item: ItemData | undefined, variantId: string | null | undefined): string | undefined {
  if (!variantId || !item) return undefined;
  const v = item.variants.find((x) => x.variantId === variantId);
  return v ? lower(v.name) : undefined;
}

/** Item/pizza body shared by top-level lines and combo picks. */
function reduceBody(item: ItemData | undefined, variantId: string | null | undefined, modifiers: CompiledModifier[]) {
  const size = sizeOf(item, variantId);
  if (!item || !item.pizzaConfig) {
    return { size, options: modifiers.map((m) => lower(m.name)).sort(), halves: undefined as CanonicalLine["halves"] };
  }
  const tIds = toppingGroupIds(item);
  const optToGroup = new Map<string, string>();
  for (const g of item.modifierGroups) for (const o of g.options) optToGroup.set(o.modifierOptionId, g.id);
  const sides = { left: [] as Array<{ id: string; name: string }>, right: [] as Array<{ id: string; name: string }>, whole: [] as Array<{ id: string; name: string }> };
  for (const m of modifiers) {
    const gid = optToGroup.get(m.modifierOptionId);
    const { side, bare } = stripPrefix(m.name);
    const isTopping = gid ? tIds.has(gid) : isHalfToppingName(m.name) || m.name.startsWith("(W) ");
    if (!isTopping) continue; // crust / sauce / cheese / garnish: not compared
    sides[side].push({ id: m.modifierOptionId, name: bare });
  }
  return {
    size,
    options: [] as string[],
    halves: { left: countToppings(sides.left), right: countToppings(sides.right), whole: countToppings(sides.whole) },
  };
}

/** First-fit slot assignment, mirroring compileComboLine, for a wire combo. */
function deriveSlotLabels(snapshot: MenuSnapshot, comboId: string, children: Array<{ menuItemId: string }>): string[] {
  const combo = snapshot.combos[comboId];
  if (!combo) return children.map(() => "");
  const fill = combo.slots.map(() => 0);
  return children.map((c) => {
    for (let i = 0; i < combo.slots.length; i++) {
      const s = combo.slots[i];
      if (fill[i] < s.max && s.choiceIds.includes(c.menuItemId)) {
        fill[i]++;
        return lower(s.label);
      }
    }
    return "";
  });
}

function reduceWireLine(snapshot: MenuSnapshot, line: CompiledLine, slotLabels?: Array<string | null | undefined>): CanonicalLine {
  const item = snapshot.items[line.menuItemId];
  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
  const notes = parseNotes(line.notes);
  const out: CanonicalLine = { item: line.menuItemId, qty, options: [] };
  if (item?.name) out.name = item.name;

  if (line.isCombo && Array.isArray(line.bundleItems)) {
    const labels = slotLabels && slotLabels.length === line.bundleItems.length && slotLabels.every((l) => typeof l === "string" && l)
      ? slotLabels.map((l) => lower(l))
      : deriveSlotLabels(snapshot, line.menuItemId, line.bundleItems);
    out.picks = line.bundleItems.map((child, i) => {
      const cItem = snapshot.items[child.menuItemId];
      const body = reduceBody(cItem, child.variantId, child.modifiers ?? []);
      const pick: CanonicalPick = { slot: labels[i] ?? "", item: child.menuItemId, options: body.options };
      if (cItem?.name) pick.name = cItem.name;
      if (body.size) pick.size = body.size;
      if (body.halves) pick.halves = body.halves;
      const ex = notes.childExcluded.get(lower(child.name || cItem?.name || ""));
      if (ex?.length) pick.excluded = [...ex].sort();
      return pick;
    });
    if (notes.note) out.note = notes.note;
    return out;
  }

  const body = reduceBody(item, line.variantId, line.modifiers ?? []);
  if (body.size) out.size = body.size;
  out.options = body.options;
  if (body.halves) out.halves = body.halves;
  if (notes.excluded.length) out.excluded = [...notes.excluded].sort();
  if (notes.note) out.note = notes.note;
  return out;
}

/** The agent's cart (COMPLETE lines only) → canonical. */
export function toCanonicalFromCart(state: CartState, snapshot: MenuSnapshot): CanonicalCart {
  const lines: CanonicalLine[] = [];
  for (const l of state.lines as CartLine[]) {
    if (l.status !== "complete" || !l.compiled) continue;
    let slotLabels: string[] | undefined;
    if (l.kind === "combo" && Array.isArray(l.pickSlots) && l.pickSlots.length) {
      const picks = (l.intent as { picks?: Array<{ pickId: string }> }).picks ?? [];
      slotLabels = picks.map((p) => l.pickSlots.find((ps) => ps.pickId === p.pickId)?.slotLabel ?? "");
    }
    lines.push(reduceWireLine(snapshot, l.compiled, slotLabels));
  }
  return normalizeCanonical({ lines });
}

/** The `/api/orders` body that was sent → canonical. */
export function toCanonicalFromPlaced(payload: { items?: CompiledLine[] } | null | undefined, snapshot: MenuSnapshot): CanonicalCart {
  const items = Array.isArray(payload?.items) ? payload!.items! : [];
  return normalizeCanonical({ lines: items.map((l) => reduceWireLine(snapshot, l)) });
}

/* ─────────────────────────────── normalize ─────────────────────────────── */

const sortStr = (xs: unknown[] | undefined) => (Array.isArray(xs) ? xs.map((x) => lower(x)).sort() : []);

function normHalves(h: CanonicalLine["halves"]): CanonicalLine["halves"] | undefined {
  if (!h) return undefined;
  let left = sortStr(h.left);
  let right = sortStr(h.right);
  const whole = sortStr(h.whole);
  // A topping on BOTH halves is the same pizza as that topping on the whole
  // ("pepperoni on the Hawaiian side and on the meat-lovers side" ≡ pepperoni
  // all over; two half charges = one whole charge on this pricing model).
  for (const t of [...left]) {
    const i = right.indexOf(t);
    if (i >= 0 && !whole.includes(t)) {
      whole.push(t);
      left = left.filter((x, j) => !(x === t && j === left.indexOf(t)));
      right.splice(i, 1);
    }
  }
  return { left, right, whole: whole.sort() };
}

function normPick(p: CanonicalPick): CanonicalPick {
  const out: CanonicalPick = { slot: lower(p.slot), item: String(p.item), options: sortStr(p.options) };
  if (Array.isArray(p.itemAlt) && p.itemAlt.length) out.itemAlt = [...p.itemAlt].map(String).sort();
  if (p.name) out.name = p.name;
  if (p.size) out.size = lower(p.size);
  const h = normHalves(p.halves);
  if (h) out.halves = h;
  if (p.excluded?.length) out.excluded = sortStr(p.excluded);
  return out;
}

/** Order-independent identity of a pick, for sorting. */
export function pickKey(p: CanonicalPick): string {
  return JSON.stringify([p.slot, p.item, p.size ?? "", p.options, p.halves ?? null, p.excluded ?? []]);
}

/** Order-independent identity of a line WITHOUT qty (identical lines merge). */
export function lineKey(l: CanonicalLine): string {
  return JSON.stringify([l.item, l.size ?? "", l.options, l.halves ?? null, l.excluded ?? [], (l.picks ?? []).map(pickKey), l.note ?? ""]);
}

export function normalizeLine(l: CanonicalLine): CanonicalLine {
  const out: CanonicalLine = { item: String(l.item), qty: Math.max(0, Math.floor(Number(l.qty) || 0)), options: sortStr(l.options) };
  if (Array.isArray(l.itemAlt) && l.itemAlt.length) out.itemAlt = [...l.itemAlt].map(String).sort();
  if (l.name) out.name = l.name;
  if (l.size) out.size = lower(l.size);
  const h = normHalves(l.halves);
  if (h) out.halves = h;
  if (l.excluded?.length) out.excluded = sortStr(l.excluded);
  if (Array.isArray(l.picks)) out.picks = l.picks.map(normPick).sort((a, b) => (pickKey(a) < pickKey(b) ? -1 : pickKey(a) > pickKey(b) ? 1 : 0));
  if (l.note && lower(l.note)) out.note = lower(l.note);
  return out;
}

export function normalizeCanonical(cart: CanonicalCart | null | undefined): CanonicalCart {
  const merged = new Map<string, CanonicalLine>();
  for (const raw of cart?.lines ?? []) {
    const l = normalizeLine(raw);
    const k = lineKey(l);
    const cur = merged.get(k);
    if (cur) cur.qty += l.qty;
    else merged.set(k, l);
  }
  const lines = [...merged.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, l]) => l);
  return { lines };
}
