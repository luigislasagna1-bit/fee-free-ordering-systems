import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * POST /api/superadmin/company — set the platform legal-entity / invoicing
 * identity shown as the ISSUER on subscription invoices (PlatformSettings
 * companyLegalName / companyTaxId / companyAddress / companySupportEmail).
 * Superadmin only. Configured ONCE, read system-wide — never hardcoded in a
 * page. Empty string clears a field. (Luigi 2026-07-02.)
 */
export async function POST(req: NextRequest) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    updatedBy: session.user?.email ?? null,
  };

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
