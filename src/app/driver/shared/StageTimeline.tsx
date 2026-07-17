"use client";
import { useLocale, useTranslations } from "next-intl";

/**
 * Stage timeline with deltas (v1.1 plan §3.1 shared building block) — the
 * driver History detail's accepted → started → picked up → delivered ladder
 * (Phase 4), reusable by the restaurant Delivery detail's assigned → … ladder
 * (Phase 7). Callers pass their own stage nodes (labels + timestamps); this
 * component owns only layout, locale time formatting, and the between-stage
 * deltas (feefreeShared.minutesOnly / hoursMinutes).
 *
 * Nodes with a null timestamp are skipped entirely (a delivery that failed
 * before pickup simply has fewer rows) — deltas run between consecutive
 * PRESENT stamps. tone: "fail" renders the rose terminal node for
 * failed/returned; reached stages are otherwise emerald (done).
 */
export type TimelineNode = {
  key: string;
  label: string;
  /** ISO string or Date; null = stage never reached → row skipped. */
  at: string | Date | null;
  /** Terminal-node color override: "fail" → rose (failed/returned). */
  tone?: "ok" | "fail";
};

export function StageTimeline({ nodes }: { nodes: TimelineNode[] }) {
  const tShared = useTranslations("feefreeShared");
  const locale = useLocale();
  const present = nodes.filter((n) => n.at != null);
  if (present.length === 0) return null;

  return (
    <ol className="space-y-0">
      {present.map((n, i) => {
        const at = new Date(n.at as string | Date);
        const prev = i > 0 ? new Date(present[i - 1]!.at as string | Date) : null;
        const deltaMs = prev ? at.getTime() - prev.getTime() : null;
        const dotCls = n.tone === "fail" ? "bg-rose-500" : "bg-emerald-500";
        return (
          <li key={n.key} className="relative pl-6 pb-4 last:pb-0">
            {i < present.length - 1 && (
              <span className="absolute left-[5px] top-3.5 bottom-0 w-px bg-gray-700" aria-hidden />
            )}
            <span className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full ${dotCls}`} aria-hidden />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-gray-200">{n.label}</span>
              <span className="text-xs text-gray-500 flex-shrink-0">
                {at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            {deltaMs != null && deltaMs >= 0 && (
              <div className="text-[11px] text-gray-500">+{formatDelta(deltaMs, tShared)}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatDelta(ms: number, t: ReturnType<typeof useTranslations>): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return t("minutesOnly", { m: mins });
  return t("hoursMinutes", { h: Math.floor(mins / 60), m: mins % 60 });
}
