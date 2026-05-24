/**
 * ShipDay webhook receiver.
 *
 * ShipDay POSTs status updates to this endpoint as drivers move through
 * the lifecycle:
 *
 *   ORDER_DRIVER_ASSIGNED   driver claimed the dispatch
 *   ORDER_ONTHEWAY_STATUS   driver picked up the food
 *   ORDER_COMPLETED         delivered to customer
 *   ORDER_FAILED_DELIVERY   couldn't deliver (no answer, wrong address, etc.)
 *   ORDER_CANCELLED         driver / dispatcher cancelled
 *
 * Body shape (per ShipDay docs):
 *   {
 *     event: "ORDER_ONTHEWAY_STATUS",
 *     order: { orderId: 12345, additionalId: "ord_..." | "internal-id" },
 *     ...
 *   }
 *
 * We use `additionalId` (which we set to our internal Order.id at
 * dispatch time) to find the right Order row. Falls back to looking up
 * by shipdayOrderId if additionalId is missing.
 *
 * Security: ShipDay supports a shared secret token in the request. We
 * verify it matches the SHIPDAY_WEBHOOK_TOKEN env var. If you don't
 * configure that env var, the endpoint is open — we log a warning so
 * misconfigured deployments are noticed.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { translateShipdayEvent } from "@/lib/shipday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify the shared-secret token if configured. ShipDay sends it via
  // the `token` query param (per their docs) or a custom header — we
  // accept both for flexibility.
  const expected = process.env.SHIPDAY_WEBHOOK_TOKEN;
  if (expected) {
    const tokenFromQuery = req.nextUrl.searchParams.get("token");
    const tokenFromHeader = req.headers.get("x-shipday-token");
    const provided = tokenFromQuery ?? tokenFromHeader ?? "";
    if (provided !== expected) {
      console.warn("[shipday webhook] rejected — token mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[shipday webhook] SHIPDAY_WEBHOOK_TOKEN not set — accepting any caller. Set the env var to harden.");
  }

  let body: {
    event?: string;
    order?: { orderId?: number | string; additionalId?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event ?? "";
  const additionalId = body.order?.additionalId ?? null;
  const shipdayOrderId = body.order?.orderId != null ? String(body.order.orderId) : null;

  if (!event) {
    return NextResponse.json({ error: "Missing event field" }, { status: 400 });
  }
  if (!additionalId && !shipdayOrderId) {
    return NextResponse.json({ error: "Missing order identifier" }, { status: 400 });
  }

  // Locate the Order row. Prefer the additionalId (our internal ID) as
  // it's a direct primary-key lookup. Fall back to scanning by
  // shipdayOrderId for events where additionalId got dropped.
  const order = additionalId
    ? await prisma.order.findUnique({ where: { id: additionalId } })
    : await prisma.order.findFirst({ where: { shipdayOrderId: shipdayOrderId! } });

  if (!order) {
    console.warn("[shipday webhook] no matching order", { additionalId, shipdayOrderId, event });
    // Return 200 so ShipDay doesn't retry forever on permanently-missing
    // orders. We've logged it for investigation.
    return NextResponse.json({ ok: true, skipped: "no_matching_order" });
  }

  const { shipdayStatus, orderStatus } = translateShipdayEvent(event);
  if (!shipdayStatus && !orderStatus) {
    // Unknown event — log + acknowledge so ShipDay stops retrying.
    console.log("[shipday webhook] unknown event ignored", event);
    return NextResponse.json({ ok: true, skipped: "unknown_event" });
  }

  const updates: Record<string, unknown> = {};
  if (shipdayStatus) updates.shipdayStatus = shipdayStatus;
  if (orderStatus) {
    updates.status = orderStatus;
    if (orderStatus === "completed") updates.completedAt = new Date();
  }
  // Capture the shipdayOrderId if we didn't already have it (edge case:
  // ORDER_ASSIGNED fires before our dispatch response landed).
  if (!order.shipdayOrderId && shipdayOrderId) {
    updates.shipdayOrderId = shipdayOrderId;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: updates,
  });

  console.log("[shipday webhook] applied", { orderId: order.id, event, shipdayStatus, orderStatus });
  return NextResponse.json({ ok: true });
}
