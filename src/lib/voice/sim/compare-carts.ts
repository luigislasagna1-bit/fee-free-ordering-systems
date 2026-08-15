/**
 * CART COMPARISON — actual vs expected canonical carts → `CartDiff`.
 *
 * Both carts are normalized first (see canonical.ts). Lines are paired by a
 * greedy best-match: only lines whose item agrees (`expected.item` ∪
 * `expected.itemAlt`) may pair; among eligible pairs the highest similarity
 * wins, repeatedly. Unpaired expected lines are `missing`, unpaired actual
 * lines are `extra`.
 *
 * Field rules on a matched pair:
 *  • qty       — equal.
 *  • size      — compared ONLY when the expected line names one (an expected
 *                line with no size accepts any actual size; the authors omit
 *                the size on single-variant picks like the combo's wings).
 *  • modifiers — the set of options ∪ "no <excluded>", exact set equality;
 *                counted per option so a partial miss still scores.
 *  • halves    — SWAP-INVARIANT: {left:A, right:B} equals {left:B, right:A}
 *                (a caller who says "one half X, the other Y" gave no side).
 *                `whole` compared separately. A missing `halves` on either
 *                side is the empty split.
 *  • picks     — paired the same way (item ∪ itemAlt, then best score); a pick
 *                is correct when its slot (if the expected names one), size (if
 *                named), modifiers and halves all agree. `comboSlots` counts
 *                expected picks.
 *  • note      — when the expected line carries one, the actual note must
 *                contain it (case-insensitive substring).
 *  • name      — informational only, never compared.
 *
 * `exact` ⇔ no missing, no extra, and every pair fully equal.
 */
import { normalizeCanonical } from "./canonical";
import type { CanonicalCart, CanonicalLine, CanonicalPick, CartDiff } from "./scenario-types";

type Halves = NonNullable<CanonicalLine["halves"]>;
const EMPTY_HALVES: Halves = { left: [], right: [], whole: [] };

const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const inter = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;
const union = (a: string[], b: string[]) => new Set([...a, ...b]).size;
const jaccard = (a: string[], b: string[]) => (a.length === 0 && b.length === 0 ? 1 : inter(a, b) / Math.max(1, union(a, b)));

const modifierSet = (l: { options: string[]; excluded?: string[] }) => [...l.options, ...(l.excluded ?? []).map((e) => `no ${e}`)].sort();

const itemOk = (expected: { item: string; itemAlt?: string[] }, actual: { item: string }) =>
  actual.item === expected.item || (expected.itemAlt ?? []).includes(actual.item);

/** Best orientation of two splits: returns per-side diff under the better of
 *  the straight and the swapped pairing, plus whether it is exact. */
export function compareHalves(actual: Halves | undefined, expected: Halves | undefined) {
  const a = actual ?? EMPTY_HALVES;
  const e = expected ?? EMPTY_HALVES;
  const straight = inter(a.left, e.left) + inter(a.right, e.right);
  const swapped = inter(a.left, e.right) + inter(a.right, e.left);
  const useSwap = swapped > straight;
  const aL = useSwap ? a.right : a.left;
  const aR = useSwap ? a.left : a.right;
  const sides = [
    { side: "left", actual: aL, expected: e.left },
    { side: "right", actual: aR, expected: e.right },
    { side: "whole", actual: a.whole, expected: e.whole },
  ].map((s) => ({
    side: s.side,
    missing: s.expected.filter((t) => !s.actual.includes(t)),
    extra: s.actual.filter((t) => !s.expected.includes(t)),
  }));
  const exact = sides.every((s) => !s.missing.length && !s.extra.length);
  const total = union([...a.left, ...a.right, ...a.whole], [...e.left, ...e.right, ...e.whole]);
  const matched = Math.max(straight, swapped) + inter(a.whole, e.whole);
  return { exact, sides, swapped: useSwap, similarity: total === 0 ? 1 : Math.min(1, matched / total) };
}

function pickScore(a: CanonicalPick, e: CanonicalPick): number {
  let s = 0;
  if (!e.slot || a.slot === e.slot) s += 1;
  if (!e.size || a.size === e.size) s += 1;
  s += jaccard(modifierSet(a), modifierSet(e));
  s += compareHalves(a.halves, e.halves).similarity;
  return s;
}

