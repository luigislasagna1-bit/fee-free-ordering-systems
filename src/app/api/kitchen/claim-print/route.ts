/**
 * POST /api/kitchen/claim-print   body: { orderId }
 *
 * Session-authed atomic print claim for the APP-OPEN web auto-print. The kitchen
 * page calls this just before it auto-prints an order so the native background-
 * print service (which claims the same Order.kitchenPrintedAt) can never double-
 * print the same ticket. Returns { claimed: true } if THIS caller won the claim
 * (→ go ahead and print), or { claimed: false } if another path already printed
 * it (→ skip). Manual reprints do NOT claim — they always print on demand.
 * Luigi 2026-06-22.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderId } = await req.json().catch(() => ({}));
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const claim = await prisma.order.updateMany({
    where: { id: orderId, restaurantId, kitchenPrintedAt: null },
    data: { kitchenPrintedAt: new Date() },
  });
  return NextResponse.json({ claimed: claim.count > 0 });
}
