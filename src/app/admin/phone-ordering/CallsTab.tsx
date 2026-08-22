import { getTranslations } from "next-intl/server";
import { Search, X } from "lucide-react";
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { Pagination, buildQuery, one, type SearchParams } from "@/components/admin/reports/table-nav";
import Link from "next/link";
import { collectedOf } from "@/lib/reports/collected";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { CALL_OUTCOMES } from "@/lib/voice/analytics";
import { phoneDigitsKey } from "@/lib/phone";
import { CallRowLink } from "./CallRowLink";
import { CallerLink } from "./CallerLink";
import { formatTzDateTime, formatDuration, OutcomeChip, SentimentDot } from "./shared";

const PAGE_SIZE = 20;

/**
 * Calls tab — server-paged call log with search (phone digits / caller name /
 * summary), outcome + date-range filters. Every row drills into
 * /admin/phone-ordering/calls/[id]. Beats Loman: totals come from OUR order
 * join, not a "see POS" cop-out.
 */
export default async function CallsTab({
  restaurantId,
  sp,
}: {
  restaurantId: string;
  sp: SearchParams;
}) {
  const t = await getTranslations("admin.phoneOrderingPage.callLog");
  const scope = await resolveReportScope(restaurantId);
  const spEff: SearchParams = { ...sp, preset: sp.preset ?? "last_28" };
  const range = parseDateRangeInTz(spEff, scope.timezone ?? undefined);

  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const outcomeParam = one(sp.outcome);
  const outcome = (CALL_OUTCOMES as readonly string[]).includes(outcomeParam ?? "") ? outcomeParam : undefined;
  const page = Math.max(1, parseInt(one(sp.page) ?? "1", 10) || 1);

  // Search: phone digits, customer name (via a scoped Customer lookup —
  // VoiceCall.customerId is a loose ref, no relation to join through), or the
  // AI summary text.
  const or: Prisma.VoiceCallWhereInput[] = [];
  if (q) {
    or.push({ summary: { contains: q, mode: "insensitive" } });
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ fromNumber: { contains: digits } });
    const matching = await prisma.customer.findMany({
      where: { restaurantId, name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 200,
    });
    if (matching.length > 0) or.push({ customerId: { in: matching.map((c) => c.id) } });
  }

  const where: Prisma.VoiceCallWhereInput = {
    restaurantId,
    startedAt: { gte: range.from, lte: range.to },
    ...(outcome ? { outcome } : {}),
    ...(or.length > 0 ? { OR: or } : {}),
  };

  const [totalCount, calls] = await Promise.all([
    prisma.voiceCall.count({ where }),
    prisma.voiceCall.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        startedAt: true,
        fromNumber: true,
        outcome: true,
        durationSeconds: true,
        billableSeconds: true,
        sentiment: true,
        customerId: true,
        orderNumber: true,
        transferReason: true,
      },
    }),
  ]);

  // Join orders (total + items count) and caller names for THIS page only.
  const orderNumbers = Array.from(new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)));
  const customerIds = Array.from(new Set(calls.map((c) => c.customerId).filter((id): id is string => !!id)));
  const [orders, customers] = await Promise.all([
    orderNumbers.length
      ? prisma.order.findMany({
          where: { restaurantId, orderNumber: { in: orderNumbers } },
          // Unfiltered on purpose — a rejected/cancelled order still shows its
          // item count; only its MONEY is dashed out below (Overview parity).
          select: { orderNumber: true, status: true, total: true, creditApplied: true, _count: { select: { items: true } } },
        })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.customer.findMany({ where: { restaurantId, id: { in: customerIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o]));
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const outcomeLabel = (o: string | null) =>
    o && (CALL_OUTCOMES as readonly string[]).includes(o) ? t(`outcome.${o}`) : t("outcome.unknown");

  // Landing here from the Overview "needs attention" banner pre-fills
  // ?outcome=error with nothing on screen saying so — the chips make an
  // active filter visible and give it a one-click way out.
  const filtersActive = !!q || !!outcome;
  const clearHref = (() => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", "calls");
    u.delete("q");
    u.delete("outcome");
    u.delete("page");
    return `?${u.toString()}`;
  })();

  return (
    <div className="space-y-4">
      {/* Filter bar — plain GET form so the whole tab stays a server page.
          Hidden inputs preserve the active tab + date range across submits. */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <form method="get" className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="tab" value="calls" />
          {one(sp.preset) && <input type="hidden" name="preset" value={one(sp.preset)} />}
          {one(sp.from) && <input type="hidden" name="from" value={one(sp.from)} />}
          {one(sp.to) && <input type="hidden" name="to" value={one(sp.to)} />}
          <label className="block">
            <span className="sr-only">{t("searchPlaceholder")}</span>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("searchPlaceholder")}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm w-72 max-w-full focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </label>
          <select
            name="outcome"
            defaultValue={outcome ?? ""}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          >
            <option value="">{t("filterOutcomeAll")}</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcome.${o}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition"
          >
            {t("applyFilters")}
          </button>
        </form>
        <DateRangePicker defaultPreset="last_28" />
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
        <span>{t("callCountLabel", { count: totalCount, range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}</span>
        {filtersActive && (
          <>
            <span className="text-gray-300">·</span>
            {q && (
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-medium text-amber-800">
                {t("filterSearchChip", { q })}
              </span>
            )}
            {outcome && (
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-medium text-amber-800">
                {t(`outcome.${outcome}`)}
              </span>
            )}
            <Link href={clearHref} className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900">
              <X className="w-3 h-3" />
              {t("clearFilters")}
            </Link>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-2.5 px-4 font-medium">{t("colTime")}</th>
                <th className="py-2.5 px-4 font-medium">{t("colCaller")}</th>
                <th className="py-2.5 px-4 font-medium">{t("colName")}</th>
                <th className="py-2.5 px-4 font-medium">{t("colOutcome")}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t("colDuration")}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t("colAiTime")}</th>
                <th className="py-2.5 px-4 font-medium text-center">{t("colSentiment")}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t("colTotal")}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t("colItems")}</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm text-gray-400">
                    {t("emptyState")}
                  </td>
                </tr>
              )}
              {calls.map((c) => {
                const order = c.orderNumber ? orderByNumber.get(c.orderNumber) : undefined;
                // Money on an order the canonical report filter excludes was
                // never collected — printing it here would make this column
                // irreconcilable with the Revenue KPI. Dashed out exactly like
                // the Overview recent-activity feed already does.
                const voided =
                  !!order &&
                  ((REPORT_ORDER_STATUS_WHERE.status.notIn as readonly string[]).includes(order.status) ||
                    order.orderNumber.startsWith(REPORT_ORDER_STATUS_WHERE.orderNumber.not.startsWith));
                const collected = order && !voided ? collectedOf(order) : null;
                const name = c.customerId ? nameById.get(c.customerId) : undefined;
                const digits = phoneDigitsKey(c.fromNumber);
                return (
                  <CallRowLink key={c.id} href={`/admin/phone-ordering/calls/${c.id}`}>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                      {formatTzDateTime(c.startedAt, scope.timezone)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {c.fromNumber && digits ? (
                        <CallerLink digits={digits} title={t("callerHistoryHint")} className="font-mono text-gray-700">
                          {c.fromNumber}
                        </CallerLink>
                      ) : c.fromNumber ? (
                        <span className="font-mono text-gray-700">{c.fromNumber}</span>
                      ) : (
                        <span className="text-gray-400">{t("anonymousCaller")}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {name && digits ? (
                        <CallerLink digits={digits} title={t("callerHistoryHint")} className="font-medium text-gray-900" showIcon>
                          {name}
                        </CallerLink>
                      ) : name ? (
                        <span className="font-medium text-gray-900">{name}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <OutcomeChip
                        outcome={c.outcome}
                        label={outcomeLabel(c.outcome)}
                        transferred={!!c.transferReason && c.outcome === "order_placed"}
                      />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-right text-gray-600 tabular-nums">
                      {formatDuration(c.durationSeconds)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-right tabular-nums">
                      {c.billableSeconds != null ? (
                        <span className={c.billableSeconds < (c.durationSeconds ?? 0) ? "text-emerald-600 font-medium" : "text-gray-600"}>
                          {formatDuration(c.billableSeconds)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-center">
                      <SentimentDot sentiment={c.sentiment} label={c.sentiment ? t(`sentiment.${c.sentiment}`) : ""} />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-right font-semibold text-gray-900 tabular-nums">
                      {collected != null ? fmtCurrency(collected, scope.currency) : "—"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-right text-gray-600 tabular-nums">
                      {order ? order._count.items : "—"}
                    </td>
                  </CallRowLink>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          current={page}
          total={totalPages}
          sp={sp}
          labelPage={t("paginationPage", { current: page, total: totalPages })}
          labelPrevious={t("paginationPrevious")}
          labelNext={t("paginationNext")}
        />
      )}
    </div>
  );
}
