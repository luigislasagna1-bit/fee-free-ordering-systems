import { norm, stem, phonetic, editDistance, fuzzyBudget, splitSizeToken } from "./fuzzy";

/**
 * The per-call MENU INDEX — everything the cart engine needs to know about
 * WHAT EXISTS without a round trip, built once from the /api/internal/voice/menu
 * payload at call setup.
 *
 * Two jobs:
 *   1. `has(id)` — the id whitelist. A tool may only ever act on a menuItemId
 *      that was in THIS call's menu snapshot. Anything else is refused before
 *      the compiler is even asked (prompt-injection and stale-id defence).
 *   2. `search(q)` — spoken words → candidate items, so the model stops copying
 *      ids out of a forty-thousand-token prompt and asks the server instead.
 *      Never guesses: returns ranked candidates and an `exact` flag; picking is
 *      the model's job, and one candidate is still a candidate.
 */
export type MenuKind = "item" | "pizza" | "combo";

export type MenuEntry = {
  menuItemId: string;
  name: string;
  kind: MenuKind;
  category: string;
  price: number | null;
  hasVariants: boolean;
  /** Variant names (simple items) or size names (builders) — for speech only. */
  sizes: string[];
  soldOut: boolean;
  description: string | null;
  /** The size baked into the item NAME ("Large 3 Topping" → "large"), if any. */
  nameSize: string | null;
  /** The name with the size token removed — the size-family key. */
  familyKey: string;
  todayDeal: unknown | null;
  /** Option names of a SIMPLE item's groups ("Garlic", "Ranch" on Dipping
   *  Sauce) — so "garlic dip" finds the dip whose flavour is an option, not
   *  only items with "garlic" in their name. */
  keywords: string[];
};

export type SearchCandidate = MenuEntry & { score: number };

export type FindResult = {
  candidates: SearchCandidate[];
  /** True when the top candidate is an exact (or stem-exact) name match. */
  exact: boolean;
  /** A size word found in the query and stripped before matching. */
  sizeHint: string | null;
  /** Real items that exist on other days — so "the Thursday special" is answered honestly. */
  notToday: Array<{ name: string; available: string | null }>;
};

export type MenuIndex = {
  has(id: string): boolean;
  get(id: string): MenuEntry | undefined;
  kindOf(id: string): MenuKind | null;
  search(query: string, opts?: { limit?: number }): FindResult;
  /** Every entry — for the state block's name lookups. */
  entries(): MenuEntry[];
  notToday: Array<{ name: string; available: string | null }>;
};

const MAX_CANDIDATES = 5;

/** Words that carry no meaning for finding an item. */
const STOP = new Set([
  "a", "an", "the", "some", "please", "just", "of", "with", "and", "for", "me", "i", "want", "get", "like",
  "can", "could", "have", "one", "two", "three", "order", "pizza", "pizzas", "combo", "deal", "size", "piece",
  "pieces", "pc", "pcs", "it", "that", "this", "to", "my", "your", "add", "another",
]);

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

