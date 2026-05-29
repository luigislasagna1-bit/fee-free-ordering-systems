"use client";

/**
 * FreebiePromptModal — customer-facing picker for Promo Type 7 (Get a FREE item).
 *
 * Two states:
 *   - Locked (cart subtotal < trigger):  show the freebie pool greyed out
 *     with a "Add $X more to your cart to unlock" header.
 *   - Unlocked (cart subtotal >= trigger): show the freebie pool as clickable
 *     cards. Clicking one adds it to the cart at $0 with a "Free with promo:
 *     <name>" note + closes the modal.
 *
 * The engine still auto-applies the discount when the cart genuinely
 * qualifies — this modal is purely a discovery affordance that makes it
 * easy to find + pick the freebie.
 */
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type MenuItemLite = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
};

interface Props {
  promoName: string;
  triggerAmount: number;
  cartSubtotal: number;
  eligibleItems: MenuItemLite[];
  primaryColor: string;
  onAddFreebie: (item: MenuItemLite) => void;
  onClose: () => void;
}

export function FreebiePromptModal({
  promoName,
  triggerAmount,
  cartSubtotal,
  eligibleItems,
  primaryColor,
  onAddFreebie,
  onClose,
}: Props) {
  const unlocked = cartSubtotal >= triggerAmount;
  const missing = Math.max(0, triggerAmount - cartSubtotal);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">
              Free item offer
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{promoName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status banner */}
        <div className="px-5 pt-5">
          {unlocked ? (
            <div
              className="rounded-xl p-4 text-sm font-medium"
              style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
            >
              You&apos;ve unlocked a free item! Pick one below:
            </div>
          ) : (
            <div className="rounded-xl p-4 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200">
              Add <strong>{formatCurrency(missing)}</strong> more to your cart to unlock this
              freebie. Eligible items below.
            </div>
          )}
        </div>

        {/* Freebie pool */}
        <div className="p-5">
          {eligibleItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No eligible items configured.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {eligibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => unlocked && onAddFreebie(item)}
                  className={`flex flex-col text-left rounded-xl border-2 overflow-hidden transition ${
                    unlocked
                      ? "border-gray-100 hover:border-gray-300 cursor-pointer"
                      : "border-gray-100 opacity-40 cursor-not-allowed"
                  }`}
                >
                  {item.imageUrl ? (
                    <div className="aspect-[16/9] overflow-hidden bg-gray-50">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div
                      className="aspect-[16/9]"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }}
                    />
                  )}
                  <div className="p-3">
                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-400 line-through mt-0.5">
                      {formatCurrency(item.price)}
                    </div>
                    {unlocked && (
                      <span
                        className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
                      >
                        FREE
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="font-semibold px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            {unlocked ? "Maybe later" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
