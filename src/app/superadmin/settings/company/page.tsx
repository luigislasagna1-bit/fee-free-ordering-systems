import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { CompanySettingsClient } from "./CompanySettingsClient";

/**
 * Superadmin → Company / Invoicing. The platform legal-entity identity shown as
 * the ISSUER on subscription invoices (the platform is the merchant of record).
 * Configured ONCE here, read system-wide by the invoice page — never hardcoded.
 */
export default async function CompanySettingsPage() {
  // Platform legal/invoicing identity — FULL superadmin only. The layout
  // already bounced unauthenticated visitors to /login; a support user lands
  // on the dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  // Tolerate the columns not yet existing (prod migration may lag the deploy).
  let s: {
    companyLegalName: string | null;
    companyTaxId: string | null;
    companyAddress: string | null;
    companySupportEmail: string | null;
    companyLogoUrl: string | null;
    companyRegistryNo: string | null;
    companyWebsite: string | null;
    updatedAt: Date | null;
  } | null = null;
  try {
    s = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: {
        companyLegalName: true,
        companyTaxId: true,
        companyAddress: true,
        companySupportEmail: true,
        companyLogoUrl: true,
        companyRegistryNo: true,
        companyWebsite: true,
        updatedAt: true,
      },
    });
  } catch {
    s = null;
  }

  return (
    <CompanySettingsClient
      initial={{
        companyLegalName: s?.companyLegalName ?? "",
        companyTaxId: s?.companyTaxId ?? "",
        companyAddress: s?.companyAddress ?? "",
        companySupportEmail: s?.companySupportEmail ?? "",
        companyLogoUrl: s?.companyLogoUrl ?? "",
        companyRegistryNo: s?.companyRegistryNo ?? "",
        companyWebsite: s?.companyWebsite ?? "",
        updatedAt: s?.updatedAt?.toISOString() ?? null,
      }}
    />
  );
}
