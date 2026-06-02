"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, MessageSquare, Loader2, ThumbsUp, CheckCircle2, XCircle,
  Activity, Star, ImagePlus, X as XIcon, Sparkles, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  REPORT_STATUSES, VERIFY_QUORUM,
  TYPE_LABEL, STATUS_LABEL, PRIORITY_LABEL,
  TYPE_BADGE, STATUS_BADGE, PRIORITY_BADGE,
  ACTIVITY_LABEL,
  type ReportType, type ReportStatus, type ReportPriority,
  type VerificationVote, type ActivityKind,
} from "@/lib/reseller-reports-constants";

interface Comment {
  id: string;
  authorEmail: string;
  authorName: string;
  body: string;
  imageUrls: string[];
  createdAt: string;
}

interface Verification {
  id: string;
  voterEmail: string;
  voterName: string;
  vote: string;
  isReporter: boolean;
  updatedAt: string;
}

interface Upvote {
  id: string;
  voterEmail: string;
  voterName: string;
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  actorEmail: string;
  actorName: string;
  kind: string;
  detail: string | null;
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
  reporterEmail: string;
  reporterName: string;
  filedOnBehalf: boolean;
  imageUrls: string[];
  /** SUPERADMIN-ONLY AI triage note (markdown). null for resellers (never
   *  sent to their browser) or when not yet generated. */
  aiAnalysis: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  verifications: Verification[];
  upvotes: Upvote[];
  activity: ActivityEntry[];
  myUpvoteId: string | null;
  myVerificationVote: string | null;
}

