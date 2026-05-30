/**
 * PATCH /api/public/restaurant-customer/me
 *
 * Update the signed-in per-restaurant customer's profile (name + phone).
 * Email is the sign-in identity and immutable here — changing it would
 * need a verify-new-email flow (future work).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

export async function PATCH(req: NextRequest) {
  // No expectedRestaurantId — the session is the source of truth. The
  // session itself binds to a restaurantId so the update only touches
  // the customer row at THIS restaurant.
  const me = await getCurrentRestaurantCustomer();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { name?: string; phone?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: { name?: string; phone?: string | null } = {};
  if (typeof body.name === "string") {
    const n = body.name.trim().slice(0, 100);
    if (n.length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = n;
  }
  if (typeof body.phone === "string") {
    const p = body.phone.trim().slice(0, 30);
    data.phone = p === "" ? null : p;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id: me.id },
    data,
    select: { id: true, name: true, email: true, phone: true },
  });
  return NextResponse.json({ customer: updated });
}
