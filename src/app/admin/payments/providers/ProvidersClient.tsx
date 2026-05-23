"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard, CheckCircle, XCircle, AlertCircle, Loader2,
  ExternalLink, Shield, Zap, Lock,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

type RestaurantState = {
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
} | null;

interface Props {
  restaurant: RestaurantState;
  stripeConfigured: boolean;
  /** True when the restaurant has subscribed to the Online Payments add-on
   *  (i.e. has the `card_payments` feature). Required before connecting
   *  Stripe is actually useful — without it, the /api/public/payment-intent
   *  gate rejects card charges. */
  hasOnlinePaymentsAddOn: boolean;
  /** True when "online_card" is currently in the restaurant's Accepted
   *  Methods. An owner can subscribe to the add-on but choose not to
   *  surface online card payment to customers — Stripe onboarding shouldn't
   *  feel mandatory in that case. */
  onlineCardEnabled: boolean;
}

export function ProvidersClient({
  restaurant,
  stripeConfigured,
  hasOnlinePaymentsAddOn,
  onlineCardEnabled,
}: Props) {
  const params = useSearchParams();
  const justConnected = params.get("status") === "connected";

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = !!restaurant?.stripeAccountId;
  const charges = !!restaurant?.stripeChargesEnabled;
  const payouts = !!restaurant?.stripePayoutsEnabled;
  const status = restaurant?.stripeAccountStatus || "not_connected";

  async function startOnboarding() {
    setBusy("onboard");
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start onboarding");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start onboarding");
    } finally {
      setBusy(null);
    }
  }

  async function refreshStatus() {
    setBusy("refresh");
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/status");
      if (!res.ok) {
        setError("Could not refresh status");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect your Stripe account? You won't be able to accept payments until you reconnect.")) return;
    setBusy("disconnect");
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not disconnect");
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
        <h1 className="text-2xl font-bold text-gray-900">Accept payments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your Stripe account to accept card payments from your customers.
          Money lands directly in your Stripe balance — Fee Free Ordering takes
          0% per order. You only pay Stripe&apos;s standard processing fee.
        </p>
      </div>

      {!stripeConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Payments not yet enabled</p>
            <p className="text-sm text-amber-700 mt-1">
              The platform hasn't finished setting up Stripe. Contact support to enable
              online payments for your restaurant.
            </p>
          </div>
        </div>
      )}

      {/* Entitlement gate — if the restaurant hasn't subscribed to Online
          Payments, connecting Stripe alone doesn't unlock card charges. The
          customer-side /api/public/payment-intent rejects with 402 until
          hasFeature(card_payments) returns true. Lead with the add-on. */}
      {stripeConfigured && !hasOnlinePaymentsAddOn && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-orange-900">
              Subscribe to Online Payments first
            </p>
            <p className="text-sm text-orange-800 mt-1">
              Card payments are unlocked by the <strong>Online Payments</strong> add-on.
              Without it, even a connected Stripe account can&apos;t accept card charges
              from your customers — they&apos;ll get redirected to cash / pay-at-store only.
              You can still set up Stripe Connect now and the add-on later, but you won&apos;t
              accept cards until both are done.
            </p>
            <Link
              href="/admin/billing/add-ons"
              className="inline-flex items-center gap-2 mt-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              View add-ons
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Has the add-on, has online_card enabled in Accepted Methods, but no
          Stripe yet. This is the only state where we should push connecting
          Stripe prominently — otherwise the owner has consciously opted out
          of online card payment and we shouldn't nag. */}
      {stripeConfigured && hasOnlinePaymentsAddOn && onlineCardEnabled && !restaurant?.stripeAccountId && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <Zap className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              You&apos;re subscribed to Online Payments — one step left
            </p>
            <p className="text-sm text-blue-800 mt-1">
              Connect your Stripe account below to start accepting card payments.
              Onboarding takes about 5 minutes.
            </p>
          </div>
        </div>
      )}

      {/* Has the add-on, but online_card is NOT in Accepted Methods. The
          owner is paying for the entitlement but hasn't actually turned
          card payment on for customers. Surface that and link to the
          right place — don't push Stripe Connect. */}
      {stripeConfigured && hasOnlinePaymentsAddOn && !onlineCardEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Online card payment is currently OFF
            </p>
            <p className="text-sm text-amber-800 mt-1">
              You&apos;re subscribed to the Online Payments add-on, but customers
              can&apos;t pay by card yet — you haven&apos;t enabled it in Accepted
              Methods. Connecting Stripe alone won&apos;t change that.
            </p>
            <Link
              href="/admin/payments"
              className="inline-flex items-center gap-2 mt-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Enable in Accepted Methods
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {justConnected && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-800">Returned from Stripe</p>
            <p className="text-sm text-green-700 mt-1">
              We're syncing your account status. Refresh in a moment if it doesn't update.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#635BFF] rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Stripe</div>
              <div className="text-xs text-gray-500">Connect account · Express onboarding</div>
            </div>
          </div>
          {connected && (
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                charges
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {charges ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {charges ? "Connected" : "Setup incomplete"}
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {!connected && (
            <>
              <div className="space-y-3">
                <Feature
                  icon={<Zap className="w-4 h-4" />}
                  title="One-click onboarding"
                  body="Sign in or create your Stripe account in a few minutes."
                />
                <Feature
                  icon={<Shield className="w-4 h-4" />}
                  title="No card data on our servers"
                  body="Card details go straight to Stripe — we never see them."
                />
                <Feature
                  icon={<CreditCard className="w-4 h-4" />}
                  title="Money lands in your bank"
                  body="Stripe pays you directly. Fee Free Ordering takes 0% per order — you only pay Stripe's processing fee."
                />
              </div>
              <button
                onClick={startOnboarding}
                disabled={busy !== null || !stripeConfigured}
                className="w-full flex items-center justify-center gap-2 bg-[#635BFF] hover:bg-[#5048df] text-white font-semibold px-5 py-3 rounded-xl text-sm transition disabled:opacity-50"
              >
                {busy === "onboard" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Connect with Stripe
              </button>
            </>
          )}

          {connected && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatusTile
                  label="Accept charges"
                  ok={charges}
                  hint={charges ? "Live" : "Pending verification"}
                />
                <StatusTile
                  label="Bank payouts"
                  ok={payouts}
                  hint={payouts ? "Enabled" : "Pending"}
                />
              </div>
              <p className="text-xs text-gray-500">
                Account status: <span className="font-mono">{status}</span>
              </p>
              {!charges && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                  Stripe still needs more info to enable charges. Click below to finish
                  onboarding.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!charges && (
                  <button
                    onClick={startOnboarding}
                    disabled={busy !== null}
                    className="flex items-center gap-2 bg-[#635BFF] hover:bg-[#5048df] text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                  >
                    {busy === "onboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Finish onboarding
                  </button>
                )}
                <button
                  onClick={refreshStatus}
                  disabled={busy !== null}
                  className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                >
                  {busy === "refresh" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh status"}
                </button>
                <button
                  onClick={disconnect}
                  disabled={busy !== null}
                  className="flex items-center gap-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                >
                  {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{body}</div>
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
