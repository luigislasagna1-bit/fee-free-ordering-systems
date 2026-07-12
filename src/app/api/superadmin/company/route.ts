import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

/**
 * POST /api/superadmin/company — set the platform legal-entity / invoicing
 * identity shown as the ISSUER on subscription invoices (PlatformSettings
 * companyLegalName / companyTaxId / companyAddress / companySupportEmail).
 * Superadmin only. Configured ONCE, read system-wide — never hardcoded in a
 * page. Empty string clears a field. (Luigi 2026-07-02.)
 */
export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, max) : null;
  };
  const data = {
    companyLegalName: str(body.companyLegalName, 120),
    companyTaxId: str(body.companyTaxId, 60),
    companyAddress: str(body.companyAddress, 200),
    companySupportEmail: str(body.companySupportEmail, 120),
    companyLogoUrl: str(body.companyLogoUrl, 500),
    companyRegistryNo: str(body.companyRegistryNo, 120),
    companyWebsite: str(body.companyWebsite, 200),
    updatedBy: user.email ?? null,
  };

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
