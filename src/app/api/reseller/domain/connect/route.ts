import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isResellerView } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/reseller/domain/connect { domain: "partner.com" }
 *
 * Reseller-scoped equivalent of /api/admin/domain/connect-custom. Tier-
 * gated to the white-label Full subscription ($29/mo) — Basic resellers
 * see a "needs Full" error.
 *
 * Validates the domain, registers it with the configured provider
 * (Vercel in production), and stores the resulting status on the
 * ResellerProfile row. Returns the DNS records the reseller must add
 * at their registrar to complete verification.
 *
 * Uniqueness: a domain can be either on a Restaurant or a ResellerProfile,
 * never both. We check both tables before binding to keep the proxy
 * resolution unambiguous.
 */
const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Tier gate ────────────────────────────────────────────────────────
  // Only the Full tier ($29/mo) includes custom domain. Basic resellers
  // can see the page but the connect action returns 402-style copy
  // pointing at the upgrade flow.
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      whiteLabelTier: true,
      whiteLabelStatus: true,
    },
  });
  if (!profile || profile.status !== "approved") {
    return NextResponse.json({ error: "Reseller account not approved" }, { status: 403 });
  }
  if (profile.whiteLabelStatus !== "active" || profile.whiteLabelTier !== "full") {
    return NextResponse.json(
      {
        error:
          "Custom domain requires the White-Label Full subscription. Upgrade at /reseller/branding.",
      },
      { status: 402 },
    );
  }

  // ── Input validation ─────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.domain || "").trim().toLowerCase();
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  // ── Uniqueness — across both Restaurant + ResellerProfile ────────────
  // The proxy resolver uses the host header to route, so a domain
  // double-bound to a restaurant AND a reseller would have ambiguous
  // semantics. We forbid it.
  const [restaurantClash, resellerClash] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { customDomain: domain },
      select: { id: true },
    }),
    prisma.resellerProfile.findFirst({
      where: { customDomain: domain, NOT: { id: user.resellerProfileId } },
      select: { id: true },
    }),
  ]);
  if (restaurantClash) {
    return NextResponse.json({ error: "Domain is already connected to a restaurant" }, { status: 409 });
  }
  if (resellerClash) {
    return NextResponse.json({ error: "Domain is already connected to another reseller" }, { status: 409 });
  }

  // ── Register with the domain provider (Vercel / local stub) ──────────
  const provider = getDomainProvider();
  let dnsRecords;
  try {
    const result = await provider.addDomain(domain);
    dnsRecords = result.dnsRecords;
    await prisma.resellerProfile.update({
      where: { id: user.resellerProfileId },
      data: {
        customDomain: domain,
        customDomainStatus: result.status.verified ? "verified" : "pending",
        customDomainAddedAt: new Date(),
        customDomainError: null,
      },
    });
  } catch (e: any) {
    await prisma.resellerProfile.update({
      where: { id: user.resellerProfileId },
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
