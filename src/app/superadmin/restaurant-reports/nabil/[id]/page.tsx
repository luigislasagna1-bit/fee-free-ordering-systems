import Link from "next/link";
import { totalsMismatch } from "@/lib/voice/totals-mismatch";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, ListTree, Mic, PhoneCall, ShoppingBag } from "lucide-react";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { formatCurrency } from "@/lib/utils";
import { VOICE_CALL_REPORT_TOPIC_LABEL_EN } from "@/lib/voice/call-reports";
import CallTimeline from "@/app/admin/phone-ordering/calls/[id]/CallTimeline";
import NabilReportWorkClient from "./NabilReportWorkClient";
import OpenAsRestaurantButton from "./OpenAsRestaurantButton";

/**
 * Superadmin — one Nabil AI call report (Luigi 2026-08-16). Everything needed
 * to work it on ONE screen: the restaurant's words, the status + verdict, the
 * notes thread (both sides), then the evidence — recording, AI summary, the
 * order the engine placed (money included), quoted-vs-charged, the transcript,
 * and (?events=1) the full call timeline with the regression-case download.
 * English-only (superadmin convention).
 */
export const dynamic = "force-dynamic";

const MAX_TIMELINE_EVENTS = 2000;
type TranscriptTurn = { role?: string; text?: string; ts?: number | string; interrupted?: boolean };

