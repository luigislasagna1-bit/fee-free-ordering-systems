import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Ban, CalendarDays, MessageSquareText, Mic, PhoneForwarded, ShoppingBag } from "lucide-react";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { collectedOf } from "@/lib/reports/collected";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { CALL_OUTCOMES } from "@/lib/voice/analytics";
import { formatTzDateTime, formatDuration, OutcomeChip, SentimentDot } from "../../shared";
import BlockCallerButton from "./BlockCallerButton";

/**
 * Call detail — transcript bubbles, AI summary + sentiment, the recording
 * player, the FULL order card with money (we OWN the order — no "See POS"),
 * reservation + transfer cards, caller history, block/unblock. Scoped fetch:
 * id + restaurantId or 404.
 */

type TranscriptTurn = { role?: string; text?: string; ts?: number | string };

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const restaurantId = user.restaurantId;
  if (!(await hasFeature(restaurantId, "phone_ordering_agent"))) redirect("/admin/phone-ordering");

  const { id } = await params;
  const call = await prisma.voiceCall.findFirst({
    where: { id, restaurantId },
  });
  if (!call) notFound();

  const t = await getTranslations("admin.phoneOrderingPage.callDetail");
  const tCalls = await getTranslations("admin.phoneOrderingPage.callLog");
  const scope = await resolveReportScope(restaurantId);
  const fmt = (n: number) => fmtCurrency(n, scope.currency);
  const tz = scope.timezone;

  const [customer, order, reservation, blockedRow, history] = await Promise.all([
    call.customerId
      ? prisma.customer.findFirst({ where: { id: call.customerId, restaurantId }, select: { id: true, name: true, phone: true } })
      : Promise.resolve(null),
    call.orderNumber
      ? prisma.order.findFirst({
          where: { restaurantId, orderNumber: call.orderNumber },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            type: true,
            subtotal: true,
            taxAmount: true,
            deliveryFee: true,
            tip: true,
            promoDiscount: true,
            couponDiscount: true,
            creditApplied: true,
            total: true,
            items: {
              select: { id: true, name: true, variantName: true, quantity: true, subtotal: true, notes: true },
              orderBy: { createdAt: "asc" },
            },
          },
        })
      : Promise.resolve(null),
    call.reservationCode
      ? prisma.reservation.findFirst({
          where: { restaurantId, confirmationCode: call.reservationCode },
          select: { id: true, confirmationCode: true, status: true, date: true, time: true, partySize: true, customerName: true },
        })
      : Promise.resolve(null),
    call.fromNumber
      ? prisma.blockedCaller.findUnique({
          where: { restaurantId_phone: { restaurantId, phone: call.fromNumber } },
          select: { id: true },
        })
      : Promise.resolve(null),
    call.fromNumber
      ? prisma.voiceCall.findMany({
          where: { restaurantId, fromNumber: call.fromNumber, id: { not: call.id } },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { id: true, startedAt: true, outcome: true, durationSeconds: true, orderNumber: true },
        })
      : Promise.resolve([]),
  ]);

  // Totals for the caller-history rows (one query for all 10). Orders the
  // canonical report filter excludes are dropped here so their totals fall
  // through to "—" rather than reading as money collected.
  const historyOrderNumbers = Array.from(new Set(history.map((h) => h.orderNumber).filter((n): n is string => !!n)));
  const historyOrders = historyOrderNumbers.length
    ? await prisma.order.findMany({
        // Canonical status/TEST- filter merged into the voice join — the
        // orderNumber `in` and `not` clauses must live in ONE filter object.
        where: {
          restaurantId,
          status: REPORT_ORDER_STATUS_WHERE.status,
          orderNumber: { ...REPORT_ORDER_STATUS_WHERE.orderNumber, in: historyOrderNumbers },
        },
        select: { orderNumber: true, total: true, creditApplied: true },
      })
    : [];
  const historyTotal = new Map(historyOrders.map((o) => [o.orderNumber, collectedOf(o)]));

  const outcomeLabel = (o: string | null) =>
    o && (CALL_OUTCOMES as readonly string[]).includes(o) ? tCalls(`outcome.${o}`) : tCalls("outcome.unknown");

  const transcript: TranscriptTurn[] = Array.isArray(call.transcript) ? (call.transcript as TranscriptTurn[]) : [];
  const callerDisplay = customer?.name || call.fromNumber || tCalls("anonymousCaller");
  const discount = (order?.promoDiscount ?? 0) + (order?.couponDiscount ?? 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Header. */}
      <div>
        <Link href="/admin/phone-ordering?tab=calls" className="text-sm text-gray-600 hover:text-gray-900">
          &larr; {t("backToCalls")}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 flex-wrap">
              {callerDisplay}
              <OutcomeChip
                outcome={call.outcome}
                label={outcomeLabel(call.outcome)}
                transferred={!!call.transferReason && call.outcome === "order_placed"}
              />
            </h1>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              {customer?.name && call.fromNumber && <span className="font-mono">{call.fromNumber}</span>}
              <span>{t("startedAt", { time: formatTzDateTime(call.startedAt, tz, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}</span>
              <span>
                {t("durationLabel")}: {formatDuration(call.durationSeconds)}
              </span>
              {call.language && (
                <span>
                  {t("languageLabel")}: <span className="uppercase">{call.language}</span>
                </span>
              )}
              {call.sentiment && <SentimentDot sentiment={call.sentiment} label={tCalls(`sentiment.${call.sentiment}`)} />}
            </div>
          </div>
          {call.fromNumber && (
            <div className="flex items-center gap-2">
              <BlockCallerButton phone={call.fromNumber} blockedId={blockedRow?.id ?? null} />
            </div>
          )}
        </div>
        {blockedRow && (
          <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
            <Ban className="w-3.5 h-3.5" />
            {t("callerBlockedNote")}
          </p>
        )}
      </div>

      {/* Recording. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <Mic className="w-4 h-4 text-gray-400" />
          {t("recordingTitle")}
        </h3>
        {call.recordingUrl ? (
          // Authenticated playback proxy (session + entitlement enforced
          // server-side; the raw Twilio URL never reaches the browser).
          <audio controls preload="none" className="w-full" src={`/api/admin/phone-ordering/calls/${call.id}/recording`} />
        ) : (
          <p className="text-sm text-gray-500">{t("recordingPending")}</p>
        )}
      </div>

      {/* AI summary. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
          <MessageSquareText className="w-4 h-4 text-gray-400" />
          {t("summaryTitle")}
        </h3>
        {call.summary ? (
          <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">{t("summaryPending")}</p>
        )}
      </div>

      {/* Order card — full items + money. We own the order; deep-link to it. */}
      {order && (
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              {t("orderCardTitle", { number: order.orderNumber })}
              {/* Raw status (same untranslated chip as the reservation card) so
                  a cancelled/rejected order can't be read as money collected. */}
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">{order.status}</span>
            </h3>
            <Link
              href={`/admin/orders/${order.id}`}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
            >
              {t("viewOrder")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {order.items.map((it) => (
              <div key={it.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">
                    {it.quantity} × {it.name}
                  </span>
                  {it.variantName && <span className="text-gray-500"> · {it.variantName}</span>}
                  {it.notes && <div className="text-xs text-gray-500 mt-0.5">{it.notes}</div>}
                </div>
                <span className="tabular-nums text-gray-700 flex-shrink-0">{fmt(it.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-sm">
            <MoneyLine label={t("mSubtotal")} value={fmt(order.subtotal)} />
            {order.taxAmount > 0 && <MoneyLine label={t("mTax")} value={fmt(order.taxAmount)} />}
            {order.deliveryFee > 0 && <MoneyLine label={t("mDeliveryFee")} value={fmt(order.deliveryFee)} />}
            {order.tip > 0 && <MoneyLine label={t("mTip")} value={fmt(order.tip)} />}
            {discount > 0 && <MoneyLine label={t("mDiscount")} value={`− ${fmt(discount)}`} />}
            <div className="flex items-center justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>{t("mTotal")}</span>
              <span className="tabular-nums">{fmt(order.total)}</span>
            </div>
            {/* Store credit is a TENDER — when redeemed, show the real money
                collected under the full order value (collected.ts contract). */}
            {order.creditApplied > 0 && (
              <>
                <MoneyLine label={t("mCredit")} value={`− ${fmt(order.creditApplied)}`} />
                <div className="flex items-center justify-between font-bold text-emerald-700">
                  <span>{t("mCollected")}</span>
                  <span className="tabular-nums">{fmt(collectedOf(order))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reservation card. */}
      {call.reservationCode && (
        <div className="rounded-xl border border-sky-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-sky-600" />
            {t("reservationCardTitle", { code: call.reservationCode })}
          </h3>
          {reservation ? (
            <div className="text-sm text-gray-700 flex items-center gap-4 flex-wrap">
              <span>
                {reservation.date} · {reservation.time}
              </span>
              <span>{t("resParty", { count: reservation.partySize })}</span>
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-sky-100 text-sky-800">{reservation.status}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("resNotFound")}</p>
          )}
        </div>
      )}

      {/* Transfer reason. */}
      {call.transferReason && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
          <h3 className="font-semibold text-purple-900 mb-1 flex items-center gap-1.5">
            <PhoneForwarded className="w-4 h-4" />
            {t("transferCardTitle")}
          </h3>
          <p className="text-sm text-purple-900/80">{call.transferReason}</p>
        </div>
      )}

      {/* Transcript. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-4">{t("transcriptTitle")}</h3>
        {transcript.length === 0 ? (
          <p className="text-sm text-gray-400 italic">{t("transcriptEmpty")}</p>
        ) : (
          <div className="space-y-2.5">
            {transcript.map((turn, i) => {
              const isCaller = (turn.role ?? "user") === "user";
              const raw = String(turn.text ?? "");
              // Synthetic session injections ride the "user" role fully wrapped
              // in parentheses (barge-in resume, wrap-up nudge, "(pressed 1)").
              // Keypad presses ARE caller actions — keep those; render the rest
              // as a neutral system note, never as caller speech.
              const synthetic = isCaller && /^\([\s\S]*\)$/.test(raw.trim()) && !/^\(pressed /.test(raw.trim());
              if (synthetic) {
                return (
                  <div key={i} className="flex justify-center">
                    <span className="text-[11px] italic text-gray-400 text-center max-w-[85%]">{raw.trim()}</span>
                  </div>
                );
              }
              const interrupted = /\[interrupted\]\s*$/i.test(raw);
              const text = raw.replace(/\s*\[interrupted\]\s*$/i, "");
              return (
                <div key={i} className={`flex ${isCaller ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      isCaller ? "bg-gray-100 text-gray-800 rounded-bl-sm" : "bg-amber-100 text-amber-950 rounded-br-sm"
                    }`}
                  >
                    <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${isCaller ? "text-gray-400" : "text-amber-600"}`}>
                      {isCaller ? t("callerLabel") : "Nabil"}
                    </div>
                    {text}
                    {interrupted && (
                      <span className="ml-1.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400 italic">
                        · {t("interruptedTag")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Caller history. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-3">{t("historyTitle")}</h3>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">{t("historyEmpty")}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {history.map((h) => (
              <Link
                key={h.id}
                href={`/admin/phone-ordering/calls/${h.id}`}
                className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition"
              >
                <span className="w-40 flex-shrink-0 text-xs text-gray-500">{formatTzDateTime(h.startedAt, tz)}</span>
                <span className="flex-1">
                  <OutcomeChip outcome={h.outcome} label={outcomeLabel(h.outcome)} />
                </span>
                <span className="w-14 text-right text-xs text-gray-500 tabular-nums">{formatDuration(h.durationSeconds)}</span>
                <span className="w-20 text-right text-sm font-semibold text-gray-900 tabular-nums">
                  {h.orderNumber && historyTotal.has(h.orderNumber) ? fmt(historyTotal.get(h.orderNumber)!) : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Superadmin-only cost/meta footer (real role, never the impersonated one). */}
      {user.role === "superadmin" && (call.model || call.tokensIn != null || call.costCents != null) && (
        <div className="text-[11px] text-gray-400 flex items-center gap-4 flex-wrap">
          {call.model && (
            <span>
              {t("metaModel")}: {call.model}
            </span>
          )}
          {(call.tokensIn != null || call.tokensOut != null) && (
            <span>
              {t("metaTokens")}: {call.tokensIn ?? 0} / {call.tokensOut ?? 0}
            </span>
          )}
          {call.costCents != null && (
            <span>
              {t("metaCost")}: {fmtCurrency(call.costCents / 100, "usd")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MoneyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-gray-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
