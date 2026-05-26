import { NextResponse } from "next/server";
import { getSessionUser, isResellerView } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/reseller/domain/verify — poll the provider for the active
 * reseller's custom domain status and persist it. Mirrors the restaurant
 * equivalent at /api/admin/domain/verify-custom but scoped to the
 * ResellerProfile.
 *
 * Called by the UI on:
 *   - First connect (auto-poll once after addDomain returned)
 *   - Manual "Re-check" button
 *   - Periodic polling while status is "pending" / "verifying"
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { customDomain: true },
  });
  if (!profile?.customDomain) {
    return NextResponse.json({ error: "No custom domain connected" }, { status: 400 });
  }

  const provider = getDomainProvider();
  let status;
  try {
    status = await provider.verifyDomain(profile.customDomain);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Provider error" }, { status: 502 });
  }

  await prisma.resellerProfile.update({
    where: { id: user.resellerProfileId },
    data: {
      customDomainStatus: status.verified ? "verified" : "verifying",
      customDomainError: status.error ?? null,
    },
  });

  return NextResponse.json({ ok: true, status });
}
