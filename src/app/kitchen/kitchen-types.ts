export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  notes: string | null;
  createdAt: string;
  /** Set when the order is "released" to the kitchen — for cash orders
   *  immediately on POST, for online_card orders once Stripe confirms
   *  payment via webhook. Drives the kitchen countdown so the timer
   *  doesn't start ticking while the customer is still in Checkout. */
  notifiedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  refundStatus: string | null;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  tip: number | null;
  couponDiscount: number | null;
  promoDiscount: number | null;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  preparationTime: number | null;
  estimatedReady: string | null;
  /** Stamped at order creation when the customer came from /marketplace.
   *  Kitchen display shows a purple "MARKETPLACE" badge so staff knows
   *  it's a discovery-channel order vs a direct walk-up / widget order. */
  viaMarketplace: boolean;
  items: {
    id: string;
    name: string;
    variantName: string | null;
    price: number;
    quantity: number;
    subtotal: number;
    notes: string | null;
    modifiers: { name: string; priceAdjustment: number }[];
  }[];
};

export interface PrinterSettings {
  printNodeConnected: boolean;
  printNodeAccountName: string | null;
  selectedPrinterId: number | null;
  selectedPrinterName: string | null;
  autoPrint: boolean;
  printKitchen: boolean;
  printCustomer: boolean;
  kitchenCopies: number;
  customerCopies: number;
  paperWidth: string;             // "58mm" | "80mm"
  fontSize: string;
  showLargeOrderNumber: boolean;
  showLogo: boolean;
  printerLanguage: string;        // "escpos" | "starprnt"
  hasApiKey: boolean;
}

// Theme system
const THEMES = {
  light: {
    base: "bg-gray-50 text-gray-900",
    header: "bg-white border-b border-gray-200",
    tabs: "bg-white border-b border-gray-200",
    tabActive: "border-emerald-500 text-emerald-600",
    tabInactive: "border-transparent text-gray-500 hover:text-gray-800",
    row: "bg-white border-b border-gray-100 hover:bg-emerald-50 cursor-pointer",
    rowNew: "bg-emerald-50 border-b border-gray-100",
    rowSelected: "bg-emerald-50 border-l-4 border-emerald-500 cursor-pointer",
    detail: "bg-white border-l border-gray-200",
    modal: "bg-white shadow-2xl",
    text: "text-gray-900",
    textMuted: "text-gray-500",
    muted: "text-gray-500",
    subtle: "text-gray-400",
    border: "border-gray-200",
    btn: "bg-gray-100 hover:bg-gray-200 text-gray-700",
    input: "bg-white border-gray-300 text-gray-900",
    surface: "bg-white",
    badgePending: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    badgeAccepted: "bg-blue-100 text-blue-800 border border-blue-200",
    badgePreparing: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    badgeReady: "bg-green-100 text-green-800 border border-green-200",
    badgeCompleted: "bg-gray-100 text-gray-600 border border-gray-200",
    badgeRejected: "bg-red-100 text-red-800 border border-red-200",
    badgeCancelled: "bg-red-100 text-red-800 border border-red-200",
  },
  dark: {
    base: "bg-gray-900 text-white",
    header: "bg-gray-800 border-b border-gray-700",
    tabs: "bg-gray-800 border-b border-gray-700",
    tabActive: "border-emerald-500 text-emerald-400",
    tabInactive: "border-transparent text-gray-400 hover:text-white",
    row: "bg-gray-800 border-b border-gray-700/50 hover:bg-gray-750 cursor-pointer",
    rowNew: "bg-yellow-500/10 border-b border-gray-700/50",
    rowSelected: "bg-gray-700 border-l-4 border-emerald-500 cursor-pointer",
    detail: "bg-gray-800 border-l border-gray-700",
    modal: "bg-gray-800",
    text: "text-white",
    textMuted: "text-gray-300",
    muted: "text-gray-400",
    subtle: "text-gray-500",
    border: "border-gray-700",
    btn: "bg-gray-700 hover:bg-gray-600 text-gray-200",
    input: "bg-gray-700 border-gray-600 text-white",
    surface: "bg-gray-800",
    badgePending: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    badgeAccepted: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    badgePreparing: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    badgeReady: "bg-green-500/20 text-green-300 border border-green-500/30",
    badgeCompleted: "bg-gray-700 text-gray-400 border border-gray-600",
    badgeRejected: "bg-red-500/20 text-red-300 border border-red-500/30",
    badgeCancelled: "bg-red-500/20 text-red-300 border border-red-500/30",
  },
} as const;

export type ThemeMode = "light" | "dark";
// Loosen to string so both light/dark variants are assignable
export type T = { [K in keyof typeof THEMES.light]: string };
export { THEMES };
