import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

/**
 * PUT /api/restaurants/payment-methods
 * Body: { methods: Array<"cash" | "card_in_person" | "online_card" | "paypal"> }
 *
 * Updates Restaurant.paymentMethods. Owner must be authed and own the
 * restaurant (session restaurantId is the only ID we trust — body never
 * carries a restaurantId).
 *
 * Idempotent: writing the same array twice is a no-op. Empty array is
 * rejected so an accidental clear can't quietly break publishing.
 */
const ALLOWED = new Set(["cash", "card_in_person", "online_card", "paypal"]);
/** Methods that require the Online Payments add-on (card_payments
 *  entitlement). Mirrors the toggle-gate in
 *  src/app/admin/payments/PaymentMethodsClient.tsx so a tampered client
 *  POSTing direct can't bypass the add-on requirement. */
const ENTITLED_METHODS = new Set(["online_card", "paypal"]);

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const ORDER_TYPES = ["pickup", "delivery", "dine_in", "take_out"];
  const cleanList = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? Array.from(new Set<string>(arr.filter((m: unknown): m is string => typeof m === "string" && ALLOWED.has(m))))
      : [];

  // Two accepted shapes:
  //   • { methodsByType: { pickup:[...], delivery:[...], ... } }  (per-order-type, new)
  //   • { methods: [...] }                                         (flat, legacy)
  // Luigi 2026-06-08.
  let perType: Record<string, string[]> | null = null;
  let flat: string[] | null = null;
  if (body && body.methodsByType && typeof body.methodsByType === "object") {
    const map: Record<string, string[]> = {};
    for (const ot of ORDER_TYPES) {
      const list = cleanList(body.methodsByType[ot]);
      if (list.length > 0) map[ot] = list;
    }
    perType = map;
  } else if (body && Array.isArray(body.methods)) {
    flat = cleanList(body.methods);
  } else {
    return NextResponse.json({ error: "methods or methodsByType is required" }, { status: 400 });
  }

  // Online card / PayPal require the online_payments add-on. We DON'T reject
  // the whole save when one is present without the add-on — that left
  // restaurants permanently stuck: they couldn't drop a stale online_card
  // (UI lock) AND its presence 412'd every save, so cash/card-in-person could
  // never be turned on either. Instead, STRIP the entitled methods server-side
  // and save the rest. Security is identical — online_card / paypal never
  // persist without entitlement — but a stale pick can no longer block saving
  // the methods the restaurant CAN use. Luigi 2026-06-15.
  const chosenNow = perType ? Object.values(perType).flat() : (flat ?? []);
  if (chosenNow.some((m) => ENTITLED_METHODS.has(m))) {
    const entitled = await hasFeature(restaurantId, "card_payments");
    if (!entitled) {
      if (perType) {
        const next: Record<string, string[]> = {};
        for (const [ot, list] of Object.entries(perType)) {
          const keep = list.filter((m) => !ENTITLED_METHODS.has(m));
          if (keep.length) next[ot] = keep;
        }
        perType = next;
      } else if (flat) {
        flat = flat.filter((m) => !ENTITLED_METHODS.has(m));
      }
    }
  }

  // After any stripping, at least one usable method must remain.
  const finalChosen = perType ? Object.values(perType).flat() : (flat ?? []);
  if (finalChosen.length === 0) {
    return NextResponse.json({ error: "Pick at least one payment method." }, { status: 400 });
  }
  const toStore = JSON.stringify(perType ?? flat);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { paymentMethods: toStore },
  });

  return NextResponse.json({ ok: true });
}