function lineScore(a: CanonicalLine, e: CanonicalLine): number {
  let s = 0;
  if (a.qty === e.qty) s += 1;
  if (!e.size || a.size === e.size) s += 1;
  s += 2 * jaccard(modifierSet(a), modifierSet(e));
  s += 2 * compareHalves(a.halves, e.halves).similarity;
  if (e.picks?.length || a.picks?.length) {
    const ap = a.picks ?? [];
    const ep = e.picks ?? [];
    const pairs = greedyPair(ap, ep, (x, y) => (itemOk(y, x) ? pickScore(x, y) : -1));
    s += 2 * (pairs.length / Math.max(1, Math.max(ap.length, ep.length)));
  }
  return s;
}

/** Greedy best-first pairing. `score` < 0 means "may not pair". */
function greedyPair<A, E>(actual: A[], expected: E[], score: (a: A, e: E) => number): Array<{ ai: number; ei: number; score: number }> {
  const cands: Array<{ ai: number; ei: number; score: number }> = [];
  actual.forEach((a, ai) => expected.forEach((e, ei) => {
    const s = score(a, e);
    if (s >= 0) cands.push({ ai, ei, score: s });
  }));
  cands.sort((x, y) => y.score - x.score || x.ei - y.ei || x.ai - y.ai);
  const usedA = new Set<number>();
  const usedE = new Set<number>();
  const out: Array<{ ai: number; ei: number; score: number }> = [];
  for (const c of cands) {
    if (usedA.has(c.ai) || usedE.has(c.ei)) continue;
    usedA.add(c.ai);
    usedE.add(c.ei);
    out.push(c);
  }
  return out.sort((x, y) => x.ei - y.ei);
}

const label = (l: CanonicalLine, i: number) => `line ${i + 1} (${l.name ?? l.item}${l.size ? `, ${l.size}` : ""})`;
const pickLabel = (p: CanonicalPick) => `${p.name ?? p.item}${p.slot ? ` [${p.slot}]` : ""}`;

