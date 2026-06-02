"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MessageSquare, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  REPORT_STATUSES,
  TYPE_LABEL, STATUS_LABEL, PRIORITY_LABEL,
  TYPE_BADGE, STATUS_BADGE, PRIORITY_BADGE,
  type ReportType, type ReportStatus, type ReportPriority,
} from "@/lib/reseller-reports-constants";

interface Comment {
  id: string;
  authorEmail: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface Report {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  priority: string;
  authorEmail: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
}

export function ReportDetailClient({
  access, report: initial,
}: {
  access: { canComment: boolean; canChangeStatus: boolean };
  report: Report;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const post = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      const { comment } = await r.json();
      setReport((prev) => ({
        ...prev,
        comments: [...prev.comments, {
          id: comment.id,
          authorEmail: comment.authorEmail,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
        }],
      }));
      setNewComment("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPosting(false);
    }
  };

  const changeStatus = async (next: ReportStatus) => {
    setSavingStatus(true);
    const prev = report.status;
    setReport((p) => ({ ...p, status: next }));
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error("Failed");
      toast.success(`Status → ${STATUS_LABEL[next]}`);
      router.refresh();
    } catch (e) {
      setReport((p) => ({ ...p, status: prev }));
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <Link
          href="/reseller-reports"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="w-4 h-4" /> Back to reports
        </Link>

        <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${TYPE_BADGE[report.type as ReportType] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                  {TYPE_LABEL[report.type as ReportType] ?? report.type}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_BADGE[report.status as ReportStatus] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                  {STATUS_LABEL[report.status as ReportStatus] ?? report.status}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORITY_BADGE[report.priority as ReportPriority] ?? "bg-gray-100 text-gray-700"}`}>
                  {PRIORITY_LABEL[report.priority as ReportPriority] ?? report.priority}
                </span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{report.title}</h1>
              <div className="text-xs text-gray-500 mt-1">
                by <strong>{report.authorName}</strong>
                {" · "}
                {new Date(report.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          {access.canChangeStatus && (
            <div className="mt-4 flex items-center gap-2 flex-wrap pt-4 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Change status</label>
              <select
                value={report.status}
                disabled={savingStatus}
                onChange={(e) => changeStatus(e.target.value as ReportStatus)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {REPORT_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              {savingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{report.body}</p>
          </div>
        </div>

        {/* Comments */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            Comments ({report.comments.length})
          </h2>
          {report.comments.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              No comments yet. Be the first to chime in.
            </div>
          ) : (
            <ul className="space-y-2">
              {report.comments.map((c) => (
                <li key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">
                    <strong className="text-gray-700">{c.authorName}</strong>
                    {" · "}
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}

          {access.canComment && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Add a comment</label>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                maxLength={5_000}
                placeholder="Update, follow-up question, repro steps…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 leading-relaxed"
              />
              <div className="flex items-center justify-end mt-2 gap-2">
                <button
                  onClick={post}
                  disabled={posting || !newComment.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white"
                >
                  {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Post comment
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
