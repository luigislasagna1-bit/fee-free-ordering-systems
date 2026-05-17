"use client";

import { useState } from "react";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";

type Initial = {
  email: string;
  name: string;
  companyName: string;
  website: string;
  country: string;
  payoutMethod: "paypal" | "bank" | "other" | null;
  payoutDetails: string | null;
  referralCode: string;
  referralUrl: string;
};

export function ProfileClient({ initial }: { initial: Initial }) {
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [website, setWebsite] = useState(initial.website);
  const [country, setCountry] = useState(initial.country);
  const [payoutMethod, setPayoutMethod] = useState<"paypal" | "bank" | "other" | "">(initial.payoutMethod ?? "");
  const [payoutDetails, setPayoutDetails] = useState(initial.payoutDetails ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        companyName,
        website,
        country,
        payoutMethod: payoutMethod || null,
      };
      // Only send payoutDetails if the user typed something new (preserves existing on no-op save)
      if (payoutDetails && payoutDetails !== initial.payoutDetails) {
        body.payoutDetails = payoutDetails;
      }
      const res = await fetch("/api/reseller/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  function copyReferral() {
    navigator.clipboard.writeText(initial.referralUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Profile & referral</h1>
        <p className="text-sm text-gray-500">Manage your details, payout method, and referral link.</p>
      </div>

      {/* Referral block */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Your referral link</h2>
        <p className="text-xs text-gray-500 mb-3">
          Anyone who signs up using this link is automatically attributed to your account. Earnings start once
          the restaurant becomes active (paid subscription).
        </p>
        <div className="flex gap-2">
          <code className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-700 break-all">
            {initial.referralUrl}
          </code>
          <button
            onClick={copyReferral}
            className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Referral code: <code>{initial.referralCode}</code>
        </div>
      </div>

      {/* Profile form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Profile</h2>
        <div className="space-y-3">
          <Field label="Account email">
            <input type="text" disabled value={initial.email} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
          </Field>
          <Field label="Company name">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <input
                type="url"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </Field>
            <Field label="Country">
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Payout method */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-1">Payout method</h2>
        <p className="text-xs text-gray-500 mb-4">
          How you'd like to receive payouts. Details are encrypted at rest.
        </p>
        <div className="space-y-3">
          <Field label="Method">
            <select
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value as any)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            >
              <option value="">Choose…</option>
              <option value="paypal">PayPal</option>
              <option value="bank">Bank transfer</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {payoutMethod && (
            <Field
              label={
                payoutMethod === "paypal"
                  ? "PayPal email"
                  : payoutMethod === "bank"
                  ? "Bank details (routing/account or IBAN)"
                  : "Payment details"
              }
            >
              <textarea
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
              {initial.payoutDetails && (
                <p className="text-[11px] text-green-600 mt-1">Details saved. Edit to overwrite.</p>
              )}
            </Field>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700">Saved.</div>
      )}

      <div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