export function buildMenuIndex(menuPayload: any): MenuIndex {
  const byId = new Map<string, MenuEntry>();
  const list: MenuEntry[] = [];
  for (const cat of menuPayload?.menu ?? []) {
    const category = String(cat?.category ?? "");
    for (const it of cat?.items ?? []) {
      const id = String(it?.menuItemId ?? "");
      if (!id) continue;
      const kind: MenuKind = it.isCombo ? "combo" : it.isPizza ? "pizza" : "item";
      const split = splitSizeToken(String(it.name ?? ""));
      const entry: MenuEntry = {
        menuItemId: id,
        name: String(it.name ?? ""),
        kind,
        category,
        price: typeof it.price === "number" ? it.price : null,
        hasVariants: !!it.hasVariants || (Array.isArray(it.variants) && it.variants.length > 0),
        sizes: Array.isArray(it.sizeNames)
          ? it.sizeNames.map(String)
          : Array.isArray(it.variants)
            ? it.variants.map((v: any) => String(v?.name ?? "")).filter(Boolean)
            : [],
        soldOut: !!it.isSoldOut,
        description: it.description ? String(it.description) : null,
        nameSize: split.token,
        familyKey: split.rest,
        todayDeal: it.todayDeal ?? null,
        keywords:
          kind === "item" && Array.isArray(it.modifierGroups)
            ? ([...new Set<string>((it.modifierGroups as any[]).flatMap((g: any) => (Array.isArray(g?.options) ? g.options.map((o: any) => norm(String(o?.name ?? ""))) : [])))] as string[]).filter(Boolean).slice(0, 80)
            : [],
      };
      byId.set(id, entry);
      list.push(entry);
    }
  }
  const notToday: Array<{ name: string; available: string | null }> = Array.isArray(menuPayload?.notToday)
    ? menuPayload.notToday
        .map((o: any) => ({ name: String(o?.name ?? ""), available: o?.available ? String(o.available) : null }))
        .filter((o: { name: string }) => o.name)
    : [];

  function search(query: string, opts?: { limit?: number }): FindResult {
    const limit = opts?.limit ?? MAX_CANDIDATES;
    const split = splitSizeToken(query);
    const qNorm = split.rest || norm(query);
    const qStem = stem(qNorm);
    const qTokens = tokens(qNorm);
    const qPhon = phonetic(qNorm);
    const scored: SearchCandidate[] = [];
    for (const e of list) {
      const nameN = norm(e.name);
      const nameStem = stem(e.name);
      // Compare against BOTH the full name and the size-stripped family key so
      // "large pepperoni" finds "Large Pepperoni Pizza" and "pepperoni" alone
      // finds every size of it.
      const familyN = e.familyKey;
      let score = 0;
      const nameTok = tokens(e.name).join(" ");
      const famTok = tokens(familyN).join(" ");
      const qTok = qTokens.join(" ");
      if (nameN === qNorm || familyN === qNorm) score = 100;
      else if (nameStem === qStem || stem(familyN) === qStem) score = 90;
      // "a coke" / "the coke" — same words once stop words are gone.
      else if (qTok && (nameTok === qTok || famTok === qTok)) score = 100;
      else if (qTok && (stem(nameTok) === stem(qTok) || stem(famTok) === stem(qTok))) score = 90;
      else if (qTokens.length) {
        const nameTokens = new Set([...tokens(e.name), ...tokens(e.category), ...e.keywords.flatMap((k) => tokens(k))]);
        // A token matches on equality, stem, or a ≥3-char prefix either way
        // ("dip" ~ "dipping", "pepp" ~ "pepperoni").
        const tokMatch = (n: string, t: string) => n === t || stem(n) === stem(t) || (t.length >= 3 && n.startsWith(t)) || (n.length >= 3 && t.startsWith(n));
        const hits = qTokens.filter((t) => nameTokens.has(t) || [...nameTokens].some((n) => tokMatch(n, t)));
        if (hits.length === qTokens.length) score = 70 + Math.min(10, hits.length);
        else if (hits.length > 0 && hits.length >= Math.ceil(qTokens.length / 2)) score = 40 + hits.length * 5;
      }
      if (score === 0 && qPhon.length >= 3 && (phonetic(e.name) === qPhon || phonetic(familyN) === qPhon)) score = 50;
      if (score === 0) {
        const budget = fuzzyBudget(qStem.length);
        if (budget > 0 && (editDistance(nameStem, qStem) <= budget || editDistance(stem(familyN), qStem) <= budget)) score = 30;
      }
      if (score === 0) continue;
      // A size in the query that matches the item's own name-size is a strong tie-break.
      if (split.token && e.nameSize === split.token) score += 5;
      if (split.token && e.nameSize && e.nameSize !== split.token) score -= 5;
      if (e.soldOut) score -= 1;
      scored.push({ ...e, score });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const candidates = scored.slice(0, limit);
    const notTodayHits = notToday.filter((o) => {
      const on = norm(o.name);
      return on === qNorm || stem(o.name) === qStem || (qTokens.length && qTokens.every((t) => on.includes(t)));
    });
    // Exact when the top hit is a name match and nothing else ties it — a
    // runner-up that differs ONLY by size ("EXTRA Large 1 Topping" behind
    // "Large 1 Topping" when the caller said "large") does not count as a tie.
    const top = candidates[0];
    const second = candidates[1];
    const secondIsSizeSibling =
      !!top && !!second && !!split.token && top.nameSize === split.token && second.familyKey === top.familyKey && second.nameSize !== top.nameSize;
    return {
      candidates,
      exact: !!top && top.score >= 90 && (!second || second.score < 90 || secondIsSizeSibling),
      sizeHint: split.token,
      notToday: notTodayHits,
    };
  }

  return {
    has: (id) => byId.has(String(id)),
    get: (id) => byId.get(String(id)),
    kindOf: (id) => byId.get(String(id))?.kind ?? null,
    search,
    entries: () => list.slice(),
    notToday,
  };
}
