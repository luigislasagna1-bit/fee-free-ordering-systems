"use client";

/**
 * GuidedPromoModal — slot-by-slot guided builder for the "pick specific
 * items" promo types that previously only showed an informational modal:
 *   - bogo            (paid group + free group)
 *   - buy_n_get_free  (one or more paid/trigger groups + a free group)
 *   - free_dish_meal  (trigger groups + a free group)
 *   - fixed_combo     (groups whose combined picks earn a fixed discount)
 *   - percentage_combo(groups whose combined picks earn a % discount)
 *
 * STEP-BY-STEP wizard (Luigi 2026-07-03, GloriaFood-style — replaces the old
 * all-groups-at-once scroll that customers found confusing): ONE group per
 * step. Picking from a single-pick step auto-advances to the next unfinished
 * step; when the LAST requirement is met the deal auto-completes into the
 * cart. Every picked step becomes a tappable chip in the progress strip, so
 * the customer can jump back and change any selection. Multi-pick steps
 * (minCount>1 or a range) keep an explicit Next / Add-to-cart button. When a
 * picked item has size variants they choose the size right here (no backing
 * out to the full menu).
 *
 * Output: a flat list of picks (`menuItemId` + `variantId` + `isFree`) handed
 * to the parent. Paid picks go in at their normal price; free-group picks are
 * tagged "Free with promo: <name>" so the engine nets exactly one to $0 and
 * the existing cleanup reverts them if the qualifying items are later removed.
 * The discount itself is always engine-driven — this modal only assembles the
 * qualifying cart, never gates the benefit.
 */
import { useMemo, useRef, useState } from "react";
import { X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrencyFormat } from "@/lib/currency-context";
import { useTranslations } from "next-intl";

type VariantLite = { id: string; name: string; price: number };

type MenuItemLite = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
  variants?: VariantLite[];
  /** Sold-out in the main menu — rendered DISABLED + "Sold out" here
   *  (display-only; the orders route still rejects a sold-out pick). */
  isSoldOut?: boolean;
};

type RuleConfigGroup = {
  id?: string;
  label?: string;
  categoryIds?: string[];
  itemIds?: string[];
  menuItemIds?: string[];
  variantIds?: string[];
  role?: "paid" | "free" | "trigger" | "required";
  minCount?: number;
  maxCount?: number;
};

/** A single (item, size) selection. `variantId` is null for items without
 *  sizes. The pair is the unit the slot counts toward min/max. */
type Pick = { menuItemId: string; variantId: string | null };

export type GuidedPromoPick = Pick & { isFree: boolean };

interface Props {
  promoId: string;
  promoName: string;
  promotionType: string;
  groups: RuleConfigGroup[];
  allMenuItems: MenuItemLite[];
  primaryColor: string;
  /** Discount percentage applied to the winning item. 100 (or omitted) →
   *  fully free; <100 → a partial discount (e.g. "50% off"). For bogo it
   *  describes the cheaper/pricier item; for buy_n_get_free it badges the
   *  free-group items. */
  discountPct?: number;
  /** BOGO discount strategy: "cheapest" (the cheaper pick is discounted) or
   *  "most_expensive" (the pricier one). Drives the explanatory hint so the
   *  customer knows which of their two picks wins. */
  discountStrategy?: string;
  onComplete: (picks: GuidedPromoPick[], promoName: string) => void;
  onClose: () => void;
}

/** Eligible items for a group, variant-aware. Whole-item / whole-category
 *  selections keep every size; a group that targets specific variant IDs
 *  narrows that item to only the targeted sizes (so a "BOGO large pizza"
 *  promo doesn't offer the small). Mirrors PromoDetailModal.collectFreebieOptions. */
