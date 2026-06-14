"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { InheritanceToggles, type InheritanceApi } from "./InheritanceToggles";

/**
 * Child-location inheritance panel (Luigi's multi-location spec). Shown only to
 * a CHILD location, where it manages that location's OWN inheritance. The toggle
 * UI + logic live in <InheritanceToggles>; this wrapper just wires the child's
 * self-service endpoints:
 *   • menu  → the dedicated copy-on-customize endpoints (revert/customize), since
 *             toggling it copies/clears menu rows.
 *   • hours/zones/availability → PATCH /api/restaurants/inheritance (a simple
 *             flag; the location keeps its own rows, ignored while inheriting).
 * The brand parent manages the same settings per child from the Locations page
 * via <ParentLocationInheritance>, which talks to a parent-authorized endpoint.
 */
export function InheritancePanel() {
  const t = useTranslations("admin.locations");

  const api = useMemo<InheritanceApi>(
    () => ({
      load: async () => {
        const res = await fetch("/api/restaurants/inheritance");
        if (!res.ok) return null;
        const data = await res.json();
        return { perSetting: data.perSetting, locks: data.locks, isChild: !!data.isChild };
      },
      saveJson: async (next) => {
        const res = await fetch("/api/restaurants/inheritance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error("patch failed");
      },
      saveMenu: async (inherit) => {
        // Turning inheritance ON replaces this location's custom menu with the
        // brand's — confirm before the destructive revert.
        if (inherit && !window.confirm(t("menuRevertConfirm"))) return false;
        const url = inherit ? "/api/menu/revert-to-brand-menu" : "/api/menu/customize-location";
        const res = await fetch(url, { method: "POST" });
        if (!res.ok) throw new Error("menu toggle failed");
        return true;
      },
    }),
    [t],
  );

  return (
    <InheritanceToggles
      api={api}
      variant="card"
      title={t("inheritTitle")}
      subtitle={t("inheritSubtitle")}
    />
  );
}
