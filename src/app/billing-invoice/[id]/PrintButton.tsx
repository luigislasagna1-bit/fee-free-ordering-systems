"use client";

import { Printer } from "lucide-react";

/** Triggers the browser print dialog (Save as PDF) for the invoice.
 *  Hidden from the printed output via the `no-print` class. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
    >
      <Printer className="w-4 h-4" /> {label}
    </button>
  );
}
