import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/admin/domain/connect-custom { domain: "luigis.ca" }
 *
 * Validates the input, registers the domain with the configured provider
 * (Vercel in production, local stub otherwise), and stores the resulting
 * status on the Restaurant row.
 *
 * On success, returns the DNS records the user must add at their registrar.
 */

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = String(body?.domain || "").trim().toLowerCase();
  // Strip protocol + trailing slash if user pastes a full URL
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const taken = await prisma.restaurant.findFirst({
    where: { customDomain: domain, NOT: { id: user.restaurantId } },
    select: { id: true },
  });
  if (taken) return NextResponse.json({ error: "Domain is already connected to another restaurant" }, { status: 409 });

  const provider = getDomainProvider();
  let dnsRecords;
  try {
    const result = await provider.addDomain(domain);
    dnsRecords = result.dnsRecords;
    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: {
        customDomain: domain,
        customDomainStatus: result.status.verified ? "verified" : "pending",
        customDomainAddedAt: new Date(),
        customDomainError: null,
      },
    });
  } catch (e: any) {
    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: {
        customDomain: domain,
        customDomainStatus: "error",
        customDomainError: e?.message ?? String(e),
      },
    });
    return NextResponse.json({ error: e?.message ?? "Provider error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, domain, dnsRecords, providerIsDevStub: provider.isDevStub });
}
