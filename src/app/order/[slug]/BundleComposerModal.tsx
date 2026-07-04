"use client";

/**
 * BundleComposerModal — slot-by-slot guided builder for Promo Type 8
 * (Meal bundle) and Type 13 (Meal bundle with speciality).
 *
 * STEP-BY-STEP wizard (Luigi 2026-07-03 — same GloriaFood-style flow as
 * GuidedPromoModal): ONE slot per step. Picking from a single-pick step
 * auto-advances; the LAST missing pick auto-adds the bundle to the cart.
 * Finished steps become tappable chips (jump back + change, picks kept).
 * Multi-pick slots keep an explicit Next / Add button. A slot's selection
 * is a multi-select bounded by [minCount, maxCount].
 *
 * Type 13 adds per-item speciality upcharges: items inside a group with
 * `extraFee > 0` display a "+$X.XX" badge and add their fee to the bundle
 * line total. The base bundle price is fixed by the owner; the speciality
 * fees stack on top.
 *
 * Output: a single bundle CartItem with `isBundle: true` + `bundleItems[]`
 * carrying the child picks. The cart renders this as ONE consolidated
 * line with indented child rows; the receipt + kitchen ticket do the same.
 */
import { useMemo, useRef, useState } from "react";
import { X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrencyFormat } from "@/lib/currency-context";
import { useTranslations } from "next-intl";

type MenuItemLite = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
};

type RuleConfigGroup = {
  id?: string;
  label?: string;
  categoryIds?: string[];
  itemIds?: string[];
  menuItemIds?: string[];
  minCount?: number;
  maxCount?: number;
  extraFee?: number; // Type 13 — per-item upcharge for items in this slot
};

/** Shape emitted by the composer for the parent OrderingPageClient to
 *  drop into the cart. Mirrors the CartItem.bundleItems schema. */
export type BundleCartItem = {
  /** Synthetic menu item ID. Always prefixed `bundle:` so OrderItem
   *  inserts can detect bundle lines without an extra column. */
  syntheticMenuItemId: string;
  promoId: string;
  promoName: string;
  bundlePrice: number;
  lineTotal: number;
  children: Array<{
    menuItemId: string;
    name: string;
    variantId?: string;
    variantName?: string;
    notes?: string;
    specialityFee?: number;
  }>;
};

interface Props {
  promoId: string;
  promoName: string;
  bundlePrice: number;
  groups: RuleConfigGroup[];
  allMenuItems: MenuItemLite[];
  primaryColor: string;
  isSpeciality: boolean;
  onAddBundle: (bundle: BundleCartItem) => void;
  onClose: () => void;
}

function collectGroupItems(group: RuleConfigGroup, allMenuItems: MenuItemLite[]): MenuItemLite[] {
  const idSet = new Set<string>([...(group.itemIds ?? []), ...(group.menuItemIds ?? [])]);
  const catSet = new Set<string>(group.categoryIds ?? []);
  return allMenuItems.filter((mi) => idSet.has(mi.id) || (mi.categoryId && catSet.has(mi.categoryId)));
}

