import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";
import { hostCandidates } from "@/lib/domains/host-candidates";
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
  try {
    return await handle(req);
  } catch (err) {
    // Catch-all so the client never sees "Unexpected end of JSON input"
    // from an empty 500 body. Any uncaught error here means our code
    // or the Vercel API misbehaved — bubble the message up so the
    // owner has SOMETHING to paste into a support ticket.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[connect-custom] unhandled", { err: message });
    return NextResponse.json(
      { error: `Internal error: ${message}` },
      { status: 500 },
    );
  }
}

async function handle(req: NextRequest) {
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

  // Uniqueness across BOTH restaurant + reseller tables (including domains
  // parked in another restaurant's pending/previous slots). Reseller custom
  // domains live on ResellerProfile (the White-Label Full tier feature);
  // double-binding a domain would create ambiguous proxy resolution.
  // Compare on the SAME identity the host resolver uses (apex ≡ www) across
  // every column that binds a domain to a tenant. An exact-match check here
  // let "www.victim.com" slip past a "victim.com" claim and then answer for
  // it at the edge — a cross-tenant hijack caught in review (2026-07-30).
  const claimCandidates = hostCandidates(domain);
  const [restaurantClash, resellerClash] = await Promise.all([
    prisma.restaurant.findFirst({
      where: {
        OR: [
          { customDomain: { in: claimCandidates } },
          { pendingCustomDomain: { in: claimCandidates } },
          { previousCustomDomain: { in: claimCandidates } },
        ],
        NOT: { id: user.restaurantId },
      },
      select: { id: true },
    }),
    prisma.resellerProfile.findFirst({
      where: { customDomain: { in: claimCandidates } },
      select: { id: true },
    }),
  ]);
  if (restaurantClash) return NextResponse.json({ error: "Domain is already connected to another restaurant" }, { status: 409 });
  if (resellerClash) return NextResponse.json({ error: "Domain is already in use by a reseller white-label account" }, { status: 409 });

  const current = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { customDomain: true, customDomainStatus: true },
  });
  if (current?.customDomain === domain) {
    // Re-connecting the domain that's already live is a no-op, not a switch.
    return NextResponse.json({ ok: true, domain, dnsRecords: [], mode: "already-live" });
  }

  // ZERO-DOWNTIME SWITCH (2026-07-30 incident): when a domain is already LIVE,
  // the new one goes into pendingCustomDomain — the live domain keeps serving
  // and keeps powering links/emails. The resolver serves the store on the
  // pending host as soon as its DNS lands, and verify-custom performs the
  // atomic cutover only once the provider confirms DNS actually routes here
  // (ownership-"verified" alone is NOT enough — that was the incident).
  const isSwitch = !!current?.customDomain;

  const provider = getDomainProvider();
  let dnsRecords;
  try {
    const result = await provider.addDomain(domain);
    dnsRecords = result.dnsRecords;
    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: isSwitch
        ? { pendingCustomDomain: domain, customDomainError: null }
        : {
            customDomain: domain,
            // Even when ownership auto-verifies, DNS may not point at us yet —
            // verify-custom promotes to "verified" only once routing confirms.
            customDomainStatus: "pending",
            customDomainAddedAt: new Date(),
            customDomainError: null,
          },
    });
  } catch (e: any) {
    // A failed SWITCH must not touch the live domain — record the error only.
    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: isSwitch
        ? { customDomainError: e?.message ?? String(e) }
        : {
            customDomain: domain,
            customDomainStatus: "error",
            customDomainError: e?.message ?? String(e),
          },
    });
    return NextResponse.json({ error: e?.message ?? "Provider error" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    domain,
    dnsRecords,
    mode: isSwitch ? "switch-pending" : "first-connect",
    liveDomain: current?.customDomain ?? null,
    providerIsDevStub: provider.isDevStub,
  });
}

