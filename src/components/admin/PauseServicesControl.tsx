"use client";
import { useEffect, useState, useCallback } from "react";
import { Pause, Play, Loader2, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

/**
 * Owner-facing "Pause services" control on the admin Services page — the
 * backend twin of the kitchen-app pause panel (Fabrizio: pause should be in the
 * backend too, not only the app). Self-contained: fetches its own state from
 * /api/admin/pause-services (GET) and writes via POST. The same `*PausedUntil`
 * columns drive the customer banner + order gate + kitchen app, so a pause here
 * shows up everywhere and auto-resumes when the timer runs out.
 */
type ServiceKey = "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";
const ALL: ServiceKey[] = ["pickup", "delivery", "dineIn", "catering", "takeOut", "reservations"];
const DURATIONS = [
  { key: "duration30", minutes: 30 },
  { key: "duration1h", minutes: 60 },
  { key: "duration2h", minutes: 120 },
] as const;

export function PauseServicesControl() {
  const t = useTranslations("admin.services");
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<ServiceKey, boolean>>({
    pickup: false, delivery: false, dineIn: false, catering: false, takeOut: false, reservations: false,
  });
  const [pausedUntil, setPausedUntil] = useState<Partial<Record<ServiceKey, string | null>>>({});
  const [hoursFormat, setHoursFormat] = useState<"12h" | "24h">("12h");
  const [selected, setSelected] = useState<Set<ServiceKey>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/pause-services")
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
  const toggle = (s: ServiceKey) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });

  const submit = useCallback(
    async (mode: "duration" | "restOfDay" | "resume", durationMinutes?: number) => {
      if (selected.size === 0) { toast.error(t("pause.pickFirst")); return; }
      setBusy(true);
      try {
        const body: Record<string, unknown> = { services: Array.from(selected) };
        if (mode === "resume") body.resume = true;
        else if (mode === "restOfDay") body.restOfDay = true;
        else body.durationMinutes = durationMinutes;
        const res = await fetch("/api/admin/pause-services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed (${res.status})`);
        }
        toast.success(mode === "resume" ? t("pause.resumedToast") : t("pause.pausedToast"));
        setSelected(new Set());
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
    },
    [selected, t, load],
  );

  // Stay quiet while loading or when the shop has no services to pause — the
  // Services page shouldn't show an empty pause card.
  if (loading || available.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Pause className="w-5 h-5 text-amber-500" /> {t("pause.title")}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{t("pause.description")}</p>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
          {t("pause.pickServices")}
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
                {t(s)}
                {paused && (
                  <span className="block text-[10px] mt-0.5 opacity-70">
                    {t("pause.pausedUntil", {
                      time: new Date(pausedUntil[s]!).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hourCycle: hoursFormat === "24h" ? "h23" : "h12",
                      }),
                    })}
                  </span>
                )}
                {picked && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 absolute top-1.5 right-1.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => submit("duration", d.minutes)}
            className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
          >
            {t("pause.pauseFor", { duration: t(`pause.${d.key}` as "pause.duration30") })}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => submit("restOfDay")}
          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
        >
          {t("pause.restOfDay")}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => submit("resume")}
          className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition inline-flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" /> {t("pause.resumeNow")}
        </button>
      </div>

      {busy && (
        <div className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("pause.saving")}
        </div>
      )}
    </div>
  );
}
