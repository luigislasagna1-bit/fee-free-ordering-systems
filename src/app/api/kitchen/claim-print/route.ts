/**
 * POST /api/kitchen/claim-print   body: { orderId, release? }
 *
 * Session-authed atomic print claim for the APP-OPEN web auto-print. The kitchen
 * page calls this just before it auto-prints an order so the native background-
 * print service (which claims the same Order.kitchenPrintedAt) can never double-
 * print the same ticket. Returns { claimed: true } if THIS caller won the claim
 * (→ go ahead and print), or { claimed: false } if another path already printed
 * it (→ skip). Manual reprints do NOT claim — they always print on demand.
 *
 * RELEASE ({ release: true }): the app-open auto-print won the claim but the
 * physical print FAILED (printer asleep / LAN blip). Un-claim the ticket so the
 * device catch-up pass AND the native background printer re-offer it on the next
 * poll instead of losing it forever. Mirrors the native print-job-token ?release=1
 * path — without it a transient printer drop during a foreground auto-print would
 * permanently drop the kitchen ticket. Luigi 2026-06-22.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderId = body?.orderId;
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  // Release a failed claim so the order becomes printable again. Scoped to this
  // restaurant + an actually-claimed order. Session-authed (trusted kitchen), so
  // no time guard is needed here (the token route, which is less trusted, has one).
  if (body?.release === true) {
    const released = await prisma.order.updateMany({
      where: { id: orderId, restaurantId, kitchenPrintedAt: { not: null } },
      data: { kitchenPrintedAt: null },
    });
    return NextResponse.json({ released: released.count > 0 });
  }

  const claim = await prisma.order.updateMany({
    where: { id: orderId, restaurantId, kitchenPrintedAt: null },
    data: { kitchenPrintedAt: new Date() },
  });
  return NextResponse.json({ claimed: claim.count > 0 });
}
