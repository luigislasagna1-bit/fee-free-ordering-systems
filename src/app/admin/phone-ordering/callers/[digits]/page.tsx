import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Ban,
  CalendarDays,
  Clock,
  PhoneCall,
  PhoneIncoming,
  ShoppingBag,
  Smile,
  Star,
  Wallet,
} from "lucide-react";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { phoneDigitsKey } from "@/lib/phone";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { collectedOf } from "@/lib/reports/collected";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { CALL_OUTCOMES, countBy } from "@/lib/voice/analytics";
import { formatTzDateTime, formatDuration, OutcomeChip, SentimentDot } from "../../shared";
import BlockCallerButton from "../../calls/[id]/BlockCallerButton";

/**
 * Caller history — everything ONE PHONE NUMBER has done on the Nabil line.
 *
 * Keyed by phone digits (phoneDigitsKey), never by customer: phone history is
 * a separate world from the online customer area by design (Luigi
 * 2026-08-22 — "I don't want it to interfere with online stuff"). So the only
 * orders here are the ones Nabil's calls produced (VoiceCall.orderNumber →
 * Order), and the display name comes from those phone tickets first. No link
 * into /admin/customers, no online orders pulled in.
 *
 * Beats Loman's "View Caller History": we own the orders, so the page shows
 * real money, what they usually order, their mood on calls, and every call
 * with its AI summary — not a list of "See POS for details" rows.
 *
 * Scoped: every query carries restaurantId, so a pasted URL for another
 * store's caller shows nothing.
 */

const CALLS_SHOWN = 60;
const ORDERS_SHOWN = 12;
const FAVORITES_SHOWN = 5;

