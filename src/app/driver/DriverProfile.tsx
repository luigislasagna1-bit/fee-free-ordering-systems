"use client";
import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Calendar, Loader2, LogOut, RefreshCw, Star, Store, Volume2, VolumeX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency, PLATFORM_CURRENCY } from "@/lib/utils";
import { isSoundsMuted, setSoundsMuted } from "./shared/driver-sounds";
import { LanguageRow } from "./shared/LanguageRow";
import { clearPrefCookie } from "./shared/role-pref";
import { formatPct } from "./shared/format-pct";

/**
 * Driver Profile tab (v1.1 plan §3.5): identity, the blended rating with its
 * three component bars (ratingComponents() is the ONE home for that math —
 * the server sends the components, nothing is re-derived here), lifetime
 * counters, read-only hourly rate (platform money → PLATFORM_CURRENCY;
 * hidden when 0 — it's never multiplied into any wages figure), language row,
 * and the relocated sign-out (same driver-basePath signOut() mechanics as the
 * old DriverQueue header button, plus the ffd-role-pref clear that must
 * travel with it, plan §2.4).
 *
 * Manual refresh only: ONE fetch when the tab first mounts (the shell keeps
 * it mounted afterwards) + an explicit refresh button. No polling — the 8s
 * queue poll and 30s heartbeat in DriverQueue are the app's only intervals.
 */

type Me = {
  name: string;
  email: string;
  phone: string | null;
  homeStoreName: string | null;
  createdAt: string;
  hourlyRateCents: number;
  ratingPct: number;
  deliveredCount: number;
  cancelledCount: number;
  lateCount: number;
  components: { reliability: number; onTime: number; feedback: number };
};

export function DriverProfile({ active = true }: { active?: boolean }) {
  const t = useTranslations("driver");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Mirrors the driver-sounds mute flag (localStorage). Read in an EFFECT,
  // never during render — SSR pre-renders this client component and a render
  // read would mismatch hydration (the 2026-07-17 localStorage gotcha).
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(isSoundsMuted());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/driver/me", { cache: "no-store" });
      if (res.status === 401) {
        // Same superseded-session rule as every other driver surface.
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = await res.json();
      if (data?.driver) setMe(data.driver);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch EVERY time the tab becomes active, not just on first mount: the
  // shell keeps this component mounted forever (Jobs stays mounted too), so a
  // mount-only fetch showed stale counters — Luigi's gate test delivered an
  // order and Profile still said "0 delivered" until a full re-login
  // (2026-07-17). One indexed findUnique per tab-tap is cheap; no polling.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (loading && !me) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="px-4 py-10 max-w-lg mx-auto text-center space-y-4">
        <p className="text-sm text-gray-400">{t("profileLoadFailed")}</p>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          <RefreshCw className="w-4 h-4" /> {t("refresh")}
        </button>
      </div>
    );
  }

  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sinceDate = new Date(me.createdAt).toLocaleDateString(locale, { year: "numeric", month: "long" });

  return (
    <main className="px-4 py-4 pb-24 space-y-3 max-w-lg mx-auto">
      {/* Manual refresh (no polling on this tab) */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="text-gray-400 hover:text-white disabled:opacity-50"
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Identity */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {initials || <Star className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="font-bold">{me.name}</div>
            <div className="text-xs text-gray-400 truncate">{me.email}</div>
            {me.phone && <div className="text-xs text-gray-400">{me.phone}</div>}
          </div>
        </div>
        <div className="space-y-1.5 text-xs text-gray-400">
          {me.homeStoreName && (
            <div className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="text-gray-500">{t("homeStore")}:</span>
              <span className="text-gray-300">{me.homeStoreName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            {t("driverSince", { date: sinceDate })}
          </div>
        </div>
      </section>

      {/* Rating */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("ratingTitle")}</h2>
          <span className="inline-flex items-center gap-1 text-lg font-bold text-amber-400">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> {formatPct(me.ratingPct / 100, locale)}
          </span>
        </div>
        <RatingBar label={t("ratingReliability")} value={me.components.reliability} />
        <RatingBar label={t("ratingOnTime")} value={me.components.onTime} />
        <RatingBar label={t("ratingFeedback")} value={me.components.feedback} />
      </section>

      {/* Lifetime counters */}
      <section className="grid grid-cols-3 gap-2">
        <StatTile label={t("statDelivered")} value={me.deliveredCount} accent="text-emerald-400" />
        <StatTile label={t("statReleased")} value={me.cancelledCount} accent="text-gray-200" />
        <StatTile label={t("statLate")} value={me.lateCount} accent="text-amber-400" />
      </section>

      {/* Read-only hourly rate — platform money, hidden when unset (0). */}
      {me.hourlyRateCents > 0 && (
        <section className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-gray-300">{t("hourlyRate")}</span>
          <span className="font-bold text-emerald-400">
            {formatCurrency(me.hourlyRateCents / 100, PLATFORM_CURRENCY)}
          </span>
        </section>
      )}

      {/* Sounds on/off — writes the driver-sounds module's persisted mute
          flag; the play functions read it at play time, so no event plumbing.
          Row styling matches LanguageRow (icon + label left, control right). */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {muted ? <VolumeX className="w-4 h-4 text-gray-500" /> : <Volume2 className="w-4 h-4 text-gray-500" />}
          {t("soundsLabel")}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!muted}
          aria-label={t("soundsLabel")}
          onClick={() => {
            const nextMuted = !muted;
            setMuted(nextMuted);
            setSoundsMuted(nextMuted);
          }}
          className="flex items-center gap-2"
        >
          <span className="text-xs font-semibold text-gray-400">{muted ? tCommon("off") : tCommon("on")}</span>
          <span
            className={`relative inline-block w-11 h-6 rounded-full transition-colors ${muted ? "bg-gray-600" : "bg-emerald-500"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${muted ? "" : "translate-x-5"}`}
            />
          </span>
        </button>
      </div>

      <LanguageRow />

      {/* Relocated sign-out: mechanics verbatim from the old header button
          (driver-basePath signOut via DriverSessionProvider) + pref-clear. */}
      <button
        type="button"
        onClick={() => {
          clearPrefCookie();
          signOut({ callbackUrl: "/driver/login" });
        }}
        className="w-full flex items-center justify-center gap-2 bg-gray-800 border border-gray-700 hover:border-rose-500/50 text-rose-400 font-semibold py-3 rounded-2xl text-sm"
      >
        <LogOut className="w-4 h-4" /> {t("signOut")}
      </button>
    </main>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const locale = useLocale();
  // pct drives the CSS bar width (always "{n}%" — CSS syntax, not copy);
  // the visible label goes through formatPct (locale-aware % placement).
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-gray-300">{formatPct(pct / 100, locale)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl px-2 py-3 text-center">
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
