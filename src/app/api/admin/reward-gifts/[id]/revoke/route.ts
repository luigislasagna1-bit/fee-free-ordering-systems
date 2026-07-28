/**
 * POST /api/admin/reward-gifts/[id]/revoke — cancel a still-PENDING gift
 * (typo'd email, change of heart). Atomic pending→revoked guarded flip: a
 * gift that was claimed in the meantime returns 409 and the money stays with
 * the customer (revoking claimed credit would be a wallet deduction — that's
 * the existing manual adjust tool's job, deliberately separate).
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  // Restaurant scoping INSIDE the guarded update — a tampered id from another
  // restaurant flips zero rows and reads as 409/404.
  const res = await prisma.pendingRewardGrant.updateMany({
    where: { id, restaurantId, status: "pending" },
    data: { status: "revoked", revokedAt: new Date() },
  });
  if (res.count === 0) {
    const exists = await prisma.pendingRewardGrant.findFirst({ where: { id, restaurantId }, select: { status: true } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "not_pending", code: "not_pending", status: exists.status }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