export function ReportDetailClient({
  access, report: initial, myEmail, myName,
}: {
  access: { canComment: boolean; canChangeStatus: boolean };
  report: Report;
  myEmail: string;
  myName: string;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [newComment, setNewComment] = useState("");
  /** URLs of any screenshots the user has attached to the in-progress
   *  comment. Each entry is the URL returned by /api/reseller-reports/upload. */
  const [newCommentImages, setNewCommentImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [busyUpvote, setBusyUpvote] = useState(false);
  const [busyVerify, setBusyVerify] = useState(false);
  // Reporter reassignment (SA only). Prefilled with the current
  // on-behalf reporter when there is one; blank otherwise.
  const [reporterNameInput, setReporterNameInput] = useState(
    report.filedOnBehalf ? report.reporterName : "",
  );
  const [reporterEmailInput, setReporterEmailInput] = useState(
    report.filedOnBehalf ? report.reporterEmail : "",
  );
  const [savingReporter, setSavingReporter] = useState(false);
  const [shippingFix, setShippingFix] = useState(false);
  // AI triage note (superadmin-only). Starts with whatever the server sent
  // (null for resellers, or null if not generated yet).
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(initial.aiAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState(false);

  /** Upload one or more image files to /api/reseller-reports/upload.
   *  Returns the URL list — caller decides whether to merge into the
   *  in-progress comment, a new report, etc. Shows a single toast on
   *  any failure (we don't surface per-file errors — most failures are
   *  "wrong type" or "too large" and the user can re-attach). */
  const uploadImages = async (files: FileList | File[]): Promise<string[]> => {
    const arr = Array.from(files);
    if (arr.length === 0) return [];
    setUploadingImage(true);
    const uploaded: string[] = [];
    try {
      for (const file of arr) {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/reseller-reports/upload", {
          method: "POST",
          body: form,
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          toast.error(d.error || "Upload failed");
          continue;
        }
        const { url } = await r.json();
        if (typeof url === "string") uploaded.push(url);
      }
    } finally {
      setUploadingImage(false);
    }
    return uploaded;
  };

  // Verification tally — counts WORKING vs NOT_WORKING, and surfaces
  // the reporter's vote (if any) so the UI can emphasise "the person
  // who filed it agrees the fix is good".
  const tally = useMemo(() => {
    let working = 0;
    let notWorking = 0;
    let reporterVote: string | null = null;
    let reporterVoterName: string | null = null;
    for (const v of report.verifications) {
      if (v.vote === "WORKING") working++;
      if (v.vote === "NOT_WORKING") notWorking++;
      if (v.isReporter) {
        reporterVote = v.vote;
        reporterVoterName = v.voterName;
      }
    }
    return { working, notWorking, reporterVote, reporterVoterName };
  }, [report.verifications]);

  // ─── Status change (SA only) ───────────────────────────────────────
  const changeStatus = async (next: ReportStatus) => {
    if (next === report.status) return;
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

  // ─── AI triage analysis (SA only) ──────────────────────────────────
  // Generates the analysis on first superadmin view (and backfills old
  // reports the same way). Idempotent server-side, so a double-fire just
  // returns the cached note.
  const runAnalysis = async (regenerate = false) => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Analysis failed");
      setAiAnalysis(d.analysis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (access.canChangeStatus && !aiAnalysis && !analyzing && !aiError) {
      void runAnalysis(false);
    }
    // Run once on mount for an un-analyzed report. Deliberately not
    // re-firing on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Delete a comment (SA only) ─────────────────────────────────────
  const deleteComment = async (commentId: string) => {
    if (!window.confirm("Delete this comment? This can't be undone.")) return;
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setReport((p) => ({ ...p, comments: p.comments.filter((c) => c.id !== commentId) }));
      toast.success("Comment deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // ─── Delete the whole report (SA only) ──────────────────────────────
  const deleteReport = async () => {
    if (!window.confirm("Delete this entire report and all its comments? This can't be undone.")) return;
    setDeletingReport(true);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      toast.success("Report deleted");
      router.push("/reseller-reports");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setDeletingReport(false);
    }
  };

  // ─── Mark fix shipped (SA only) ─────────────────────────────────────
  // Moves the report to In Testing and emails the reporter + upvoters to
  // verify. Does NOT close it — that still needs human verification.
  const shipFix = async () => {
    const note = window.prompt(
      "Optional note to the reporter (e.g. a version tag or 'try a hard refresh'). Leave blank to skip:",
      "",
    );
    // prompt returns null if the user cancels — abort the whole action.
    if (note === null) return;
    setShippingFix(true);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/ship-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed");
      toast.success(`Marked In Testing · notified ${d.notified ?? 0} ${d.notified === 1 ? "person" : "people"}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setShippingFix(false);
    }
  };

  // ─── Reporter reassignment (SA only) ───────────────────────────────
  // `clear` reverts attribution to the report's author. Otherwise the
  // typed name/email become the "reported by" credit.
  const saveReporter = async (clear = false) => {
    const email = clear ? "" : reporterEmailInput.trim();
    const name = clear ? "" : reporterNameInput.trim();
    if (!clear && !email) {
      toast.error("Enter the reporter's email (or use Clear)");
      return;
    }
    setSavingReporter(true);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedByEmail: email, reportedByName: name }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      if (clear) {
        setReporterNameInput("");
        setReporterEmailInput("");
        toast.success("Reporter reset to author");
      } else {
        toast.success("Reporter updated");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingReporter(false);
    }
  };

  // ─── Comments ───────────────────────────────────────────────────────
  const post = async () => {
    // Allow image-only comments — sometimes a screenshot says it all.
    if (!newComment.trim() && newCommentImages.length === 0) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment, imageUrls: newCommentImages }),
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
          imageUrls: newCommentImages,
          createdAt: comment.createdAt,
        }],
      }));
      setNewComment("");
      setNewCommentImages([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPosting(false);
    }
  };

  // ─── Upvote / "me too" ──────────────────────────────────────────────
  const toggleUpvote = async () => {
    setBusyUpvote(true);
    const wasUpvoted = !!report.myUpvoteId;
    try {
      const r = await fetch(`/api/reseller-reports/${report.id}/upvote`, {
        method: wasUpvoted ? "DELETE" : "POST",
      });
      if (!r.ok) throw new Error("Failed");
      // Refetch the page to pull fresh tallies + activity. Simpler than
      // mutating local state for every micro-interaction.
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyUpvote(false);
    }
  };

  // ─── Verification poll ─────────────────────────────────────────────
  const castVerify = async (vote: VerificationVote | null) => {
    setBusyVerify(true);
    try {
      if (vote === null) {
        const r = await fetch(`/api/reseller-reports/${report.id}/verify`, { method: "DELETE" });
        if (!r.ok) throw new Error("Failed");
        toast.success("Verification withdrawn");
      } else {
        const r = await fetch(`/api/reseller-reports/${report.id}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote }),
        });
        if (!r.ok) throw new Error("Failed");
        toast.success(vote === "WORKING" ? "Marked Confirmed Working" : "Marked Still Not Working");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyVerify(false);
    }
  };

  const iAmReporter = report.reporterEmail.toLowerCase() === myEmail.trim().toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <Link
          href="/reseller-reports"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="w-4 h-4" /> Back to reports
        </Link>

        {/* ── Report header ─────────────────────────────────────────── */}
        <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
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

          {/* Reporter line — prominent. When filed-on-behalf, also note
              who actually filed it (the form-submitter) in a subtitle. */}
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-sm text-gray-700">
              Reported by <strong className="text-gray-900">{report.reporterName}</strong>
            </span>
            <span className="text-xs text-gray-400">
              · {new Date(report.createdAt).toLocaleString()}
            </span>
          </div>
          {report.filedOnBehalf && (
            <div className="text-[11px] text-gray-500 mt-1 italic">
              Filed on their behalf by {report.authorName}
            </div>
          )}

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
              {(report.status === "NEW" || report.status === "IN_PROGRESS") && (
                <button
                  onClick={shipFix}
                  disabled={shippingFix}
                  title="Move to In Testing and email the reporter + upvoters to verify"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white"
                >
                  {shippingFix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Mark fix shipped
                </button>
              )}
            </div>
          )}

          {/* Awaiting-verification banner — visible to everyone while the
              report is In Testing. Surfaces the human-gated close rule. */}
          {report.status === "IN_TESTING" && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-900">
                🧪 <strong>Awaiting verification.</strong>{" "}
                {tally.working} of {VERIFY_QUORUM} confirmations needed to auto-close.
                {tally.notWorking > 0 && " A “still not working” vote is currently blocking auto-close."}
                {access.canChangeStatus && " You can also set it to Fixed manually above."}
              </div>
            </div>
          )}

          {access.canChangeStatus && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Reassign reporter
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-2">
                Credit the person who actually reported this. Leave blank and Clear to attribute it to {report.authorName}.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={reporterNameInput}
                  onChange={(e) => setReporterNameInput(e.target.value)}
                  disabled={savingReporter}
                  placeholder="Reporter name"
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white w-40"
                />
                <input
                  type="email"
                  value={reporterEmailInput}
                  onChange={(e) => setReporterEmailInput(e.target.value)}
                  disabled={savingReporter}
                  placeholder="reporter@email.com"
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white w-52"
                />
                <button
                  onClick={() => saveReporter(false)}
                  disabled={savingReporter}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white"
                >
                  {savingReporter && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save
                </button>
                {report.filedOnBehalf && (
                  <button
                    onClick={() => saveReporter(true)}
                    disabled={savingReporter}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{report.body}</p>
            {report.imageUrls.length > 0 && (
              <ScreenshotStrip urls={report.imageUrls} onOpen={(u) => setLightboxUrl(u)} />
            )}
          </div>

          {access.canChangeStatus && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={deleteReport}
                disabled={deletingReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                title="Permanently delete this report and all its comments"
              >
                {deletingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete report
              </button>
            </div>
          )}
        </div>

        {/* ── AI triage analysis (SUPERADMIN ONLY, internal) ────────── */}
        {access.canChangeStatus && (
          <div className="mt-4 bg-indigo-50/60 rounded-2xl border border-indigo-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold text-indigo-900">AI Analysis</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                  Internal · superadmin only
                </span>
              </div>
              {aiAnalysis && !analyzing && (
                <button
                  onClick={() => runAnalysis(true)}
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  title="Re-run the analysis from scratch"
                >
                  Re-analyze
                </button>
              )}
            </div>
            {analyzing ? (
              <div className="flex items-center gap-2 text-sm text-indigo-700 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing this report…
              </div>
            ) : aiError ? (
              <div className="text-sm text-rose-700">
                {aiError}{" "}
                <button onClick={() => runAnalysis(false)} className="underline font-semibold">
                  Retry
                </button>
              </div>
            ) : aiAnalysis ? (
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
            ) : (
              <div className="text-sm text-gray-500">Not analyzed yet.</div>
            )}
          </div>
        )}

        {/* ── Engagement panel: upvote + verification ──────────────── */}
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {/* "Me too" upvote */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">Me too</div>
                <div className="text-xl font-bold text-emerald-600 mt-0.5">
                  {report.upvotes.length}
                  <span className="text-xs font-normal text-gray-500 ml-1">
                    {report.upvotes.length === 1 ? "person hit this" : "people hit this"}
                  </span>
                </div>
              </div>
              {access.canComment && (
                <button
                  onClick={toggleUpvote}
                  disabled={busyUpvote}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    report.myUpvoteId
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  } disabled:opacity-50`}
                >
                  {busyUpvote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <ThumbsUp className="w-4 h-4" />
                  {report.myUpvoteId ? "Voted" : "Me too"}
                </button>
              )}
            </div>
            {report.upvotes.length > 0 && (
              <div className="mt-2 text-[11px] text-gray-500 truncate" title={report.upvotes.map(u => u.voterName).join(", ")}>
                {report.upvotes.slice(0, 3).map(u => u.voterName).join(", ")}
                {report.upvotes.length > 3 && ` +${report.upvotes.length - 3} more`}
              </div>
            )}
          </div>

          {/* Verification poll — "Did the fix actually work?" */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Did the fix work?
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> {tally.working}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 text-rose-700">
                <XCircle className="w-3.5 h-3.5" /> {tally.notWorking}
              </span>
            </div>
            {tally.reporterVote && (
              <div className={`mt-2 text-[11px] font-semibold inline-flex items-center gap-1 ${
                tally.reporterVote === "WORKING" ? "text-emerald-700" : "text-rose-700"
              }`}>
                <Star className="w-3 h-3 fill-current" />
                Reporter ({tally.reporterVoterName}) says: {tally.reporterVote === "WORKING" ? "Working ✓" : "Still broken ✗"}
              </div>
            )}
            {access.canComment && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => castVerify(report.myVerificationVote === "WORKING" ? null : "WORKING")}
                  disabled={busyVerify}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    report.myVerificationVote === "WORKING"
                      ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                      : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  } disabled:opacity-50`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmed Working
                </button>
                <button
                  onClick={() => castVerify(report.myVerificationVote === "NOT_WORKING" ? null : "NOT_WORKING")}
                  disabled={busyVerify}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    report.myVerificationVote === "NOT_WORKING"
                      ? "bg-rose-500 text-white border-rose-500 hover:bg-rose-600"
                      : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                  } disabled:opacity-50`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Still Not Working
                </button>
              </div>
            )}
            {iAmReporter && (
              <div className="mt-2 text-[10px] text-amber-600 font-semibold uppercase tracking-wider">
                You are the reporter — your vote carries extra weight ★
              </div>
            )}
          </div>
        </div>

        {/* ── Comments ─────────────────────────────────────────────── */}
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
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-xs text-gray-500">
                      <strong className="text-gray-700">{c.authorName}</strong>
                      {" · "}
                      {new Date(c.createdAt).toLocaleString()}
                    </div>
                    {access.canChangeStatus && (
                      <button
                        onClick={() => deleteComment(c.id)}
                        title="Delete this comment"
                        className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {c.body && (
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  )}
                  {c.imageUrls.length > 0 && (
                    <ScreenshotStrip urls={c.imageUrls} onOpen={(u) => setLightboxUrl(u)} />
                  )}
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
              {newCommentImages.length > 0 && (
                <PendingAttachments
                  urls={newCommentImages}
                  onRemove={(u) => setNewCommentImages((p) => p.filter((x) => x !== u))}
                />
              )}
              <div className="flex items-center justify-between mt-2 gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer ${uploadingImage ? "opacity-60 cursor-wait" : ""}`}>
                  {uploadingImage
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ImagePlus className="w-3.5 h-3.5" />}
                  Attach screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    disabled={uploadingImage}
                    className="sr-only"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      const urls = await uploadImages(files);
                      if (urls.length > 0) setNewCommentImages((p) => [...p, ...urls].slice(0, 10));
                      // Reset the input so picking the same file twice re-fires onChange.
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={post}
                  disabled={posting || (!newComment.trim() && newCommentImages.length === 0)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white"
                >
                  {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Post comment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Lightbox for screenshots ────────────────────────────── */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
            onClick={() => setLightboxUrl(null)}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <XIcon className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Screenshot"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* ── Activity timeline ───────────────────────────────────── */}
        {report.activity.length > 0 && (
          <div className="mt-6">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              Activity
            </h2>
            <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {report.activity.map((a) => (
                <li key={a.id} className="px-4 py-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">{a.actorName}</span>{" "}
                  <span>{ACTIVITY_LABEL[a.kind as ActivityKind] ?? a.kind}</span>
                  {a.detail && (
                    <span className="text-gray-500"> — <span className="font-mono">{a.detail}</span></span>
                  )}
                  <span className="text-gray-400"> · {new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders a row of screenshot thumbnails. Clicking one opens the
 *  lightbox via the parent's `onOpen` callback. Sized to be readable
 *  on the page (each thumb ~96px tall) while still letting the user
 *  zoom for detail when they need to. */
function ScreenshotStrip({ urls, onOpen }: { urls: string[]; onOpen: (url: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <button
          key={u}
          type="button"
          onClick={() => onOpen(u)}
          className="block rounded-lg overflow-hidden border border-gray-200 hover:border-emerald-400 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-emerald-300"
          aria-label={`Open screenshot ${i + 1}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u}
            alt={`Screenshot ${i + 1}`}
            className="h-24 w-auto object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}

/** Pending-attachments preview shown above the comment composer. Each
 *  thumbnail has an X overlay to remove it before posting. */
function PendingAttachments({
  urls, onRemove,
}: {
  urls: string[];
  onRemove: (url: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <div key={u} className="relative rounded-lg overflow-hidden border border-gray-200 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={`Attachment ${i + 1}`} className="h-20 w-auto object-cover" />
          <button
            type="button"
            onClick={() => onRemove(u)}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Remove attachment"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
