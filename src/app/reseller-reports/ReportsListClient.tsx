"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Bug, Lightbulb, Sliders, ArrowUpRight, MessageSquare,
  UserPlus, Trash2, X, Loader2, Inbox, ThumbsUp, CheckCircle2,
  ImagePlus, Paperclip, ArrowLeft, CheckCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  REPORT_TYPES, REPORT_STATUSES, REPORT_PRIORITIES,
  TYPE_LABEL, STATUS_LABEL, PRIORITY_LABEL,
  TYPE_BADGE, STATUS_BADGE, PRIORITY_BADGE,
  type ReportType, type ReportStatus, type ReportPriority,
} from "@/lib/reseller-reports-constants";

interface ReportRow {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  authorEmail: string;
  authorName: string;
  /** The person who actually reported the issue. Equals author when
   *  reportedByEmail was null on the row. Drives the "by X" display. */
  reporterEmail: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  upvotesCount: number;
  verificationsCount: number;
  attachmentsCount: number;
  /** True when this report has activity (comment / status change) since the
   *  viewer last opened it — drives the in-app NEW badge + bold title. */
  isNew?: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  displayName: string | null;
  invitedAt: string;
}

interface Access {
  canCreate: boolean;
  canChangeStatus: boolean;
  canInvite: boolean;
}

