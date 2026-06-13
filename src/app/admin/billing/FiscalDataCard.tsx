"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { getFiscalConfig, isKnownFiscalCountry, FISCAL_COUNTRY_CODES } from "@/lib/fiscal-countries";

type Profile = {
  legalName: string; taxId: string; taxIdType: string; billingEmail: string;
  addressLine1: string; addressLine2: string; city: string; state: string;
  postalCode: string; country: string; sdiCode: string; pec: string;
};

const EMPTY: Profile = {
  legalName: "", taxId: "", taxIdType: "", billingEmail: "",
  addressLine1: "", addressLine2: "", city: "", state: "",
  postalCode: "", country: "", sdiCode: "", pec: "",
};

// Manual Stripe tax-id types — only offered for countries we don't have an
// explicit scheme for (the "Other" fallback). Value is the Stripe `type`.
const TAX_ID_TYPES: Array<{ value: string; label: string }> = [
  { value: "", label: "—" },
  { value: "eu_vat", label: "EU VAT" },
  { value: "gb_vat", label: "UK VAT" },
  { value: "ch_vat", label: "Switzerland VAT" },
  { value: "au_abn", label: "Australia ABN" },
  { value: "ca_gst_hst", label: "Canada GST/HST" },
  { value: "us_ein", label: "US EIN" },
  { value: "no_vat", label: "Norway VAT" },
];

export function FiscalDataCard() {
  const t = useTranslations("admin.billing");
  const locale = useLocale();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/restaurants/billing-profile");
        const data = await res.json();
        if (!cancelled && data.profile) setForm({ ...EMPTY, ...data.profile });
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof Profile, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  // Country drives which fiscal fields show, their labels, and the Stripe type.
  const fiscal = getFiscalConfig(form.country);
  const knownCountry = isKnownFiscalCountry(form.country);

  // Localized country names for the picker, sorted by name in the UI language.
  const countryOptions = useMemo(() => {
    let display: Intl.DisplayNames | null = null;
    try { display = new Intl.DisplayNames([locale], { type: "region" }); } catch { /* older runtime */ }
    return FISCAL_COUNTRY_CODES
      .map((code) => ({ code, name: display?.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  // Changing country auto-applies that country's Stripe tax-id type and clears
  // Italy-only fields when they no longer apply, so we never save stale SDI/PEC.
  function onCountryChange(country: string) {
    const cfg = getFiscalConfig(country);
    setForm((f) => ({
      ...f,
      country,
      taxIdType: isKnownFiscalCountry(country) ? cfg.taxIdType : f.taxIdType,
      sdiCode: cfg.showSdiPec ? f.sdiCode : "",
      pec: cfg.showSdiPec ? f.pec : "",
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/restaurants/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const label = "block text-xs font-semibold text-gray-700 mb-1";

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <FileText className="w-5 h-5 text-emerald-600" /> {t("fiscalTitle")}
      </h2>
      <p className="text-sm text-gray-500 mb-4">{t("fiscalSubtitle")}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Country first — it decides which fiscal fields appear below. */}
            <div>
              <label className={label}>{t("fiscalCountry")}</label>
              <select className={input} value={form.country} onChange={(e) => onCountryChange(e.target.value)}>
                <option value="">—</option>
                {countryOptions.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            {/* Manual Stripe tax-id type only for countries without a built-in
                scheme; known countries set it automatically from the country. */}
            {knownCountry ? (
              <div className="hidden sm:block" />
            ) : (
              <div>
                <label className={label}>{t("fiscalTaxIdType")}</label>
                <select className={input} value={form.taxIdType} onChange={(e) => set("taxIdType", e.target.value)}>
                  {TAX_ID_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className={label}>{t("fiscalLegalName")}</label>
              <input className={input} value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder={t("fiscalLegalNamePlaceholder")} />
            </div>

            {/* Tax id — label + placeholder come from the selected country
                (GST/HST, Partita IVA, VAT, EIN, …); these are the country's own
                fiscal terms, shown verbatim in every UI language. */}
            <div className="sm:col-span-2">
              <label className={label}>{knownCountry ? fiscal.taxIdLabel : t("fiscalTaxId")}</label>
              <input
                className={input}
                value={form.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                placeholder={fiscal.taxIdPlaceholder || "—"}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={label}>{t("fiscalBillingEmail")}</label>
              <input type="email" className={input} value={form.billingEmail} onChange={(e) => set("billingEmail", e.target.value)} placeholder="accounting@restaurant.com" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>{t("fiscalAddress1")}</label>
              <input className={input} value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>{t("fiscalAddress2")}</label>
              <input className={input} value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
            </div>
            <div>
              <label className={label}>{t("fiscalCity")}</label>
              <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className={label}>{t("fiscalState")}</label>
              <input className={input} value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div>
              <label className={label}>{t("fiscalPostalCode")}</label>
              <input className={input} value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            <div className="hidden sm:block" />

            {/* Italy e-invoicing (SDI recipient code + PEC) — only for Italy. */}
            {fiscal.showSdiPec && (
              <>
                <div>
                  <label className={label}>{t("fiscalSdi")}</label>
                  <input className={input} value={form.sdiCode} onChange={(e) => set("sdiCode", e.target.value)} placeholder="0000000" />
                </div>
                <div>
                  <label className={label}>{t("fiscalPec")}</label>
                  <input type="email" className={input} value={form.pec} onChange={(e) => set("pec", e.target.value)} />
                </div>
              </>
            )}

            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t("fiscalSave")}
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> {t("fiscalSaved")}
                </span>
              )}
            </div>
            <p className="sm:col-span-2 text-xs text-gray-400">{t("fiscalHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
