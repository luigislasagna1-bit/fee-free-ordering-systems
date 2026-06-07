"use client";

/**
 * BundleComposerModal — slot-by-slot guided builder for Promo Type 8
 * (Meal bundle) and Type 13 (Meal bundle with speciality).
 *
 * Each "group" in the promo's ruleConfig represents ONE slot. The customer
 * picks `minCount..maxCount` items per slot from the group's eligible item
 * pool. The "Add bundle to cart" button enables when every slot has at
 * least `minCount` selections.
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
import { useMemo, useState } from "react";
import { X, Check } from "lucide-react";
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
  const formatCurrency = useCurrencyFormat();
  const [picks, setPicks] = useState<string[][]>(() => groups.map(() => []));

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
  const allSlotsSatisfied = groups.every((g, i) => {
    const min = Math.max(1, Number(g.minCount ?? 1));
    return picks[i].length >= min;
  });

  function togglePick(slotIndex: number, itemId: string) {
    setPicks((prev) => {
      const next = prev.map((arr) => [...arr]);
      const group = groups[slotIndex];
      const max = Math.max(1, Number(group.maxCount ?? group.minCount ?? 1));
      const current = next[slotIndex];
      const idx = current.indexOf(itemId);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        if (current.length >= max) {
          // For single-pick slots (max=1) — replace; for multi-pick at
          // max — refuse (the click is a no-op).
          if (max === 1) {
            current.length = 0;
            current.push(itemId);
          }
          // else: at cap, don't add.
        } else {
          current.push(itemId);
        }
      }
      return next;
    });
  }

  function handleAdd() {
    if (!allSlotsSatisfied) return;
    const children: BundleCartItem["children"] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const fee = Number(group.extraFee ?? 0);
      for (const itemId of picks[i]) {
        const item = slotItems[i].find((m) => m.id === itemId);
        if (!item) continue;
        children.push({
          menuItemId: item.id,
          name: item.name,
          specialityFee: isSpeciality && fee > 0 ? fee : undefined,
        });
      }
    }
    onAddBundle({
      syntheticMenuItemId: `bundle:${promoId}`,
      promoId,
      promoName,
      bundlePrice,
      lineTotal,
      children,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">
              {isSpeciality ? t("mealBundleWithSpeciality") : t("mealBundle")}
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
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
            aria-label={t("closeAriaLabel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slots */}
        <div className="p-5 space-y-5">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {t("noGroupsConfigured")}
            </p>
          ) : (
            groups.map((group, slotIndex) => {
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
                        const isPicked = picked.includes(item.id);
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
                            {isPicked && (
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-gray-500">{t("totalLabel")} </span>
            <span className="font-bold text-gray-900">{formatCurrency(lineTotal)}</span>
            {isSpeciality && specialityTotal > 0 && (
              <span className="text-xs text-gray-400 ml-2">
                {t("totalBreakdown", { base: formatCurrency(bundlePrice), speciality: formatCurrency(specialityTotal) })}
              </span>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!allSlotsSatisfied}
            className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor }}
          >
            {t("addBundleToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
