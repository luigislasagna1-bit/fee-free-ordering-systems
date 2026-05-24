import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  try {
    // Kitchen polling — must accept BOTH the kitchen session (tablet /
    // native app) AND the admin session (when an owner opens /kitchen
    // in the same browser tab as /admin). Using getServerSession with
    // admin authOptions only recognized admin sessions, so the native
    // app's poll silently failed with 401 and new orders never showed
    // up — caught during UAT, see task #92 for the matching bug fix on
    // /api/kitchen/test-order.
    const user = await getSessionUser({ preferKitchen: true });
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const restaurantId = user.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "No restaurant associated" }, { status: 400 });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: thirtyDaysAgo },
        // Only show orders that have been "released" — for cash orders
        // that's immediately, for online-card orders that's once Stripe
        // confirms payment via webhook (payment_intent.succeeded).
        // Filters out pending-payment cards so the kitchen never starts
        // cooking food that hasn't been paid for.
        notifiedAt: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        items: {
          include: { modifiers: { select: { name: true, priceAdjustment: true } } },
        },
      },
    });

    // Also include the restaurant's kitchen workflow mode so the
    // client can render the right UI (simple = Accept/Reject only,
    // tracking = full state machine). Cheap extra round-trip — the
    // restaurant row is small and the kitchen polls every 4 seconds
    // so we want it cached. The client only re-reads the mode when
    // the response shape changes; otherwise it stays the same.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { kitchenWorkflowMode: true },
    });

    return NextResponse.json({
      orders,
      kitchenWorkflowMode: restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple",
    });
  } catch (err: any) {
    console.error("[kitchen/orders GET]", err);
    return NextResponse.json({ error: err.message ?? "Failed to load orders" }, { status: 500 });
  }
}