function collectGroupItems(group: RuleConfigGroup, allMenuItems: MenuItemLite[]): MenuItemLite[] {
  const idSet = new Set<string>([...(group.itemIds ?? []), ...(group.menuItemIds ?? [])]);
  const catSet = new Set<string>(group.categoryIds ?? []);
  const variantIdSet = new Set<string>(group.variantIds ?? []);
  const out: MenuItemLite[] = [];
  for (const mi of allMenuItems) {
    const wholeItem = idSet.has(mi.id) || (!!mi.categoryId && catSet.has(mi.categoryId));
    if (wholeItem) {
      out.push(mi);
      continue;
    }
    const targeted = (mi.variants ?? []).filter((v) => variantIdSet.has(v.id));
    if (targeted.length) out.push({ ...mi, variants: targeted });
  }
  return out;
}

/** Decide which slots are the "free" ones — i.e. which slot's pick is tagged
 *  as the giveaway in the cart and badged FREE in the UI.
 *   - buy_n_get_free / free_dish_meal → the designated free group (role, else
 *     the LAST slot): the reward genuinely comes from one group.
 *   - bogo → NONE. BOGO discounts the cheaper (or pricier) of the qualifying
 *     items by PRICE, not by group, so badging one group "free" is misleading
 *     (and contradicts which item the engine actually discounts). We instead
 *     show a strategy hint ("the cheaper item is free") and let the engine
 *     pick. Luigi 2026-06-07.
 *   - combos → nothing is free (the whole combo is discounted). */
function freeSlotFlags(promotionType: string, groups: RuleConfigGroup[]): boolean[] {
  if (
    promotionType === "fixed_combo" ||
    promotionType === "percentage_combo" ||
    promotionType === "bogo"
  ) {
    return groups.map(() => false);
  }
  const hasRoleFree = groups.some((g) => g.role === "free");
  if (hasRoleFree) return groups.map((g) => g.role === "free");
  // buy_n_get_free, free_dish_meal
  return groups.map((_, i) => i === groups.length - 1);
}

