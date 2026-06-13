"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Link2, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

type Setting = "menu" | "hours" | "zones" | "availability";
const JSON_SETTINGS: Exclude<Setting, "menu">[] = ["hours", "zones", "availability"];
const ALL_SETTINGS: Setting[] = ["menu", "hours", "zones", "availability"];

type State = Record<Setting, boolean>;

/**
 * Child-location inheritance panel (Luigi's multi-location spec). Shown only to a
 * CHILD location. Each setting toggles independently between "from brand" (live
 * inheritance) and "set here" (local), plus an "everything from brand" master.
 *   • menu  → the existing copy-on-customize endpoints (revert/customize), since
 *             toggling it copies/clears menu rows.
 *   • hours/zones/availability → PATCH /api/restaurants/inheritance (simple flag;
 *             the location keeps its own rows, they're just ignored while inheriting).
 */
export function InheritancePanel() {
  const t = useTranslations("admin.locations");
  const [state, setState] = useState<State | null>(null);
  const [isChild, setIsChild] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Setting | "all" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/restaurants/inheritance");
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setIsChild(!!data.isChild);
      setState(data.perSetting as State);
    } catch { /* leave hidden */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setJsonSetting = async (next: Partial<Record<Exclude<Setting, "menu">, boolean>>) => {
    const res = await fetch("/api/restaurants/inheritance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error("patch failed");
  };

  const setMenu = async (inherit: boolean) => {
    // Turning inheritance ON replaces this location's custom menu with the
    // brand's — confirm before the destructive revert.
    if (inherit && !window.confirm(t("menuRevertConfirm"))) return false;
    const url = inherit ? "/api/menu/revert-to-brand-menu" : "/api/menu/customize-location";
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error("menu toggle failed");
    return true;
  };

  const toggle = async (setting: Setting) => {
    if (!state || busy) return;
    const next = !state[setting];
    setBusy(setting);
    try {
      if (setting === "menu") {
        const ok = await setMenu(next);
        if (!ok) { setBusy(null); return; }
      } else {
        await setJsonSetting({ [setting]: next });
      }
      setState((s) => (s ? { ...s, [setting]: next } : s));
      toast.success(t("inheritSaved"));
    } catch {
      toast.error(t("inheritSaveError"));
    } finally {
      setBusy(null);
    }
  };

  const allOn = !!state && ALL_SETTINGS.every((s) => state[s]);

  const toggleAll = async () => {
    if (!state || busy) return;
    const target = !allOn;
    setBusy("all");
    try {
      // Menu first (it may prompt / copy rows); only proceed if it succeeds.
      if (state.menu !== target) {
        const ok = await setMenu(target);
        if (!ok) { setBusy(null); return; }
      }
      await setJsonSetting(Object.fromEntries(JSON_SETTINGS.map((s) => [s, target])));
      setState(Object.fromEntries(ALL_SETTINGS.map((s) => [s, target])) as State);
      toast.success(t("inheritSaved"));
    } catch {
      toast.error(t("inheritSaveError"));
    } finally {
      setBusy(null);
    }
  };

  if (loading || !isChild || !state) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-bold text-gray-900">{t("inheritTitle")}</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t("inheritSubtitle")}</p>

      {/* Master toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-emerald-600" /> {t("inheritEverything")}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{t("inheritEverythingHint")}</p>
        </div>
        <Switch on={allOn} busy={busy === "all"} disabled={busy !== null} onClick={toggleAll} />
      </div>

      {/* Per-setting toggles */}
      <div className="divide-y divide-gray-100">
        {ALL_SETTINGS.map((s) => (
          <div key={s} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 text-sm">{t(`setting_${s}`)}</div>
              <div className="text-xs text-gray-400">
                {state[s] ? t("stateInherited") : t("stateCustom")}
              </div>
            </div>
            <Switch on={state[s]} busy={busy === s} disabled={busy !== null} onClick={() => toggle(s)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Switch({
  on, busy, disabled, onClick,
}: { on: boolean; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-60 ${
        on ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
      </span>
    </button>
  );
}
