import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/admin/domain/verify-custom — poll the provider for the active
 * restaurant's custom-domain state and persist it.
 *
 * Two modes (2026-07-30 zero-downtime switch):
 *
 * 1. A pendingCustomDomain exists (domain SWITCH in progress): check the
 *    PENDING domain. Cutover happens here — and only when the provider
 *    confirms both ownership (`verified`) AND that DNS actually routes to us
 *    (`misconfigured === false`; Vercel's `verified` alone covers ownership
 *    only, which is how the incident happened). On cutover the swap is one
 *    atomic UPDATE: previous ← live, live ← pending, pending ← null. The old
 *    domain then 308s to the new one via the resolver, so nothing breaks.
 *
 * 2. No pending (first connect): check the live customDomain, but promote to
 *    "verified" only when DNS routes too — never on ownership alone.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { customDomain: true, pendingCustomDomain: true },
  });

  const target = r?.pendingCustomDomain || r?.customDomain;
  if (!target) return NextResponse.json({ error: "No custom domain connected" }, { status: 400 });

  const provider = getDomainProvider();
  let status;
  let config;
  try {
    status = await provider.verifyDomain(target);
    config = await provider.getDomainConfig(target);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Provider error" }, { status: 502 });
  }

  const routable = status.verified && !config.misconfigured;

  if (r?.pendingCustomDomain) {
    if (routable) {
      await prisma.restaurant.update({
        where: { id: user.restaurantId },
        data: {
          previousCustomDomain: r.customDomain,
          customDomain: r.pendingCustomDomain,
          customDomainStatus: "verified",
          customDomainAddedAt: new Date(),
          pendingCustomDomain: null,
          customDomainError: null,
        },
      });
      return NextResponse.json({
        ok: true,
        cutover: true,
        status: { ...status, verified: true },
        misconfigured: false,
        liveDomain: r.pendingCustomDomain,
        redirectingFrom: r.customDomain,
      });
    }
    // Not routable yet — the LIVE domain is untouched; just report progress.
    return NextResponse.json({
      ok: true,
      cutover: false,
      status: { ...status, verified: false },
      misconfigured: config.misconfigured,
      dnsPending: status.verified && config.misconfigured,
      error: status.error ?? config.error ?? null,
    });
  }

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: {
      customDomainStatus: routable ? "verified" : "verifying",
      customDomainError: status.error ?? config.error ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    status: { ...status, verified: routable },
    misconfigured: config.misconfigured,
    dnsPending: status.verified && config.misconfigured,
  });
}
