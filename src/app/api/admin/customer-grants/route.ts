/**
 * DELETE /api/admin/customer-grants?id=…
 *
 * Revoke a customer-assigned offer (CustomerCoupon grant) — Fabrizio
 * 2026-07-02: an assigned offer must be removable after the fact (his
 * customer page showed an expired grant with no way to clear it).
 *
 * Revoke = status → "revoked" (already part of the status enum), NOT a row
 * delete — the audit trail stays, the checkout resolvers
 * (resolveAssignedPromoByCode / findActiveGrants) only honor granted/
 * released/applied so a revoked grant can never apply again, and the
 * customer-page list (granted/applied/redeemed) stops showing it.
 *
 * Guards: restaurant-scoped; only "granted" or "released" grants can be
 * revoked — "applied" is pinned to an in-flight order and "redeemed" is
 * history, both must stay untouched.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await prisma.customerCoupon.updateMany({
    where: { id, restaurantId, status: { in: ["granted", "released"] } },
    data: { status: "revoked" },
  });
  if (updated.count === 0) {
    // Wrong restaurant, unknown id, or a grant that's applied/redeemed.
    return NextResponse.json({ error: "This offer can't be revoked." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
