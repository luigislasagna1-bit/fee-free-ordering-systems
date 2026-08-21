"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Pause, Play, Loader2, CheckCircle2, CalendarClock } from "lucide-react";

/**
 * Temporary Closure — phone-ONLY pause control inside the Nabil dashboard
 * (Luigi 2026-08-20). Writes to VoiceAgentConfig.phone*PausedUntil via
 * /api/admin/phone-ordering/pause — NOT to the shared Restaurant.*PausedUntil
 * columns. The website and kitchen app are completely unaffected.
 *
 * Self-fetching like src/components/admin/PauseServicesControl.tsx (the admin
 * Services page twin) — deliberately a separate component: this one adds the
 * longer quick-picks (6h/12h/tomorrow/Monday/custom local time) and the
 * closure message. Saves inline, NOT through the settings form's sticky save
 * bar (pause state is live VoiceAgentConfig state — except the closure message,
 * which PATCHes {pauseGreeting} alone on the main phone-ordering route).
 */
type ServiceKey = "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";
const ALL: ServiceKey[] = ["pickup", "delivery", "dineIn", "catering", "takeOut", "reservations"];

type PauseBody =
  | { durationMinutes: number }
  | { restOfDay: true }
  | { untilStartOfDay: "monday" }
  | { untilLocal: { date: string; time: string } }
  | { resume: true };

export default function TemporaryClosureCard({ initialPauseGreeting }: { initialPauseGreeting: string }) {
  const t = useTranslations("admin.phoneOrderingPage.closure");
  const tSvc = useTranslations("admin.services");
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<ServiceKey, boolean>>({
    pickup: false, delivery: false, dineIn: false, catering: false, takeOut: false, reservations: false,
  });
  const [pausedUntil, setPausedUntil] = useState<Partial<Record<ServiceKey, string | null>>>({});
  const [hoursFormat, setHoursFormat] = useState<"12h" | "24h">("12h");
  const [selected, setSelected] = useState<Set<ServiceKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [greeting, setGreeting] = useState(initialPauseGreeting);
  const [savedGreeting, setSavedGreeting] = useState(initialPauseGreeting);
  const [savingGreeting, setSavingGreeting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/phone-ordering/pause")
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) setEnabled(d.enabled);
        if (d.pausedUntil) setPausedUntil(d.pausedUntil);
        if (d.hoursFormat === "24h" || d.hoursFormat === "12h") setHoursFormat(d.hoursFormat);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const available = ALL.filter((s) => enabled[s]);
  const isPaused = (s: ServiceKey) => {
    const u = pausedUntil[s];
    return !!u && new Date(u).getTime() > Date.now();
  };
  const anyPaused = available.some(isPaused);
  const toggle = (s: ServiceKey) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });

  const untilLabel = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    const hourCycle = hoursFormat === "24h" ? ("h23" as const) : ("h12" as const);
    return sameDay
      ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hourCycle })
      : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle });
  };

  const submit = useCallback(
    async (body: PauseBody) => {
      if (selected.size === 0) { toast.error(tSvc("pause.pickFirst")); return; }
      setBusy(true);
      try {
        const res = await fetch("/api/admin/pause-services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: Array.from(selected), ...body }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${res.status})`);
        }
        toast.success("resume" in body ? t("resumedToast") : t("pausedToast"));
        setSelected(new Set());
        setShowCustom(false);
        load();
        // The header chip + any server-rendered pause state re-read on refresh.
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
    },
    [selected, t, load, router],
  );

  const saveGreeting = async () => {
    setSavingGreeting(true);
    try {
      const res = await fetch("/api/admin/phone-ordering", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pauseGreeting: greeting }),
      });
      if (!res.ok) throw new Error();
      setSavedGreeting(greeting);
      toast.success(t("greetingSaved"));
    } catch {
      toast.error(t("greetingSaveError"));
    } finally {
      setSavingGreeting(false);
    }
  };

  if (loading || available.length === 0) return null;

  const quickBtn = "px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition";

  return (
    <div className={`rounded-2xl border shadow-sm p-5 space-y-4 ${anyPaused ? "border-amber-300 bg-amber-50/40" : "border-gray-100 bg-white"}`}>
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Pause className="w-5 h-5 text-amber-500" /> {t("title")}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{t("description")}</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{tSvc("pause.pickServices")}</div>
          <button
            type="button"
            onClick={() => setSelected(new Set(selected.size === available.length ? [] : available))}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 transition"
          >
            {selected.size === available.length ? t("selectNone") : t("pauseEverything")}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {available.map((s) => {
            const paused = isPaused(s);
            const picked = selected.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`relative px-3 py-2 rounded-xl border text-sm font-semibold transition text-left ${
                  picked
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : paused
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-gray-200 bg-white text-gray-800 hover:border-emerald-300"
                }`}
              >
                {tSvc(s)}
                {paused && (
                  <span className="block text-[10px] mt-0.5 opacity-70">
                    {tSvc("pause.pausedUntil", { time: untilLabel(pausedUntil[s]!) })}
                  </span>
                )}
                {picked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 absolute top-1.5 right-1.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || selected.size === 0} onClick={() => submit({ durationMinutes: 60 })} className={quickBtn}>
          {t("pause1h")}
        </button>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => submit({ durationMinutes: 360 })} className={quickBtn}>
          {t("pause6h")}
        </button>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => submit({ durationMinutes: 720 })} className={quickBtn}>
          {t("pause12h")}
        </button>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => submit({ restOfDay: true })} className={quickBtn}>
          {t("untilTomorrow")}
        </button>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => submit({ untilStartOfDay: "monday" })} className={quickBtn}>
          {t("untilMonday")}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => setShowCustom((v) => !v)}
          className="px-3 py-2 rounded-lg border border-amber-500 text-amber-700 hover:bg-amber-50 disabled:opacity-40 text-sm font-semibold transition inline-flex items-center gap-1.5"
        >
          <CalendarClock className="w-3.5 h-3.5" /> {t("custom")}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => submit({ resume: true })}
          className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition inline-flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" /> {tSvc("pause.resumeNow")}
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <label className="text-xs font-semibold text-gray-700">
            {t("customDate")}
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="block mt-1 px-2 py-1.5 rounded-lg border border-gray-300 text-sm font-normal bg-white"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            {t("customTime")}
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="block mt-1 px-2 py-1.5 rounded-lg border border-gray-300 text-sm font-normal bg-white"
            />
          </label>
          <button
            type="button"
            disabled={busy || !customDate || !customTime || selected.size === 0}
            onClick={() => submit({ untilLocal: { date: customDate, time: customTime } })}
            className={quickBtn}
          >
            {t("customApply")}
          </button>
          <span className="text-[11px] text-gray-500">{t("customHint")}</span>
        </div>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">{t("sharedNote")}</p>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <label className="block text-sm font-medium text-gray-800">
          {t("greetingLabel")}
          <textarea
            value={greeting}
            maxLength={200}
            rows={2}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder={t("greetingPlaceholder")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 leading-relaxed flex-1">{t("greetingHint")}</p>
          <span className="text-[11px] text-gray-400 tabular-nums">{greeting.length}/200</span>
          <button
            type="button"
            disabled={savingGreeting || greeting === savedGreeting}
            onClick={saveGreeting}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold transition"
          >
            {t("greetingSave")}
          </button>
        </div>
      </div>

      {busy && (
        <div className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tSvc("pause.saving")}
        </div>
      )}
    </div>
  );
}
