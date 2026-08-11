import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../guard";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/phone-ordering/pay-at-door   { payAtDoorDelivery: boolean }
 *
 * Luigi 2026-08-11: "stores should be able to do delivery without accepting
 * payment over the phone, same as pickup. these orders should not be sent with
 * shipday. they should still be populated in shipday — it's the store's
 * responsibility."
 *
 * The flag lives on ShipdayConfig (it is a delivery-dispatch decision, read by
 * `/api/orders`, the customer checkout and `dispatchOrderNow`) even though the
 * owner meets it in the Nabil Payments tab — that's where the prepaid-only
 * block was, so that's where the choice belongs.
 *
 * Deliberately does NOT create a ShipdayConfig row: with no ShipDay connection
 * there is nothing to opt out of, and an empty row would look like a
 * half-configured integration in /admin/delivery.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const body = await req.json().catch(() => ({}));
  if (typeof body.payAtDoorDelivery !== "boolean") {
    return NextResponse.json({ error: "payAtDoorDelivery must be a boolean", code: "bad_request" }, { status: 400 });
  }

  // Restaurant-scoped by construction: updateMany on the session's own id.
  const res = await prisma.shipdayConfig.updateMany({
    where: { restaurantId: gate.restaurantId },
    data: { payAtDoorDelivery: body.payAtDoorDelivery },
  });
  if (res.count === 0) {
    return NextResponse.json(
      { error: "ShipDay isn't connected for this restaurant", code: "no_shipday_config" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, payAtDoorDelivery: body.payAtDoorDelivery });
}
