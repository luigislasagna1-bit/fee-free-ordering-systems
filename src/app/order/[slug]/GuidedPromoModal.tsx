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
 * Each promo "group" is rendered as ONE slot. The customer picks
 * `minCount..maxCount` items per slot from the group's eligible pool; when a
 * picked item has size variants they choose the size right here (no backing
 * out to the full menu). The "Add to cart" CTA enables only once EVERY slot
 * is satisfied — i.e. the customer is walked through each requirement and the
 * deal is completed in one place.
 *
 * Output: a flat list of picks (`menuItemId` + `variantId` + `isFree`) handed
 * to the parent. Paid picks go in at their normal price; free-group picks are
 * tagged "Free with promo: <name>" so the engine nets exactly one to $0 and
 * the existing cleanup reverts them if the qualifying items are later removed.
 * The discount itself is always engine-driven — this modal only assembles the
 * qualifying cart, never gates the benefit.
 */
import { useMemo, useState } from "react";
import { X, Check } from "lucide-react";
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
  /** Discount on the free slot, as a percentage. 100 (or omitted) → the item
   *  is fully free ("FREE" badge); <100 → a partial-discount badge ("50% off").
   *  Only meaningful for types that HAVE a free group (bogo). */
  discountPct?: number;
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

/** Decide which slots are the "free" ones. Role wins when the owner set it;
 *  otherwise fall back to the per-type convention the engine assumes:
 *   - bogo → slot index 1 is free
 *   - buy_n_get_free / free_dish_meal → the LAST slot is free
 *   - combos → nothing is free (the whole combo is discounted) */
function freeSlotFlags(promotionType: string, groups: RuleConfigGroup[]): boolean[] {
  if (promotionType === "fixed_combo" || promotionType === "percentage_combo") {
    return groups.map(() => false);
  }
  const hasRoleFree = groups.some((g) => g.role === "free");
  if (hasRoleFree) return groups.map((g) => g.role === "free");
  if (promotionType === "bogo") return groups.map((_, i) => i === 1);
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

  const slotMin = (i: number) => Math.max(1, Number(groups[i].minCount ?? 1));
  const slotMax = (i: number) => Math.max(slotMin(i), Number(groups[i].maxCount ?? slotMin(i)));

  const slotSatisfied = (i: number) => (picks[i] ?? []).length >= slotMin(i);
  const allSatisfied = groups.every((_, i) => slotSatisfied(i));
  const remaining = groups.reduce((sum, _, i) => sum + Math.max(0, slotMin(i) - (picks[i] ?? []).length), 0);

  function sameToken(a: Pick, b: Pick) {
    return a.menuItemId === b.menuItemId && (a.variantId ?? null) === (b.variantId ?? null);
  }

  function togglePick(slotIndex: number, token: Pick) {
    setPicks((prev) => {
      const next = groups.map((_, i) => (prev[i] ?? []).map((p) => ({ ...p })));
      const current = next[slotIndex];
      const max = slotMax(slotIndex);
      const idx = current.findIndex((p) => sameToken(p, token));
      if (idx >= 0) {
        current.splice(idx, 1);
      } else if (current.length >= max) {
        // Single-pick slot → replace. Multi-pick at cap → ignore the click.
        if (max === 1) {
          next[slotIndex] = [token];
        }
      } else {
        current.push(token);
      }
      return next;
    });
  }

  function handleAdd() {
    if (!allSatisfied) return;
    const flat: GuidedPromoPick[] = [];
    groups.forEach((_, i) => {
      for (const p of picks[i] ?? []) {
        flat.push({ menuItemId: p.menuItemId, variantId: p.variantId, isFree: isFreeSlot[i] });
      }
    });
    onComplete(flat, promoName);
  }

  const benefitHint =
    promotionType === "bogo" ? t("hintBogo")
    : promotionType === "buy_n_get_free" ? t("hintBuyNGetFree")
    : promotionType === "free_dish_meal" ? t("hintFreeDishMeal")
    : t("hintCombo");

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
              {t("buildYourDeal")}
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{promoName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{benefitHint}</p>
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
            <p className="text-sm text-gray-500 text-center py-8">{t("noGroupsConfigured")}</p>
          ) : (
            groups.map((group, slotIndex) => {
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500 min-w-0">
            {allSatisfied ? (
              <span className="font-medium" style={{ color: primaryColor }}>{t("readyHint")}</span>
            ) : (
              t("remainingHint", { count: remaining })
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!allSatisfied}
            className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {t("addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
