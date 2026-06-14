"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Link2, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

export type Setting = "menu" | "hours" | "zones" | "availability";
const JSON_SETTINGS: Exclude<Setting, "menu">[] = ["hours", "zones", "availability"];
const ALL_SETTINGS: Setting[] = ["menu", "hours", "zones", "availability"];

export type InheritState = Record<Setting, boolean>;

/**
 * The pluggable data layer. Both call sites share the exact same toggle UI +
 * logic and differ only here:
 *   • a CHILD managing itself     → /api/restaurants/inheritance + /api/menu/*
 *   • a PARENT managing one child → /api/restaurants/locations/[childId]/inheritance
 */
export type InheritanceApi = {
  /** Current per-setting state + whether the target really is a child. */
  load: () => Promise<{ perSetting: InheritState; isChild: boolean } | null>;
  /** Persist hours/zones/availability flags (true = inherit from brand). */
  saveJson: (next: Partial<Record<Exclude<Setting, "menu">, boolean>>) => Promise<void>;
  /** Persist the menu flag. Return false to abort (e.g. the user cancelled the
   *  destructive confirm). `inherit` true = use the brand menu (wipes local). */
  saveMenu: (inherit: boolean) => Promise<boolean>;
};

/**
 * Per-option location inheritance toggles (Luigi's multi-location spec). Each
 * setting flips independently between "from brand" (live inheritance) and "set
 * here" (local), plus an "everything from brand" master.
 *   • menu  → copy/revert (handled by the api.saveMenu the caller supplies).
 *   • hours/zones/availability → a simple flag; the location keeps its own rows,
 *     they're just ignored while inheriting.
 */
export function InheritanceToggles({
  api,
  variant,
  title,
  subtitle,
}: {
  api: InheritanceApi;
  /** "card" = standalone card with header (child self-service). "inline" =
   *  bare toggles for embedding inside an expander (parent per-child). */
  variant: "card" | "inline";
  title?: string;
  subtitle?: string;
}) {
  const t = useTranslations("admin.locations");
  const [state, setState] = useState<InheritState | null>(null);
  const [isChild, setIsChild] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Setting | "all" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.load();
      if (data) {
        setIsChild(data.isChild);
        setState(data.perSetting);
      }
    } catch {
      /* leave hidden */
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (setting: Setting) => {
    if (!state || busy) return;
    const next = !state[setting];
    setBusy(setting);
    try {
      if (setting === "menu") {
        const ok = await api.saveMenu(next);
        if (!ok) { setBusy(null); return; }
      } else {
        await api.saveJson({ [setting]: next });
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
      // Menu first (it may prompt / copy / delete rows); only proceed if it succeeds.
      if (state.menu !== target) {
        const ok = await api.saveMenu(target);
        if (!ok) { setBusy(null); return; }
      }
      await api.saveJson(Object.fromEntries(JSON_SETTINGS.map((s) => [s, target])));
      setState(Object.fromEntries(ALL_SETTINGS.map((s) => [s, target])) as InheritState);
      toast.success(t("inheritSaved"));
    } catch {
      toast.error(t("inheritSaveError"));
    } finally {
      setBusy(null);
    }
  };

  // ── Visibility ──
  if (loading) {
    // Card: stay invisible (no layout shift, matches the original panel).
    // Inline: the user just expanded the row, so show a small spinner.
    if (variant === "card") return null;
    return (
      <div className="py-2 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }
  if (!isChild || !state) return null;

  const body = (
    <>
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
    </>
  );

  if (variant === "inline") return body;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
      {body}
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
