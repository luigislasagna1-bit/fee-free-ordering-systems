"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessageSquare, RefreshCw } from "lucide-react";
import {
  VOICE_CALL_REPORT_STATUSES,
  VOICE_CALL_REPORT_STATUS_LABEL_EN,
  VOICE_CALL_REPORT_TOPIC_LABEL_EN,
  type VoiceCallReportStatus,
} from "@/lib/voice/call-reports";

type Row = {
  id: string;
  topic: string;
  urgent: boolean;
  status: string;
  description: string;
  reporterName: string | null;
  createdAt: string;
  updatedAt: string;
  restaurant: { id: string; name: string; slug: string };
  call: { id: string; startedAt: string; durationSeconds: number | null; outcome: string | null; orderNumber: string | null; fromNumber: string | null };
  _count: { comments: number };
};

const FILTERS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  ...VOICE_CALL_REPORT_STATUSES.map((s) => ({ key: s, label: VOICE_CALL_REPORT_STATUS_LABEL_EN[s] })),
  { key: "all", label: "All" },
];

export function statusChipClass(status: string): string {
  switch (status as VoiceCallReportStatus) {
    case "NEW":
      return "bg-rose-100 text-rose-700";
    case "INVESTIGATING":
      return "bg-amber-100 text-amber-700";
    case "NEEDS_INFO":
      return "bg-sky-100 text-sky-700";
    case "FIXED":
      return "bg-emerald-100 text-emerald-700";
    case "WONT_FIX":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NabilReportsListClient() {
  const [filter, setFilter] = useState("open");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch is a plain promise chain (no synchronous setState in the effect
  // body); `tick` re-runs it for Refresh, `filter` for the status tabs.
  const [tick, setTick] = useState(0);
  const [cursorReq, setCursorReq] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ status: filter, take: "50" });
    if (cursorReq) qs.set("cursor", cursorReq);
    fetch(`/api/superadmin/restaurant-reports/nabil?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { reports: Row[]; nextCursor: string | null; counts: Record<string, number> };
      })
      .then((j) => {
        if (cancelled) return;
        setRows((prev) => (cursorReq ? [...prev, ...j.reports] : j.reports));
        setNextCursor(j.nextCursor);
        setCounts(j.counts);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, cursorReq, tick]);

  const load = useCallback((cursor: string | null) => {
    setLoading(true);
    setCursorReq(cursor);
    setTick((n) => n + 1);
  }, []);

  const openCount = (counts.NEW ?? 0) + (counts.INVESTIGATING ?? 0) + (counts.NEEDS_INFO ?? 0);
  const countFor = (key: string) =>
    key === "open" ? openCount : key === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[key] ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setLoading(true);
              setCursorReq(null);
              setFilter(f.key);
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
              filter === f.key ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 ${filter === f.key ? "text-emerald-100" : "text-gray-400"}`}>{countFor(f.key)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => load(null)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Reported</th>
              <th className="px-4 py-2.5">Restaurant</th>
              <th className="px-4 py-2.5">Issue</th>
              <th className="px-4 py-2.5">Call</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nothing here — no restaurant has reported a call in this state.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={`hover:bg-gray-50 ${r.urgent && r.status !== "FIXED" && r.status !== "WONT_FIX" ? "bg-red-50/40" : ""}`}>
                <td className="px-4 py-3 whitespace-nowrap align-top">
                  <Link href={`/superadmin/restaurant-reports/nabil/${r.id}`} className="font-medium text-gray-900 hover:underline">
                    {fmtWhen(r.createdAt)}
                  </Link>
                  <div className="text-xs text-gray-400">{r.reporterName || "—"}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-gray-900">{r.restaurant.name}</div>
                  <div className="text-xs text-gray-400">{r.restaurant.slug}</div>
                </td>
                <td className="px-4 py-3 align-top max-w-md">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.urgent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        <AlertTriangle className="w-3 h-3" /> URGENT
                      </span>
                    )}
                    <span className="font-medium text-gray-800">{(VOICE_CALL_REPORT_TOPIC_LABEL_EN as Record<string, string>)[r.topic] ?? r.topic}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.description}</div>
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-gray-600">
                  <div>{fmtWhen(r.call.startedAt)}</div>
                  <div className="text-gray-400">
                    {r.call.durationSeconds != null ? `${Math.floor(r.call.durationSeconds / 60)}m ${r.call.durationSeconds % 60}s` : "—"} · {r.call.outcome ?? "—"}
                    {r.call.orderNumber ? ` · ${r.call.orderNumber}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChipClass(r.status)}`}>
                    {(VOICE_CALL_REPORT_STATUS_LABEL_EN as Record<string, string>)[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-right text-xs text-gray-500 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> {r._count.comments}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => load(nextCursor)}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
