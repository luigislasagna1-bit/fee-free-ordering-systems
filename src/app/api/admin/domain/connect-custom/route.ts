import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";
import { hasFeature } from "@/lib/entitlements";

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

  // Paid feature gate — Custom Domain add-on at $9.99/mo grants the
  // `custom_domain_routing` entitlement. Without it we reject before
  // touching the Vercel API (no point burning a registration call on
  // a request that wouldn't be billed for). UI mirrors this with an
  // "Activate add-on" CTA in place of the connect input.
  const allowed = await hasFeature(user.restaurantId, "custom_domain_routing");
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Custom Domain requires the $9.99/mo Custom Domain add-on. Activate it at /admin/billing/add-ons to continue.",
      },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = String(body?.domain || "").trim().toLowerCase();
  // Strip protocol + trailing slash if user pastes a full URL
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  // Uniqueness across BOTH restaurant + reseller tables. Reseller
  // custom domains live on ResellerProfile (the White-Label Full tier
  // feature); double-binding a domain to a restaurant + a reseller
  // would create ambiguous proxy resolution.
  const [restaurantClash, resellerClash] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { customDomain: domain, NOT: { id: user.restaurantId } },
      select: { id: true },
    }),
    prisma.resellerProfile.findFirst({
      where: { customDomain: domain },
      select: { id: true },
    }),
  ]);
  if (restaurantClash) return NextResponse.json({ error: "Domain is already connected to another restaurant" }, { status: 409 });
  if (resellerClash) return NextResponse.json({ error: "Domain is already in use by a reseller white-label account" }, { status: 409 });

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
