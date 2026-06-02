/**
 * PATCH /api/kitchen/menu-stock/[id]
 *
 * Kitchen-side fast-edit for MenuItem.isSoldOut and price. Lets staff
 * mark an item out of stock OR adjust its base price without leaving
 * the kitchen display. The customer ordering page and admin menu page
 * both read the same row, so changes propagate immediately on the next
 * page load / refetch.
 *
 * Body: { isSoldOut?: boolean, price?: number } — either or both.
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
  let body: { isSoldOut?: boolean; price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { isSoldOut?: boolean; price?: number } = {};
  if (typeof body.isSoldOut === "boolean") data.isSoldOut = body.isSoldOut;
  if (body.price !== undefined) {
    // Accept a plain JS number; reject NaN, negative, and absurdly large
    // values. Round to 2 decimals so the DB doesn't carry float fuzz
    // (e.g. 19.989999) that confuses the receipt printer.
    const n = typeof body.price === "number" ? body.price : Number(body.price);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    data.price = Math.round(n * 100) / 100;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Restaurant scope check on the WHERE clause so a kitchen user can't
  // edit items on other restaurants.
  const result = await prisma.menuItem.updateMany({
    where: { id, restaurantId },
    data,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, ...data });
}