export function ReportsListClient({
  access, reports: initialReports, invites: initialInvites,
}: {
  access: Access;
  reports: ReportRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [invites, setInvites] = useState(initialInvites);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | ReportType>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // How many rows currently carry the NEW badge — drives the "Mark all read"
  // button's visibility + count. Counted over ALL reports, not the filtered
  // view, because the server-side action clears every badge regardless of
  // whatever filter happens to be active.
  const newCount = useMemo(() => reports.filter((r) => r.isNew).length, [reports]);

  const markAllRead = async () => {
    setMarkingAllRead(true);
    try {
      const r = await fetch("/api/reseller-reports/mark-all-seen", { method: "POST" });
      if (!r.ok) throw new Error("Failed");
      // Optimistically clear the badges, then refresh so the layout's nav
      // badge (countNewReportsForViewer) re-derives from the server too.
      setReports((prev) => prev.map((row) => (row.isNew ? { ...row, isNew: false } : row)));
      toast.success("All reports marked as read");
      router.refresh();
    } catch {
      toast.error("Couldn't mark reports as read");
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Buckets keyed by status. The page renders one section per status
  // with a coloured heading + the matching rows underneath. This is the
  // "color-coated headings" Luigi spec'd.
  const buckets = useMemo(() => {
    const filtered = reports.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        // Search across title + author + reporter so "luigi" matches
        // both his own reports AND ones he filed on behalf of someone.
        const hay = `${r.title} ${r.authorName} ${r.authorEmail} ${r.reporterName} ${r.reporterEmail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byStatus: Record<ReportStatus, ReportRow[]> = {
      NEW: [], IN_PROGRESS: [], IN_TESTING: [], FIXED: [], WONT_FIX: [],
    };
    for (const r of filtered) {
      if (r.status in byStatus) byStatus[r.status as ReportStatus].push(r);
    }
    return byStatus;
  }, [reports, query, statusFilter, typeFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            {/* Back to the caller's dashboard. canInvite is superadmin-only,
                so it doubles as the "is this a superadmin?" signal. */}
            <Link
              href={access.canInvite ? "/superadmin" : "/reseller"}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {access.canInvite ? "Back to Superadmin" : "Back to Dashboard"}
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Reseller Reports &amp; Requests</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Hidden internal tracker. {access.canChangeStatus
                ? "Superadmin view — you can change status and invite resellers."
                : "Reseller view — you can file new reports and comment on any. Status changes are reserved to the platform admin."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {newCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAllRead}
                title="Clear the NEW badge on every report for you (doesn't affect anyone else)"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60 transition"
              >
                {markingAllRead
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCheck className="w-4 h-4" />}
                Mark all read ({newCount})
              </button>
            )}
            {access.canInvite && (
              <button
                type="button"
                onClick={() => setShowInvites(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 transition"
              >
                <UserPlus className="w-4 h-4" />
                Manage access ({invites.length})
              </button>
            )}
            {access.canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition"
              >
                <Plus className="w-4 h-4" /> New report
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-6 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or author…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="ALL">All statuses</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="ALL">All types</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>

        {/* Sections — one per status. Empty buckets render but say "none yet". */}
        <div className="space-y-6">
          {REPORT_STATUSES.map((s) => (
            <StatusSection
              key={s}
              status={s}
              rows={buckets[s]}
            />
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-8 text-[11px] text-gray-400 text-center">
          Reports are visible to invited resellers + the platform admin.
          Customer-facing pages never link here.
        </p>
      </div>

      {showCreate && (
        <CreateReportModal
          canSetReporter={access.canChangeStatus /* same gate as superadmin */}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.push(`/reseller-reports/${id}`);
          }}
        />
      )}

      {showInvites && (
        <InvitesModal
          invites={invites}
          onClose={() => setShowInvites(false)}
          onChange={(next) => setInvites(next)}
        />
      )}
    </div>
  );
}

function StatusSection({ status, rows }: { status: ReportStatus; rows: ReportRow[] }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${STATUS_BADGE[status]}`}>
          {STATUS_LABEL[status]}
        </h2>
        <span className="text-xs text-gray-500">{rows.length} report{rows.length === 1 ? "" : "s"}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-gray-400 italic px-3">None yet.</div>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reseller-reports/${r.id}`}
                className="flex items-start gap-3 p-4 hover:bg-gray-50 transition"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {iconForType(r.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.isNew && (
                      <span
                        title="New activity since you last viewed"
                        className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-white"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        New
                      </span>
                    )}
                    <span className={`truncate ${r.isNew ? "font-extrabold text-gray-900" : "font-semibold text-gray-900"}`}>{r.title}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${TYPE_BADGE[r.type as ReportType] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                      {TYPE_LABEL[r.type as ReportType] ?? r.type}
                    </span>
                    {r.priority !== "MEDIUM" && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORITY_BADGE[r.priority as ReportPriority] ?? "bg-gray-100 text-gray-700"}`}>
                        {PRIORITY_LABEL[r.priority as ReportPriority] ?? r.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                    {/* "Reported by" prominent — bold name so the actual
                        reporter (not whoever clicked Submit on their
                        behalf) is what jumps off the row. */}
                    <span>
                      Reported by <strong className="text-gray-700">{r.reporterName}</strong>
                    </span>
                    <span>· {new Date(r.createdAt).toLocaleDateString()}</span>
                    {r.upvotesCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-700" title={`${r.upvotesCount} "me too" upvotes`}>
                        <ThumbsUp className="w-3 h-3" /> {r.upvotesCount}
                      </span>
                    )}
                    {r.verificationsCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-purple-700" title="Verification poll votes">
                        <CheckCircle2 className="w-3 h-3" /> {r.verificationsCount}
                      </span>
                    )}
                    {r.attachmentsCount > 0 && (
                      <span className="inline-flex items-center gap-1" title={`${r.attachmentsCount} screenshot${r.attachmentsCount === 1 ? "" : "s"} attached`}>
                        <Paperclip className="w-3 h-3" /> {r.attachmentsCount}
                      </span>
                    )}
                    {r.commentsCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> {r.commentsCount}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function iconForType(type: string) {
  if (type === "BUG") return <Bug className="w-5 h-5 text-red-500" />;
  if (type === "FEATURE_REQUEST") return <Lightbulb className="w-5 h-5 text-sky-500" />;
  return <Sliders className="w-5 h-5 text-amber-500" />;
}

// ─── New report modal ────────────────────────────────────────────────

function CreateReportModal({
  canSetReporter, onClose, onCreated,
}: {
  canSetReporter: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [type, setType] = useState<ReportType>("BUG");
  const [priority, setPriority] = useState<ReportPriority>("MEDIUM");
  // Reported-by — only shown when canSetReporter (superadmin). Empty
  // string means "I am the reporter" and the server attributes it to
  // the caller. Set this to a different email to file on behalf of
  // someone else (e.g. Luigi filing a bug a reseller called him about).
  const [reportedByEmail, setReportedByEmail] = useState("");
  const [reportedByName, setReportedByName] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const submit = async () => {
    if (!title.trim() || !bodyText.trim()) {
      toast.error("Title and description required");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/reseller-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, bodyText, type, priority,
          reportedByEmail: canSetReporter ? reportedByEmail : undefined,
          reportedByName: canSetReporter ? reportedByName : undefined,
          imageUrls,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      const { id } = await r.json();
      toast.success("Report filed");
      onCreated(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ReportPriority)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {REPORT_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="One-line summary — e.g. 'Kitchen tabs flash old orders on cold open'"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              maxLength={20_000}
              rows={8}
              placeholder="Steps to reproduce, what you expected, what happened."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 leading-relaxed"
            />
          </div>
          {/* Screenshot attachments — PNG / JPG / WebP / GIF, up to 10
              files, 10 MB each. Uploaded immediately to Vercel Blob via
              /api/reseller-reports/upload; on a successful upload the
              URL goes into imageUrls[] and a thumbnail renders below.
              We don't drag-and-drop yet — file picker is enough for
              most users and avoids the UX glitches drag introduces. */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Screenshots <span className="text-gray-400 font-normal">(optional — PNG, JPG, WebP, GIF up to 10 MB each)</span>
            </label>
            <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer ${uploadingImage ? "opacity-60 cursor-wait" : ""}`}>
              {uploadingImage
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ImagePlus className="w-3.5 h-3.5" />}
              Add screenshot
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
                  if (urls.length > 0) setImageUrls((p) => [...p, ...urls].slice(0, 10));
                  e.target.value = "";
                }}
              />
            </label>
            {imageUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageUrls.map((u, i) => (
                  <div key={u} className="relative rounded-lg overflow-hidden border border-gray-200 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`Screenshot ${i + 1}`} className="h-20 w-auto object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrls((p) => p.filter((x) => x !== u))}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      aria-label="Remove screenshot"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Reported-by — superadmin-only. Lets Luigi file a report
              on behalf of a reseller who phoned in the issue, with
              proper attribution so the list shows "Reported by X"
              correctly. Leave blank to file as yourself. */}
          {canSetReporter && (
            <div className="border-t border-gray-100 pt-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reported by <span className="text-gray-400 font-normal">(optional — leave blank to file as yourself)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={reportedByEmail}
                  onChange={(e) => setReportedByEmail(e.target.value)}
                  placeholder="reporter@example.com"
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <input
                  value={reportedByName}
                  onChange={(e) => setReportedByName(e.target.value)}
                  placeholder="Display name"
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Use this when a reseller calls in a bug and you&apos;re entering it for them.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            File report
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invites modal (superadmin only) ─────────────────────────────────

function InvitesModal({
  invites, onClose, onChange,
}: {
  invites: InviteRow[];
  onClose: () => void;
  onChange: (next: InviteRow[]) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/reseller-reports/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      const { invite } = await r.json();
      // Dedupe + prepend
      onChange([
        { id: invite.id, email: invite.email, displayName: invite.displayName, invitedAt: invite.invitedAt },
        ...invites.filter((i) => i.id !== invite.id),
      ]);
      setEmail("");
      setDisplayName("");
      toast.success("Access granted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string, who: string) => {
    if (!confirm(`Revoke access for ${who}?`)) return;
    try {
      const r = await fetch(`/api/reseller-reports/invites/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      onChange(invites.filter((i) => i.id !== id));
      toast.success("Access revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Manage access</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Add a reseller&apos;s email so they can see and file reports here.
            They must already have a reseller account on the platform to log in.
            Revoking does not delete their past reports or comments.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email *</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reseller@example.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <button
              onClick={add}
              disabled={busy || !email.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <UserPlus className="w-4 h-4" /> Add
            </button>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Currently invited ({invites.length})</h3>
            {invites.length === 0 ? (
              <div className="text-xs text-gray-400 italic">Nobody yet. Add an email above.</div>
            ) : (
              <ul className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 truncate">{inv.displayName || inv.email}</div>
                      {inv.displayName && (
                        <div className="text-[11px] text-gray-500 truncate">{inv.email}</div>
                      )}
                    </div>
                    <button
                      onClick={() => revoke(inv.id, inv.displayName || inv.email)}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
