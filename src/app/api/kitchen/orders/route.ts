import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!["restaurant_admin", "kitchen_staff", "superadmin"].includes(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getSessionUser({ preferKitchen: true });
    const restaurantId = user?.restaurantId;
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

    return NextResponse.json(orders);
  } catch (err: any) {
    console.error("[kitchen/orders GET]", err);
    return NextResponse.json({ error: err.message ?? "Failed to load orders" }, { status: 500 });
  }
}
