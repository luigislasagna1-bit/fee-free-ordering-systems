import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/admin/domain/verify-custom — poll the provider for the active
 * restaurant's custom domain status and persist it. Returns the latest status
 * so the admin UI can render badges (Verified, SSL, etc.) without a separate
 * GET.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { customDomain: true },
  });

  if (!r?.customDomain) return NextResponse.json({ error: "No custom domain connected" }, { status: 400 });

  const provider = getDomainProvider();
  let status;
  try {
    status = await provider.verifyDomain(r.customDomain);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Provider error" }, { status: 502 });
  }

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: {
      customDomainStatus: status.verified ? "verified" : "verifying",
      customDomainError: status.error ?? null,
    },
  });

  return NextResponse.json({ ok: true, status });
}
