"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageSquare, Send } from "lucide-react";
import {
  VOICE_CALL_REPORT_STATUSES,
  VOICE_CALL_REPORT_STATUS_LABEL_EN,
  type VoiceCallReportStatus,
} from "@/lib/voice/call-reports";
import { fmtWhen, statusChipClass } from "../NabilReportsListClient";

type Comment = { id: string; authorRole: string; authorName: string | null; authorEmail: string; body: string; createdAt: string };
type Report = { id: string; status: string; resolution: string | null; description: string; urgent: boolean; createdAt: string; comments: Comment[] };

/**
 * The working surface of one report: the restaurant's words, status + the
 * platform's verdict (saved with one button; the reporter is emailed on
 * change), and the notes thread both sides read. Optimistic where cheap,
 * router.refresh() after each write so the server-rendered evidence stays
 * the source of truth.
 */
export default function NabilReportWorkClient({ report, restaurantName, staffName }: { report: Report; restaurantName: string; staffName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<VoiceCallReportStatus>((report.status as VoiceCallReportStatus) || "NEW");
  const [resolution, setResolution] = useState(report.resolution ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<Comment[]>(report.comments);
  const [error, setError] = useState<string | null>(null);

  const dirty = status !== report.status || (resolution.trim() || "") !== (report.resolution ?? "");

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/superadmin/restaurant-reports/nabil/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution: resolution.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    const body = note.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/restaurant-reports/nabil/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { comment: Comment };
      setComments((c) => [...c, j.comment]);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Left: what the restaurant said + verdict controls */}
      <div className="lg:col-span-3 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{restaurantName} wrote</div>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{report.description}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VoiceCallReportStatus)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              {VOICE_CALL_REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VOICE_CALL_REPORT_STATUS_LABEL_EN[s]}
                </option>
              ))}
            </select>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChipClass(report.status)}`}>
              now: {(VOICE_CALL_REPORT_STATUS_LABEL_EN as Record<string, string>)[report.status] ?? report.status}
            </span>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Answer to the restaurant (the verdict)</label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Plain words the owner will read on the call page: what went wrong, what changed, what to expect."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> {saving ? "Saving…" : "Save status & answer"}
            </button>
            {saved && !dirty && <span className="text-xs text-emerald-700">Saved — the reporter has been emailed.</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </div>

      {/* Right: the thread */}
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-emerald-600" /> Notes ({comments.length})
        </h3>
        <div className="flex-1 space-y-3 max-h-96 overflow-y-auto pr-1">
          {comments.length === 0 && <p className="text-sm text-gray-400 italic">No notes yet. Ask a question or say what you found — the restaurant sees it on the call page.</p>}
          {comments.map((c) => {
            const platform = c.authorRole === "platform";
            return (
              <div key={c.id} className={`rounded-lg px-3 py-2 text-sm ${platform ? "bg-emerald-50 border border-emerald-100" : "bg-gray-50 border border-gray-100"}`}>
                <div className="text-[11px] text-gray-500 mb-0.5">
                  <span className="font-semibold text-gray-700">{platform ? c.authorName || "Fee Free team" : `${restaurantName} — ${c.authorName || c.authorEmail}`}</span> · {fmtWhen(c.createdAt)}
                </div>
                <div className="whitespace-pre-wrap text-gray-900">{c.body}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`Reply as ${staffName}…`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={send}
              disabled={sending || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
