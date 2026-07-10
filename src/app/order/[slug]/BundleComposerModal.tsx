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
  /** Size variants — for speciality bundles each size becomes its own pickable
   *  option so the customer chooses Regular vs Large in the slot, and the fee
   *  can attach to just the premium size. Luigi 2026-07-07. */
  variants?: { id: string; name: string; price: number }[];
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
  /** Eligibility: narrow the slot to specific size-variants (empty = all sizes). */
  variantIds?: string[];
  minCount?: number;
  maxCount?: number;
  extraFee?: number; // Type 13 — the premium upcharge for this slot
  /** Type 13: the specific size-variants that carry extraFee (e.g. Large = +$5);
   *  base sizes are free. Empty = the fee applies to every pick (legacy). */
  specialityVariantIds?: string[];
  /** Type 13: whole-item premium picks (non-sized dishes) that carry extraFee. */
  specialityItemIds?: string[];
};

/** One pickable option in a slot. For speciality bundles a sized item expands
 *  to one option per size; otherwise one option per item. `fee` is the upcharge
 *  THIS option adds (0 unless it's a premium size/item). Luigi 2026-07-07. */
type SlotOption = {
  key: string;
  itemId: string;
  variantId?: string;
  variantName?: string;
  name: string;
  price: number;
  imageUrl?: string;
  isSoldOut?: boolean;
  fee: number;
};

/** The upcharge a pick adds in its slot: the slot fee ONLY when the chosen
 *  size/item is in the speciality set; base sizes are free. No set → every pick
 *  carries the fee (legacy). Mirrors the engine's specialityFeeForPick so the
 *  displayed total matches the server charge. */
