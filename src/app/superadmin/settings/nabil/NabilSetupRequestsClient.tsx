"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ClipboardList, RefreshCw, RotateCcw } from "lucide-react";
import type { VoiceSetupRequestRow } from "@/lib/voice/setup-request";

/**
 * Superadmin › Nabil Phone Lines — the CONCIERGE ACTIVATION queue (English-only
 * by policy — superadmin surface). Every restaurant that subscribed to Nabil AI
 * and has no line yet filed one of these; the platform provisions the number
 * by hand (script + Twilio), then marks the request done. The dashboard on the
 * restaurant's side flips to live when its VoiceNumber row exists — "Mark done"
 * is bookkeeping, and the row says loudly when it is pressed before a line exists.
 */
export function NabilSetupRequestsClient() {
  const [open, setOpen] = useState<VoiceSetupRequestRow[] | null>(null);
  const [done, setDone] = useState<VoiceSetupRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/voice-setup-requests", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const body = (await res.json()) as { open: VoiceSetupRequestRow[]; done: VoiceSetupRequestRow[] };
      setOpen(body.open);
      setDone(body.done);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (row: VoiceSetupRequestRow, status: "DONE" | "NEW") => {
    if (status === "DONE" && !row.line) {
      if (!window.confirm(`${row.restaurant.name} has NO VoiceNumber row yet — their dashboard will keep saying "we're setting up your line" until one exists.\n\nMark the request done anyway?`)) return;
    }
    setBusy(row.id);
    try {
      const res = await fetch("/api/superadmin/voice-setup-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(status === "DONE" ? `Marked done — ${row.restaurant.name}` : `Re-opened — ${row.restaurant.name}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    }
    setBusy(null);
  };

  const Row = ({ row }: { row: VoiceSetupRequestRow }) => {
    const p = row.payload;
    const isOpen = row.status === "NEW";
    return (
      <tr className="align-top">
        <td className="px-3 py-3">
          <div className="font-medium text-gray-900">{row.restaurant.name}</div>
          <div className="text-xs text-gray-400">{row.restaurant.slug} · {row.restaurant.timezone ?? "—"}</div>
          <div className="text-xs text-gray-500 mt-0.5">{row.restaurant.email ?? "—"} · {row.restaurant.phone ?? "—"}</div>
          <div className="mt-1">
            {row.line ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                line {row.line.phoneNumber} ({row.line.status})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                no line yet
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-xs">
          {p ? (
            <div className="space-y-0.5">
              <div><span className="text-gray-500">Wants:</span> <strong>{p.mode === "forward" ? "forward their number to Nabil" : "a NEW Nabil number"}</strong></div>
              <div><span className="text-gray-500">Callers dial today:</span> <span className="font-mono">{p.currentNumber}</span></div>
              <div><span className="text-gray-500">Transfer to staff:</span> <span className="font-mono">{p.transferNumber}</span></div>
              <div><span className="text-gray-500">Greeting name:</span> “{p.greetingName}”</div>
              {p.notes && <div className="text-gray-700 whitespace-pre-wrap"><span className="text-gray-500">Notes:</span> {p.notes}</div>}
              {p.submittedBy && <div className="text-gray-400">filed by {p.submittedBy}</div>}
            </div>
          ) : (
            <span className="text-rose-600">payload unreadable</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
          <div>filed {new Date(row.createdAt).toLocaleString()}</div>
          {row.updatedAt !== row.createdAt && <div>updated {new Date(row.updatedAt).toLocaleString()}</div>}
          {row.doneAt && <div className="text-emerald-700">done {new Date(row.doneAt).toLocaleString()}</div>}
        </td>
        <td className="px-3 py-3 text-right whitespace-nowrap">
          {isOpen ? (
            <button
              onClick={() => void setStatus(row, "DONE")}
              disabled={busy === row.id}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {busy === row.id ? "Saving…" : "Mark done"}
            </button>
          ) : (
            <button
              onClick={() => void setStatus(row, "NEW")}
              disabled={busy === row.id}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-open
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-600" /> Line setup requests
            {open && open.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{open.length} open</span>
            )}
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Concierge activation: a restaurant that subscribes to Nabil AI files how it wants its line set up, and we
            provision the number by hand <strong>within one business day</strong> (script + Twilio; the row on the
            table below appears once the VoiceNumber exists). Then press <strong>Mark done</strong>. Their dashboard
            flips from &ldquo;we&apos;re setting up your line&rdquo; to live when the VoiceNumber row exists — not on this button.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Restaurant</th>
              <th className="text-left px-3 py-2">What they asked for</th>
              <th className="text-left px-3 py-2">When</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && open === null && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {open && open.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">No open setup requests — every subscriber has a line.</td>
              </tr>
            )}
            {open?.map((row) => <Row key={row.id} row={row} />)}
            {showDone && done.map((row) => <Row key={row.id} row={row} />)}
          </tbody>
        </table>
      </div>
      {done.length > 0 && (
        <button onClick={() => setShowDone((v) => !v)} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
          {showDone ? "Hide" : "Show"} {done.length} completed request{done.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
