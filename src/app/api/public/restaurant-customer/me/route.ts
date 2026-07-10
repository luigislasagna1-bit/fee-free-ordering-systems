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

  let body: { name?: string; phone?: string; marketingConsent?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: {
    name?: string;
    phone?: string | null;
    marketingConsent?: boolean;
    marketingConsentAt?: Date | null;
  } = {};
  if (typeof body.name === "string") {
    const n = body.name.trim().slice(0, 100);
    if (n.length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = n;
  }
  if (typeof body.phone === "string") {
    const p = body.phone.trim().slice(0, 30);
    // Phone is required at signup (Luigi 2026-07-09) and must stay set —
    // an empty value here would let customers blank it right back out (and
    // dodge the signup phone-uniqueness guard). Empty = leave unchanged;
    // a new value must look like a real number (≥7 digits), same rule as
    // the signup route.
    if (p !== "") {
      if (p.replace(/\D/g, "").length < 7) {
        return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
      }
      data.phone = p;
    }
  }
  // Marketing-consent toggle — customer can opt in or out from their
  // own profile. When they flip the box on, we stamp the consent date
  // so we can prove WHEN they consented if asked. When they flip it
  // off, we clear the date too (they're no longer consented).
  if (typeof body.marketingConsent === "boolean") {
    data.marketingConsent = body.marketingConsent;
    data.marketingConsentAt = body.marketingConsent ? new Date() : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id: me.id },
    data,
    select: { id: true, name: true, email: true, phone: true, marketingConsent: true },
  });
  return NextResponse.json({ customer: updated });
}
