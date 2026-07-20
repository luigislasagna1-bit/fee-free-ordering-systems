/**
 * POST /api/admin/orders/[id]/shipday-dispatch
 *
 * The admin order page's "Send to ShipDay" button. Re-runs the exact same
 * dispatch path the accept transition uses (src/lib/shipday-dispatch.ts) and
 * — unlike the fire-and-forget accept hook — RETURNS ShipDay's answer, so a
 * rejection ("can't parse address", "missing phone", …) is finally visible to
 * the owner instead of dying in a server log. Built after Luigi's first live
 * test orders were silently rejected (2026-07-12).
 *
 * Owner-scoped: the order must belong to the session's restaurant. Dispatch
 * preconditions (delivery type, config on, prepaid, not already sent, order
 * alive) are enforced inside dispatchOrderNow and reported as typed `skipped`
 * codes.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { dispatchOrderNow } from "@/lib/shipday-dispatch";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  // Role gate (LR-SEC-02): manual dispatch is a dispatch-surface action —
  // kitchen_staff accept/ready orders but must not fling one to ShipDay
  // (sibling of the FeeFree dispatch/config gates). Gate on `role`, not
  // effectiveRole, so impersonating superadmins/resellers still pass.
  if (!user?.restaurantId || user.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Scope check BEFORE any work: the order must belong to this restaurant.
  const order = await prisma.order.findFirst({
    where: { id, restaurantId: user.restaurantId },
    select: { id: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const result = await dispatchOrderNow(id);
  // 200 either way — the body carries ok/skipped/error; the UI renders it.
  return NextResponse.json(result);
}
