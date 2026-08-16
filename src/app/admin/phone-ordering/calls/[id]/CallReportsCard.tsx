"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { AlertTriangle, Flag, MessageSquare, Send } from "lucide-react";
import type { VoiceCallReportStatus, VoiceCallReportTopic } from "@/lib/voice/call-reports";

export type CallReportView = {
  id: string;
  topic: string;
  urgent: boolean;
  description: string;
  status: string;
  resolution: string | null;
  createdAtLabel: string;
  comments: { id: string; authorRole: string; authorName: string | null; body: string; createdAtLabel: string }[];
};

function statusClass(status: string): string {
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

/**
 * The reports a restaurant filed on this call, with the platform's status,
 * verdict and the notes thread — and a reply box, so a fix is worked
 * together from the same page the owner reported it on. Dates arrive
 * pre-formatted (restaurant timezone) from the server page.
 */
export default function CallReportsCard({ callId, reports }: { callId: string; reports: CallReportView[] }) {
  const t = useTranslations("admin.phoneOrderingPage.callDetail.report");
  if (reports.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
        <Flag className="w-4 h-4 text-emerald-600" /> {t("cardTitle")}
      </h3>
      <div className="space-y-4">
        {reports.map((r) => (
          <ReportItem key={r.id} callId={callId} report={r} />
        ))}
      </div>
    </div>
  );
}

function ReportItem({ callId, report }: { callId: string; report: CallReportView }) {
  const t = useTranslations("admin.phoneOrderingPage.callDetail.report");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState(report.comments);

  const send = async () => {
    const body = note.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/phone-ordering/calls/${callId}/report/${report.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { comment: { id: string; authorRole: string; authorName: string | null; body: string; createdAt: string } };
      setComments((c) => [...c, { ...j.comment, createdAtLabel: t("justNow") }]);
      setNote("");
      toast.success(t("replySentToast"));
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  const topicLabel = t(`topics.${report.topic as VoiceCallReportTopic}`);
  const statusLabel = t(`status.${report.status as VoiceCallReportStatus}`);

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {report.urgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
              <AlertTriangle className="w-3 h-3" /> {t("urgentBadge")}
            </span>
          )}
          <span className="font-medium text-gray-900">{topicLabel}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(report.status)}`}>{statusLabel}</span>
        </div>
        <span className="text-xs text-gray-500">{t("reportedAt", { time: report.createdAtLabel })}</span>
      </div>
      <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{report.description}</p>

      {report.resolution && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">{t("resolutionTitle")}</div>
          <p className="text-sm text-emerald-900 whitespace-pre-wrap">{report.resolution}</p>
        </div>
      )}

      <div className="mt-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" /> {t("threadTitle")} ({comments.length})
        </div>
        {comments.length === 0 && <p className="text-xs text-gray-400 italic">{t("threadEmpty")}</p>}
        <div className="space-y-2">
          {comments.map((c) => {
            const platform = c.authorRole === "platform";
            return (
              <div key={c.id} className={`rounded-lg px-3 py-2 text-sm ${platform ? "bg-white border border-emerald-100" : "bg-white border border-gray-100"}`}>
                <div className="text-[11px] text-gray-500 mb-0.5">
                  <span className="font-semibold text-gray-700">{platform ? t("fromPlatform") : c.authorName || t("fromYou")}</span> · {c.createdAtLabel}
                </div>
                <div className="whitespace-pre-wrap text-gray-900">{c.body}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t("replyPlaceholder")}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !note.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> {t("replySend")}
          </button>
        </div>
      </div>
    </div>
  );
}
