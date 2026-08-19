/**
 * POST /api/public/orders/[id]/cancel-unpaid   body: { token?: string }
 *
 * Instant customer-initiated cancellation of a still-UNPAID, never-released
 * checkout — the payment page's guarded "Cancel my order" action (Luigi
 * 2026-08-17: "customers shouldn't be able to exit the payment flow without
 * paying and if they do... order should be cancelled").
 *
 * Deliberately NOT the same endpoint as /api/public/orders/[id]/cancel: that
 * route hard-requires `status: "pending"` (kitchen hasn't accepted) and
 * rejects with "already accepted, call the restaurant" otherwise. Auto-accept
 * stamps an unpaid card/PayPal order `status: "accepted"` at CREATE while its
 * release stays deferred on `notifiedAt` — so on any restaurant with
 * autoAcceptOrders on, that endpoint would incorrectly refuse to cancel the
 * exact order this feature targets. This endpoint's guard is the abandoned-
 * payment definition itself (see abandoned-order-cancel.ts), which is
 * structurally incapable of touching a paid or kitchen-released order.
 *
 * Auth: a purpose-scoped "order-cancel" HMAC token — the SAME token purpose
 * the other cancel route already uses (order-status-token.ts), minted into
 * the public order GET response (/api/orders/[id]) only while the order
 * currently qualifies as abandoned. No session-ownership path needed: the
 * public GET this token rides on is already unauthenticated by design (the
 * payment page itself works off orderId alone, no login required), so the
 * token's only job is raising the bar above "guess a random order id" —
 * it is not standing in for identity.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyActionToken } from "@/lib/order-status-token";
import { cancelAbandonedOrder } from "@/lib/abandoned-order-cancel";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : undefined;

  if (!verifyActionToken("order-cancel", id, token)) {
    return NextResponse.json(
      { error: "Invalid or missing cancel token.", code: "invalid_token" },
      { status: 401 },
    );
  }

  const result = await cancelAbandonedOrder(id, "customer");
  if (!result.cancelled) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Order not found", code: "not_found" }, { status: 404 });
    }
    // The claim lost the race — either a payment resolved in the meantime, or
    // it was already cancelled by another trigger. Re-read so the client can
    // tell the two apart.
    const fresh = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentStatus: true } });
    const alreadyPaid = fresh?.paymentStatus === "paid" || fresh?.paymentStatus === "authorized";
    return NextResponse.json(
      {
        error: alreadyPaid
          ? "Looks like this payment already went through."
          : "This order is no longer cancellable.",
        code: alreadyPaid ? "already_paid" : "already_resolved",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
