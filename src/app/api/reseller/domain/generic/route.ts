import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isResellerView } from "@/lib/session";
import prisma from "@/lib/db";
import {
  isReservedSubdomain,
  validateSubdomainFormat,
} from "@/lib/domains/reserved";

/**
 * Reseller generic-subdomain endpoint.
 *
 * - POST   /api/reseller/domain/generic { subdomain: "acme" }
 *     Claim or change the reseller's generic subdomain. Validates format
 *     against the same RESERVED list restaurants use, then checks
 *     uniqueness across BOTH Restaurant.subdomain AND
 *     ResellerProfile.genericSubdomain so the proxy resolution can't be
 *     ambiguous. Subdomains are case-insensitive (stored lowercase).
 *
 * - DELETE /api/reseller/domain/generic
 *     Release the subdomain. The reseller-branded login at
 *     <slug>.<platform> stops resolving as soon as the LRU TTL on the
 *     proxy lapses (60s) — instant for end users in practice.
 *
 * Available on BOTH white-label tiers (Basic + Full). The whole point of
 * the generic subdomain is that it's the no-DNS-setup option; gating it
 * behind the Full tier would defeat the purpose.
 */

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      whiteLabelStatus: true,
      genericSubdomain: true,
    },
  });
  if (!profile || profile.status !== "approved") {
    return NextResponse.json({ error: "Reseller account not approved" }, { status: 403 });
  }
  // White-label active (any tier) — the generic subdomain is included
  // with both Basic ($9.99) and Full ($29). Resellers without an active
  // white-label sub see an upsell on the page itself; this endpoint
  // still rejects to keep the schema consistent.
  if (profile.whiteLabelStatus !== "active") {
    return NextResponse.json(
      { error: "Generic subdomain requires an active White-Label subscription. Subscribe at /reseller/branding." },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = String(body?.subdomain || "").trim().toLowerCase();
  const validity = validateSubdomainFormat(raw);
  if (!validity.ok) {
    return NextResponse.json({ error: validity.reason }, { status: 400 });
  }
  // Reserved list double-check (validateSubdomainFormat already runs this
  // but keep it explicit so future refactors don't silently weaken the
  // guarantee).
  if (isReservedSubdomain(raw)) {
    return NextResponse.json({ error: "That subdomain is reserved." }, { status: 400 });
  }

  // Uniqueness across BOTH tables. We do this before the write so the
  // user gets a friendly "taken by a restaurant" error instead of a 500
  // from a unique-constraint collision on @unique. The race is tiny —
  // worst case Prisma's @unique throws and we surface a generic 409.
  const [restaurantClash, resellerClash] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { subdomain: raw, isActive: true },
      select: { id: true },
    }),
    prisma.resellerProfile.findFirst({
      where: { genericSubdomain: raw, NOT: { id: user.resellerProfileId } },
      select: { id: true },
    }),
  ]);
  if (restaurantClash) {
    return NextResponse.json(
      { error: "That subdomain is already in use by a restaurant." },
      { status: 409 },
    );
  }
  if (resellerClash) {
    return NextResponse.json(
      { error: "That subdomain is already in use by another reseller." },
      { status: 409 },
    );
  }

  try {
    await prisma.resellerProfile.update({
      where: { id: user.resellerProfileId },
      data: { genericSubdomain: raw },
    });
  } catch (e: any) {
    // P2002 = unique constraint violation. Race with another claimer.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "That subdomain was just claimed by another account." }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message ?? "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subdomain: raw,
    host: `${raw}.${process.env.PLATFORM_DOMAIN || "feefreeordering.com"}`,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.resellerProfile.update({
    where: { id: user.resellerProfileId },
    data: { genericSubdomain: null },
  });
  return NextResponse.json({ ok: true });
}
