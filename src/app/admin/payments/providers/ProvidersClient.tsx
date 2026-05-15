"use client";
import { useState } from "react";
import {
  CreditCard, CheckCircle, XCircle, AlertCircle, Eye, EyeOff,
  Loader2, Zap, Shield, RefreshCw, ExternalLink, Info
} from "lucide-react";
import { useTranslations } from "next-intl";

interface SavedProvider {
  mode: string;
  publishableKey: string;
  isActive: boolean;
  connectMethod: string;
  stripeAccountId?: string;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  hasSecretKey: boolean;
}

interface Props {
  savedProvider: SavedProvider | null;
  encryptionConfigured: boolean;
}

export function ProvidersClient({ savedProvider, encryptionConfigured }: Props) {
  const t = useTranslations("admin.payments");
  const tCommon = useTranslations("common");
  const [mode, setMode] = useState<"test" | "live">(
    (savedProvider?.mode as "test" | "live") ?? "test"
  );
  const [publishableKey, setPublishableKey] = useState(savedProvider?.publishableKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [showSk, setShowSk] = useState(false);
  const [isActive, setIsActive] = useState(savedProvider?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hasSecretKey, setHasSecretKey] = useState(savedProvider?.hasSecretKey ?? false);
  const [lastTestStatus, setLastTestStatus] = useState(savedProvider?.lastTestStatus ?? null);
  const [lastTestedAt, setLastTestedAt] = useState(savedProvider?.lastTestedAt ?? null);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const body: Record<string, unknown> = { mode, publishableKey, isActive };
    if (secretKey) body.secretKey = secretKey;

    const res = await fetch("/api/restaurants/payment-provider", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error ?? "Failed to save");
      return;
    }
    setSaveSuccess(true);
    setSecretKey("");
    if (data.secretKeyMasked) setHasSecretKey(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/restaurants/payment-provider/test", { method: "POST" });
    const data = await res.json();
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, msg: `Connected successfully (${data.mode} mode)` });
      setLastTestStatus("ok");
      setLastTestedAt(new Date().toISOString());
    } else {
      setTestResult({ ok: false, msg: data.error ?? "Connection failed" });
      setLastTestStatus("failed");
      setLastTestedAt(new Date().toISOString());
    }
  }

  const pkPlaceholder = mode === "live" ? "pk_live_..." : "pk_test_...";
  const skPlaceholder = mode === "live" ? "sk_live_..." : "sk_test_...";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("helpText")}</p>
      </div>

      {!encryptionConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Payment setup not available</p>
            <p className="text-sm text-amber-700 mt-1">
              Secure key storage has not been configured on this platform. Please contact your system administrator to enable online payments.
            </p>
          </div>
        </div>
      )}

      {/* Stripe Provider Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#635BFF] rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Stripe</div>
              <div className="text-xs text-gray-500">Direct API keys</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastTestStatus && (
              <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                lastTestStatus === "ok"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {lastTestStatus === "ok"
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <XCircle className="w-3.5 h-3.5" />}
                {lastTestStatus === "ok" ? t("connected") : t("testFailed")}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">{t("active")}</span>
              <div
                onClick={() => setIsActive(!isActive)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${isActive ? "bg-orange-500" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode toggle */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">{tCommon("type")}</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
              {(["test", "live"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-5 py-2 text-sm font-semibold transition ${
                    mode === m
                      ? m === "live"
                        ? "bg-green-500 text-white"
                        : "bg-orange-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {m === "live" ? t("modeLive") : t("modeTest")}
                </button>
              ))}
            </div>
          </div>

          {/* Publishable key */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              {t("publishableKey")}
            </label>
            <input
              type="text"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              placeholder={pkPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">&nbsp;</p>
          </div>

          {/* Secret key */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              {t("secretKey")}
            </label>
            <div className="relative">
              <input
                type={showSk ? "text" : "password"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={skPlaceholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSk(!showSk)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSk ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {hasSecretKey && !secretKey && (
              <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> ✓
              </p>
            )}
          </div>

          {/* Error / success */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {t("testSuccess")}
            </div>
          )}
          {testResult && (
            <div className={`rounded-xl p-3 flex gap-2 text-sm ${testResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {testResult.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {testResult.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? tCommon("loading") : t("saveAndTest")}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !hasSecretKey}
              className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {testing ? tCommon("loading") : t("testConnection")}
            </button>
          </div>

          {lastTestedAt && (
            <p className="text-xs text-gray-400">
              Last tested: {new Date(lastTestedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 font-medium"
        >
          Stripe Dashboard <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
