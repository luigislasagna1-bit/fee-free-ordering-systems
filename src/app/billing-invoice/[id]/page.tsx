import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { getFiscalConfig, isKnownFiscalCountry } from "@/lib/fiscal-countries";
import { isEuViesCountry } from "@/lib/vies";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "./PrintButton";

/**
 * Platform-generated, branded invoice for one SubscriptionInvoice — billed by
 * FeeFreeOrdering, OR by the reseller that signed up the restaurant (when the
 * reseller has active white-label). Downloadable via the browser's print → PDF,
 * straight from the platform (no Stripe link). Carries the restaurant's saved
 * fiscal details. (Report cmpxe5fd2 follow-up, Luigi 2026-06-04.)
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin.invoice");
  // Localize invoice dates to the viewer's language (system-wide, never a fixed
  // format). Luigi 2026-07-02.
  const locale = await getLocale();
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) notFound();

  // Ownership-scoped: the invoice MUST belong to this restaurant.
  const inv = await prisma.subscriptionInvoice.findFirst({
    where: { id, restaurantId },
  });
  if (!inv) notFound();

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true, address: true, city: true, state: true, zip: true, country: true,
      email: true, phone: true,
      billingProfile: true,
      resellerProfile: {
        select: { status: true, companyName: true, companyVatId: true, imprint: true, brandLogoUrl: true, whiteLabelStatus: true },
      },
    },
  });
  if (!restaurant) notFound();

  // ── Issuer (legal seller) + optional reseller "local partner" ──────────────
  // The PLATFORM is the merchant of record (its Stripe account charged the
  // card), so it is the legal ISSUER on EVERY invoice, including reseller
  // de-branded ones — it can never be omitted from a fiscal document. A
  // reseller appears as the prominent "Your local partner" (logo leads the
  // header; name + VAT in the footer). This mirrors the GloriaFood/Oracle model
  // the reporter cited. (Luigi 2026-07-02, invoice-issuer analysis; supersedes
  // the earlier reseller-as-issuer approach.)
  const reseller = restaurant.resellerProfile;
  const showPartner = !!(
    reseller?.status === "approved" &&
    (reseller.imprint?.trim() || reseller.brandLogoUrl) &&
    reseller.companyName
  );
  // Platform legal-entity identity — read from PlatformSettings (configurable
  // system-wide, never hardcoded); safe defaults so it always renders a valid
  // issuer even before the superadmin fills it in.
  const platform = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { companyLegalName: true, companyTaxId: true, companyAddress: true, companySupportEmail: true, companyLogoUrl: true, companyRegistryNo: true, companyWebsite: true },
  }).catch(() => null);
  const issuer = {
    name: platform?.companyLegalName?.trim() || "Fee Free Ordering Inc.",
    taxId: platform?.companyTaxId?.trim() || "",
    address: platform?.companyAddress?.trim() || "",
    email: platform?.companySupportEmail?.trim() || "support@feefreeordering.com",
    // Registry line ("Trade Register no" on the Oracle sample; Canada =
    // Corporation Number) + website — both free text incl. their own label,
    // set in Superadmin → Company. Luigi 2026-07-03.
    registryNo: platform?.companyRegistryNo?.trim() || "",
    website: platform?.companyWebsite?.trim() || "www.feefreeordering.com",
    // The Fee Free logo — shown ONLY on DIRECT (non-reseller) invoices; a
    // reseller invoice shows the reseller's own logo instead. Luigi 2026-07-02.
    logo: platform?.companyLogoUrl?.trim() || "",
  };
  const partner = showPartner
    ? {
        name: reseller!.companyName as string,
        logo: reseller!.brandLogoUrl ?? null,
        vat: reseller!.companyVatId?.trim() ?? "",
      }
    : null;

  // ── Bill-to: saved fiscal details, falling back to the restaurant record ──
  const bp = restaurant.billingProfile;
  const billToName = bp?.legalName || restaurant.name;
  const billToTaxId = bp?.taxId || "";
  // Country-specific label for the tax id (GST/HST, P.IVA, VAT, EIN…), falling
  // back to the generic "VAT ID" string for unknown countries.
  const billToTaxLabel = isKnownFiscalCountry(bp?.country)
    ? getFiscalConfig(bp?.country).taxIdShort
    : t("vatId");
  const billToAddress = [
    bp?.addressLine1 || restaurant.address,
    bp?.city || restaurant.city,
    [bp?.state || restaurant.state, bp?.postalCode || restaurant.zip].filter(Boolean).join(" "),
    bp?.country || restaurant.country,
  ].filter(Boolean).join(", ");
  const billToEmail = bp?.billingEmail || restaurant.email || "";

  // EU B2B reverse charge (Fabrizio cmr1ty0lc, 2026-07-03): an EU restaurant
  // whose VAT number is VIES-VALIDATED is invoiced at 0% with the Art. 44
  // note — the GloriaFood/Oracle model. (EU restaurants WITHOUT a validated
  // number can't start paid subscriptions at all — Option A — so an EU
  // invoice without this flag shouldn't normally exist.)
  const euReverseCharge =
    isEuViesCountry(bp?.country) && !!bp?.taxId && bp?.taxIdViesValid === true;

  const when = inv.paidAt ?? inv.createdAt;
  const invoiceNo = `INV-${new Date(when).getFullYear()}-${id.slice(-6).toUpperCase()}`;
  // Stable per-restaurant customer number + the Stripe payment reference —
  // both on the Oracle sample ("Customer number" / "Payment Gateway ID") and
  // what support/accountants use to match a payment to the processor.
  const customerNo = `C-${restaurantId.slice(-8).toUpperCase()}`;
  const paymentRef = inv.stripeInvoiceId || "";
  // Restaurant identification inside the line item (Oracle prints ID + name +
  // address there, so the invoice says exactly WHICH location was served).
  const restaurantAddress = [
    restaurant.address,
    restaurant.city,
    [restaurant.state, restaurant.zip].filter(Boolean).join(" "),
    restaurant.country,
  ].filter(Boolean).join(", ");
  const periodLabel = inv.periodStart && inv.periodEnd
    ? `${new Date(inv.periodStart).toLocaleDateString(locale)} – ${new Date(inv.periodEnd).toLocaleDateString(locale)}`
    : null;
  const amount = formatCurrency(inv.amountPaid / 100, inv.currency);
  const isPaid = inv.status === "paid";

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between no-print">
        <Link href="/admin/billing" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </Link>
        <PrintButton label={t("download")} />
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:shadow-none print:border-0">
        {/* Header — issuer (legal seller) + invoice meta. A reseller's logo
            leads for a de-branded account (visual primacy), but the named
            issuer below is always the platform (merchant of record). */}
        <div className="flex items-start justify-between gap-6 pb-6 border-b border-gray-100">
          <div className="min-w-0">
            {/* Logo: a RESELLER invoice shows the reseller's own logo (de-brand);
                a DIRECT invoice shows the Fee Free logo. (Luigi 2026-07-02.) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {partner?.logo ? (
              <img src={partner.logo} alt={partner.name} className="h-10 mb-2 object-contain" />
            ) : !partner && issuer.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={issuer.logo} alt={issuer.name} className="h-10 mb-2 object-contain" />
            ) : null}
            <div className="text-lg font-bold text-gray-900">{issuer.name}</div>
            {issuer.taxId && <div className="text-xs text-gray-500 mt-0.5">{issuer.taxId}</div>}
            {issuer.address && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{issuer.address}</div>}
            <div className="text-xs text-gray-500 mt-0.5">{issuer.email}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold tracking-tight text-gray-900">{t("title")}</div>
            <div className="text-xs text-gray-500 mt-1">{t("invoiceNumber")} {invoiceNo}</div>
            <div className="text-xs text-gray-500">{t("issueDate")}: {new Date(when).toLocaleDateString(locale)}</div>
            <div className="text-xs text-gray-500">{t("customerNo")}: {customerNo}</div>
            {paymentRef && <div className="text-xs text-gray-500 break-all">{t("paymentRef")}: {paymentRef}</div>}
            <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isPaid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              {isPaid ? t("statusPaid") : t("statusDue")}
            </span>
          </div>
        </div>

        {/* Bill-to */}
        <div className="py-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{t("billedTo")}</div>
          <div className="text-sm font-semibold text-gray-900">{billToName}</div>
          {billToTaxId && <div className="text-sm text-gray-600">{billToTaxLabel}: {billToTaxId}</div>}
          {billToAddress && <div className="text-sm text-gray-600">{billToAddress}</div>}
          {billToEmail && <div className="text-sm text-gray-600">{billToEmail}</div>}
        </div>

        {/* Line items — Nr/Qty/Description/Unit-price/Price like the Oracle
            sample, with the served restaurant identified INSIDE the line so
            the invoice says which location the service was for. */}
        <table className="w-full text-sm border-t border-gray-100">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="text-left font-semibold py-2 pr-2 w-8">{t("lineNo")}</th>
              <th className="text-left font-semibold py-2 pr-2 w-10">{t("qty")}</th>
              <th className="text-left font-semibold py-2">{t("description")}</th>
              <th className="text-right font-semibold py-2 pl-2 whitespace-nowrap">{t("unitPrice")}</th>
              <th className="text-right font-semibold py-2 pl-2 whitespace-nowrap">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="py-3 text-gray-500 align-top">1</td>
              <td className="py-3 text-gray-500 align-top">1</td>
              <td className="py-3 text-gray-800">
                {t("servicesLine")}
                {periodLabel && <div className="text-xs text-gray-500 mt-0.5">{t("period")}: {periodLabel}</div>}
                <div className="text-xs text-gray-500 mt-0.5">{t("restaurantIdLabel")}: {customerNo}</div>
                <div className="text-xs text-gray-500">{t("restaurantNameLabel")}: {restaurant.name}</div>
                {restaurantAddress && <div className="text-xs text-gray-500">{t("restaurantAddressLabel")}: {restaurantAddress}</div>}
              </td>
              <td className="py-3 text-right text-gray-800 align-top whitespace-nowrap">{amount}</td>
              <td className="py-3 text-right text-gray-800 align-top whitespace-nowrap">{amount}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="py-2 text-right font-semibold text-gray-700">{t("subTotal")}</td>
              <td className="py-2 text-right font-semibold text-gray-700 whitespace-nowrap">{amount}</td>
            </tr>
            {/* Tax line — always shown, like the Oracle sample. 0% today for
                EVERY invoice: EU B2B = reverse charge, everyone else = no tax
                collected yet (Canadian GST/HST arrives with Stripe Tax at
                Stripe-Live setup — revisit this row then). */}
            <tr className="border-t border-gray-100">
              <td colSpan={4} className="py-2 text-right text-gray-600">{t("taxRateAmount", { rate: "0.00" })}</td>
              <td className="py-2 text-right text-gray-600 whitespace-nowrap">{formatCurrency(0, inv.currency)}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="py-3 text-right font-bold text-gray-900">{t("total")}</td>
              <td className="py-3 text-right font-bold text-gray-900 whitespace-nowrap">{amount}</td>
            </tr>
          </tfoot>
        </table>

        {/* Art. 44 reverse-charge disclosure — required wording for a 0% EU
            B2B cross-border service sale (mirrors the Oracle invoice). */}
        {euReverseCharge && (
          <p className="text-xs text-gray-500 mt-4">{t("reverseChargeNote")}</p>
        )}

        {/* Reseller "local partner" line (GloriaFood/Oracle model): the reseller's
            identity + its own VAT live HERE, clearly attributed to the partner —
            never in the issuer slot above. */}
        {partner && (
          <p className="text-sm text-gray-600 mt-8 pt-4 border-t border-gray-100">
            <span className="font-semibold text-gray-500">{t("localPartner")}:</span>{" "}
            {partner.name}
            {partner.vat ? ` · ${t("vatId")} ${partner.vat}` : ""}
          </p>
        )}

        {/* Issuer legal footer — the full corporate-identity block the Oracle
            sample carries (name / registry no / tax no / HQ / contact / web),
            plus the license-terms statement. Values come from Superadmin →
            Company; blank fields are simply omitted. */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 leading-relaxed">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-semibold text-gray-600">
            <span>{issuer.name}</span>
            <span>{issuer.email}</span>
            {issuer.website && <span>{issuer.website}</span>}
          </div>
          {issuer.registryNo && <div className="mt-1">{issuer.registryNo}</div>}
          {issuer.taxId && <div>{issuer.taxId}</div>}
          {issuer.address && <div className="whitespace-pre-line">{issuer.address}</div>}
          <p className="mt-2 text-gray-400">{t("licenseNote")}</p>
        </div>

        <p className="text-xs text-gray-400 mt-4">{t("thankYou")}</p>
      </div>
    </div>
  );
}
