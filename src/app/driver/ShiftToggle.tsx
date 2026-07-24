"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Loader2, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Driver shift clock control (B0), mounted once in the shared ShellHeader so it's
 * visible and tappable on every tab, independent of the assignment-gated GPS.
 *
 * SERVER-AUTHORITATIVE: the open shift + its clockInAt come from GET /api/driver/shift
 * (re-read on mount and whenever the app returns to the foreground), and elapsed
 * time is DERIVED from that server clockInAt — never an independent local counter —
 * so it survives backgrounding, remount and a device switch. Clock-out is a
 * two-tap inline confirm (no modal): first tap arms, second within 3.5s commits.
 */
type OpenShift = { id: string; clockInAt: string } | null;

function elapsedLabel(clockInAtIso: string, nowMs: number, tShared: (k: string, v?: any) => string): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(clockInAtIso).getTime()) / 60000));
  return mins < 60 ? tShared("minutesOnly", { m: mins }) : tShared("hoursMinutes", { h: Math.floor(mins / 60), m: mins % 60 });
}

export function ShiftToggle() {
  const t = useTranslations("driver");
  const tShared = useTranslations("feefreeShared");
  const [open, setOpen] = useState<OpenShift>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const on401 = () => window.location.assign("/driver/login");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/shift", { cache: "no-store" });
      if (res.status === 401) return on401();
      if (!res.ok) return;
      const data = await res.json();
      setOpen(data?.open ?? null);
    } catch {
      /* transient — leave last-known state */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Read on mount + every time the app comes back to the foreground.
  useEffect(() => {
    refresh();
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // Re-derive elapsed once a minute while on shift (display only; source = server clockInAt).
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/shift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.status === 401) return on401();
      const data = await res.json().catch(() => null);
      if (res.ok || res.status === 409) setOpen(data?.open ?? null); // 409 = already on shift → sync
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }, []);

  const end = useCallback(async () => {
    // First tap arms the confirm; second tap within the window commits.
    if (!confirming) {
      setConfirming(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
    setBusy(true);
    try {
      const res = await fetch("/api/driver/shift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      if (res.status === 401) return on401();
      if (res.ok || res.status === 404) setOpen(null); // 404 = nothing open → sync
    } finally {
      setBusy(false);
    }
  }, [confirming]);

  if (!loaded) return null; // avoid a flash of the wrong state before the first read

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-300 hover:text-white disabled:opacity-50"
        aria-label={t("startShift")}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {t("startShift")}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400" title={t("onShift")}>
        <Clock className="w-3.5 h-3.5" /> {elapsedLabel(open.clockInAt, now, tShared)}
      </span>
      <button
        type="button"
        onClick={end}
        disabled={busy}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-50 ${
          confirming ? "text-amber-400" : "text-gray-400 hover:text-white"
        }`}
        aria-label={t("endShift")}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}{" "}
        {confirming ? t("endShiftConfirm") : t("endShift")}
      </button>
    </span>
  );
}
