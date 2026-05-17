"use client";

import { useState } from "react";
import {
  CreditCard, CheckCircle, XCircle, AlertCircle, Eye, EyeOff,
  Loader2, ExternalLink, Shield, RefreshCw,
} from "lucide-react";

type Initial = {
  mode: "test" | "live" | null;
  enabled: boolean;
  publishableKey: string;
  hasSecretKey: boolean;
  secretKeyPreview: string | null;
  hasWebhookSecret: boolean;
  webhookSecretPreview: string | null;
  decryptOk: boolean;
  updatedAt: string | null;
  envSecretPresent: boolean;
  envPublishablePresent: boolean;
  envWebhookPresent: boolean;
  encryptionKeyConfigured: boolean;
};

export function StripeSettingsClient({ initial }: { initial: Initial }) {
  const [mode, setMode] = useState<"test" | "live">(initial.mode ?? "test");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [publishableKey, setPublishableKey] = useState(initial.publishableKey);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showSk, setShowSk] = useState(false);
  const [showWh, setShowWh] = useState(false);
  const [hasSecretKey, setHasSecretKey] = useState(initial.hasSecretKey);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(initial.hasWebhookSecret);
  const [secretKeyPreview, setSecretKeyPreview] = useState(initial.secretKeyPreview);
  const [webhookSecretPreview, setWebhookSecretPreview] = useState(initial.webhookSecretPreview);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const skPlaceholder = mode === "live" ? "sk_live_..." : "sk_test_...";
  const pkPlaceholder = mode === "live" ? "pk_live_..." : "pk_test_...";

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const body: Record<string, unknown> = { mode, enabled, publishableKey };
    if (secretKey) body.secretKey = secretKey;
    if (webhookSecret) body.webhookSecret = webhookSecret;

    const res = await fetch("/api/superadmin/settings/stripe", {
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
    if (data.secretKeyPreview) {
      setHasSecretKey(true);
      setSecretKeyPreview(data.secretKeyPreview);
      setSecretKey("");
    }
    if (data.webhookSecretPreview) {
      setHasWebhookSecret(true);
      setWebhookSecretPreview(data.webhookSecretPreview);
      setWebhookSecret("");
    }
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/superadmin/settings/stripe/test", { method: "POST" });
    const data = await res.json();
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, msg: data.message ?? `Connected (${data.mode} mode)` });
    } else {
      setTestResult({ ok: false, msg: data.error ?? "Connection failed" });
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stripe</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your platform Stripe credentials. Restaurant subscriptions and the platform
          application fee from customer orders both settle into this account.
        </p>
      </div>

      {!initial.encryptionKeyConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Encryption key missing</p>
            <p className="text-sm text-amber-700 mt-1">
              <code>ENCRYPTION_KEY</code> isn't set on the server, so secret keys
              can't be stored. Add it to your env vars and redeploy before saving.
            </p>
          </div>
        </div>
      )}

      {!initial.decryptOk && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Stored key can't be decrypted</p>
            <p className="text-sm text-red-700 mt-1">
              The encryption key changed since the secret was saved. Paste your
              Stripe secret again to overwrite.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#635BFF] rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Platform Stripe account</div>
              <div className="text-xs text-gray-500">
                {hasSecretKey ? "Secret key saved" : initial.envSecretPresent ? "Using env var" : "Not configured"}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Enabled</span>
            <div
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? "bg-orange-500" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </label>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Mode</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
              {(["test", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-5 py-2 text-sm font-semibold transition ${
                    mode === m
                      ? m === "live"
                        ? "bg-green-500 text-white"
                        : "bg-orange-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {m === "live" ? "Live" : "Test"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Test mode uses <code>sk_test_</code> / <code>pk_test_</code> keys. Switch to Live for production.
            </p>
          </div>

          {/* Publishable */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Publishable key</label>
            <input
              type="text"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              placeholder={pkPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Safe to expose to browsers. Used to render Stripe forms.</p>
          </div>

          {/* Secret */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Secret key</label>
            <div className="relative">
              <input
                type={showSk ? "text" : "password"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={hasSecretKey ? "•••••• saved — paste a new one to rotate" : skPlaceholder}
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
                <CheckCircle className="w-3 h-3" />
                Saved {secretKeyPreview ? <code className="text-gray-500">({secretKeyPreview})</code> : null}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Encrypted at rest. Never sent back to the browser.
            </p>
          </div>

          {/* Webhook */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Webhook signing secret</label>
            <div className="relative">
              <input
                type={showWh ? "text" : "password"}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={hasWebhookSecret ? "•••••• saved — paste a new one to rotate" : "whsec_..."}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowWh(!showWh)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showWh ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {hasWebhookSecret && !webhookSecret && (
              <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Saved {webhookSecretPreview ? <code className="text-gray-500">({webhookSecretPreview})</code> : null}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Get this from Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret.
            </p>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Saved.
            </div>
          )}
          {testResult && (
            <div className={`rounded-xl p-3 flex gap-2 text-sm ${testResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {testResult.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {testResult.msg}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !initial.encryptionKeyConfigured}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {testing ? "Testing..." : "Test connection"}
            </button>
          </div>

          {initial.updatedAt && (
            <p className="text-xs text-gray-400">Last saved: {new Date(initial.updatedAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2">
        <h2 className="text-sm font-semibold text-blue-900">Where to find these</h2>
        <ul className="text-sm text-blue-800 space-y-1.5">
          <li className="flex items-center gap-2">
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
              API keys (publishable + secret) <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li className="flex items-center gap-2">
            <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
              Webhooks (signing secret) <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>
            Webhook endpoint URL: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/stripe</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
