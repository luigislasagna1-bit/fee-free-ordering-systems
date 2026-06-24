import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { getFiscalConfig, isKnownFiscalCountry } from "@/lib/fiscal-countries";
import { getTranslations } from "next-intl/server";
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
        select: { status: true, companyName: true, imprint: true, brandLogoUrl: true, whiteLabelStatus: true },
      },
    },
  });
  if (!restaurant) notFound();

  // ── Biller: reseller (with active white-label) else FeeFreeOrdering ──
  const reseller = restaurant.resellerProfile;
  // Free de-brand tier (Luigi 2026-06-23): an APPROVED reseller who configured branding (imprint
  // OR logo) bills under THEIR identity here — no paid subscription required — so the invoice never
  // leaks "Fee Free Ordering" on a de-branded restaurant. Mirrors isResellerDebranded(); we still
  // require companyName since it's the biller name. (A reseller who set neither stays on platform.)
  const useReseller = !!(
    reseller?.status === "approved" &&
    (reseller.imprint?.trim() || reseller.brandLogoUrl) &&
    reseller.companyName
  );
  const biller = useReseller
    ? { name: reseller!.companyName as string, line: reseller!.imprint ?? "", logo: reseller!.brandLogoUrl ?? null }
    : { name: "Fee Free Ordering", line: "support@feefreeordering.com", logo: null as string | null };

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

  const when = inv.paidAt ?? inv.createdAt;
  const invoiceNo = `INV-${new Date(when).getFullYear()}-${id.slice(-6).toUpperCase()}`;
  const periodLabel = inv.periodStart && inv.periodEnd
    ? `${new Date(inv.periodStart).toLocaleDateString()} – ${new Date(inv.periodEnd).toLocaleDateString()}`
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
        {/* Header — biller + invoice meta */}
        <div className="flex items-start justify-between gap-6 pb-6 border-b border-gray-100">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {biller.logo ? <img src={biller.logo} alt={biller.name} className="h-10 mb-2 object-contain" /> : null}
            <div className="text-lg font-bold text-gray-900">{biller.name}</div>
            {biller.line && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{biller.line}</div>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold tracking-tight text-gray-900">{t("title")}</div>
            <div className="text-xs text-gray-500 mt-1">{t("invoiceNumber")} {invoiceNo}</div>
            <div className="text-xs text-gray-500">{t("issueDate")}: {new Date(when).toLocaleDateString()}</div>
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

        {/* Line items */}
        <table className="w-full text-sm border-t border-gray-100">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="text-left font-semibold py-2">{t("description")}</th>
              <th className="text-right font-semibold py-2">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="py-3 text-gray-800">
                {t("servicesLine")}
                {periodLabel && <div className="text-xs text-gray-500 mt-0.5">{t("period")}: {periodLabel}</div>}
              </td>
              <td className="py-3 text-right text-gray-800 align-top">{amount}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="py-3 text-right font-bold text-gray-900">{t("total")}</td>
              <td className="py-3 text-right font-bold text-gray-900">{amount}</td>
            </tr>
          </tfoot>
        </table>

        <p className="text-xs text-gray-400 mt-8">{t("thankYou")}</p>
      </div>
    </div>
  );
}
