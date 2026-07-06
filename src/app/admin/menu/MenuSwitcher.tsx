"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Plus, Copy, Pencil, Trash2, CheckCircle2, Loader2, Radio, Clock, CalendarClock, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { HelpTip } from "@/components/HelpTip";

export type MenuLite = {
  id: string;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  scheduledActivateAt: string | null;
  publishedAt: string | null;
  /** Recurring daily window — null/empty = all-hours default menu. */
  availableDays: string | null; // JSON [0..6]
  availableFrom: string | null; // "HH:MM"
  availableTo: string | null;
  categoryCount: number;
};

// 0=Sun..6=Sat short labels in the viewer's locale (no per-day i18n keys
// needed — 2023-01-01 was a Sunday, so +dow lands on the right weekday).
function dowLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, d) => fmt.format(new Date(2023, 0, 1 + d)));
}

// Format a stored 24h "HH:MM" for display in the restaurant's chosen format.
function fmtTime(hhmm: string, fmt: "12h" | "24h"): string {
  if (fmt !== "12h" || !/^\d\d:\d\d$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const ap = h >= 12 ? "PM" : "AM";
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Time picker that honours the restaurant's 12h/24h setting. Always emits a
 *  24h "HH:MM" value (what the API + storage use); only the display differs.
 *  Native <input type="time"> follows the BROWSER locale, which ignored the
 *  restaurant's 12h setting (Luigi 2026-06-12) — this select-based control
 *  guarantees the right format. 5-minute granularity is plenty for menu hours. */
function TimeField({ value, onChange, fmt }: { value: string; onChange: (v: string) => void; fmt: "12h" | "24h" }) {
  const valid = /^\d\d:\d\d$/.test(value);
  const h = valid ? parseInt(value.slice(0, 2), 10) : 0;
  const m = valid ? parseInt(value.slice(3, 5), 10) : 0;
  const mins = Array.from({ length: 12 }, (_, i) => i * 5); // 00,05,…,55
  const emit = (nh: number, nm: number) => onChange(`${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
  const sel = "border border-gray-200 rounded-lg px-1.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";
  if (fmt === "12h") {
    const ap = h >= 12 ? "PM" : "AM";
    const h12 = (h % 12) || 12;
    const toH24 = (nh12: number, nap: string) => (nh12 % 12) + (nap === "PM" ? 12 : 0);
    return (
      <span className="inline-flex items-center gap-1">
        <select className={sel} value={h12} onChange={(e) => emit(toH24(parseInt(e.target.value, 10), ap), m)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((hh) => <option key={hh} value={hh}>{hh}</option>)}
        </select>
        <span className="text-gray-400">:</span>
        <select className={sel} value={m} onChange={(e) => emit(h, parseInt(e.target.value, 10))}>
          {mins.map((mm) => <option key={mm} value={mm}>{String(mm).padStart(2, "0")}</option>)}
        </select>
        <select className={sel} value={ap} onChange={(e) => emit(toH24(h12, e.target.value), m)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select className={sel} value={h} onChange={(e) => emit(parseInt(e.target.value, 10), m)}>
        {Array.from({ length: 24 }, (_, i) => i).map((hh) => <option key={hh} value={hh}>{String(hh).padStart(2, "0")}</option>)}
      </select>
      <span className="text-gray-400">:</span>
      <select className={sel} value={m} onChange={(e) => emit(h, parseInt(e.target.value, 10))}>
        {mins.map((mm) => <option key={mm} value={mm}>{String(mm).padStart(2, "0")}</option>)}
      </select>
    </span>
  );
}

/**
 * Menu-version switcher + manager bar shown above the menu editor. Lets the
 * owner pick which menu to edit (a draft while the live one stays untouched),
 * create / duplicate / rename / delete menus, and set one live. Multi-menu
 * Phase 2. Luigi 2026-06-05.
 */
export function MenuSwitcher({ menus, selectedMenuId, hoursFormat = "24h" }: { menus: MenuLite[]; selectedMenuId: string; hoursFormat?: "12h" | "24h" }) {
  const router = useRouter();
  const t = useTranslations("admin.menus");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedAt, setSchedAt] = useState("");
  // Daily-window editor state.
  const [windowing, setWindowing] = useState(false);
  const [winDays, setWinDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [winFrom, setWinFrom] = useState("");
  const [winTo, setWinTo] = useState("");

  const selected = menus.find((m) => m.id === selectedMenuId) ?? menus[0];
  const visible = menus.filter((m) => !m.isArchived);
  const dayNames = dowLabels(locale);

  // push() alone changes the URL but Next's client router can serve the
  // previous menu's server-rendered categories from cache — so the editor
  // showed the OLD menu until a manual reload (Luigi 2026-06-11). refresh()
  // forces the server component to re-fetch for the newly-selected menu.
  const go = (menuId: string) => {
    router.push(`/admin/menu?menu=${menuId}`);
    router.refresh();
  };

  const run = async (fn: () => Promise<Response>, okMsg: string, after?: (json: any) => void) => {
    setBusy(true);
    try {
      const res = await fn();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Coverage gap — localize from the structured gaps (server `error` is
        // English fallback). Day labels come from the viewer's locale.
        if (json.code === "menu_coverage_gap" && Array.isArray(json.gaps)) {
          const list = json.gaps.map((g: any) => `${dowLabels(locale)[g.dow] ?? g.dayLabel} ${fmtTime(g.from, hoursFormat)}–${fmtTime(g.to, hoursFormat)}`).join(", ");
          throw new Error(t("coverageGap", { list }));
        }
        throw new Error(json.error || "Failed");
      }
      toast.success(okMsg);
      after?.(json);
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || t("failed"));
    }
    setBusy(false);
  };

  const newMenu = () => {
    const name = window.prompt(t("newMenuPrompt"), t("newMenuDefault"));
    if (name === null) return;
    run(() => fetch("/api/menus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
      t("created"), (j) => j.id && go(j.id));
  };
  const duplicate = () => {
    const name = window.prompt(t("duplicatePrompt"), `${selected.name} (copy)`);
    if (name === null) return;
    run(() => fetch(`/api/menus/${selected.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
      t("duplicated"), (j) => j.id && go(j.id));
  };
  const rename = () => {
    const name = window.prompt(t("renamePrompt"), selected.name);
    if (name === null || !name.trim()) return;
    run(() => fetch(`/api/menus/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }), t("renamed"));
  };
  const activate = () => {
    if (!window.confirm(t("activateConfirm", { name: selected.name }))) return;
    run(() => fetch(`/api/menus/${selected.id}/activate`, { method: "POST" }), t("activated"));
  };
  const del = async () => {
    if (!window.confirm(t("deleteConfirm", { name: selected.name }))) return;
    const onDeleted = () => {
      const fallback = menus.find((m) => m.isActive) ?? menus.find((m) => m.id !== selected.id);
      if (fallback) go(fallback.id);
    };
    // The server refuses (409 referenced_by_promos) when a promotion targets a
    // dish/size on this menu — a menu delete cascade-nukes those, silently
    // breaking live promos. Name the promos + offer to force. Red-team 2026-07-06.
    setBusy(true);
    try {
      let res = await fetch(`/api/menus/${selected.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        if (j.error === "referenced_by_promos") {
          const names = Array.isArray(j.promoNames) ? j.promoNames.join(", ") : "";
          if (!window.confirm(t("deletePromoBlocked", { names }))) { setBusy(false); return; }
          res = await fetch(`/api/menus/${selected.id}?force=1`, { method: "DELETE" });
        }
      }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed"); }
      toast.success(t("deleted"));
      onDeleted();
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || t("failed"));
    }
    setBusy(false);
  };
  const saveSchedule = () => {
    if (!schedAt) return;
    run(() => fetch(`/api/menus/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledActivateAt: new Date(schedAt).toISOString() }) }),
      t("scheduleSaved"), () => setScheduling(false));
  };
  const clearSchedule = () =>
    run(() => fetch(`/api/menus/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledActivateAt: null }) }), t("scheduleCleared"));

  // Daily window — open the editor prefilled from the selected menu.
  const openWindowEditor = () => {
    try {
      const days = selected.availableDays ? (JSON.parse(selected.availableDays) as number[]) : [0, 1, 2, 3, 4, 5, 6];
      setWinDays(Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6]);
    } catch { setWinDays([0, 1, 2, 3, 4, 5, 6]); }
    // Sensible defaults so the time selects start populated for a new window.
    setWinFrom(selected.availableFrom ?? "10:00");
    setWinTo(selected.availableTo ?? "22:00");
    setWindowing(true);
  };
  const toggleWinDay = (d: number) =>
    setWinDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const saveWindow = () => {
    if (!winFrom || !winTo || winDays.length === 0) return;
    run(
      () => fetch(`/api/menus/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window: { from: winFrom, to: winTo, days: winDays } }),
      }),
      t("windowSaved"), () => setWindowing(false),
    );
  };
  const clearWindow = () =>
    run(() => fetch(`/api/menus/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ window: null }) }),
      t("windowCleared"), () => setWindowing(false));

  if (!selected) return null;

  const hasWindow = !!(selected.availableFrom && selected.availableTo);
  // "Mon, Tue, Wed 10:00–14:00" or "Every day 10:00–14:00".
  const windowLabel = (() => {
    if (!hasWindow) return null;
    let daysTxt = t("everyDay");
    try {
      const days = selected.availableDays ? (JSON.parse(selected.availableDays) as number[]) : null;
      if (days && days.length && days.length < 7) daysTxt = days.map((d) => dayNames[d]).join(", ");
    } catch { /* every day */ }
    return `${daysTxt} ${fmtTime(selected.availableFrom!, hoursFormat)}–${fmtTime(selected.availableTo!, hoursFormat)}`;
  })();

  const schedLabel = selected.scheduledActivateAt
    ? new Date(selected.scheduledActivateAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="mb-4 p-3 bg-white border border-gray-200 rounded-xl">
    <div className="flex flex-wrap items-center gap-2">
      {/* Menu picker */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300"
        >
          <span className="truncate max-w-[200px]">{selected.name}</span>
          {selected.isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
              <Radio className="w-3 h-3" /> {t("live")}
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-80 overflow-y-auto">
              {visible.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setOpen(false); go(m.id); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${m.id === selected.id ? "bg-emerald-50" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800">{m.name}</span>
                    <span className="block text-[11px] text-gray-400">{t("categories", { n: m.categoryCount })}{m.availableFrom && m.availableTo ? ` · ${fmtTime(m.availableFrom, hoursFormat)}–${fmtTime(m.availableTo, hoursFormat)}` : ""}{m.scheduledActivateAt ? ` · ${t("scheduled")}` : ""}</span>
                  </span>
                  {m.isActive && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 flex-shrink-0"><Radio className="w-3 h-3" /> {t("live")}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}

      {/* Actions */}
      <div className="flex items-center gap-1.5 ml-auto">
        {!selected.isActive && (
          <button onClick={activate} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
            <CheckCircle2 className="w-4 h-4" /> {t("setLive")}
          </button>
        )}
        {/* Schedule = the headline feature of this menu manager (set a draft
            to go live automatically at a future time). It was an unlabeled
            clock icon and owners couldn't find it (Luigi 2026-06-12) — now a
            labelled button, like New menu. Only shown on a draft (you schedule
            a DRAFT to replace the live menu, not the live one itself). */}
        {!selected.isActive && (
          <button onClick={() => setScheduling((s) => !s)} disabled={busy} title={t("schedule")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:text-sky-600 hover:border-gray-300 disabled:opacity-60">
            <Clock className="w-4 h-4" /> <span className="hidden sm:inline">{t("schedule")}</span>
          </button>
        )}
        {/* Daily hours = recurring time-of-day window (Lunch/Dinner auto-switch).
            Available on any menu, distinct from the one-time go-live above. */}
        <button onClick={() => (windowing ? setWindowing(false) : openWindowEditor())} disabled={busy} title={t("dailyHours")} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm disabled:opacity-60 ${hasWindow ? "border-sky-300 text-sky-700 bg-sky-50" : "border-gray-200 text-gray-700 hover:text-sky-600 hover:border-gray-300"}`}>
          <CalendarClock className="w-4 h-4" /> <span className="hidden sm:inline">{t("dailyHours")}</span>
        </button>
        <button onClick={newMenu} disabled={busy} title={t("newMenu")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-gray-300 disabled:opacity-60">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t("newMenu")}</span>
        </button>
        <button onClick={duplicate} disabled={busy} title={t("duplicate")} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-gray-300 disabled:opacity-60">
          <Copy className="w-4 h-4" />
        </button>
        <button onClick={rename} disabled={busy} title={t("rename")} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-gray-300 disabled:opacity-60">
          <Pencil className="w-4 h-4" />
        </button>
        {!selected.isActive && (
          <button onClick={del} disabled={busy} title={t("delete")} className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-60">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>

    {/* Scheduling row — set/clear a future go-live time for this draft. */}
    {(scheduling || schedLabel) && !selected.isActive && (
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
        <Clock className="w-4 h-4 text-sky-500" />
        {schedLabel && !scheduling ? (
          <>
            <span className="text-sm text-gray-700">{t("scheduledForLabel", { time: schedLabel })}</span>
            <button onClick={() => setScheduling(true)} className="text-xs font-semibold text-sky-600 hover:underline ml-1">{t("change")}</button>
            <button onClick={clearSchedule} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-red-500 ml-1 inline-flex items-center gap-1"><X className="w-3 h-3" />{t("clearSchedule")}</button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">{t("scheduleGoLive")}<HelpTip text={t("scheduleHelp")} /></span>
            <input
              type="datetime-local"
              value={schedAt}
              onChange={(e) => setSchedAt(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button onClick={saveSchedule} disabled={busy || !schedAt} className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-50">{t("scheduleSave")}</button>
            <button onClick={() => setScheduling(false)} className="text-xs text-gray-400 hover:text-gray-600">{t("cancel")}</button>
          </>
        )}
      </div>
    )}

    {/* Daily-window row — recurring time-of-day window for this menu. When set,
        this menu is live only on these days/hours; the system blocks a save
        that would leave any open hour with no menu. */}
    {(windowing || hasWindow) && (
      <div className="mt-3 pt-3 border-t border-gray-100">
        {hasWindow && !windowing ? (
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-500" />
            <span className="text-sm text-gray-700">{t("dailyHoursActive", { window: windowLabel ?? "" })}</span>
            <button onClick={openWindowEditor} className="text-xs font-semibold text-sky-600 hover:underline ml-1">{t("change")}</button>
            <button onClick={clearWindow} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-red-500 ml-1 inline-flex items-center gap-1"><X className="w-3 h-3" />{t("windowClear")}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Heading + hover help (Luigi 2026-06-12 standing rule: explain
                non-obvious features via a hover ⓘ, not a cluttering text box).
                The ⓘ explains the default-vs-timed-menu model. */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-700">{t("dailyHours")}</span>
              <HelpTip text={t("dailyHoursExplainer")} />
            </div>
            <span className="text-sm text-gray-600">{t("dailyHoursHint")}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {dayNames.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleWinDay(d)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${winDays.includes(d) ? "bg-sky-500 border-sky-500 text-white" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-500">{t("windowFrom")}</label>
              <TimeField value={winFrom} onChange={setWinFrom} fmt={hoursFormat} />
              <label className="text-xs text-gray-500">{t("windowTo")}</label>
              <TimeField value={winTo} onChange={setWinTo} fmt={hoursFormat} />
              <button onClick={saveWindow} disabled={busy || !winFrom || !winTo || winDays.length === 0} className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-50">{t("windowSave")}</button>
              <button onClick={() => setWindowing(false)} className="text-xs text-gray-400 hover:text-gray-600">{t("cancel")}</button>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
