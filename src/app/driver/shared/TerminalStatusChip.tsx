"use client";
import { useTranslations } from "next-intl";

/**
 * Terminal status chip (v1.1 plan §3.1 shared building block / §3.3):
 * Delivered emerald · Failed rose · Returned gray. Shared by the driver
 * History list + detail (Phase 4) and reusable by the restaurant Deliveries
 * tab (Phase 7 — its extra `cancelled` status falls through to the gray
 * style with the raw status until its admin-side label ships there).
 *
 * Labels come from the shared feefreeShared timeline keys so the chip and
 * the StageTimeline terminal node can never disagree (plan §6 dedup rule).
 */
const CHIP_STYLES: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-rose-500/15 text-rose-400",
  returned: "bg-gray-600/40 text-gray-300",
};

const CHIP_LABEL_KEYS: Record<string, string> = {
  delivered: "timelineDelivered",
  failed: "timelineFailed",
  returned: "timelineReturned",
};

export function TerminalStatusChip({ status }: { status: string }) {
  const t = useTranslations("feefreeShared");
  const labelKey = CHIP_LABEL_KEYS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        CHIP_STYLES[status] ?? "bg-gray-600/40 text-gray-300"
      }`}
    >
      {labelKey ? t(labelKey) : status}
    </span>
  );
}
