"use client";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Full-screen detail overlay (v1.1 plan §3.1 shared building block) — the
 * driver History detail (Phase 4) and the restaurant Delivery detail
 * (Phase 7) render inside this same chrome so the two shells stay visually
 * identical.
 *
 * It is client STATE inside the active tab, never a route (no new
 * auth-dependent server redirects — plan §8 framework guardrail). z-40 sits
 * above the shell's bottom nav (z-20) and sticky headers (z-10) but below
 * the z-50 confirm/disclosure dialogs. The overlay scrolls itself
 * (overscroll-contain keeps the page behind from chaining), and — like
 * ShellHeader — its sticky header carries the top safe-area inset ITSELF so
 * the back button never lands under the iPhone notch (Luigi 2026-07-16).
 */
export function DetailOverlay({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const tCommon = useTranslations("common");
  return (
    <div className="fixed inset-0 z-40 bg-gray-900 text-white overflow-y-auto overscroll-contain">
      <header
        className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon("back")}
          title={tCommon("back")}
          className="text-gray-400 hover:text-white -ml-1 p-1 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight truncate">{title}</div>
          {subtitle != null && <div className="text-xs text-gray-400 leading-tight truncate">{subtitle}</div>}
        </div>
      </header>
      <main
        className="px-4 py-4 space-y-3 max-w-lg mx-auto"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
