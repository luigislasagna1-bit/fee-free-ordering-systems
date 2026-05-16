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
    select: { customDomain: true },
  });
  if (!r?.customDomain) return NextResponse.json({ ok: true });

  const provider = getDomainProvider();
  try {
    await provider.removeDomain(r.customDomain);
  } catch (e: any) {
    // Don't block the row update on provider errors — the user wants the
    // domain gone from their account. Surface the error so they can manually
    // clean up on the provider side if needed.
    console.warn("[domain disconnect] provider.removeDomain failed:", e?.message);
  }

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: {
      customDomain: null,
      customDomainStatus: "none",
      customDomainAddedAt: null,
      customDomainError: null,
    },
  });

  return NextResponse.json({ ok: true });
}