export function compareCarts(actualIn: CanonicalCart, expectedIn: CanonicalCart): CartDiff {
  const actual = normalizeCanonical(actualIn);
  const expected = normalizeCanonical(expectedIn);
  const diff: CartDiff = {
    exact: true,
    missing: [],
    extra: [],
    matched: 0,
    items: { correct: 0, total: expected.lines.length },
    sizes: { correct: 0, total: 0 },
    qty: { correct: 0, total: 0 },
    modifiers: { correct: 0, total: 0 },
    halves: { correct: 0, total: 0 },
    comboSlots: { correct: 0, total: 0 },
    humanSummary: [],
  };
  const summary = diff.humanSummary;

  const pairs = greedyPair(actual.lines, expected.lines, (a, e) => (itemOk(e, a) ? lineScore(a, e) : -1));
  const pairedA = new Set(pairs.map((p) => p.ai));
  const pairedE = new Set(pairs.map((p) => p.ei));

  expected.lines.forEach((e, ei) => {
    if (pairedE.has(ei)) return;
    diff.missing.push(e);
    diff.exact = false;
    // Field totals still count what was expected, so a missing line drags accuracy down.
    diff.qty.total += 1;
    if (e.size) diff.sizes.total += 1;
    diff.modifiers.total += Math.max(1, modifierSet(e).length);
    if (e.halves) diff.halves.total += 1;
    diff.comboSlots.total += e.picks?.length ?? 0;
    summary.push(`${label(e, ei)}: MISSING — expected ${e.qty}× ${e.name ?? e.item}${describeLine(e)}`);
  });
  actual.lines.forEach((a, ai) => {
    if (pairedA.has(ai)) return;
    diff.extra.push(a);
    diff.exact = false;
    summary.push(`extra: ${a.qty}× ${a.name ?? a.item}${describeLine(a)} was on the order but not expected`);
  });

  for (const { ai, ei } of pairs) {
    const a = actual.lines[ai];
    const e = expected.lines[ei];
    diff.matched += 1;
    diff.items.correct += 1;
    let lineExact = true;
    const who = label(e, ei);

    diff.qty.total += 1;
    if (a.qty === e.qty) diff.qty.correct += 1;
    else {
      lineExact = false;
      summary.push(`${who}: qty ${a.qty}, expected ${e.qty}`);
    }

    if (e.size) {
      diff.sizes.total += 1;
      if (a.size === e.size) diff.sizes.correct += 1;
      else {
        lineExact = false;
        summary.push(`${who}: size '${a.size ?? "none"}', expected '${e.size}'`);
      }
    }

    {
      const am = modifierSet(a);
      const em = modifierSet(e);
      const tot = Math.max(1, union(am, em));
      diff.modifiers.total += tot;
      diff.modifiers.correct += am.length === 0 && em.length === 0 ? 1 : inter(am, em);
      if (!setEq(am, em)) {
        lineExact = false;
        for (const m of em.filter((x) => !am.includes(x))) summary.push(`${who}: missing option '${m}'`);
        for (const m of am.filter((x) => !em.includes(x))) summary.push(`${who}: unexpected option '${m}'`);
      }
    }

    if (e.halves || a.halves) {
      diff.halves.total += 1;
      const h = compareHalves(a.halves, e.halves);
      if (h.exact) diff.halves.correct += 1;
      else {
        lineExact = false;
        for (const s of h.sides) {
          for (const t of s.missing) summary.push(`${who}: missing topping '${t}' on ${s.side}`);
          for (const t of s.extra) summary.push(`${who}: unexpected topping '${t}' on ${s.side}`);
        }
      }
    }

    if (e.picks?.length || a.picks?.length) {
      const ap = a.picks ?? [];
      const ep = e.picks ?? [];
      diff.comboSlots.total += ep.length;
      const pp = greedyPair(ap, ep, (x, y) => (itemOk(y, x) ? pickScore(x, y) : -1));
      const usedA = new Set(pp.map((p) => p.ai));
      const usedE = new Set(pp.map((p) => p.ei));
      for (const { ai: pai, ei: pei } of pp) {
        const pa = ap[pai];
        const pe = ep[pei];
        let ok = true;
        const pw = `${who} pick ${pickLabel(pe)}`;
        if (pe.slot && pa.slot !== pe.slot) {
          ok = false;
          summary.push(`${pw}: in slot '${pa.slot || "?"}', expected '${pe.slot}'`);
        }
        if (pe.size && pa.size !== pe.size) {
          ok = false;
          summary.push(`${pw}: size '${pa.size ?? "none"}', expected '${pe.size}'`);
        }
        const am = modifierSet(pa);
        const em = modifierSet(pe);
        if (!setEq(am, em)) {
          ok = false;
          for (const m of em.filter((x) => !am.includes(x))) summary.push(`${pw}: missing option '${m}'`);
          for (const m of am.filter((x) => !em.includes(x))) summary.push(`${pw}: unexpected option '${m}'`);
        }
        const h = compareHalves(pa.halves, pe.halves);
        if (!h.exact) {
          ok = false;
          for (const s of h.sides) {
            for (const t of s.missing) summary.push(`${pw}: missing topping '${t}' on ${s.side}`);
            for (const t of s.extra) summary.push(`${pw}: unexpected topping '${t}' on ${s.side}`);
          }
        }
        if (ok) diff.comboSlots.correct += 1;
        else lineExact = false;
      }
      ep.forEach((pe, pei) => {
        if (usedE.has(pei)) return;
        lineExact = false;
        summary.push(`${who}: missing pick ${pickLabel(pe)}${pe.options.length ? ` (${pe.options.join(", ")})` : ""}`);
      });
      ap.forEach((pa, pai) => {
        if (usedA.has(pai)) return;
        lineExact = false;
        summary.push(`${who}: unexpected pick ${pickLabel(pa)}${pa.options.length ? ` (${pa.options.join(", ")})` : ""}`);
      });
    }

    if (e.note) {
      if (!(a.note ?? "").includes(e.note)) {
        lineExact = false;
        summary.push(`${who}: note '${a.note ?? ""}' does not contain '${e.note}'`);
      }
    }

    if (!lineExact) diff.exact = false;
  }

  if (diff.exact && !summary.length) summary.push("exact match");
  return diff;
}

function describeLine(l: CanonicalLine): string {
  const bits: string[] = [];
  if (l.options.length) bits.push(l.options.join(", "));
  if (l.halves) {
    const h = l.halves;
    if (h.left.length || h.right.length) bits.push(`left: ${h.left.join(", ") || "-"}; right: ${h.right.join(", ") || "-"}`);
    if (h.whole.length) bits.push(`whole: ${h.whole.join(", ")}`);
  }
  if (l.excluded?.length) bits.push(`no ${l.excluded.join(", no ")}`);
  if (l.picks?.length) bits.push(`picks: ${l.picks.map((p) => pickLabel(p)).join(" | ")}`);
  return bits.length ? ` [${bits.join(" · ")}]` : "";
}
