"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, X } from "lucide-react";

/**
 * Shown at the top of an UNCLAIMED import-to-try sandbox storefront. The person
 * looking at it is the restaurant owner who just pasted their GloriaFood menu on
 * /import — this is the prompt to convert: claim it free and it becomes their own
 * live 0%-commission ordering page (the menu is already imported). Dismissible.
 */
export function SandboxClaimBanner({ claimToken }: { claimToken: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Sparkles className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm font-medium flex-1 leading-snug">
          This is <strong>your menu</strong>, live — claim it free to keep it as your own 0%-commission ordering page.
        </p>
        <Link
          href={`/signup?claim=${encodeURIComponent(claimToken)}`}
          className="inline-flex items-center gap-1.5 bg-white text-emerald-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-50 transition whitespace-nowrap"
        >
          Claim it free <ArrowRight className="w-4 h-4" />
        </Link>
        <button onClick={() => setHidden(true)} aria-label="Dismiss" className="text-white/80 hover:text-white p-1 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
