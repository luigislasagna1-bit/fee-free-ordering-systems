"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { InheritanceToggles, type InheritanceApi } from "./InheritanceToggles";

/**
 * Brand-parent control of ONE child location's live inheritance, shown inline
 * under that child's row on the Locations page (Luigi's multi-location spec,
 * 2026-06-13). Lets the owner set what each location inherits — menu, hours,
 * delivery zones, item availability — without logging into each one.
 *
 * Collapsed by default; the toggles (and their GET) mount only when expanded,
 * so a brand with N locations doesn't fire N inheritance requests on page load.
 * Writes go to the parent-authorized endpoint, which re-checks that this parent
 * owns childId before touching anything.
 */
export function ParentLocationInheritance({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const t = useTranslations("admin.locations");
  const [open, setOpen] = useState(false);

  const api = useMemo<InheritanceApi>(
    () => ({
      load: async () => {
        const res = await fetch(`/api/restaurants/locations/${childId}/inheritance`);
        if (!res.ok) return null;
        const data = await res.json();
        return { perSetting: data.perSetting, isChild: !!data.isChild };
      },
      saveJson: async (next) => {
        const res = await fetch(`/api/restaurants/locations/${childId}/inheritance`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error("patch failed");
      },
      saveMenu: async (inherit) => {
        // Turning menu inheritance ON wipes THIS child's custom menu — confirm,
        // naming the location so the owner can't act on the wrong one.
        if (inherit && !window.confirm(`${childName}: ${t("menuRevertConfirm")}`)) return false;
        const res = await fetch(`/api/restaurants/locations/${childId}/inheritance`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menu: inherit }),
        });
        if (!res.ok) throw new Error("menu toggle failed");
        return true;
      },
    }),
    [childId, childName, t],
  );

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
        {t("brandControlsLabel")}
      </button>
      {open && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-3">{t("inheritSubtitle")}</p>
          <InheritanceToggles api={api} variant="inline" />
        </div>
      )}
    </div>
  );
}
