import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { ensureMarketplaceListing } from "@/lib/marketplace";

/**
 * GET /api/admin/marketplace
 * Returns the restaurant's marketplace listing config. The marketplace is
 * FREE + INCLUDED for every restaurant (Luigi 2026-07-14) — there is no
 * entitlement to check, so we always ensure a row exists (it holds the
 * isListed opt-out toggle + optional customization).
 *
 * Authz: session must own a restaurant; every read/write below is scoped
 * to the session's own restaurantId — a restaurant can only ever touch
 * its own listing.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMarketplaceListing(user.restaurantId);
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId: user.restaurantId },
  });

  return NextResponse.json({
    included: true,
    listing: listing
      ? {
          ...listing,
          marketplaceCategories: safeJson(listing.marketplaceCategories),
          marketplaceTags: safeJson(listing.marketplaceTags),
        }
      : null,
  });
}

/**
 * PATCH /api/admin/marketplace
 * Update the restaurant's marketplace listing config (incl. the isListed
 * opt-out toggle). The marketplace is free + included, so there is NO paid
 * entitlement gate — authorization is ownership: the session must own a
 * restaurant, and the update is scoped to `restaurantId: user.restaurantId`,
 * so an owner can only edit their own listing. Superadmins can additionally
 * flip `marketplaceFeatured` (gated below — restaurant_admin's attempt is
 * silently dropped).
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (typeof body.isListed === "boolean") updates.isListed = body.isListed;
  if (typeof body.marketplaceTagline === "string")
    updates.marketplaceTagline = body.marketplaceTagline.slice(0, 200).trim() || null;
  if (typeof body.marketplaceShortDesc === "string")
    updates.marketplaceShortDesc = body.marketplaceShortDesc.slice(0, 500).trim() || null;
  if (typeof body.marketplaceBanner === "string")
    updates.marketplaceBanner = body.marketplaceBanner.slice(0, 500).trim() || null;

  // Categories + tags: validate as string arrays and re-stringify.
  if (Array.isArray(body.marketplaceCategories)) {
    const arr = body.marketplaceCategories
      .filter((c: unknown) => typeof c === "string")
      .map((c: string) => c.trim().toLowerCase().slice(0, 40))
      .filter((c: string) => c.length > 0)
      .slice(0, 8);
    updates.marketplaceCategories = JSON.stringify(arr);
  }
  if (Array.isArray(body.marketplaceTags)) {
    const arr = body.marketplaceTags
      .filter((c: unknown) => typeof c === "string")
      .map((c: string) => c.trim().slice(0, 40))
      .filter((c: string) => c.length > 0)
      .slice(0, 8);
    updates.marketplaceTags = JSON.stringify(arr);
  }

  // marketplaceFeatured + marketplaceSortOrder — superadmin-only.
  if (user.role === "superadmin") {
    if (typeof body.marketplaceFeatured === "boolean")
      updates.marketplaceFeatured = body.marketplaceFeatured;
    if (Number.isInteger(body.marketplaceSortOrder))
      updates.marketplaceSortOrder = body.marketplaceSortOrder;
  }

  // Ensure the row exists before updating (otherwise updateMany 0-row
  // silent-failure).
  await ensureMarketplaceListing(user.restaurantId);
  const updated = await prisma.marketplaceListing.update({
    where: { restaurantId: user.restaurantId },
    data: updates,
  });

  return NextResponse.json({
    ok: true,
    listing: {
      ...updated,
      marketplaceCategories: safeJson(updated.marketplaceCategories),
      marketplaceTags: safeJson(updated.marketplaceTags),
    },
  });
}

function safeJson(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
