/**
 * PATCH /api/kitchen/menu-stock/variant/[id]
 *
 * Kitchen-side fast-edit for ItemVariant.price. The base /menu-stock/[id]
 * route only writes MenuItem.price — but items with `hasVariants: true`
 * (pizzas, pastas with S/M/L, etc.) charge based on the variant row,
 * not the base. Editing MenuItem.price there is a silent no-op, which
 * is exactly the trap Luigi hit on 2026-06-02.
 *
 * This route fixes that by giving the kitchen panel a place to write
 * each variant's own price. The customer page and admin menu read the
 * same row, so the change propagates immediately.
 *
 * Body: { price: number } — > 0, < 9999, rounded to 2 dp.
 *
 * Restaurant scope is enforced by joining through the variant's
 * MenuItem: a kitchen user can't edit a variant whose parent MenuItem
 * belongs to a different restaurant.
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
  let body: { price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.price === undefined) {
    return NextResponse.json({ error: "price required" }, { status: 400 });
  }
  const n = typeof body.price === "number" ? body.price : Number(body.price);
  if (!Number.isFinite(n) || n < 0 || n > 9999) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }
  const rounded = Math.round(n * 100) / 100;

  // Scope check: load the variant + its parent MenuItem and confirm
  // restaurantId matches the kitchen session. We do this read-then-update
  // because Prisma doesn't support relational filters in updateMany on
  // a 1-level nested relation cleanly — and the two-query cost is
  // negligible at kitchen-edit cadence.
  const variant = await prisma.itemVariant.findUnique({
    where: { id },
    select: { id: true, menuItem: { select: { restaurantId: true } } },
  });
  if (!variant || variant.menuItem.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  await prisma.itemVariant.update({
    where: { id },
    data: { price: rounded },
  });
  return NextResponse.json({ ok: true, id, price: rounded });
}