function feeForOption(group: RuleConfigGroup, variantId: string | undefined, itemId: string): number {
  const fee = Math.max(0, Number(group.extraFee ?? 0));
  if (fee <= 0) return 0;
  const sv = group.specialityVariantIds ?? [];
  const si = group.specialityItemIds ?? [];
  if (sv.length === 0 && si.length === 0) return fee;
  if (variantId && sv.includes(variantId)) return fee;
  if (itemId && si.includes(itemId)) return fee;
  return 0;
}

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
  /** Re-edit seed: the cart line's current children. The composer opens with
   *  these picks already selected (greedy slot-matching with a specialityFee
   *  tie-break for overlapping groups); stale picks (config changed since) are
   *  dropped. Luigi 2026-07-09. */
  initial?: { children: Array<{ menuItemId: string; variantId?: string; specialityFee?: number }> };
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
  initial,
}: Props) {
  /**
   * `picks[slotIndex]` = array of menuItemIds chosen for that slot. A
   * slot's selection is a multi-select bounded by [minCount, maxCount].
   */
  const t = useTranslations("customer.bundle");
  // Shared wizard strings (Step N of M / Next / Back) — same keys as the
  // guided promo modal so the two builders read identically.
  const tWiz = useTranslations("customer.guidedPromo");
  // Reused "Sold out" string (same key the menu card uses) for disabled picks.
  const tOrder = useTranslations("ordering");
  const formatCurrency = useCurrencyFormat();

  /** Pickable options per slot — one per size for speciality bundles (so the
   *  customer chooses Regular vs Large), one per item otherwise. Memoised off
   *  the menu catalog which can be large. Hoisted ABOVE the picks state so the
   *  re-edit seed initializer can resolve option keys. Luigi 2026-07-09. */
  const slotOptions = useMemo<SlotOption[][]>(
    () => groups.map((g) => {
      const items = collectGroupItems(g, allMenuItems);
      const opts: SlotOption[] = [];
      for (const it of items) {
        const variants = it.variants ?? [];
        if (isSpeciality && variants.length > 0) {
          const varFilter = new Set(g.variantIds ?? []);
          for (const v of variants) {
            if (varFilter.size > 0 && !varFilter.has(v.id)) continue; // eligibility narrowing
            opts.push({ key: `${it.id}::${v.id}`, itemId: it.id, variantId: v.id, variantName: v.name, name: it.name, price: v.price, imageUrl: it.imageUrl, isSoldOut: it.isSoldOut, fee: feeForOption(g, v.id, it.id) });
          }
        } else {
          opts.push({ key: it.id, itemId: it.id, name: it.name, price: it.price, imageUrl: it.imageUrl, isSoldOut: it.isSoldOut, fee: isSpeciality ? feeForOption(g, undefined, it.id) : 0 });
        }
      }
      return opts;
    }),
    [groups, allMenuItems, isSpeciality],
  );

  // Re-edit: seed picks from the cart line's children. Greedy over the slot
  // groups with a specialityFee TIE-BREAK — when a pick is eligible in several
  // groups, prefer the one whose fee matches what the line actually charged, so
  // re-pricing can't drift. Stale picks (config changed) are dropped; the
  // customer just re-picks. Luigi 2026-07-09.
  const [picks, setPicks] = useState<string[][]>(() => {
    const result = groups.map(() => [] as string[]);
    if (!initial?.children?.length) return result;
    const maxOf = (i: number) => {
      const min = Math.max(1, Number(groups[i].minCount ?? 1));
      return Math.max(min, Number(groups[i].maxCount ?? groups[i].minCount ?? 1));
    };
    for (const child of initial.children) {
      const matchIn = (i: number) =>
        slotOptions[i]?.find((o) => o.itemId === child.menuItemId && (o.variantId ?? null) === (child.variantId ?? null));
      const cands: number[] = [];
      for (let i = 0; i < groups.length; i++) {
        if (result[i].length >= maxOf(i)) continue;
        if (matchIn(i)) cands.push(i);
      }
      if (cands.length === 0) continue; // stale pick → drop
      const wantFee = Math.round(Math.max(0, Number(child.specialityFee ?? 0)) * 100);
      const chosen = cands.find((i) => Math.round((matchIn(i)!.fee ?? 0) * 100) === wantFee) ?? cands[0];
      result[chosen].push(matchIn(chosen)!.key);
    }
    return result;
  });
  /** The slot currently on screen. */
  const [step, setStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Leave-guard (Luigi 2026-07-03): closing a PARTIALLY built bundle asks
   *  first; untouched or complete closes silently. */
  const [confirmLeave, setConfirmLeave] = useState(false);

  /** Total speciality upcharge so the "Add bundle" button can show the
   *  accurate final price as the customer toggles items. */
  const specialityTotal = useMemo(() => {
    if (!isSpeciality) return 0;
    let sum = 0;
    for (let i = 0; i < groups.length; i++) {
      for (const key of picks[i] ?? []) {
        sum += slotOptions[i]?.find((o) => o.key === key)?.fee ?? 0;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [picks, groups, isSpeciality, slotOptions]);

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
    // Speciality total recomputed off the passed picks so an auto-complete
    // (which fires before the state round-trip) prices the same as handleAdd.
    let spec = 0;
    for (let i = 0; i < groups.length; i++) {
      for (const key of arr[i] ?? []) {
        const opt = slotOptions[i].find((o) => o.key === key);
        if (!opt) continue;
        if (isSpeciality) spec += opt.fee;
        children.push({
          menuItemId: opt.itemId,
          name: opt.name,
          variantId: opt.variantId,
          variantName: opt.variantName,
          specialityFee: isSpeciality && opt.fee > 0 ? opt.fee : undefined,
        });
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

  function togglePick(slotIndex: number, key: string) {
    // Sold-out options are display-disabled; never let a pick (incl. a
    // single-pick auto-advance) complete a bundle through one.
    if (slotOptions[slotIndex].find((o) => o.key === key)?.isSoldOut) return;
    // Computed OUTSIDE setState so the wizard can advance / auto-complete on
    // the same values it stores (mirrors GuidedPromoModal).
    const next = picks.map((arr) => [...arr]);
    const max = slotMaxOf(slotIndex);
    const current = next[slotIndex];
    if (max === 1) {
      // Single-pick slot: tap = select (replace); tapping the SAME option deselects.
      const idx = current.indexOf(key);
      next[slotIndex] = idx >= 0 ? [] : [key];
    } else {
      // Multi-pick slot: every tap ADDS one more (the same option can fill
      // several picks — Luigi 2026-07-03); removal is the row's − control.
      if (current.length >= max) return;
      current.push(key);
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

  /** Remove ONE occurrence of an option from a multi-pick slot. */
  function removeOnePick(slotIndex: number, key: string) {
    setPicks((prev) => {
      const next = prev.map((arr) => [...arr]);
      const idx = next[slotIndex].indexOf(key);
      if (idx >= 0) next[slotIndex].splice(idx, 1);
      return next;
    });
  }

  // (chipLabel removed 2026-07-04 — the progress strip now renders one chip
  // PER UNIT, built inline where the strip renders.)

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
          {/* Progress strip — one chip PER UNIT to pick (Luigi 2026-07-04:
              a "pick 3" slot shows three chips filling one by one). Filled
              chips show their item and jump back on tap. */}
          {(() => {
            type Unit = { g: number; label: string; filled: boolean };
            const units: Unit[] = [];
            let n = 0;
            groups.forEach((_, g) => {
              const count = Math.max(slotMinOf(g), (picks[g] ?? []).length);
              for (let u = 0; u < count; u++) {
                n++;
                const key = (picks[g] ?? [])[u];
                const opt = key ? slotOptions[g].find((o) => o.key === key) : undefined;
                const label = opt
                  ? (opt.variantName ? `${opt.name} · ${opt.variantName}` : opt.name)
                  : (slotMinOf(g) === 1 && groups[g].label?.trim())
                    ? groups[g].label!.trim()
                    : t("slotFallbackLabel", { n });
                units.push({ g, label, filled: !!key });
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
                      {unit.filled ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="flex-shrink-0">{idx + 1}.</span>}
                      <span className="truncate">{unit.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
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
                  {slotOptions[slotIndex].length === 0 ? (
                    <p className="text-xs text-gray-400 italic">{t("noEligibleItems")}</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {slotOptions[slotIndex].map((opt) => {
                        const n = picked.filter((k) => k === opt.key).length;
                        const isPicked = n > 0;
                        const isMulti = max > 1;
                        const isSold = !!opt.isSoldOut;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            disabled={isSold}
                            onClick={() => togglePick(slotIndex, opt.key)}
                            className={`flex items-center gap-3 p-2 rounded-xl border-2 transition text-left ${isSold ? "opacity-60 cursor-not-allowed" : ""}`}
                            style={
                              isPicked
                                ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }
                                : { borderColor: "#f3f4f6" }
                            }
                          >
                            {opt.imageUrl ? (
                              <img
                                src={opt.imageUrl}
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
                                {opt.name}
                                {opt.variantName && (
                                  <span className="text-gray-500 font-normal"> · {opt.variantName}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {isSold ? (
                                  <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {tOrder("soldOut")}
                                  </span>
                                ) : isSpeciality && opt.fee > 0 ? (
                                  <span className="font-semibold" style={{ color: primaryColor }}>
                                    {t("specialityFee", { fee: formatCurrency(opt.fee) })}
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
                                  onClick={(e) => { e.stopPropagation(); removeOnePick(slotIndex, opt.key); }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeOnePick(slotIndex, opt.key); } }}
                                  aria-label={tWiz("removeOneAria", { name: opt.name })}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 transition hover:bg-gray-50"
                                  style={{ borderColor: primaryColor, color: primaryColor }}
                                >
                                  −
                                </span>
                                {/* Explicit + — "tap the card again" is undiscoverable
                                    (Luigi 2026-07-04 iPhone test). */}
                                {(picks[slotIndex] ?? []).length < slotMaxOf(slotIndex) && (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); togglePick(slotIndex, opt.key); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); togglePick(slotIndex, opt.key); } }}
                                    aria-label={tWiz("addOneMoreAria", { name: opt.name })}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 transition hover:bg-gray-50"
                                    style={{ borderColor: primaryColor, color: primaryColor }}
                                  >
                                    +
                                  </span>
                                )}
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
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3 safe-bottom">
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