export function BundleComposerModal({
  promoId,
  promoName,
  bundlePrice,
  groups,
  allMenuItems,
  primaryColor,
  isSpeciality,
  onAddBundle,
  onClose,
}: Props) {
  /**
   * `picks[slotIndex]` = array of menuItemIds chosen for that slot. A
   * slot's selection is a multi-select bounded by [minCount, maxCount].
   */
  const t = useTranslations("customer.bundle");
  // Shared wizard strings (Step N of M / Next / Back) — same keys as the
  // guided promo modal so the two builders read identically.
  const tWiz = useTranslations("customer.guidedPromo");
  const formatCurrency = useCurrencyFormat();
  const [picks, setPicks] = useState<string[][]>(() => groups.map(() => []));
  /** The slot currently on screen. */
  const [step, setStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Leave-guard (Luigi 2026-07-03): closing a PARTIALLY built bundle asks
   *  first; untouched or complete closes silently. */
  const [confirmLeave, setConfirmLeave] = useState(false);

  /** Items pool per slot — memoised because we do this off the menu
   *  catalog which can be large. */
  const slotItems = useMemo(
    () => groups.map((g) => collectGroupItems(g, allMenuItems)),
    [groups, allMenuItems],
  );

  /** Total speciality upcharge so the "Add bundle" button can show the
   *  accurate final price as the customer toggles items. */
  const specialityTotal = useMemo(() => {
    if (!isSpeciality) return 0;
    let sum = 0;
    for (let i = 0; i < groups.length; i++) {
      const fee = Number(groups[i].extraFee ?? 0);
      if (fee > 0) {
        sum += picks[i].length * fee;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [picks, groups, isSpeciality]);

  const lineTotal = Math.round((bundlePrice + specialityTotal) * 100) / 100;

  // ── Validation ────────────────────────────────────────────────────
  // Each slot must satisfy [minCount, maxCount]. minCount defaults to 1
  // (typical bundle: pick one from each group); maxCount defaults to 1
  // if the owner left it unset.
  const slotMinOf = (i: number) => Math.max(1, Number(groups[i].minCount ?? 1));
  const slotMaxOf = (i: number) => Math.max(slotMinOf(i), Number(groups[i].maxCount ?? groups[i].minCount ?? 1));
  const satisfiedIn = (arr: string[][], i: number) => (arr[i] ?? []).length >= slotMinOf(i);
  const slotSatisfied = (i: number) => satisfiedIn(picks, i);
  const allSlotsSatisfied = groups.every((_, i) => slotSatisfied(i));

  function goToStep(i: number) {
    setStep(Math.max(0, Math.min(groups.length - 1, i)));
    scrollRef.current?.scrollTo({ top: 0 });
  }

  /** X / backdrop route through here: a partially built bundle asks first. */
  function requestClose() {
    const hasAnyPick = picks.some((arr) => (arr ?? []).length > 0);
    if (hasAnyPick && !allSlotsSatisfied) setConfirmLeave(true);
    else onClose();
  }

  function buildBundle(arr: string[][]): BundleCartItem {
    const children: BundleCartItem["children"] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const fee = Number(group.extraFee ?? 0);
      for (const itemId of arr[i] ?? []) {
        const item = slotItems[i].find((m) => m.id === itemId);
        if (!item) continue;
        children.push({
          menuItemId: item.id,
          name: item.name,
          specialityFee: isSpeciality && fee > 0 ? fee : undefined,
        });
      }
    }
    // Speciality total recomputed off the passed picks so an auto-complete
    // (which fires before the state round-trip) prices the same as handleAdd.
    let spec = 0;
    if (isSpeciality) {
      for (let i = 0; i < groups.length; i++) {
        const fee = Number(groups[i].extraFee ?? 0);
        if (fee > 0) spec += (arr[i] ?? []).length * fee;
      }
    }
    const total = Math.round((bundlePrice + spec) * 100) / 100;
    return {
      syntheticMenuItemId: `bundle:${promoId}`,
      promoId,
      promoName,
      bundlePrice,
      lineTotal: total,
      children,
    };
  }

  function togglePick(slotIndex: number, itemId: string) {
    // Computed OUTSIDE setState so the wizard can advance / auto-complete on
    // the same values it stores (mirrors GuidedPromoModal).
    const next = picks.map((arr) => [...arr]);
    const max = slotMaxOf(slotIndex);
    const current = next[slotIndex];
    if (max === 1) {
      // Single-pick slot: tap = select (replace); tapping the SAME item deselects.
      const idx = current.indexOf(itemId);
      next[slotIndex] = idx >= 0 ? [] : [itemId];
    } else {
      // Multi-pick slot: every tap ADDS one more (the same item can fill
      // several picks — Luigi 2026-07-03); removal is the row's − control.
      if (current.length >= max) return;
      current.push(itemId);
    }
    setPicks(next);

    // Wizard flow: single-pick slots auto-advance; the last missing pick
    // auto-adds the finished bundle (speciality fees are shown on each item
    // button before picking, so the price is never a surprise).
    if (max !== 1 || !satisfiedIn(next, slotIndex)) return;
    if (groups.every((_, i) => satisfiedIn(next, i))) {
      onAddBundle(buildBundle(next));
      return;
    }
    const nextUnfinished = groups.findIndex((_, i) => !satisfiedIn(next, i));
    if (nextUnfinished >= 0) goToStep(nextUnfinished);
  }

  function handleAdd() {
    if (!allSlotsSatisfied) return;
    onAddBundle(buildBundle(picks));
  }

  /** Remove ONE occurrence of an item from a multi-pick slot. */
  function removeOnePick(slotIndex: number, itemId: string) {
    setPicks((prev) => {
      const next = prev.map((arr) => [...arr]);
      const idx = next[slotIndex].indexOf(itemId);
      if (idx >= 0) next[slotIndex].splice(idx, 1);
      return next;
    });
  }

  /** Progress-strip chip label: picked item(s) once chosen, else slot label. */
  function chipLabel(i: number): string {
    const chosen = picks[i] ?? [];
    if (chosen.length === 0) return groups[i].label?.trim() || t("slotFallbackLabel", { n: i + 1 });
    // List EVERY pick (duplicates as ×N) — same fix as GuidedPromoModal
    // (Luigi 2026-07-04: the chip must show all selected items).
    const counts = new Map<string, { label: string; n: number }>();
    for (const id of chosen) {
      const item = slotItems[i].find((m) => m.id === id);
      const cur = counts.get(id);
      if (cur) cur.n += 1; else counts.set(id, { label: item?.name ?? "…", n: 1 });
    }
    return [...counts.values()].map(({ label, n }) => (n > 1 ? `${label} ×${n}` : label)).join(" + ");
  }

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
        {/* Leave-guard overlay — the bundle is partially built. */}
        {confirmLeave && (
          <div className="absolute inset-0 z-30 bg-white/85 backdrop-blur-[2px] flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5 max-w-sm w-full text-center">
              <div className="text-sm font-bold text-gray-900 mb-1">{tWiz("leaveTitle")}</div>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="text-white font-semibold px-4 py-2 rounded-xl text-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  {tWiz("keepBuilding")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="font-semibold px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {tWiz("leaveAnyway")}
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
                {isSpeciality ? t("mealBundleWithSpeciality") : t("mealBundle")}
                {groups.length > 1 && (
                  <span className="ml-2 normal-case tracking-normal" style={{ color: primaryColor }}>
                    {tWiz("stepOf", { n: step + 1, total: groups.length })}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-gray-900 truncate">{promoName}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("bundlePriceLabel")} <strong>{formatCurrency(bundlePrice)}</strong>
                {isSpeciality && (
                  <span className="text-xs text-gray-400 ml-2">{t("specialityUpchargeNote")}</span>
                )}
              </p>
            </div>
            <button
              onClick={requestClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
              aria-label={t("closeAriaLabel")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Progress strip — finished slots show their picked item and are
              tappable to change; current slot outlined; upcoming muted. */}
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
                    {done ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="flex-shrink-0">{i + 1}.</span>}
                    <span className="truncate">{chipLabel(i)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Current slot only — one step at a time. */}
        <div className="p-5 space-y-5">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {t("noGroupsConfigured")}
            </p>
          ) : (
            groups.map((group, slotIndex) => {
              if (slotIndex !== step) return null;
              const min = Math.max(1, Number(group.minCount ?? 1));
              const max = Math.max(min, Number(group.maxCount ?? min));
              const picked = picks[slotIndex];
              const fee = Number(group.extraFee ?? 0);
              const slotComplete = picked.length >= min;
              return (
                <div key={group.id ?? slotIndex}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                      {slotComplete && <Check className="w-4 h-4" style={{ color: primaryColor }} />}
                      {group.label ?? t("slotFallbackLabel", { n: slotIndex + 1 })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {t("pickCount", { range: min === max ? String(min) : `${min}–${max}`, picked: picked.length, max })}
                    </div>
                  </div>
                  {slotItems[slotIndex].length === 0 ? (
                    <p className="text-xs text-gray-400 italic">{t("noEligibleItems")}</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {slotItems[slotIndex].map((item) => {
                        const n = picked.filter((id) => id === item.id).length;
                        const isPicked = n > 0;
                        const isMulti = max > 1;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => togglePick(slotIndex, item.id)}
                            className="flex items-center gap-3 p-2 rounded-xl border-2 transition text-left"
                            style={
                              isPicked
                                ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }
                                : { borderColor: "#f3f4f6" }
                            }
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-lg flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {item.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {isSpeciality && fee > 0 ? (
                                  <span className="font-semibold" style={{ color: primaryColor }}>
                                    {t("specialityFee", { fee: formatCurrency(fee) })}
                                  </span>
                                ) : (
                                  t("included")
                                )}
                              </div>
                            </div>
                            {/* Multi-pick slots: the same item can fill several
                                picks (×N) with a − to drop one (Luigi 2026-07-03). */}
                            {isMulti && n > 0 && (
                              <>
                                <span className="text-xs font-bold flex-shrink-0" style={{ color: primaryColor }}>×{n}</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); removeOnePick(slotIndex, item.id); }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeOnePick(slotIndex, item.id); } }}
                                  aria-label={tWiz("removeOneAria", { name: item.name })}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 transition hover:bg-gray-50"
                                  style={{ borderColor: primaryColor, color: primaryColor }}
                                >
                                  −
                                </span>
                              </>
                            )}
                            {!isMulti && isPicked && (
                              <Check className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />
                            )}
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

        {/* Footer — wizard controls + running total. */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {step > 0 && (
              <button
                type="button"
                onClick={() => goToStep(step - 1)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" /> {tWiz("backStep")}
              </button>
            )}
            <div className="text-sm min-w-0 truncate">
              <span className="text-gray-500">{t("totalLabel")} </span>
              <span className="font-bold text-gray-900">{formatCurrency(lineTotal)}</span>
              {isSpeciality && specialityTotal > 0 && (
                <span className="text-xs text-gray-400 ml-2">
                  {t("totalBreakdown", { base: formatCurrency(bundlePrice), speciality: formatCurrency(specialityTotal) })}
                </span>
              )}
            </div>
          </div>
          {allSlotsSatisfied ? (
            <button
              onClick={handleAdd}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {t("addBundleToCart")}
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
              {tWiz("nextStep")} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              disabled
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm opacity-40 cursor-not-allowed flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {t("addBundleToCart")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
