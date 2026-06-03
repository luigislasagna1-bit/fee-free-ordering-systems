"use client";
/**
 * /admin/kickstarter client — the owner-facing Kickstarter dashboard.
 *
 * Two stacked sections matching DESIGN-MARKETING-SUITE.md §6:
 *
 *   1. First Buy Promo — toggle that auto-creates a 10% off, new-
 *      customers-only Promotion row (campaignRef="kickstarter_first_buy")
 *      when ON. When ON the card surfaces a link to the
 *      /admin/promotions/[id]/edit page so the owner can fine-tune
 *      the discount, banner copy, etc.
 *
 *   2. Invite Prospects — toggle + CSV upload + recent-imports list.
 *      Toggling ON does NOT immediately email anyone; the hourly
 *      /api/cron/kickstarter-invites cron drips 20 emails/import/hr.
 *
 * Styling deliberately mirrors AutopilotClient.tsx so the two pillars
 * read as part of the same suite.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import {
  Rocket, Tag, Users, Upload, FileText, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, ExternalLink, CheckCircle2, AlertCircle,
  Mail, Clock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportRow {
  id: string;
  filename: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  emailsSent: number;
  emailsLastSent: string | null;
  isComplete: boolean;
  uploadedAt: string;
}

interface Props {
  initialFirstBuyEnabled: boolean;
  initialInviteEnabled: boolean;
  initialFirstBuyPromoId: string | null;
  initialImports: ImportRow[];
}

// ─── KickstarterClient ──────────────────────────────────────────────────────

export function KickstarterClient({
  initialFirstBuyEnabled,
  initialInviteEnabled,
  initialFirstBuyPromoId,
  initialImports,
}: Props) {
  const t = useTranslations("admin.kickstarter");
  const router = useRouter();
  const [firstBuyEnabled, setFirstBuyEnabled] = useState(initialFirstBuyEnabled);
  const [inviteEnabled, setInviteEnabled] = useState(initialInviteEnabled);
  const [firstBuyPromoId, setFirstBuyPromoId] = useState<string | null>(initialFirstBuyPromoId);
  const [imports] = useState<ImportRow[]>(initialImports);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const patchState = async (body: Partial<{ firstBuyPromoEnabled: boolean; inviteProspectsEnabled: boolean }>) => {
    try {
      const res = await fetch("/api/restaurants/kickstarter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || t("saveFailed"));
      }
      const next = await res.json();
      setFirstBuyEnabled(next.firstBuyPromoEnabled);
      setInviteEnabled(next.inviteProspectsEnabled);
      setFirstBuyPromoId(next.firstBuyPromoId ?? null);
      // Refresh the server-rendered shell so any other surfaces (sidebar
      // badges, promotions list) pick up the cascade.
      startTransition(() => router.refresh());
      return true;
    } catch (e: any) {
      toast.error(e.message ?? t("saveFailed"));
      return false;
    }
  };

  const toggleFirstBuy = async () => {
    const next = !firstBuyEnabled;
    // Optimistic flip so the toggle feels instant; reverted on error
    // via the patchState payload (we replace from server response).
    setFirstBuyEnabled(next);
    const ok = await patchState({ firstBuyPromoEnabled: next });
    if (ok) {
      toast.success(next ? t("firstBuyActivated") : t("firstBuyPaused"));
    }
  };

  const toggleInvite = async () => {
    const next = !inviteEnabled;
    setInviteEnabled(next);
    const ok = await patchState({ inviteProspectsEnabled: next });
    if (ok) {
      toast.success(next ? t("inviteActivated") : t("invitePaused"));
    }
  };

  return (
    <div>
      {/* Header — matches AutopilotClient layout */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Rocket className="w-5 h-5 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        </div>
        <p className="text-sm text-gray-500 ml-13">
          {t("pageSubtitle")}
        </p>
      </div>

      {/* Overview card — same gradient + 3-step explainer as Autopilot */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 text-lg mb-2">{t("howItWorksTitle")}</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
            <div>
              <span className="font-semibold block">{t("step1Title")}</span>
              {t("step1Body")}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
            <div>
              <span className="font-semibold block">{t("step2Title")}</span>
              {t("step2Body")}
            </div>
          </div>
        </div>
      </div>

      {/* ── First Buy Promo ── */}
      <FirstBuyCard
        enabled={firstBuyEnabled}
        promoId={firstBuyPromoId}
        onToggle={toggleFirstBuy}
      />

      {/* ── Invite Prospects ── */}
      <InviteProspectsCard
        enabled={inviteEnabled}
        imports={imports}
        expandedImport={expandedImport}
        onToggle={toggleInvite}
        onExpand={(id) => setExpandedImport((cur) => (cur === id ? null : id))}
        onUploaded={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}

// ─── First Buy Promo card ───────────────────────────────────────────────────

function FirstBuyCard({
  enabled,
  promoId,
  onToggle,
}: {
  enabled: boolean;
  promoId: string | null;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.kickstarter");
  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden mb-4 ${enabled ? "border-emerald-200" : "border-gray-100"}`}
    >
      <div className="p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
          <Tag className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{t("firstBuyTitle")}</span>
            {enabled && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {t("activeBadge")}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("firstBuyDescription")}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition flex-shrink-0"
          aria-label={enabled ? t("disableFirstBuyAriaLabel") : t("enableFirstBuyAriaLabel")}
        >
          {enabled ? (
            <ToggleRight className="w-8 h-8 text-emerald-500" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-gray-300" />
          )}
        </button>
      </div>

      <div className="border-t border-gray-100 p-5 bg-gray-50/50 text-sm">
        {enabled ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-700">
                {t("firstBuyActiveInfo")}
              </p>
              {promoId && (
                <Link
                  href={`/admin/promotions/${promoId}/edit`}
                  className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium mt-2"
                >
                  {t("editPromoLink")}
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">
            {t("firstBuyInactiveInfo")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Invite Prospects card ──────────────────────────────────────────────────

function InviteProspectsCard({
  enabled,
  imports,
  expandedImport,
  onToggle,
  onExpand,
  onUploaded,
}: {
  enabled: boolean;
  imports: ImportRow[];
  expandedImport: string | null;
  onToggle: () => void;
  onExpand: (id: string) => void;
  onUploaded: () => void;
}) {
  const t = useTranslations("admin.kickstarter");
  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${enabled ? "border-emerald-200" : "border-gray-100"}`}
    >
      <div className="p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
          <Users className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{t("inviteTitle")}</span>
            {enabled && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {t("activeBadge")}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("inviteDescription")}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition flex-shrink-0"
          aria-label={enabled ? t("disableInviteAriaLabel") : t("enableInviteAriaLabel")}
        >
          {enabled ? (
            <ToggleRight className="w-8 h-8 text-emerald-500" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-gray-300" />
          )}
        </button>
      </div>

      {enabled && (
        <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-4">
          <UploadArea onUploaded={onUploaded} />

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("recentImportsTitle")}</h3>
            {imports.length === 0 ? (
              <p className="text-sm text-gray-500">{t("noImportsYet")}</p>
            ) : (
              <ul className="space-y-2">
                {imports.map((imp) => (
                  <ImportItem
                    key={imp.id}
                    imp={imp}
                    expanded={expandedImport === imp.id}
                    onClick={() => onExpand(imp.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Upload area (drag/drop + click) ───────────────────────────────────────

function UploadArea({ onUploaded }: { onUploaded: () => void }) {
  const t = useTranslations("admin.kickstarter");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error(t("uploadErrorNotCsv"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("uploadErrorTooLarge"));
      return;
    }
    setUploading(true);
    const loadingToastId = toast.loading(t("uploadingLabel"));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/restaurants/kickstarter/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || t("uploadFailed"));
      }
      const data = await res.json();
      const successRows = data.import?.successRows ?? 0;
      const errorRows = data.import?.errorRows ?? 0;
      toast.success(
        errorRows > 0
          ? t("importedWithSkipped", { successRows, errorRows })
          : t("imported", { successRows }),
        { id: loadingToastId },
      );
      onUploaded();
    } catch (e: any) {
      toast.error(e.message ?? t("uploadFailed"), { id: loadingToastId });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
      }}
      className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
        dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
      }`}
    >
      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600 mb-1">
        {t("dragDropPrompt")}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="ml-1 text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
        >
          {t("chooseFileButton")}
        </button>
        .
      </p>
      <p className="text-xs text-gray-400">
        {t.rich("csvColumnsHint", {
          name: () => <code className="bg-gray-100 px-1 rounded">name</code>,
          email: () => <code className="bg-gray-100 px-1 rounded">email</code>,
          phone: () => <code className="bg-gray-100 px-1 rounded">phone</code>,
        })}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
    </div>
  );
}

// ─── Import history row ─────────────────────────────────────────────────────

function ImportItem({
  imp,
  expanded,
  onClick,
}: {
  imp: ImportRow;
  expanded: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("admin.kickstarter");
  const progressPct = imp.successRows > 0
    ? Math.round((imp.emailsSent / imp.successRows) * 100)
    : 0;
  const statusLabel = !imp.isComplete
    ? t("statusImporting")
    : imp.emailsSent >= imp.successRows
      ? t("statusSent")
      : t("statusSending");

  return (
    <li className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onClick}
        className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition text-left"
      >
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{imp.filename}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {t("sentProgress", { emailsSent: imp.emailsSent, successRows: imp.successRows })}
            {imp.errorRows > 0 && (
              <span className="text-amber-600"> · {t("skippedCount", { errorRows: imp.errorRows })}</span>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            imp.isComplete && imp.emailsSent >= imp.successRows
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {statusLabel}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {t("uploadedAt", { date: new Date(imp.uploadedAt).toLocaleString() })}
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{t("sendProgressLabel")}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Stat label={t("statTotalRows")} value={imp.totalRows} icon={<FileText className="w-3 h-3" />} />
            <Stat label={t("statValid")} value={imp.successRows} icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} />
            <Stat label={t("statSkipped")} value={imp.errorRows} icon={<AlertCircle className="w-3 h-3 text-amber-500" />} />
            <Stat label={t("statEmailsSent")} value={imp.emailsSent} icon={<Mail className="w-3 h-3 text-emerald-500" />} />
          </div>
          {imp.emailsLastSent && (
            <p className="text-xs text-gray-500">
              {t("lastSend", { date: new Date(imp.emailsLastSent).toLocaleString() })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-gray-600">
      {icon}
      <span className="font-semibold text-gray-900">{value}</span>
      <span className="text-gray-500">{label}</span>
    </div>
  );
}
