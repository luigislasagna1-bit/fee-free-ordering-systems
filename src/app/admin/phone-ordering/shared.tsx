import { PhoneForwarded } from "lucide-react";

/**
 * Shared server-safe render helpers for the Nabil dashboard tabs. No client
 * hooks here — chips/dots are used inside server components; labels are
 * passed in already-translated (i18n stays at the call sites).
 */

/** Format an instant in the RESTAURANT's timezone (never the server's — a
 *  Vercel UTC clock would shift every call time; see Fabrizio #16). */
export function formatTzDateTime(
  d: Date,
  tz: string | null,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz ?? undefined }).format(d);
  } catch {
    // Invalid tz — fall back to server-local rather than crash the page.
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  }
}

/** "1:29" / "12:03" — call durations. null → em-dash. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const OUTCOME_STYLES: Record<string, string> = {
  order_placed: "bg-emerald-100 text-emerald-800",
  reservation_booked: "bg-sky-100 text-sky-800",
  faq_answered: "bg-blue-100 text-blue-800",
  transferred: "bg-purple-100 text-purple-800",
  message_taken: "bg-amber-100 text-amber-800",
  abandoned: "bg-gray-100 text-gray-600",
  spam: "bg-slate-200 text-slate-600",
  error: "bg-red-100 text-red-700",
};

export function OutcomeChip({
  outcome,
  label,
  transferred = false,
}: {
  outcome: string | null;
  label: string;
  /** Show the little transfer arrow beside the chip (an order that ALSO
   *  involved a human handoff — outcome stays order_placed by contract). */
  transferred?: boolean;
}) {
  const style = (outcome && OUTCOME_STYLES[outcome]) || "bg-gray-100 text-gray-600";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${style}`}>
        {label}
      </span>
      {transferred && <PhoneForwarded className="w-3.5 h-3.5 text-purple-500" />}
    </span>
  );
}

const SENTIMENTS: Record<string, { emoji: string; dot: string }> = {
  positive: { emoji: "🙂", dot: "bg-emerald-400" },
  neutral: { emoji: "😐", dot: "bg-gray-300" },
  negative: { emoji: "🙁", dot: "bg-red-400" },
};

export function SentimentDot({ sentiment, label }: { sentiment: string | null; label: string }) {
  const s = sentiment ? SENTIMENTS[sentiment] : undefined;
  if (!s) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={label} aria-label={label}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-sm leading-none">{s.emoji}</span>
    </span>
  );
}
