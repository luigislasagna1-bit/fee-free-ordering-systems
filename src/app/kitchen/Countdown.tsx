"use client";
import { useLocale } from "next-intl";
import { formatDueLabel } from "@/lib/format-time";

// Accept-window length the live countdown ticks down — matches the GloriaFood alert track
// duration so the on-screen countdown aligns with the audio. Keep in sync with
// KitchenDisplay's ACCEPT_WINDOW_MS (245s). Closed-placed orders get a 15-min buffer.
export const ACCEPT_WINDOW_MS = 245 * 1000;

/**
 * Live accept-window countdown — shown on the order tiles (list) AND in the order-detail
 * header (so staff see the time remaining without backing out). `now` is a ticking timestamp
 * passed by the parent (0 until the client mounts → "--:--", avoids a hydration mismatch).
 * Parked orders (alertAt still in the future) show "OPENS IN …"; falls back to createdAt for
 * legacy rows that pre-date notifiedAt. Luigi 2026-06-23 (P2).
 */
export function Countdown({
  notifiedAt, createdAt, alertAt, placedWhileClosed, now,
}: {
  notifiedAt: string | null;
  createdAt: string;
  alertAt?: string | null;
  placedWhileClosed?: boolean;
  now: number;
}) {
  const locale = useLocale();
  if (!now) return <span className="text-xs font-mono text-gray-400">--:--</span>;
  if (alertAt) {
    const alertMs = new Date(alertAt).getTime();
    if (alertMs > now) {
      const label = formatDueLabel(alertMs, now, locale);
      const badge = label.kind === "day" ? label.text.toUpperCase() : `OPENS IN ${label.text.toUpperCase()}`;
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300 whitespace-nowrap"
          title={`Alert at ${new Date(alertAt).toLocaleString(locale || undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
        >
          {badge}
        </span>
      );
    }
  }
  const reference = alertAt ?? notifiedAt ?? createdAt;
  const totalMs = placedWhileClosed ? 15 * 60 * 1000 : ACCEPT_WINDOW_MS;
  const ms = totalMs - (now - new Date(reference).getTime());
  if (ms <= 0) return <span className="text-[10px] font-bold text-red-500 animate-pulse whitespace-nowrap">URGENT</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const color = ms < 60000 ? "text-red-500 font-bold" : "text-emerald-500 font-semibold";
  return <span className={`text-[10px] ${color} font-mono whitespace-nowrap`}>{m}:{s.toString().padStart(2, "0")}</span>;
}
