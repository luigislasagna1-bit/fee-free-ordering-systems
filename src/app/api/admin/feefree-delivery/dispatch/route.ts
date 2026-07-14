import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { assignToFeeFreeDriver } from "@/lib/delivery-dispatch";

/**
 * POST /api/admin/feefree-delivery/dispatch  Body: { orderId }
 *
 * Manual "Send to driver" — queues a held delivery order (autoSend off) to the
 * FeeFree pool. force=true so it queues regardless of autoSend, but still runs
 * the shared prepaid/address dispatch guards. Owner-scoped: the order must
 * belong to the caller's restaurant.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  // Ownership — never trust a client-supplied orderId across tenants.
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const result = await assignToFeeFreeDriver(orderId, { force: true });
  if (!result.ok) {
    return NextResponse.json({ error: "Couldn't dispatch", skipped: result.skipped }, { status: 409 });
  }
  return NextResponse.json({ ok: true, assignmentId: result.assignmentId });
}
