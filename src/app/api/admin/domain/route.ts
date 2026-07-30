import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * GET /api/admin/domain — return the current domain state for the active
 * restaurant. The UI uses this on mount + after every mutation so the
 * server stays the source of truth.
 *
 * When a domain switch is pending (or a first connect isn't verified yet),
 * the response includes the DNS records for whichever domain still needs
 * registrar work — recomputed from the provider so they survive page
 * reloads (they used to live only in client state and vanish on refresh,
 * which is how the 2026-07-30 incident's "I was never told which records"
 * happened).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: {
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
      customDomainAddedAt: true,
      customDomainError: true,
      pendingCustomDomain: true,
      previousCustomDomain: true,
    },
  });

  // DNS records for the domain still awaiting registrar work, if any.
  let dnsRecords = null;
  const needsSetup = r?.pendingCustomDomain
    ? r.pendingCustomDomain
    : r?.customDomain && r.customDomainStatus !== "verified"
      ? r.customDomain
      : null;
  if (needsSetup) {
    try {
      dnsRecords = await getDomainProvider().getDomainSetup(needsSetup);
    } catch (e: any) {
      console.warn("[domain GET] getDomainSetup failed:", e?.message);
    }
  }

  return NextResponse.json({
    ...r,
    dnsRecords,
    platformDomain: process.env.PLATFORM_DOMAIN || "localtest.me",
    providerIsDevStub: (process.env.DOMAIN_PROVIDER || "local").toLowerCase() === "local",
  });
}
