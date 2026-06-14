"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Link2, SlidersHorizontal, Lock, LockOpen } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";

export type Setting = "menu" | "hours" | "zones" | "availability";
const ALL_SETTINGS: Setting[] = ["menu", "hours", "zones", "availability"];

export type InheritState = Record<Setting, boolean>;

/**
 * The pluggable data layer. Both call sites share the exact same toggle UI +
 * logic and differ only here:
 *   • a CHILD managing itself     → /api/restaurants/inheritance + /api/menu/*
 *   • a PARENT managing one child → /api/restaurants/locations/[childId]/inheritance
 */
export type InheritanceApi = {
  /** Current per-setting inherit state, per-setting LOCK state, and whether the
   *  target really is a child. */
  load: () => Promise<{ perSetting: InheritState; locks: InheritState; isChild: boolean } | null>;
  /** Persist hours/zones/availability flags (true = inherit from brand). */
  saveJson: (next: Partial<Record<Exclude<Setting, "menu">, boolean>>) => Promise<void>;
  /** Persist the menu flag. Return false to abort (e.g. the user cancelled the
   *  destructive confirm). `inherit` true = use the brand menu (wipes local). */
  saveMenu: (inherit: boolean) => Promise<boolean>;
  /** BRAND PARENT only: lock/unlock a setting so the child can('t) change it.
   *  Present → the component shows a per-setting lock control. Absent (child
   *  self-service) → locked settings render read-only ("Managed by your brand"). */
  setLock?: (setting: Setting, locked: boolean) => Promise<void>;
};

const EMPTY_LOCKS: InheritState = { menu: false, hours: false, zones: false, availability: false };

/**
 * Per-option location inheritance toggles (Luigi's multi-location spec). Each
 * setting flips independently between "from brand" (live inheritance) and "set
 * here" (local), plus an "everything from brand" master. The brand parent can
 * additionally LOCK a setting so the child can't change it (franchise control).
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
  const [locks, setLocks] = useState<InheritState>(EMPTY_LOCKS);
  const [isChild, setIsChild] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Setting | "all" | null>(null);
  const [lockBusy, setLockBusy] = useState<Setting | null>(null);

  // The PARENT view supplies setLock and may change a locked setting; the CHILD
  // view doesn't — a locked setting is read-only for it.
  const isParent = !!api.setLock;
  const lockedForChild = (s: Setting) => !isParent && locks[s];

  const load = useCallback(async () => {
    try {
      const data = await api.load();
      if (data) {
        setIsChild(data.isChild);
        setState(data.perSetting);
        setLocks(data.locks ?? EMPTY_LOCKS);
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
    if (!state || busy || lockedForChild(setting)) return;
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

  // The master may change only settings this view is allowed to touch — for a
  // child, that excludes anything the brand has locked.
  const toggleable = ALL_SETTINGS.filter((s) => !lockedForChild(s));
  const allOn = !!state && toggleable.length > 0 && toggleable.every((s) => state[s]);

  const toggleAll = async () => {
    if (!state || busy || toggleable.length === 0) return;
    const target = !allOn;
    setBusy("all");
    try {
      if (toggleable.includes("menu") && state.menu !== target) {
        const ok = await api.saveMenu(target);
        if (!ok) { setBusy(null); return; }
      }
      const jsonTargets = toggleable.filter((s): s is Exclude<Setting, "menu"> => s !== "menu");
      await api.saveJson(Object.fromEntries(jsonTargets.map((s) => [s, target])));
      setState((prev) => {
        if (!prev) return prev;
        const n = { ...prev };
        for (const s of toggleable) n[s] = target;
        return n;
      });
      toast.success(t("inheritSaved"));
    } catch {
      toast.error(t("inheritSaveError"));
    } finally {
      setBusy(null);
    }
  };

  const toggleLock = async (setting: Setting) => {
    if (!api.setLock || lockBusy) return;
    const next = !locks[setting];
    setLockBusy(setting);
    try {
      await api.setLock(setting, next);
      setLocks((l) => ({ ...l, [setting]: next }));
      toast.success(t("inheritSaved"));
    } catch {
      toast.error(t("inheritSaveError"));
    } finally {
      setLockBusy(null);
    }
  };

  // ── Visibility ──
  if (loading) {
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
        <Switch on={allOn} busy={busy === "all"} disabled={busy !== null || toggleable.length === 0} onClick={toggleAll} />
      </div>

      {/* Per-setting rows */}
      <div className="divide-y divide-gray-100">
        {ALL_SETTINGS.map((s) => (
          <div key={s} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 text-sm">{t(`setting_${s}`)}</div>
              <div className="text-xs text-gray-400 flex items-center gap-1">
                {lockedForChild(s) ? (
                  <><Lock className="w-3 h-3 text-amber-500 flex-shrink-0" /> {t("lockedByBrand")}</>
                ) : (
                  state[s] ? t("stateInherited") : t("stateCustom")
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isParent && (
                <LockBtn
                  locked={locks[s]}
                  busy={lockBusy === s}
                  disabled={lockBusy !== null}
                  label={t("lockHelp")}
                  onClick={() => toggleLock(s)}
                />
              )}
              <Switch on={state[s]} busy={busy === s} disabled={busy !== null || lockedForChild(s)} onClick={() => toggle(s)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );

  // Parent view gets a one-line "what's the lock?" affordance above the rows.
  const lockLegend = isParent ? (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2">
      <Lock className="w-3.5 h-3.5" />
      <span className="font-medium">{t("lockedByBrand")}</span>
      <HelpTip text={t("lockHelp")} placement="top" />
    </div>
  ) : null;

  if (variant === "inline") {
    return (
      <>
        {lockLegend}
        {body}
      </>
    );
  }

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

/** Brand-parent lock toggle for one setting. Amber when locked. */
function LockBtn({
  locked, busy, disabled, label, onClick,
}: { locked: boolean; busy: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={locked}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition disabled:opacity-50 ${
        locked
          ? "bg-amber-100 border-amber-300 text-amber-700"
          : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
      }`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : locked ? (
        <Lock className="w-3.5 h-3.5" />
      ) : (
        <LockOpen className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
