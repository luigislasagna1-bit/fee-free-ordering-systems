import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

/**
 * PUT /api/restaurants/payment-methods
 * Body: { methods: Array<"cash" | "card_in_person" | "online_card"> }
 *
 * Updates Restaurant.paymentMethods. Owner must be authed and own the
 * restaurant (session restaurantId is the only ID we trust — body never
 * carries a restaurantId).
 *
 * Idempotent: writing the same array twice is a no-op. Empty array is
 * rejected so an accidental clear can't quietly break publishing.
 */
const ALLOWED = new Set(["cash", "card_in_person", "online_card"]);

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

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { paymentMethods: JSON.stringify(clean) },
  });

  return NextResponse.json({ ok: true, methods: clean });
}
