import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getDomainProvider } from "@/lib/domains/provider";

/**
 * DELETE /api/admin/domain/disconnect-custom — remove the active restaurant's
 * custom domain. Calls the provider's remove API to free the binding so the
 * domain can be re-used elsewhere, then nulls out the columns on the row.
 */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { customDomain: true, pendingCustomDomain: true, previousCustomDomain: true },
  });
  if (!r?.customDomain && !r?.pendingCustomDomain) return NextResponse.json({ ok: true });

  const provider = getDomainProvider();

  // A pending domain SWITCH is cancelled first, on its own — the live domain
  // stays exactly as it is (zero-downtime guarantee). Only a second delete
  // with no pending switch removes the live domain itself.
  if (r.pendingCustomDomain) {
    try {
      await provider.removeDomain(r.pendingCustomDomain);
    } catch (e: any) {
      console.warn("[domain disconnect] provider.removeDomain (pending) failed:", e?.message);
    }
    await prisma.restaurant.update({
      where: { id: user.restaurantId },
      data: { pendingCustomDomain: null, customDomainError: null },
    });
    return NextResponse.json({ ok: true, cancelledPending: true, liveDomain: r.customDomain });
  }

  try {
    await provider.removeDomain(r.customDomain!);
  } catch (e: any) {
    // Don't block the row update on provider errors — the user wants the
    // domain gone from their account. Surface the error so they can manually
    // clean up on the provider side if needed.
    console.warn("[domain disconnect] provider.removeDomain failed:", e?.message);
  }
  // The previous-domain redirect target disappears with the live domain, so
  // clear it too (the resolver only redirects when customDomain is set, but a
  // stale unique value would also block that domain from being reused).
  if (r.previousCustomDomain) {
    try {
      await provider.removeDomain(r.previousCustomDomain);
    } catch (e: any) {
      console.warn("[domain disconnect] provider.removeDomain (previous) failed:", e?.message);
    }
  }

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: {
      customDomain: null,
      customDomainStatus: "none",
      customDomainAddedAt: null,
      customDomainError: null,
      previousCustomDomain: null,
    },
  });

  return NextResponse.json({ ok: true });
}
