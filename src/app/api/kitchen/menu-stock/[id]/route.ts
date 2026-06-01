/**
 * PATCH /api/kitchen/menu-stock/[id]
 *
 * Kitchen-side toggle for MenuItem.isSoldOut. Lets staff mark an item
 * out of stock without leaving the kitchen display. The customer
 * ordering page already respects isSoldOut (greys the item out, blocks
 * add-to-cart), so the change propagates on their next page load /
 * refetch.
 *
 * Body: { isSoldOut: boolean }
 *
 * Scoped to the kitchen's restaurant — caller can't toggle items at
 * other restaurants by guessing IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { isSoldOut?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.isSoldOut !== "boolean") {
    return NextResponse.json({ error: "isSoldOut boolean required" }, { status: 400 });
  }

  // Restaurant scope check on the WHERE clause so a kitchen user can't
  // toggle items on other restaurants.
  const result = await prisma.menuItem.updateMany({
    where: { id, restaurantId },
    data: { isSoldOut: body.isSoldOut },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, isSoldOut: body.isSoldOut });
}

