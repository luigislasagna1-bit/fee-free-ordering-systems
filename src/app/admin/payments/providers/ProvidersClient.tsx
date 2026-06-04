"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard, CheckCircle, XCircle, AlertCircle, Loader2,
  ExternalLink, Shield, Zap, Lock, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useTranslations } from "next-intl";

type RestaurantState = {
  paypalAccountStatus: string | null;
  paypalEnvironment: string | null;
  paypalMerchantEmail: string | null;
} | null;

/** Non-secret view of the restaurant's own Stripe keys (key-only model). */
type StripeState = {
  mode: string;
  publishableKey: string;
  /** Whether a secret key is already stored (encrypted). We never send the
   *  secret itself to the browser. */
  hasSecret: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
} | null;

interface Props {
  restaurant: RestaurantState;
  /** The restaurant's own Stripe API-key state, or null if never saved. */
  stripe: StripeState;
  /** True when the restaurant has subscribed to the Online Payments add-on
   *  (i.e. has the `card_payments` feature). Required before card payments
   *  are actually useful — without it, the /api/public/payment-intent gate
   *  rejects card charges. */
  hasOnlinePaymentsAddOn: boolean;
  /** True when "online_card" is currently in the restaurant's Accepted
   *  Methods. An owner can subscribe to the add-on but choose not to
   *  surface online card payment to customers. */
  onlineCardEnabled: boolean;
  /** True when "paypal" is currently in the restaurant's Accepted Methods. */
  paypalEnabled: boolean;
}

