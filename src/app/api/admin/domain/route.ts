import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

/**
 * GET /api/admin/domain — return the current domain state for the active
 * restaurant. The UI uses this on mount + after every mutation so the
 * server stays the source of truth.
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
    },
  });

  return NextResponse.json({
    ...r,
    platformDomain: process.env.PLATFORM_DOMAIN || "localtest.me",
    providerIsDevStub: (process.env.DOMAIN_PROVIDER || "local").toLowerCase() === "local",
  });
}
