"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { AlertTriangle, Flag, X } from "lucide-react";
import { VOICE_CALL_REPORT_DESCRIPTION_MIN, VOICE_CALL_REPORT_TOPICS, type VoiceCallReportTopic } from "@/lib/voice/call-reports";

/**
 * "Report this call" (Luigi 2026-08-16, Loman parity): a topic, an urgent
 * switch and the owner's own words → POST …/calls/[id]/report. The platform
 * is notified at once; the reply thread shows on this page (CallReportsCard).
 */
export default function ReportCallButton({ callId, startedLabel }: { callId: string; startedLabel: string }) {
  const t = useTranslations("admin.phoneOrderingPage.callDetail.report");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<VoiceCallReportTopic | "">("");
  const [urgent, setUrgent] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tooShort = description.trim().length < VOICE_CALL_REPORT_DESCRIPTION_MIN;
  const canSubmit = !!topic && !tooShort && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/phone-ordering/calls/${callId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, urgent, description: description.trim() }),
      });
      if (res.status === 409) {
        setErr(t("tooManyOpen"));
        return;
      }
      if (!res.ok) throw new Error();
      toast.success(t("sentToast"));
      setOpen(false);
      setTopic("");
      setUrgent(false);
      setDescription("");
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        <Flag className="w-3.5 h-3.5" />
        {t("button")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="report-call-title">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 id="report-call-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Flag className="w-5 h-5 text-emerald-600" /> {t("modalTitle")}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{t("modalIntro", { time: startedLabel })}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label={t("cancel")}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("topicLabel")} <span className="text-red-500">*</span>
                </label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as VoiceCallReportTopic | "")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t("topicPlaceholder")}</option>
                  {VOICE_CALL_REPORT_TOPICS.map((k) => (
                    <option key={k} value={k}>
                      {t(`topics.${k}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("descriptionLabel")} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder={t("descriptionPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {description.length > 0 && tooShort && (
                  <p className="mt-1 text-xs text-amber-700">{t("descriptionTooShort", { min: VOICE_CALL_REPORT_DESCRIPTION_MIN })}</p>
                )}
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-gray-800 cursor-pointer">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5" />
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" /> {t("urgentLabel")}
                </span>
              </label>

              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? t("sending") : t("submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