export default async function CallerHistoryPage({ params }: { params: Promise<{ digits: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const restaurantId = user.restaurantId;
  if (!(await hasFeature(restaurantId, "phone_ordering_agent"))) redirect("/admin/phone-ordering");

  const { digits: raw } = await params;
  const digits = phoneDigitsKey(raw);
  if (!digits) notFound();

  const t = await getTranslations("admin.phoneOrderingPage.caller");
  const tCalls = await getTranslations("admin.phoneOrderingPage.callLog");
  const tDetail = await getTranslations("admin.phoneOrderingPage.callDetail");
  const scope = await resolveReportScope(restaurantId);
  const tz = scope.timezone;
  const fmt = (n: number) => fmtCurrency(n, scope.currency);

  const callWhere = { restaurantId, fromDigits: digits };
  const [calls, callCount, firstCall] = await Promise.all([
    prisma.voiceCall.findMany({
      where: callWhere,
      orderBy: { startedAt: "desc" },
      take: CALLS_SHOWN,
      select: {
        id: true,
        startedAt: true,
        fromNumber: true,
        outcome: true,
        durationSeconds: true,
        orderNumber: true,
        reservationCode: true,
        sentiment: true,
        summary: true,
        transferReason: true,
        customerId: true,
      },
    }),
    prisma.voiceCall.count({ where: callWhere }),
    prisma.voiceCall.findFirst({ where: callWhere, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
  ]);

  // The E.164 forms this number arrived as (normally one). BlockedCaller.phone
  // is stored RAW, so the block lookup + button use the most recent form.
  const fromNumbers = Array.from(new Set(calls.map((c) => c.fromNumber).filter(Boolean)));
  const primaryNumber = fromNumbers[0] ?? null;
  const orderNumbers = Array.from(new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)));

  const [blockedRow, orders, customerRow] = await Promise.all([
    primaryNumber
      ? prisma.blockedCaller.findFirst({ where: { restaurantId, phone: { in: fromNumbers } }, select: { id: true, phone: true } })
      : Promise.resolve(null),
    orderNumbers.length
      ? prisma.order.findMany({
          // Unfiltered on purpose: a rejected order still appears in the list
          // (dashed money) so the history is honest; only the MONEY figures
          // below apply the canonical report filter.
          where: { restaurantId, orderNumber: { in: orderNumbers } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            type: true,
            total: true,
            creditApplied: true,
            createdAt: true,
            customerName: true,
            items: { select: { name: true, quantity: true }, orderBy: { createdAt: "asc" } },
          },
        })
      : Promise.resolve([]),
    // Read-only name fallback when no phone ticket carries one yet (the same
    // lookup the calls list already does). Never linked, never written.
    (() => {
      const id = calls.find((c) => c.customerId)?.customerId;
      return id
        ? prisma.customer.findFirst({ where: { id, restaurantId }, select: { name: true } })
        : Promise.resolve(null);
    })(),
  ]);

  const isVoided = (o: { status: string; orderNumber: string }) =>
    (REPORT_ORDER_STATUS_WHERE.status.notIn as readonly string[]).includes(o.status) ||
    o.orderNumber.startsWith(REPORT_ORDER_STATUS_WHERE.orderNumber.not.startsWith);
  const liveOrders = orders.filter((o) => !isVoided(o));
  const collectedByNumber = new Map(liveOrders.map((o) => [o.orderNumber, collectedOf(o)]));
  const spend = Math.round(liveOrders.reduce((s, o) => s + collectedOf(o), 0) * 100) / 100;
  const avgOrder = liveOrders.length ? Math.round((spend / liveOrders.length) * 100) / 100 : 0;

  // "Usually orders" — item quantities across the caller's live phone orders.
  const favCounts = new Map<string, number>();
  for (const o of liveOrders) for (const it of o.items) favCounts.set(it.name, (favCounts.get(it.name) ?? 0) + it.quantity);
  const favorites = [...favCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, FAVORITES_SHOWN);
  const maxFav = favorites[0]?.[1] ?? 1;

  const outcomes = countBy(calls.map((c) => c.outcome));
  const outcomesSorted = Object.entries(outcomes).sort((x, y) => y[1] - x[1]);
  const sentiments = countBy(calls.map((c) => c.sentiment));
  const sentimentTotal = (sentiments.positive ?? 0) + (sentiments.neutral ?? 0) + (sentiments.negative ?? 0);
  const positivePct = sentimentTotal ? Math.round(((sentiments.positive ?? 0) / sentimentTotal) * 100) : null;
  const reservations = calls.filter((c) => c.reservationCode).length;

  // Name: the most recent phone ticket's name, else the read-only customer
  // name, else nothing — we never guess.
  const name = orders.find((o) => o.customerName?.trim())?.customerName?.trim() || customerRow?.name?.trim() || null;
  const initial = (name ?? "#").charAt(0).toUpperCase();
  const outcomeLabel = (o: string | null) =>
    o && (CALL_OUTCOMES as readonly string[]).includes(o) ? tCalls(`outcome.${o}`) : tCalls("outcome.unknown");
  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-10">
      <Link href="/admin/phone-ordering?tab=calls" className="text-sm text-gray-600 hover:text-gray-900">
        &larr; {tDetail("backToCalls")}
      </Link>

      {/* Identity header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t("title")}</div>
              <h1 className="text-2xl font-bold text-gray-900 truncate">{name ?? t("unknownName")}</h1>
              <div className="mt-1 flex items-center gap-3 flex-wrap text-sm text-gray-500">
                {primaryNumber ? (
                  <a href={`tel:${primaryNumber}`} className="font-mono text-gray-700 hover:text-amber-700">
                    {primaryNumber}
                  </a>
                ) : (
                  <span className="font-mono">{digits}</span>
                )}
                {firstCall && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                    {t("firstCall", { date: formatTzDateTime(firstCall.startedAt, tz, dateOpts) })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {primaryNumber && <BlockCallerButton phone={blockedRow?.phone ?? primaryNumber} blockedId={blockedRow?.id ?? null} />}
          </div>
        </div>
        {blockedRow && (
          <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5" />
            {tDetail("callerBlockedNote")}
          </p>
        )}
      </div>

      {callCount === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">{t("notFound")}</div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={PhoneCall} accent="text-blue-600 bg-blue-50" label={t("kpiCalls")} value={callCount.toLocaleString()} sub={reservations > 0 ? t("reservationsSub", { count: reservations }) : undefined} />
            <Kpi
              icon={ShoppingBag}
              accent="text-amber-600 bg-amber-50"
              label={t("kpiOrders")}
              value={liveOrders.length.toLocaleString()}
              sub={liveOrders.length ? t("avgOrderSub", { amount: fmt(avgOrder) }) : undefined}
            />
            <Kpi icon={Wallet} accent="text-emerald-600 bg-emerald-50" label={t("kpiSpend")} value={fmt(spend)} sub={t("spendSub")} />
            <Kpi icon={Clock} accent="text-purple-600 bg-purple-50" label={t("kpiLastCall")} value={formatTzDateTime(calls[0].startedAt, tz)} />
            <Kpi
              icon={Smile}
              accent="text-sky-600 bg-sky-50"
              label={t("kpiMood")}
              value={positivePct != null ? t("moodValue", { pct: positivePct }) : "—"}
              sub={positivePct != null ? t("moodSub", { count: sentimentTotal }) : t("moodEmpty")}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            {/* Calls timeline */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <PhoneIncoming className="w-4 h-4 text-gray-400" />
                  {t("callsTitle")}
                </h3>
                <span className="text-xs text-gray-400">
                  {callCount > calls.length ? t("moreCalls", { shown: calls.length, total: callCount }) : t("callsCount", { count: callCount })}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {calls.map((c) => {
                  const collected = c.orderNumber ? collectedByNumber.get(c.orderNumber) : undefined;
                  return (
                    <Link
                      key={c.id}
                      href={`/admin/phone-ordering/calls/${c.id}`}
                      className="block px-5 py-3 hover:bg-gray-50/80 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-32 flex-shrink-0 text-xs text-gray-500 tabular-nums">{formatTzDateTime(c.startedAt, tz)}</span>
                        <OutcomeChip
                          outcome={c.outcome}
                          label={outcomeLabel(c.outcome)}
                          transferred={!!c.transferReason && c.outcome === "order_placed"}
                        />
                        <span className="flex-1" />
                        {c.sentiment && <SentimentDot sentiment={c.sentiment} label={tCalls(`sentiment.${c.sentiment}`)} />}
                        <span className="w-12 text-right text-xs text-gray-400 tabular-nums">{formatDuration(c.durationSeconds)}</span>
                        <span className="w-20 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {collected != null ? fmt(collected) : c.orderNumber ? <span className="text-gray-300">—</span> : ""}
                        </span>
                      </div>
                      {c.summary && <p className="mt-1.5 text-xs text-gray-500 leading-relaxed line-clamp-2">{c.summary}</p>}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {/* Usually orders */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  {t("favoritesTitle")}
                </h3>
                {favorites.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("favoritesEmpty")}</p>
                ) : (
                  <div className="space-y-2">
                    {favorites.map(([itemName, qty]) => (
                      <div key={itemName} className="flex items-center gap-3">
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-800" title={itemName}>
                          {itemName}
                        </span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(qty / maxFav) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-medium text-gray-600 tabular-nums">{t("favoriteTimes", { count: qty })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outcomes */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("outcomesTitle")}</h3>
                <div className="space-y-2">
                  {outcomesSorted.map(([o, n]) => (
                    <div key={o} className="flex items-center gap-3">
                      <div className="w-32 flex-shrink-0">
                        <OutcomeChip outcome={o} label={outcomeLabel(o)} />
                      </div>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(n / Math.max(calls.length, 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-6 text-right tabular-nums">{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Orders */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">{t("ordersTitle")}</h3>
                </div>
                {orders.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400">{t("ordersEmpty")}</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {orders.slice(0, ORDERS_SHOWN).map((o) => {
                      const voided = isVoided(o);
                      return (
                        <Link
                          key={o.id}
                          href={`/admin/orders/${o.id}`}
                          className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/80 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {o.orderNumber}
                              <span className="ml-2 text-[11px] font-normal text-gray-400 uppercase">{o.type}</span>
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatTzDateTime(o.createdAt, tz)} · {t("itemCount", { count: o.items.reduce((s, i) => s + i.quantity, 0) })}
                            </div>
                          </div>
                          <span className={`text-sm font-semibold tabular-nums ${voided ? "text-gray-300 line-through" : "text-gray-900"}`}>
                            {fmt(collectedOf(o))}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: typeof PhoneCall;
  accent: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