export function GuidedPromoModal({
  promoId,
  promoName,
  promotionType,
  groups,
  allMenuItems,
  primaryColor,
  discountPct,
  discountStrategy,
  onComplete,
  onClose,
}: Props) {
  const t = useTranslations("customer.guidedPromo");
  // Reused "Sold out" string (same key the menu card uses) for disabled picks.
  const tOrder = useTranslations("ordering");
  const formatCurrency = useCurrencyFormat();
  const freeBadge =
    typeof discountPct === "number" && discountPct < 100
      ? t("percentOffBadge", { pct: discountPct })
      : t("freeBadge");

  const slotItems = useMemo(
    () => groups.map((g) => collectGroupItems(g, allMenuItems)),
    [groups, allMenuItems],
  );
  const isFreeSlot = useMemo(() => freeSlotFlags(promotionType, groups), [promotionType, groups]);

  /** picks[slotIndex] = the (item,size) tokens chosen for that slot. */
  const [picks, setPicks] = useState<Pick[][]>(() => groups.map(() => []));
  /** The step (group index) currently on screen. */
  const [step, setStep] = useState(0);
  /** Scrolls back to the top of the modal when the step changes. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Leave-guard (Luigi 2026-07-03): closing mid-build — some picks made but
   *  the deal not finished — asks before discarding. Untouched or complete
   *  closes silently. */
  const [confirmLeave, setConfirmLeave] = useState(false);

  const slotMin = (i: number) => Math.max(1, Number(groups[i].minCount ?? 1));
  const slotMax = (i: number) => Math.max(slotMin(i), Number(groups[i].maxCount ?? slotMin(i)));

  const satisfiedIn = (arr: Pick[][], i: number) => (arr[i] ?? []).length >= slotMin(i);
  const slotSatisfied = (i: number) => satisfiedIn(picks, i);
  const allSatisfied = groups.every((_, i) => slotSatisfied(i));
  const remaining = groups.reduce((sum, _, i) => sum + Math.max(0, slotMin(i) - (picks[i] ?? []).length), 0);

  function sameToken(a: Pick, b: Pick) {
    return a.menuItemId === b.menuItemId && (a.variantId ?? null) === (b.variantId ?? null);
  }

  function goToStep(i: number) {
    setStep(Math.max(0, Math.min(groups.length - 1, i)));
    scrollRef.current?.scrollTo({ top: 0 });
  }

  /** X / backdrop route through here: a PARTIALLY built deal asks first. */
  function requestClose() {
    const hasAnyPick = picks.some((arr) => (arr ?? []).length > 0);
    if (hasAnyPick && !allSatisfied) setConfirmLeave(true);
    else onClose();
  }

  function completeWith(arr: Pick[][]) {
    const flat: GuidedPromoPick[] = [];
    groups.forEach((_, i) => {
      for (const p of arr[i] ?? []) {
        flat.push({ menuItemId: p.menuItemId, variantId: p.variantId, isFree: isFreeSlot[i] });
      }
    });
    onComplete(flat, promoName);
  }

  /** Occurrences of a token in a slot — multi-pick slots allow the SAME
   *  item/size several times (Luigi 2026-07-03: "buy 3 pastas" may well be
   *  the same pasta ×3). */
  function countOf(slotIndex: number, token: Pick) {
    return (picks[slotIndex] ?? []).filter((p) => sameToken(p, token)).length;
  }

  function togglePick(slotIndex: number, token: Pick) {
    // Sold-out items are display-disabled; never let a pick (incl. a
    // single-pick auto-complete) assemble the deal through one.
    if (allMenuItems.find((m) => m.id === token.menuItemId)?.isSoldOut) return;
    // Compute the next picks OUTSIDE setState so the wizard can decide the
    // follow-up (advance / auto-complete) on the same values it stores.
    const next = groups.map((_, i) => (picks[i] ?? []).map((p) => ({ ...p })));
    const current = next[slotIndex];
    const max = slotMax(slotIndex);
    if (max === 1) {
      // Single-pick slot: tap = select (replace); tapping the SAME token
      // deselects.
      const idx = current.findIndex((p) => sameToken(p, token));
      next[slotIndex] = idx >= 0 ? [] : [token];
    } else {
      // Multi-pick slot: every tap ADDS one more of that token (duplicates
      // welcome) until the cap; removal is the row's − control.
      if (current.length >= max) return;
      current.push(token);
    }
    setPicks(next);

    // Wizard flow (Luigi 2026-07-03): a SINGLE-pick step advances the moment
    // its item is chosen — to the next unfinished step, or, when this pick was
    // the last missing piece, straight into the cart (GloriaFood behaviour).
    // Multi-pick steps never auto-advance; the customer taps Next when ready.
    if (max !== 1 || !satisfiedIn(next, slotIndex)) return;
    if (groups.every((_, i) => satisfiedIn(next, i))) {
      completeWith(next);
      return;
    }
    const nextUnfinished = groups.findIndex((_, i) => !satisfiedIn(next, i));
    if (nextUnfinished >= 0) goToStep(nextUnfinished);
  }

  /** Remove ONE occurrence of a token from a multi-pick slot. */
  function removeOnePick(slotIndex: number, token: Pick) {
    setPicks((prev) => {
      const next = groups.map((_, i) => (prev[i] ?? []).map((p) => ({ ...p })));
      const idx = next[slotIndex].findIndex((p) => sameToken(p, token));
      if (idx >= 0) next[slotIndex].splice(idx, 1);
      return next;
    });
  }

  function handleAdd() {
    if (!allSatisfied) return;
    completeWith(picks);
  }

  // (chipLabel removed 2026-07-04 — the progress strip now renders one chip
  // PER UNIT, built inline where the strip renders.)

  const bogoHint = (() => {
    const pct = typeof discountPct === "number" ? discountPct : 100;
    const pricier = discountStrategy === "most_expensive";
    if (pct >= 100) return pricier ? t("hintBogoPricierFree") : t("hintBogoCheaperFree");
    return pricier ? t("hintBogoPricierPct", { pct }) : t("hintBogoCheaperPct", { pct });
  })();
  // Count-aware headline (Luigi 2026-07-03): "Pick one from each group" reads
  // wrong for a min-3 group ("Buy 3 pastas, get 1 pizza free"). When any
  // non-free group needs more than one pick, say so with the real number.
  const multiPickMin = groups.reduce(
    (best, g, i) => (!isFreeSlot[i] && slotMin(i) > best ? slotMin(i) : best),
    1,
  );
  const benefitHint =
    multiPickMin > 1 && (promotionType === "buy_n_get_free" || promotionType === "free_dish_meal")
      ? t("hintPickCounts", { count: multiPickMin })
      : promotionType === "bogo" ? bogoHint
      : promotionType === "buy_n_get_free" ? t("hintBuyNGetFree")
      : promotionType === "free_dish_meal" ? t("hintFreeDishMeal")
      : t("hintCombo");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={requestClose}
    >
      <div
        ref={scrollRef}
        className="bg-white rounded-2xl w-full max-w-3xl modal-vh overflow-y-auto shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Leave-guard overlay — the deal is partially built; confirm before
            discarding the picks. */}
        {confirmLeave && (
          <div className="absolute inset-0 z-30 bg-white/85 backdrop-blur-[2px] flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5 max-w-sm w-full text-center">
              <div className="text-sm font-bold text-gray-900 mb-1">{t("leaveTitle")}</div>
              <p className="text-xs text-gray-500 mb-4">{t("remainingHint", { count: remaining })}</p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="text-white font-semibold px-4 py-2 rounded-xl text-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  {t("keepBuilding")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="font-semibold px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {t("leaveAnyway")}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">
                {t("buildYourDeal")}
                {groups.length > 1 && (
                  <span className="ml-2 normal-case tracking-normal" style={{ color: primaryColor }}>
                    {t("stepOf", { n: step + 1, total: groups.length })}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-gray-900 truncate">{promoName}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{benefitHint}</p>
            </div>
            <button
              onClick={requestClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
              aria-label={t("closeAriaLabel")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Progress strip — one chip PER UNIT to pick (Luigi 2026-07-04:
              a "pick 3" group shows THREE slots that fill one by one, so
              every chosen item is visible; then the free-item slot). A
              filled chip shows its item and is tappable to go back; the
              current group's chips are outlined; upcoming ones muted. */}
          {(() => {
            type Unit = { g: number; label: string; filled: boolean };
            const units: Unit[] = [];
            let n = 0;
            groups.forEach((_, g) => {
              const count = Math.max(slotMin(g), (picks[g] ?? []).length);
              for (let u = 0; u < count; u++) {
                n++;
                const p = (picks[g] ?? [])[u];
                let label: string;
                if (p) {
                  const item = allMenuItems.find((m) => m.id === p.menuItemId);
                  const variant = item?.variants?.find((v) => v.id === p.variantId);
                  label = `${item?.name ?? "…"}${variant ? ` (${variant.name})` : ""}`;
                } else if (isFreeSlot[g]) {
                  label = groups[g].label?.trim() || t("freeSlotLabel");
                } else if (slotMin(g) === 1 && groups[g].label?.trim()) {
                  label = groups[g].label!.trim();
                } else {
                  label = t("slotLabelFallback", { n });
                }
                units.push({ g, label, filled: !!p });
              }
            });
            if (units.length < 2) return null;
            return (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {units.map((unit, idx) => {
                  const isCurrent = unit.g === step;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => goToStep(unit.g)}
                      className="inline-flex items-center gap-1.5 max-w-[220px] text-xs font-semibold px-2.5 py-1 rounded-full border-2 transition"
                      style={
                        unit.filled
                          ? { borderColor: primaryColor, backgroundColor: `${primaryColor}12`, color: primaryColor }
                          : isCurrent
                            ? { borderColor: primaryColor, color: "#111827", backgroundColor: "#fff" }
                            : { borderColor: "#e5e7eb", color: "#9ca3af", backgroundColor: "#fff" }
                      }
                      aria-current={isCurrent && !unit.filled ? "step" : undefined}
                    >
                      {unit.filled ? (
                        <Check className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <span className="flex-shrink-0">{idx + 1}.</span>
                      )}
                      <span className="truncate">{unit.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Current step only — the wizard walks one group at a time. */}
        <div className="p-5 space-y-5">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">{t("noGroupsConfigured")}</p>
          ) : (
            groups.map((group, slotIndex) => {
              if (slotIndex !== step) return null;
              const min = slotMin(slotIndex);
              const max = slotMax(slotIndex);
              const picked = picks[slotIndex] ?? [];
              const complete = slotSatisfied(slotIndex);
              const free = isFreeSlot[slotIndex];
              const isMulti = max > 1;
              // Count-aware fallback (Luigi 2026-07-03): a min-3 group must say
              // "Pick 3 items", not "Choose item 1".
              const fallbackLabel = free
                ? t("freeSlotLabel")
                : min > 1
                  ? t("slotLabelPickN", { count: min })
                  : t("slotLabelFallback", { n: slotIndex + 1 });
              return (
                <div key={group.id ?? slotIndex}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="font-semibold text-gray-900 text-sm flex items-center gap-2 min-w-0">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold flex-shrink-0"
                        style={
                          complete
                            ? { backgroundColor: primaryColor, color: "#fff" }
                            : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                        }
                      >
                        {complete ? <Check className="w-3 h-3" /> : slotIndex + 1}
                      </span>
                      <span className="truncate">{group.label?.trim() || fallbackLabel}</span>
                      {free && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
                        >
                          {freeBadge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0">
                      {t("selectedCount", {
                        range: min === max ? String(min) : `${min}–${max}`,
                        picked: picked.length,
                      })}
                    </div>
                  </div>

                  {slotItems[slotIndex].length === 0 ? (
                    <p className="text-xs text-gray-400 italic">{t("noEligibleItems")}</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {slotItems[slotIndex].map((item) => {
                        const variants = item.variants ?? [];
                        const isSold = !!item.isSoldOut;
                        // Item with sizes → render a size chip row; each size is
                        // its own selectable token so "which size?" is answered here.
                        if (variants.length > 0) {
                          return (
                            <div
                              key={item.id}
                              className={`flex flex-col gap-2 p-2 rounded-xl border-2 ${isSold ? "opacity-60" : ""}`}
                              style={{ borderColor: "#f3f4f6" }}
                            >
                              <div className="flex items-center gap-3">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                ) : (
                                  <div
                                    className="w-10 h-10 rounded-lg flex-shrink-0"
                                    style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }}
                                  />
                                )}
                                <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
                                {isSold && (
                                  <span className="ml-auto inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                                    {tOrder("soldOut")}
                                  </span>
                                )}
                              </div>
                              {!isSold && (
                              <div className="flex flex-wrap gap-1.5">
                                {variants.map((v) => {
                                  const token: Pick = { menuItemId: item.id, variantId: v.id };
                                  const n = countOf(slotIndex, token);
                                  const isPicked = n > 0;
                                  return (
                                    <span key={v.id} className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => togglePick(slotIndex, token)}
                                        aria-label={t("addOneMoreAria", { name: `${item.name} ${v.name}` })}
                                        className="text-xs font-semibold px-2.5 py-1 rounded-full border-2 transition"
                                        style={
                                          isPicked
                                            ? { borderColor: primaryColor, backgroundColor: primaryColor, color: "#fff" }
                                            : { borderColor: primaryColor, color: primaryColor }
                                        }
                                      >
                                        {v.name}
                                        {!free && ` · ${formatCurrency(v.price)}`}
                                        {isMulti && n > 0 && ` ×${n}`}
                                      </button>
                                      {/* Multi-pick slots: same size can be picked several
                                          times; − drops one, + adds one — the explicit +
                                          because "tap it again" is undiscoverable (Luigi
                                          2026-07-04 iPhone test). */}
                                      {isMulti && n > 0 && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => removeOnePick(slotIndex, token)}
                                            aria-label={t("removeOneAria", { name: `${item.name} ${v.name}` })}
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition hover:bg-gray-50"
                                            style={{ borderColor: primaryColor, color: primaryColor }}
                                          >
                                            −
                                          </button>
                                          {(picks[slotIndex] ?? []).length < slotMax(slotIndex) && (
                                            <button
                                              type="button"
                                              onClick={() => togglePick(slotIndex, token)}
                                              aria-label={t("addOneMoreAria", { name: `${item.name} ${v.name}` })}
                                              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition hover:bg-gray-50"
                                              style={{ borderColor: primaryColor, color: primaryColor }}
                                            >
                                              +
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                              )}
                            </div>
                          );
                        }
                        // Single-price item → one toggle card. Multi-pick slots
                        // count duplicates (×N badge + a − to drop one).
                        const token: Pick = { menuItemId: item.id, variantId: null };
                        const n = countOf(slotIndex, token);
                        const isPicked = n > 0;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={isSold}
                            onClick={() => togglePick(slotIndex, token)}
                            aria-label={t("addOneMoreAria", { name: item.name })}
                            className={`flex items-center gap-3 p-2 rounded-xl border-2 transition text-left ${isSold ? "opacity-60 cursor-not-allowed" : ""}`}
                            style={
                              isPicked
                                ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }
                                : { borderColor: "#f3f4f6" }
                            }
                          >
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-lg flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
                              <div className="text-xs text-gray-500">
                                {isSold ? (
                                  <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {tOrder("soldOut")}
                                  </span>
                                ) : free ? t("free") : formatCurrency(item.price)}
                              </div>
                            </div>
                            {isMulti && n > 0 && (
                              <>
                                <span className="text-xs font-bold flex-shrink-0" style={{ color: primaryColor }}>×{n}</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); removeOnePick(slotIndex, token); }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeOnePick(slotIndex, token); } }}
                                  aria-label={t("removeOneAria", { name: item.name })}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 transition hover:bg-gray-50"
                                  style={{ borderColor: primaryColor, color: primaryColor }}
                                >
                                  −
                                </span>
                                {/* Explicit + — "tap the card again" is undiscoverable
                                    (Luigi 2026-07-04 iPhone test). */}
                                {(picks[slotIndex] ?? []).length < slotMax(slotIndex) && (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); togglePick(slotIndex, token); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); togglePick(slotIndex, token); } }}
                                    aria-label={t("addOneMoreAria", { name: item.name })}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 transition hover:bg-gray-50"
                                    style={{ borderColor: primaryColor, color: primaryColor }}
                                  >
                                    +
                                  </span>
                                )}
                              </>
                            )}
                            {!isMulti && isPicked && <Check className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer — wizard controls. Single-pick steps auto-advance (and the
            last missing pick auto-completes), so Next / Add-to-cart mostly
            matter for multi-pick steps and for revisits via the chips. */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {step > 0 && (
              <button
                type="button"
                onClick={() => goToStep(step - 1)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" /> {t("backStep")}
              </button>
            )}
            <div className="text-sm text-gray-500 min-w-0 truncate">
              {allSatisfied ? (
                <span className="font-medium" style={{ color: primaryColor }}>{t("readyHint")}</span>
              ) : slotSatisfied(step) ? (
                // Current step is full but a later step (e.g. the free item)
                // remains — "Pick 1 more item" here read as a contradiction
                // next to the group's "3 / 3" (Luigi 2026-07-04).
                <span className="font-medium" style={{ color: primaryColor }}>{t("stepDoneHint")}</span>
              ) : (
                t("remainingHint", { count: remaining })
              )}
            </div>
          </div>
          {allSatisfied ? (
            <button
              onClick={handleAdd}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {t("addToCart")}
            </button>
          ) : slotSatisfied(step) && step < groups.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                const nextUnfinished = groups.findIndex((_, i) => i > step && !slotSatisfied(i));
                goToStep(nextUnfinished >= 0 ? nextUnfinished : step + 1);
              }}
              className="inline-flex items-center gap-1 text-white font-semibold px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {t("nextStep")} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              disabled
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm opacity-40 cursor-not-allowed flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {t("addToCart")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