function fmtWhen(d: Date, tz: string | null | undefined): string {
  try {
    return d.toLocaleString("en-CA", { timeZone: tz || undefined, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return d.toISOString();
  }
}
function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default async function NabilReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ events?: string | string[] }>;
}) {
  const staff = await requirePlatformStaff();
  if (!staff) return <div className="p-8 text-sm text-gray-500">Forbidden.</div>;
  const { id } = await params;
  const sp = await searchParams;
  const showEvents = (Array.isArray(sp.events) ? sp.events[0] : sp.events) === "1";

  const report = await prisma.voiceCallReport.findUnique({
    where: { id },
    include: {
      restaurant: { select: { id: true, name: true, slug: true, timezone: true, currency: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 500 },
      call: true,
    },
  });
  if (!report) notFound();
  const call = report.call;
  const tz = report.restaurant.timezone;
  const money = (n: number) => formatCurrency(n, report.restaurant.currency);

  const [order, events, otherReports] = await Promise.all([
    call.orderNumber
      ? prisma.order.findFirst({
          where: { restaurantId: report.restaurant.id, orderNumber: call.orderNumber },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            type: true,
            subtotal: true,
            taxAmount: true,
            deliveryFee: true,
            promoDiscount: true,
            couponDiscount: true,
            total: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true, variantName: true, quantity: true, subtotal: true, notes: true, modifiers: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve(null),
    showEvents
      ? prisma.voiceCallEvent.findMany({
          where: { callId: call.id },
          orderBy: { seq: "asc" },
          take: MAX_TIMELINE_EVENTS,
          select: { seq: true, ts: true, turn: true, type: true, payload: true, latencyMs: true, cartHash: true },
        })
      : Promise.resolve([]),
    prisma.voiceCallReport.findMany({
      where: { callId: call.id, id: { not: report.id } },
      select: { id: true, topic: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const transcript: TranscriptTurn[] = Array.isArray(call.transcript) ? (call.transcript as TranscriptTurn[]) : [];
  const topic = (VOICE_CALL_REPORT_TOPIC_LABEL_EN as Record<string, string>)[report.topic] ?? report.topic;
  const mismatch = totalsMismatch(call.quotedTotal, call.chargedTotal); // one tolerance platform-wide (> half a cent)
  const latency = (call.latency && typeof call.latency === "object" ? (call.latency as Record<string, unknown>) : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const ttft = (latency.ttftMs && typeof latency.ttftMs === "object" ? (latency.ttftMs as Record<string, unknown>) : {}) as Record<string, unknown>;

  return (
    <div className="max-w-5xl space-y-5 pb-10">
      <div>
        <Link href="/superadmin/restaurant-reports/nabil" className="text-sm text-gray-500 hover:text-gray-900">
          &larr; Nabil AI reports
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {report.urgent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  <AlertTriangle className="w-3.5 h-3.5" /> URGENT
                </span>
              )}
              {topic}
            </h1>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
              <Link href={`/superadmin/restaurants/${report.restaurant.id}`} className="font-medium text-gray-800 hover:underline">
                {report.restaurant.name}
              </Link>
              <span>reported {fmtWhen(report.createdAt, tz)}</span>
              <span>by {report.reporterName || report.reporterEmail || "—"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={showEvents ? `/superadmin/restaurant-reports/nabil/${report.id}` : `/superadmin/restaurant-reports/nabil/${report.id}?events=1`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ListTree className="w-3.5 h-3.5" /> {showEvents ? "Hide call timeline" : "Show call timeline"}
            </Link>
            <OpenAsRestaurantButton restaurantId={report.restaurant.id} callId={call.id} />
          </div>
        </div>
      </div>

      {/* The report itself + status/verdict + thread (client: live edits). */}
      <NabilReportWorkClient
        report={{
          id: report.id,
          status: report.status,
          resolution: report.resolution,
          description: report.description,
          urgent: report.urgent,
          createdAt: report.createdAt.toISOString(),
          comments: report.comments.map((c) => ({
            id: c.id,
            authorRole: c.authorRole,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
          })),
        }}
        restaurantName={report.restaurant.name}
        staffName={staff.name || staff.email || "Fee Free team"}
      />

      {otherReports.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This call has {otherReports.length} other report{otherReports.length === 1 ? "" : "s"}:{" "}
          {otherReports.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/superadmin/restaurant-reports/nabil/${r.id}`} className="underline">
                {(VOICE_CALL_REPORT_TOPIC_LABEL_EN as Record<string, string>)[r.topic] ?? r.topic} ({r.status})
              </Link>
            </span>
          ))}
        </div>
      )}

      {/* ── Evidence ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <PhoneCall className="w-4 h-4 text-emerald-600" /> The call
        </h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Started</dt>
            <dd className="text-gray-900">{fmtWhen(call.startedAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Duration</dt>
            <dd className="text-gray-900">{fmtDur(call.durationSeconds)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Outcome</dt>
            <dd className="text-gray-900">
              {call.outcome ?? "—"}
              {call.transferReason ? <span className="text-gray-500"> · transferred: {call.transferReason}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Caller</dt>
            <dd className="text-gray-900 font-mono">{call.fromNumber ? `…${call.fromNumber.slice(-4)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Sentiment / language</dt>
            <dd className="text-gray-900">
              {call.sentiment ?? "—"} / {call.language ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Quoted → charged</dt>
            <dd className={mismatch ? "text-red-700 font-semibold" : "text-gray-900"}>
              {call.quotedTotal != null ? money(call.quotedTotal) : "—"} → {call.chargedTotal != null ? money(call.chargedTotal) : "—"}
              {mismatch ? " ⚠ mismatch" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Model · cost</dt>
            <dd className="text-gray-900">
              {call.model ?? "—"} · {call.costCents != null ? `${(call.costCents / 100).toFixed(2)} $` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Latency (first token p50 / p95)</dt>
            <dd className="text-gray-900">
              {num(ttft.p50) != null ? `${num(ttft.p50)} ms` : "—"} / {num(ttft.p95) != null ? `${num(ttft.p95)} ms` : "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-3 text-[11px] text-gray-500 font-mono flex items-center gap-x-4 gap-y-1 flex-wrap">
          <span>agent {call.agentVersion ?? "—"}</span>
          <span>prompt {call.promptVersion ?? "—"}</span>
          <span>tools {call.toolsVersion ?? "—"}</span>
          <span>menu {call.menuSnapshotHash ? call.menuSnapshotHash.slice(0, 8) : "—"}</span>
          <span>callSid {call.callSid}</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <Mic className="w-4 h-4 text-emerald-600" /> Recording
        </h3>
        {call.recordingUrl ? (
          <audio controls preload="none" className="w-full" src={`/api/superadmin/restaurant-reports/nabil/${report.id}/recording`} />
        ) : (
          <p className="text-sm text-gray-400 italic">No recording on this call.</p>
        )}
        {call.summary && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">AI summary</div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{call.summary}</p>
          </div>
        )}
      </div>

      {order && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-emerald-600" /> Order {order.orderNumber}
            <span className="text-xs font-normal text-gray-500">
              · {order.type} · {order.status}
            </span>
            <Link href={`/superadmin/orders?q=${encodeURIComponent(order.orderNumber)}`} className="ml-auto text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
              Open in Orders <ExternalLink className="w-3 h-3" />
            </Link>
          </h3>
          <ul className="divide-y divide-gray-100 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="py-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-gray-900">
                    {it.quantity}× {it.name}
                    {it.variantName ? <span className="text-gray-500"> ({it.variantName})</span> : null}
                  </div>
                  {it.modifiers.length > 0 && <div className="text-xs text-gray-500">{it.modifiers.map((m) => m.name).join(", ")}</div>}
                  {it.notes && <div className="text-xs text-amber-700">Note: {it.notes}</div>}
                </div>
                <div className="text-gray-700 whitespace-nowrap">{money(it.subtotal)}</div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 text-sm space-y-1 max-w-xs ml-auto">
            <div className="flex justify-between">
              <dt className="text-gray-500">Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Delivery</dt>
                <dd>{money(order.deliveryFee)}</dd>
              </div>
            )}
            {(order.promoDiscount ?? 0) + (order.couponDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount</dt>
                <dd>−{money((order.promoDiscount ?? 0) + (order.couponDiscount ?? 0))}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Tax</dt>
              <dd>{money(order.taxAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-1">
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Transcript</h3>
        {transcript.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No transcript on this call.</p>
        ) : (
          <div className="space-y-2">
            {transcript.map((tr, i) => {
              const isAgent = tr.role === "assistant" || tr.role === "agent" || tr.role === "nabil";
              return (
                <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${isAgent ? "bg-gray-100 text-gray-800" : "bg-emerald-600 text-white"}`}>
                    <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${isAgent ? "text-gray-400" : "text-emerald-100"}`}>
                      {isAgent ? "Nabil" : "Caller"}
                      {tr.interrupted ? " · interrupted" : ""}
                    </div>
                    <div className="whitespace-pre-wrap">{tr.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEvents && (
        <CallTimeline
          events={events}
          versions={{
            agentVersion: call.agentVersion,
            promptVersion: call.promptVersion,
            toolsVersion: call.toolsVersion,
            model: call.model,
            menuSnapshotHash: call.menuSnapshotHash,
            eventCount: call.eventCount,
          }}
          callId={call.id}
          interruptedTag="interrupted"
          regressionHref={`/api/superadmin/restaurant-reports/nabil/${report.id}/regression-case`}
        />
      )}
    </div>
  );
}
