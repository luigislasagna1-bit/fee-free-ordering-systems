"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Building2 } from "lucide-react";

/**
 * Superadmin form for the platform legal-entity / invoicing identity. Internal
 * tool → English (same as the other superadmin settings pages). The values it
 * saves ARE read system-wide by the invoice issuer block, so they're never
 * hardcoded in a page.
 */
// Module-level, NOT inside the component: an inline sub-component is recreated
// every render, so React remounts the <input> on each keystroke and focus is
// lost (the documented "Profile input bug pattern" — hit again here 2026-07-03).
function Field({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; hint?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function CompanySettingsClient({
  initial,
}: {
  initial: {
    companyLegalName: string;
    companyTaxId: string;
    companyAddress: string;
    companySupportEmail: string;
    companyLogoUrl: string;
    companyRegistryNo: string;
    companyWebsite: string;
    updatedAt: string | null;
  };
}) {
  const [legalName, setLegalName] = useState(initial.companyLegalName);
  const [taxId, setTaxId] = useState(initial.companyTaxId);
  const [address, setAddress] = useState(initial.companyAddress);
  const [supportEmail, setSupportEmail] = useState(initial.companySupportEmail);
  const [logoUrl, setLogoUrl] = useState(initial.companyLogoUrl);
  const [registryNo, setRegistryNo] = useState(initial.companyRegistryNo);
  const [website, setWebsite] = useState(initial.companyWebsite);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyLegalName: legalName,
          companyTaxId: taxId,
          companyAddress: address,
          companySupportEmail: supportEmail,
          companyLogoUrl: logoUrl,
          companyRegistryNo: registryNo,
          companyWebsite: website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setSavedAt(Date.now());
    } catch {
      setError("Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Building2 className="w-3.5 h-3.5" /> Settings
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Company / Invoicing</h1>
        <p className="text-sm text-gray-500">
          The legal entity shown as the <strong>issuer</strong> on the subscription invoices your
          restaurants receive. Fee Free Ordering is the merchant of record (its Stripe account charges
          the card), so it must appear as the seller. Set once here — the invoice reads these values
          everywhere, never hardcoded.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <Field
          label="Legal entity name"
          value={legalName}
          onChange={setLegalName}
          placeholder="Fee Free Ordering Inc."
          hint="Falls back to “Fee Free Ordering Inc.” on invoices if left blank."
        />
        <Field
          label="Tax / business number (optional)"
          value={taxId}
          onChange={setTaxId}
          placeholder="e.g. GST/HST 123456789 RT0001 — leave blank if none"
          hint="Canada has no VAT; leave blank until you have a GST/HST number. No tax line is shown when blank."
        />
        <Field
          label="Legal address (optional)"
          value={address}
          onChange={setAddress}
          placeholder="123 Main St, Toronto, ON, Canada"
          hint="Registered business address. Invoices render without an issuer address until this is set."
        />
        <Field
          label="Company registry number (optional)"
          value={registryNo}
          onChange={setRegistryNo}
          placeholder="Corporation No. 1234567-8"
          hint="Type the label too — it prints verbatim in the invoice legal footer (the 'Trade Register no' line on EU invoices; in Canada, your federal/provincial Corporation Number from the certificate of incorporation)."
        />
        <Field
          label="Website (optional)"
          value={website}
          onChange={setWebsite}
          placeholder="www.feefreeordering.com"
          hint="Shown in the invoice legal footer."
        />
        <Field
          label="Support / billing email"
          value={supportEmail}
          onChange={setSupportEmail}
          placeholder="support@feefreeordering.com"
          hint="Falls back to support@feefreeordering.com if left blank."
        />
        <Field
          label="Logo URL (shown on direct invoices)"
          value={logoUrl}
          onChange={setLogoUrl}
          placeholder="https://…/fee-free-logo.png"
          hint="The Fee Free logo shown on invoices for restaurants NOT under a reseller. Reseller invoices show the reseller's own logo instead. Blank = no logo."
        />
        {logoUrl.trim() && (
          <div className="mb-4 -mt-2 flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Preview:</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo preview" className="h-9 object-contain rounded border border-gray-100 bg-gray-50 px-1" />
          </div>
        )}

        {error && (
          <div className="mt-2 mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
