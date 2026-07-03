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

  function togglePick(slotIndex: number, token: Pick) {
    // Compute the next picks OUTSIDE setState so the wizard can decide the
    // follow-up (advance / auto-complete) on the same values it stores.
    const next = groups.map((_, i) => (picks[i] ?? []).map((p) => ({ ...p })));
    const current = next[slotIndex];
    const max = slotMax(slotIndex);
    const idx = current.findIndex((p) => sameToken(p, token));
    if (idx >= 0) {
      current.splice(idx, 1);
    } else if (current.length >= max) {
      // Single-pick slot → replace. Multi-pick at cap → ignore the click.
      if (max === 1) {
        next[slotIndex] = [token];
      } else {
        return;
      }
    } else {
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

  function handleAdd() {
    if (!allSatisfied) return;
    completeWith(picks);
  }

  /** Progress-strip chip label: the picked item(s) once chosen, else the
   *  group's label / fallback. */
  function chipLabel(i: number): string {
    const chosen = picks[i] ?? [];
    if (chosen.length === 0) {
      const free = isFreeSlot[i];
      return groups[i].label?.trim() || (free ? t("freeSlotLabel") : t("slotLabelFallback", { n: i + 1 }));
    }
    const first = allMenuItems.find((m) => m.id === chosen[0].menuItemId);
    const variant = first?.variants?.find((v) => v.id === chosen[0].variantId);
    const name = `${first?.name ?? "…"}${variant ? ` (${variant.name})` : ""}`;
    return chosen.length > 1 ? `${name} +${chosen.length - 1}` : name;
  }

  const bogoHint = (() => {
    const pct = typeof discountPct === "number" ? discountPct : 100;
    const pricier = discountStrategy === "most_expensive";
    if (pct >= 100) return pricier ? t("hintBogoPricierFree") : t("hintBogoCheaperFree");
    return pricier ? t("hintBogoPricierPct", { pct }) : t("hintBogoCheaperPct", { pct });
  })();
  const benefitHint =
    promotionType === "bogo" ? bogoHint
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
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
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
          {/* Progress strip — one chip per step. A finished step shows its
              PICKED item and is tappable to go back and change it; the
              current step is outlined; upcoming steps are muted. */}
          {groups.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {groups.map((_, i) => {
                const done = slotSatisfied(i);
                const isCurrent = i === step;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToStep(i)}
                    className="inline-flex items-center gap-1.5 max-w-[220px] text-xs font-semibold px-2.5 py-1 rounded-full border-2 transition"
                    style={
                      done
                        ? { borderColor: primaryColor, backgroundColor: `${primaryColor}12`, color: primaryColor }
                        : isCurrent
                          ? { borderColor: primaryColor, color: "#111827", backgroundColor: "#fff" }
                          : { borderColor: "#e5e7eb", color: "#9ca3af", backgroundColor: "#fff" }
                    }
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {done ? (
                      <Check className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <span className="flex-shrink-0">{i + 1}.</span>
                    )}
                    <span className="truncate">{chipLabel(i)}</span>
                  </button>
                );
              })}
            </div>
          )}
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
              const fallbackLabel = free
                ? t("freeSlotLabel")
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
                        // Item with sizes → render a size chip row; each size is
                        // its own selectable token so "which size?" is answered here.
                        if (variants.length > 0) {
                          return (
                            <div
                              key={item.id}
                              className="flex flex-col gap-2 p-2 rounded-xl border-2"
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
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {variants.map((v) => {
                                  const token: Pick = { menuItemId: item.id, variantId: v.id };
                                  const isPicked = picked.some((p) => sameToken(p, token));
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => togglePick(slotIndex, token)}
                                      className="text-xs font-semibold px-2.5 py-1 rounded-full border-2 transition"
                                      style={
                                        isPicked
                                          ? { borderColor: primaryColor, backgroundColor: primaryColor, color: "#fff" }
                                          : { borderColor: primaryColor, color: primaryColor }
                                      }
                                    >
                                      {v.name}
                                      {!free && ` · ${formatCurrency(v.price)}`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        // Single-price item → one toggle card.
                        const token: Pick = { menuItemId: item.id, variantId: null };
                        const isPicked = picked.some((p) => sameToken(p, token));
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => togglePick(slotIndex, token)}
                            className="flex items-center gap-3 p-2 rounded-xl border-2 transition text-left"
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
                                {free ? t("free") : formatCurrency(item.price)}
                              </div>
                            </div>
                            {isPicked && <Check className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />}
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
