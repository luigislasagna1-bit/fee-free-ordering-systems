"use client";
import type { LucideIcon } from "lucide-react";

/**
 * Bottom tab bar for the Fee Free Delivery app shells (v1.1 plan §3.1) —
 * shared between the DRIVER shell (Phase 3) and the RESTAURANT shell
 * (Phase 6) so the two apps stay visually identical.
 *
 * Tab state is React state in the parent, never routes (no new
 * auth-dependent server redirects → no redirect-cache surface).
 * Fixed, dark, blurred, safe-area aware; emerald marks the active tab.
 */
export type BottomNavTab<Id extends string = string> = {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** Small count bubble on the tab icon (omit / 0 = hidden). */
  badge?: number;
};

export function BottomNav<Id extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: BottomNavTab<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 bg-gray-800/95 backdrop-blur border-t border-gray-700"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-lg mx-auto flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold transition-colors ${
                isActive ? "text-emerald-400" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