export function ProvidersClient({
  restaurant,
  stripe,
  hasOnlinePaymentsAddOn,
  onlineCardEnabled,
  paypalEnabled,
}: Props) {
  const t = useTranslations("admin.paymentProviders");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Stripe key-only state ────────────────────────────────────────────────
  const stripeActive = !!stripe?.isActive;
  const [form, setForm] = useState({
    mode: (stripe?.mode === "live" ? "live" : "test") as "test" | "live",
    publishableKey: stripe?.publishableKey ?? "",
    secretKey: "",
  });
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showStripeInstructions, setShowStripeInstructions] = useState(false);

  const hasKeysReady = !!(form.publishableKey.trim() && (form.secretKey.trim() || stripe?.hasSecret));

  async function saveKeys(activate?: boolean) {
    if (!form.publishableKey.trim() || (!form.secretKey.trim() && !stripe?.hasSecret)) {
      setError(t("errorKeysRequired"));
      return;
    }
    setBusy("save-keys");
    setError(null);
    setSavedMsg(null);
    try {
      const body: Record<string, unknown> = {
        mode: form.mode,
        publishableKey: form.publishableKey.trim(),
      };
      if (form.secretKey.trim()) body.secretKey = form.secretKey.trim();
      if (activate !== undefined) body.isActive = activate;
      const res = await fetch("/api/restaurants/payment-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("errorSaveFailed"));
        return;
      }
      setSavedMsg(t("stripeKeySaved"));
      // Clear the secret out of in-memory state — the server has it
      // encrypted now and never echoes it back.
      setForm((f) => ({ ...f, secretKey: "" }));
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setError(t("errorSaveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test-keys");
    setTestMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/restaurants/payment-provider/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTestMsg({ ok: false, text: data.error || t("stripeKeyTestFailed") });
        return;
      }
      setTestMsg({ ok: true, text: t("stripeKeyTestOk") });
    } catch {
      setTestMsg({ ok: false, text: t("stripeKeyTestFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(next: boolean) {
    setBusy("toggle-active");
    setError(null);
    try {
      const res = await fetch("/api/restaurants/payment-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || t("errorSaveFailed"));
        return;
      }
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  // ── PayPal state ────────────────────────────────────────────────────────
  const paypalConnected = restaurant?.paypalAccountStatus === "connected";
  const paypalStatus = restaurant?.paypalAccountStatus || "not_connected";
  const [ppForm, setPpForm] = useState({
    clientId: "",
    secret: "",
    environment: "live" as "sandbox" | "live",
    merchantEmail: "",
  });
  const [ppError, setPpError] = useState<string | null>(null);
  const [ppSuccess, setPpSuccess] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [showPpInstructions, setShowPpInstructions] = useState(false);

  async function connectPaypal() {
    if (!ppForm.clientId.trim() || !ppForm.secret.trim()) {
      setPpError(t("ppErrorBothRequired"));
      return;
    }
    setBusy("paypal-connect");
    setPpError(null);
    setPpSuccess(null);
    try {
      const res = await fetch("/api/paypal/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ppForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setPpError(data.error || t("ppErrorCouldNotConnect"));
        return;
      }
      setPpSuccess(
        data.merchantEmail
          ? t("ppSuccessConnectedWithEmail", { email: data.merchantEmail })
          : t("ppSuccessConnected")
      );
      // Clear creds out of the in-memory form so they don't sit in
      // React state. The server has them encrypted now.
      setPpForm({ clientId: "", secret: "", environment: ppForm.environment, merchantEmail: "" });
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setPpError(t("ppErrorNetwork"));
    } finally {
      setBusy(null);
    }
  }

  async function disconnectPaypal() {
    if (!confirm(t("ppDisconnectConfirm"))) return;
    setBusy("paypal-disconnect");
    try {
      const res = await fetch("/api/paypal/connect", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setPpError(d.error || t("errorCouldNotDisconnect"));
        return;
      }
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("pageSubtitle")}
        </p>
      </div>

      {/* Entitlement gate — if the restaurant hasn't subscribed to Online
          Payments, entering Stripe keys alone doesn't unlock card charges.
          The customer-side /api/public/payment-intent rejects with 402 until
          hasFeature(card_payments) returns true. Lead with the add-on. */}
      {!hasOnlinePaymentsAddOn && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">
              {t("noAddOnTitle")}
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              {t.rich("noAddOnBody", {
                strong: (c) => <strong>{c}</strong>,
              })}
            </p>
            <Link
              href="/admin/billing/add-ons"
              className="inline-flex items-center gap-2 mt-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              {t("viewAddOns")}
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Has the add-on, but online_card is NOT in Accepted Methods. The
          owner is paying for the entitlement but hasn't actually turned
          card payment on for customers. Surface that and link to the
          right place. */}
      {hasOnlinePaymentsAddOn && !onlineCardEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {t("cardOffTitle")}
            </p>
            <p className="text-sm text-amber-800 mt-1">
              {t("cardOffBody")}
            </p>
            <Link
              href="/admin/payments"
              className="inline-flex items-center gap-2 mt-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              {t("enableInAcceptedMethods")}
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Stripe (key-only) ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#635BFF] rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Stripe</div>
              <div className="text-xs text-gray-500">{t("stripeKeySubheading")}</div>
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              stripeActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {stripeActive ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {stripeActive ? t("stripeOnBadge") : t("stripeOffBadge")}
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-sm text-gray-600 space-y-2">
            <p>{t("stripeKeyIntro")}</p>
            <button
              type="button"
              onClick={() => setShowStripeInstructions((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#635BFF] hover:text-[#5048df]"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {showStripeInstructions ? t("stripeKeyHideWhere") : t("stripeKeyShowWhere")}
              {showStripeInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showStripeInstructions && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-2 text-xs text-indigo-900 leading-relaxed">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t("stripeKeyWhereTitle")}
              </h3>
              <p>
                {t.rich("stripeKeyWhereBody", {
                  strong: (c) => <strong>{c}</strong>,
                  a: (c) => (
                    <a
                      href="https://dashboard.stripe.com/apikeys"
                      target="_blank" rel="noopener noreferrer"
                      className="underline font-semibold inline-flex items-center gap-0.5"
                    >
                      {c}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ),
                })}
              </p>
            </div>
          )}

          {/* Mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t("stripeKeyModeLabel")}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["test", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, mode: m })}
                  className={`py-2 px-3 rounded-lg border-2 text-xs font-semibold transition ${
                    form.mode === m
                      ? "border-[#635BFF] bg-indigo-50 text-[#635BFF]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {m === "live" ? t("stripeKeyModeLive") : t("stripeKeyModeTest")}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{t("stripeKeyModeHint")}</p>
          </div>

          {/* Publishable key */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelPublishableKey")}</label>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={form.publishableKey}
              onChange={(e) => setForm({ ...form, publishableKey: e.target.value })}
              placeholder={form.mode === "live" ? "pk_live_..." : "pk_test_..."}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#635BFF]"
            />
            <p className="text-[11px] text-gray-500 mt-1">{t("publishableKeyHint")}</p>
          </div>

          {/* Secret key */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelSecretKey")}</label>
            <div className="relative">
              <input
                type={showStripeSecret ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={form.secretKey}
                onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                placeholder={
                  stripe?.hasSecret
                    ? t("stripeKeySecretSavedPlaceholder")
                    : form.mode === "live" ? "sk_live_..." : "sk_test_..."
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-20 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#635BFF]"
              />
              <button
                type="button"
                onClick={() => setShowStripeSecret(!showStripeSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-semibold"
              >
                {showStripeSecret ? t("btnHide") : t("btnShow")}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{t("secretKeyHint")}</p>
          </div>

          {savedMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {savedMsg}
            </div>
          )}
          {testMsg && (
            <div
              className={`rounded-xl p-3 flex gap-2 text-sm border ${
                testMsg.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {testMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {testMsg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveKeys()}
              disabled={busy !== null || !hasKeysReady}
              className="flex items-center gap-2 bg-[#635BFF] hover:bg-[#5048df] text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
            >
              {busy === "save-keys" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {t("btnSaveKeys")}
            </button>
            <button
              onClick={testConnection}
              disabled={busy !== null || !stripe?.hasSecret}
              className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
            >
              {busy === "test-keys" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {t("btnTestConnection")}
            </button>
          </div>

          {/* On/off toggle — only meaningful once keys are saved. */}
          {stripe?.hasSecret && (
            <div
              className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                stripeActive ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${stripeActive ? "text-green-800" : "text-gray-700"}`}>
                  {stripeActive ? t("stripeActiveTitle") : t("stripeInactiveTitle")}
                </p>
                <p className={`text-xs mt-1 ${stripeActive ? "text-green-700" : "text-gray-500"}`}>
                  {stripeActive ? t("stripeActiveBody") : t("stripeInactiveBody")}
                </p>
              </div>
              <button
                onClick={() => toggleActive(!stripeActive)}
                disabled={busy !== null || (!stripeActive && !stripe?.publishableKey)}
                className={`flex-shrink-0 flex items-center gap-2 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50 ${
                  stripeActive
                    ? "bg-white border border-red-200 hover:bg-red-50 text-red-600"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white"
                }`}
              >
                {busy === "toggle-active" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : stripeActive ? t("btnTurnOff") : t("btnTurnOn")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── PayPal ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#003087] rounded-xl flex items-center justify-center font-bold text-white text-lg">
              P
            </div>
            <div>
              <div className="font-semibold text-gray-900">PayPal</div>
              <div className="text-xs text-gray-500">{t("paypalSubheading")}</div>
            </div>
          </div>
          {paypalConnected && (
            <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              <CheckCircle className="w-3.5 h-3.5" />
              {t("badgeConnected")}
            </div>
          )}
          {paypalStatus === "error" && (
            <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
              <AlertCircle className="w-3.5 h-3.5" />
              {t("badgeError")}
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {ppError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {ppError}
            </div>
          )}
          {ppSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {ppSuccess}
            </div>
          )}

          {!paypalConnected && (
            <>
              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  {t.rich("ppSetupIntro", {
                    strong: (c) => <strong>{c}</strong>,
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPpInstructions((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showPpInstructions
                    ? t("ppHideInstructions")
                    : t("ppShowInstructions")}
                  {showPpInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showPpInstructions && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t("ppInstructionsTitle")}
                  </h3>

                  {/* Step 1 — Business account */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep1", {
                        strong: (c) => <strong>{c}</strong>,
                        a: (c) => (
                          <a
                            href="https://www.paypal.com/us/business"
                            target="_blank" rel="noopener noreferrer"
                            className="underline font-semibold inline-flex items-center gap-0.5"
                          >
                            {c}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ),
                      })}
                    </div>
                  </div>

                  {/* Step 2 — Developer dashboard */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep2", {
                        a: (c) => (
                          <a
                            href="https://developer.paypal.com/dashboard/applications/live"
                            target="_blank" rel="noopener noreferrer"
                            className="underline font-semibold inline-flex items-center gap-0.5"
                          >
                            {c}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ),
                      })}
                    </div>
                  </div>

                  {/* Step 3 — Create REST app */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep3", {
                        strong: (c) => <strong>{c}</strong>,
                        em: (c) => <em>{c}</em>,
                      })}
                    </div>
                  </div>

                  {/* Step 4 — Copy creds */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep4", {
                        strong: (c) => <strong>{c}</strong>,
                        em: (c) => <em>{c}</em>,
                        span: (c) => <span className="text-blue-700/80">{c}</span>,
                        codeA: () => <code className="font-mono bg-white px-1 rounded">A...</code>,
                        codeE: () => <code className="font-mono bg-white px-1 rounded">E...</code>,
                      })}
                    </div>
                  </div>

                  {/* Step 5 — Live vs Sandbox */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">5</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep5", {
                        strong: (c) => <strong>{c}</strong>,
                      })}
                    </div>
                  </div>

                  {/* Step 6 — Verify */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">6</div>
                    <div className="flex-1 text-xs text-blue-900 leading-relaxed">
                      {t.rich("ppStep6", {
                        strong: (c) => <strong>{c}</strong>,
                      })}
                    </div>
                  </div>

                  <div className="border-t border-blue-200 pt-3 mt-3 text-[11px] text-blue-800 leading-relaxed">
                    {t.rich("ppSecurityNote", {
                      strong: (c) => <strong>{c}</strong>,
                    })}
                  </div>
                  <div className="text-[11px] text-blue-800 leading-relaxed">
                    {t.rich("ppStuckNote", {
                      strong: (c) => <strong>{c}</strong>,
                      a: (c) => (
                        <a href="mailto:support@feefreeordering.com" className="underline font-semibold">
                          {c}
                        </a>
                      ),
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelEnvironment")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["live", "sandbox"] as const).map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setPpForm({ ...ppForm, environment: env })}
                        className={`py-2 px-3 rounded-lg border-2 text-xs font-semibold transition ${
                          ppForm.environment === env
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {env === "live" ? t("envLive") : t("envSandbox")}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t("envHint")}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelClientId")}</label>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={ppForm.clientId}
                    onChange={(e) => setPpForm({ ...ppForm, clientId: e.target.value })}
                    placeholder="AeA1QIZXiflr1_-r0U2HZsa..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelSecret")}</label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={ppForm.secret}
                      onChange={(e) => setPpForm({ ...ppForm, secret: e.target.value })}
                      placeholder="ELXxIfXdcDvWyEz4Yvqu..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-20 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-semibold"
                    >
                      {showSecret ? t("btnHide") : t("btnShow")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t("secretHint")}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelMerchantEmail")}</label>
                  <input
                    type="email"
                    autoComplete="off"
                    value={ppForm.merchantEmail}
                    onChange={(e) => setPpForm({ ...ppForm, merchantEmail: e.target.value })}
                    placeholder="payments@yourrestaurant.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t("merchantEmailHint")}
                  </p>
                </div>
              </div>

              <button
                onClick={connectPaypal}
                disabled={busy !== null || !ppForm.clientId.trim() || !ppForm.secret.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#003087] hover:bg-[#001f5c] text-white font-semibold px-5 py-3 rounded-xl text-sm transition disabled:opacity-50"
              >
                {busy === "paypal-connect" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                {t("btnVerifyConnectPaypal")}
              </button>
            </>
          )}

          {paypalConnected && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatusTile label={t("tileStatus")} ok hint={t("tileConnected")} />
                <StatusTile
                  label={t("tileEnvironment")}
                  ok={restaurant?.paypalEnvironment === "live"}
                  hint={restaurant?.paypalEnvironment === "live" ? t("tileLive") : t("tileSandboxTest")}
                />
              </div>
              {restaurant?.paypalMerchantEmail && (
                <p className="text-xs text-gray-500">
                  {t("paypalAccountLabel")} <span className="font-mono">{restaurant.paypalMerchantEmail}</span>
                </p>
              )}
              {!paypalEnabled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  {t.rich("paypalNotInAcceptedMethods", {
                    strong: (c) => <strong>{c}</strong>,
                    a: (c) => (
                      <Link href="/admin/payments" className="underline font-semibold">
                        {c}
                      </Link>
                    ),
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={disconnectPaypal}
                  disabled={busy !== null}
                  className="flex items-center gap-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                >
                  {busy === "paypal-disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btnDisconnect")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        ok ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {ok ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-600" />
        )}
        <span className={`text-sm font-semibold ${ok ? "text-green-800" : "text-yellow-800"}`}>
          {hint}
        </span>
      </div>
    </div>
  );
}
