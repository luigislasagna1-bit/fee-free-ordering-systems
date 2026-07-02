"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Tag } from "lucide-react";

/**
 * Editor for the reseller's imprint string. The string is appended to
 * receipt footers + transactional email footers for every restaurant
 * attributed to this reseller. Max 200 chars to keep it on one line of
 * a 80mm thermal receipt without wrapping.
 */
export function ImprintClient({
  initialImprint,
  companyName,
  initialCompanyVatId,
  initialShowCredit,
}: {
  initialImprint: string;
  companyName: string | null;
  initialCompanyVatId: string;
  initialShowCredit: boolean;
}) {
  const [imprint, setImprint] = useState(initialImprint);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCredit, setShowCredit] = useState(initialShowCredit);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditSavedAt, setCreditSavedAt] = useState<number | null>(null);
  const [vat, setVat] = useState(initialCompanyVatId);
  const [vatBusy, setVatBusy] = useState(false);
  const [vatSavedAt, setVatSavedAt] = useState<number | null>(null);
  const [vatError, setVatError] = useState<string | null>(null);

  // Save the reseller's VAT / tax number — appears on the "Your local partner"
  // line of the invoices your restaurants receive (the platform is the issuer).
  async function saveVat() {
    setVatBusy(true);
    setVatError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyVatId: vat.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setVatError(data.error || "Could not save"); return; }
      setVatSavedAt(Date.now());
    } catch {
      setVatError("Could not save");
    } finally {
      setVatBusy(false);
    }
  }

  // The customer-page credit toggle saves immediately on change (optimistic;
  // reverts if the PATCH fails). Separate from the imprint "Save" button.
  async function saveCredit(next: boolean) {
    setShowCredit(next);
    setCreditBusy(true);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCustomerPageCredit: next }),
      });
      if (!res.ok) {
        setShowCredit(!next); // revert on failure
      } else {
        setCreditSavedAt(Date.now());
      }
    } catch {
      setShowCredit(!next);
    } finally {
      setCreditBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imprint: imprint.trim() }),
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

  // Suggest a starter imprint based on company name if the field is empty
  // — gets a brand-new reseller from "blank" to "looks reasonable" in one
  // click. They can edit before saving.
  const suggested = companyName
    ? `Supported by ${companyName}`
    : "Supported by Your Partner LLC | contact@partner.com";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Tag className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Imprint</h1>
        <p className="text-sm text-gray-500">
          Small line of text added to the footer of <strong>transactional emails</strong>
          (order confirmations, password resets, customer account emails) sent on behalf of
          every restaurant attributed to you. Gives you visibility without intruding on the
          restaurant&apos;s brand.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          <strong>Not</strong> applied to physical thermal receipts — those stay 100% the
          restaurant&apos;s brand. Your imprint only appears on outgoing emails.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
          Imprint text
        </label>
        <textarea
          value={imprint}
          onChange={(e) => setImprint(e.target.value.slice(0, 200))}
          rows={3}
          placeholder={suggested}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-gray-400">
            Max 200 characters. Use &quot; | &quot; (pipe) to separate name, email, phone — keeps it on one
            line of a thermal receipt.
          </span>
          <span className="text-[11px] text-gray-400">{imprint.length} / 200</span>
        </div>

        {!imprint && (
          <button
            type="button"
            onClick={() => setImprint(suggested)}
            className="mt-2 text-xs text-emerald-700 font-semibold hover:underline"
          >
            Use suggested: &ldquo;{suggested}&rdquo;
          </button>
        )}

        {/* Preview matches the actual EmailFooter rendering:
            11px font, muted grey, "Powered by <bold imprint>".
            Receipts intentionally not previewed — they don't show the
            imprint at all. */}
        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-3">
            Preview — appears at the bottom of every transactional email
          </div>
          <div className="bg-white border border-gray-100 rounded-md p-4">
            <div className="text-sm text-gray-700 mb-3">[ email body content here … ]</div>
            <hr className="border-gray-200 mb-3" />
            <div className="text-[11px] text-gray-400 leading-relaxed">
              Powered by{" "}
              <strong className="text-gray-500">{imprint || suggested}</strong>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            Tiny, muted, doesn&apos;t overshadow the restaurant&apos;s own contact info that appears
            above this line in real emails.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save imprint
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <strong>Scope:</strong> applies to <em>outgoing emails only</em> for every restaurant
        attributed to you — order confirmations, password resets, reservation confirmations,
        etc. Per-restaurant overrides aren&apos;t supported yet, so keep this line generic to
        your brand.
      </div>

      {/* Invoice details — the reseller's VAT / tax number, shown as the ISSUER
          (alongside your company name) on the invoices your restaurants receive. */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Invoice details</h2>
        <p className="text-sm text-gray-500 mb-4">
          On the subscription invoices your restaurants receive,{" "}
          <strong>{companyName || "your company"}</strong> is shown as the{" "}
          <strong>&ldquo;local partner&rdquo;</strong> (your logo also leads the header). Add your
          VAT / tax number so it appears next to your company on those invoices. The invoice is
          legally issued by Fee Free Ordering Inc. (the merchant of record that charges the card),
          with your company as the prominent local partner.
          {!companyName && (
            <span className="block text-xs text-amber-700 mt-1">
              Set your company name on your profile first — it&apos;s your partner name on invoices.
            </span>
          )}
        </p>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
          VAT / tax number
        </label>
        <input
          type="text"
          value={vat}
          onChange={(e) => setVat(e.target.value.slice(0, 60))}
          placeholder="e.g. IT01234567890"
          className="w-full max-w-sm border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
        />
        {vatError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{vatError}</div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={saveVat}
            disabled={vatBusy}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {vatBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save VAT number
          </button>
          {vatSavedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Customer ordering-page credit — distinct from the email imprint above. Controls
          whether your restaurants' customer ordering pages show "Powered by {companyName}"
          in place of the (hidden) Fee Free credit. Saved via the same branding PATCH. */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Customer ordering page credit</h2>
        <p className="text-sm text-gray-500 mb-4">
          Restaurants you bring on never show &ldquo;Powered by Fee Free Ordering&rdquo; on their
          ordering pages. You can show <strong>your own</strong> credit there instead.
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCredit}
            disabled={creditBusy}
            onChange={(e) => saveCredit(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-gray-700">
            Show <strong>&ldquo;Powered by {companyName || "your company"}&rdquo;</strong> on your
            restaurants&apos; customer ordering pages.
            {!companyName && (
              <span className="block text-xs text-amber-700 mt-1">
                Set your company name on your profile first — without it there&apos;s no name to show.
              </span>
            )}
          </span>
        </label>
        <div className="flex items-center gap-2 mt-3 h-4">
          {creditBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          {!creditBusy && creditSavedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
          Off = a fully clean ordering page (no credit at all). This only takes effect once
          you&apos;ve set an imprint or logo (which is what de-brands your restaurants).
        </p>
      </div>
    </div>
  );
}
