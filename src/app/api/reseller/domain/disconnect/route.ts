import { NextResponse } from "next/server";
import { getSessionUser, isResellerView } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * POST /api/reseller/domain/disconnect — remove the reseller's custom
 * domain. Calls the provider to free the binding (so the same domain
 * can be re-bound elsewhere later) and clears the four
 * customDomain* fields on the ResellerProfile row.
 *
 * Safe to call when status is "error" — the provider call is wrapped in
 * try/catch so a stuck registration can still be cleaned up locally.
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
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Best-effort: ask the provider to remove the binding. If this fails
  // (provider unreachable, domain already gone, etc.) we still proceed
  // with the local cleanup — the user explicitly asked to disconnect
  // and the local row is the source of truth for our routing.
  const provider = getDomainProvider();
  try {
    await provider.removeDomain(profile.customDomain);
  } catch (err) {
    console.error("[reseller/domain/disconnect] provider removeDomain failed", {
      domain: profile.customDomain,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await prisma.resellerProfile.update({
    where: { id: user.resellerProfileId },
    data: {
      customDomain: null,
      customDomainStatus: "none",
      customDomainAddedAt: null,
      customDomainError: null,
    },
  });

  return NextResponse.json({ ok: true });
}
