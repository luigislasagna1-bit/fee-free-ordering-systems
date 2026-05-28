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
  if (!body || !Array.isArray(body.methods)) {
    return NextResponse.json({ error: "methods must be an array" }, { status: 400 });
  }

  // Filter to allowed slugs + dedupe. Reject empty so owners can't
  // silently clear themselves into an unpublishable state.
  const clean = Array.from(
    new Set<string>(
      body.methods.filter((m: unknown): m is string => typeof m === "string" && ALLOWED.has(m))
    )
  );
  if (clean.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one payment method." },
      { status: 400 }
    );
  }

  // Gate: online_card / paypal both require the online_payments add-on.
  // Tampered clients can't bypass the UI lock by POSTing direct —
  // re-check entitlement server-side. If they don't have it, return 412
  // (Precondition Failed) so the client UI can show the right path.
  const wantsEntitled = clean.some((m) => ENTITLED_METHODS.has(m));
  if (wantsEntitled) {
    const entitled = await hasFeature(restaurantId, "card_payments");
    if (!entitled) {
      return NextResponse.json(
        {
          error: "Subscribe to the Online Payments add-on to enable online payment methods.",
          code: "addon_required",
          addOnSlug: "online_payments",
        },
        { status: 412 },
      );
    }
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { paymentMethods: JSON.stringify(clean) },
  });

  return NextResponse.json({ ok: true, methods: clean });
}
