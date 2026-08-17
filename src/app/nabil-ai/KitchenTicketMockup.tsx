import { Phone } from "lucide-react";

/**
 * CSS-only kitchen ticket mockup — replaces the broken `kitchen-phone-order.png`
 * screenshot. Renders a thermal-receipt-style card that looks like what a
 * restaurant owner actually sees when a phone order comes through.
 *
 * Pure Tailwind, no images, server-safe.
 */
export function KitchenTicketMockup({ phoneOrderLabel }: { phoneOrderLabel: string }) {
  return (
    <div className="mx-auto max-w-[300px]">
      <div className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
        {/* Header */}
        <div className="bg-gray-900 text-white px-5 py-4 text-center">
          <div className="inline-flex items-center gap-1.5 bg-amber-500 text-amber-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
            <Phone className="w-3 h-3" />
            {phoneOrderLabel}
          </div>
          <div className="font-bold text-sm">Order #1042</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Aug 17, 2026 &middot; 6:42 PM</div>
        </div>

        {/* Items */}
        <div className="px-5 py-4 space-y-3 text-sm border-b border-dashed border-gray-200">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-bold text-gray-900">1× Large Pizza</div>
              <div className="text-xs text-gray-500 ml-2">L: Pepperoni, Mushrooms</div>
              <div className="text-xs text-gray-500 ml-2">R: Green Peppers, Onions</div>
            </div>
            <div className="font-semibold text-gray-700 flex-shrink-0">$16.99</div>
          </div>
          <div className="flex justify-between items-start gap-2">
            <div className="font-bold text-gray-900">1× Garlic Bread</div>
            <div className="font-semibold text-gray-700 flex-shrink-0">$5.99</div>
          </div>
          <div className="flex justify-between items-start gap-2">
            <div className="font-bold text-gray-900">1× 2L Coke</div>
            <div className="font-semibold text-gray-700 flex-shrink-0">$3.99</div>
          </div>
        </div>

        {/* Totals */}
        <div className="px-5 py-3 space-y-1 text-sm border-b border-dashed border-gray-200">
          <div className="flex justify-between text-emerald-700">
            <span>Combo discount</span>
            <span className="font-semibold">−$2.99</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Delivery fee</span>
            <span>$3.99</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>$28.98</span>
          </div>
        </div>

        {/* Customer info */}
        <div className="px-5 py-3 text-xs text-gray-500 space-y-0.5">
          <div><span className="font-semibold text-gray-700">Sam</span> &middot; Delivery</div>
          <div>123 Main Street, Unit 4</div>
          <div className="text-emerald-600 font-medium mt-1">NOT PAID &middot; Due on pickup</div>
        </div>
      </div>
    </div>
  );
}
