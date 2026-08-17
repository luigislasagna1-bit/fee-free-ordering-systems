"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2, Headset, Loader2, PhoneForwarded, PhoneIncoming, Send } from "lucide-react";
import type { VoiceSetupMode } from "@/lib/voice/setup-request";

/**
 * "We're setting up your line" — the CONCIERGE ACTIVATION state of the Nabil
 * dashboard (entitled restaurant, no VoiceNumber row yet). Self-serve number
 * provisioning does not exist; the platform provisions by hand within one
 * business day. Two states:
 *   • no request yet (or "Update request") → the intake form → POST
 *     /api/admin/phone-ordering/setup-request
 *   • request filed → "request received" + a summary of what was asked.
 * The page re-renders as the live dashboard the moment a VoiceNumber exists.
 */
export interface SetupRequestView {
  status: string;
  updatedAt: string; // ISO
  payload: {
    currentNumber: string;
    mode: VoiceSetupMode;
    transferNumber: string;
    greetingName: string;
    notes: string | null;
  } | null;
}

export default function SetupRequestCard({
  initialRequest,
  defaults,
}: {
  initialRequest: SetupRequestView | null;
  /** Pre-fill from the restaurant profile / Nabil settings so the form is mostly done. */
  defaults: { currentNumber: string; transferNumber: string; greetingName: string };
}) {
  const t = useTranslations("admin.phoneOrderingPage.setup");
  const tErr = useTranslations("admin.phoneOrderingPage.apiErrors");
  const locale = useLocale();
  const router = useRouter();

  const [request, setRequest] = useState<SetupRequestView | null>(initialRequest);
  const [editing, setEditing] = useState(!initialRequest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = request?.payload;
  const [currentNumber, setCurrentNumber] = useState(p?.currentNumber ?? defaults.currentNumber);
  const [mode, setMode] = useState<VoiceSetupMode>(p?.mode ?? "forward");
  const [transferNumber, setTransferNumber] = useState(p?.transferNumber ?? defaults.transferNumber);
  const [greetingName, setGreetingName] = useState(p?.greetingName ?? defaults.greetingName);
  const [notes, setNotes] = useState(p?.notes ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/phone-ordering/setup-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentNumber, mode, transferNumber, greetingName, notes }),
      });
      const body = (await res.json().catch(() => ({}))) as { request?: SetupRequestView; code?: string };
      if (!res.ok || !body.request) {
        if (body.code === "invalid_current_number" || body.code === "invalid_transfer_number") setError(tErr("invalidPhone"));
        else if (body.code === "already_provisioned") setError(t("errorAlreadyProvisioned"));
        else setError(t("errorGeneric"));
        return;
      }
      setRequest(body.request);
      setEditing(false);
      router.refresh();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow">
          <Headset className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          {!editing && request ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {t("receivedTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{t("receivedBody")}</p>
              {p && (
                <ul className="mt-3 text-sm text-gray-800 space-y-1">
                  <li className="flex items-center gap-2">
                    {p.mode === "forward" ? <PhoneForwarded className="w-4 h-4 text-amber-600" /> : <PhoneIncoming className="w-4 h-4 text-amber-600" />}
                    {p.mode === "forward"
                      ? t("summaryForward", { currentNumber: p.currentNumber })
                      : t("summaryNew", { currentNumber: p.currentNumber })}
                  </li>
                  <li>{t("summaryTransfer", { transferNumber: p.transferNumber })}</li>
                  <li>{t("summaryGreeting", { name: p.greetingName })}</li>
                  <li className="text-xs text-gray-500">
                    {t("summarySent", { date: new Date(request.updatedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}
                  </li>
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-sm font-semibold text-amber-700 hover:text-amber-900"
                >
                  {t("updateRequest")}
                </button>
                <span className="text-xs text-gray-500">{t("prepareHint")}</span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900">{t("title")}</h2>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{t("body")}</p>

              <form onSubmit={submit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t("currentNumberLabel")}</label>
                  <input
                    type="tel"
                    required
                    value={currentNumber}
                    onChange={(e) => setCurrentNumber(e.target.value)}
                    className={inputCls}
                    placeholder="+1 905 555 0123"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t("phoneHint")}</p>
                </div>

                <fieldset>
                  <legend className="block text-sm font-medium text-gray-800 mb-2">{t("modeLabel")}</legend>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(
                      [
                        ["forward", PhoneForwarded, t("modeForward"), t("modeForwardHint")],
                        ["new", PhoneIncoming, t("modeNew"), t("modeNewHint")],
                      ] as [VoiceSetupMode, typeof PhoneIncoming, string, string][]
                    ).map(([value, Icon, label, hint]) => (
                      <label
                        key={value}
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                          mode === value ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          value={value}
                          checked={mode === value}
                          onChange={() => setMode(value)}
                          className="mt-1 accent-amber-500"
                        />
                        <Icon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">{label}</span>
                          <span className="block text-xs text-gray-600 mt-0.5 leading-snug">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t("transferNumberLabel")}</label>
                  <input
                    type="tel"
                    required
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    className={inputCls}
                    placeholder="+1 905 555 0123"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t("transferNumberHint")}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t("greetingNameLabel")}</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={greetingName}
                    onChange={(e) => setGreetingName(e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t("greetingNameHint")}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">{t("notesLabel")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className={inputCls}
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {saving ? t("submitting") : t("submit")}
                  </button>
                  {request && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                      }}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      {t("cancelEdit")}
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
