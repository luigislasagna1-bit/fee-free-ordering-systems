/**
 * POST /api/admin/customers/[id]/assign-coupon
 *
 * Restaurant-admin action: create a coupon that's locked to a specific
 * customer. The coupon is created with `customerId` set, so the order-
 * placement validator (see /api/orders POST) only honors the code when
 * the logged-in customer matches. Other customers entering the same
 * code will see "this coupon isn't yours".
 *
 * Body: {
 *   discountType: "percentage" | "fixed",
 *   discountValue: number,
 *   description?: string,
 *   minimumOrder?: number,
 *   maxUses?: number,           // default 1 — single-use is the typical case
 *   expiresAt?: ISO date string,
 * }
 *
 * Auto-generates a coupon `code` of the form `<PREFIX>-<RANDOM>` where
 * PREFIX is derived from the customer's name initials (e.g. "MR" for
 * Maria Rossi) so the customer sees a personalised-looking code in
 * their account dashboard. Codes stay unique-per-restaurant via the
 * existing (restaurantId, code) constraint.
 *
 * Restaurant scoping enforced via session.restaurantId — the [id] in
 * the URL is the Customer.id, and we verify it belongs to this
 * restaurant before doing anything.
 */

import { NextResponse, after } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { sendCouponAssignedEmail } from "@/lib/email";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

function makePrefix(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "GIFT";
}

function makeCode(prefix: string): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  return `${prefix}-${rand}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: customerId } = await ctx.params;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, restaurantId: true, name: true, email: true, marketingConsent: true },
  });
  if (!customer || customer.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: {
    discountType?: string;
    discountValue?: number;
    description?: string;
    minimumOrder?: number;
    maxUses?: number;
    expiresAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: "discountValue must be a positive number" }, { status: 400 });
  }
  if (discountType === "percentage" && discountValue > 100) {
    return NextResponse.json({ error: "Percentage discount can't exceed 100" }, { status: 400 });
  }

  const minimumOrder = Math.max(0, Number(body.minimumOrder ?? 0));
  const maxUses = body.maxUses === undefined ? 1 : Math.max(1, Math.floor(Number(body.maxUses)));
  const description = body.description?.toString().slice(0, 200) || `Gift coupon for ${customer.name}`;
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  }

  // Generate a unique code — retry up to 5 times on collision. The
  // (restaurantId, code) unique constraint enforces uniqueness; in
  // practice the 6-hex tail gives ~16M codes per prefix per restaurant
  // so a collision is vanishingly rare.
  const prefix = makePrefix(customer.name);
  let coupon = null;
  let attempt = 0;
  while (attempt < 5 && !coupon) {
    const code = makeCode(prefix);
    try {
      coupon = await prisma.coupon.create({
        data: {
          restaurantId,
          code,
          description,
          discountType,
          discountValue,
          minimumOrder,
          maxUses,
          isActive: true,
          expiresAt,
          customerId: customer.id,
        },
      });
    } catch (e: unknown) {
      // P2002 = unique constraint violation. Retry with a new code.
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        attempt++;
        continue;
      }
      throw e;
    }
  }

  if (!coupon) {
    return NextResponse.json({ error: "Could not generate a unique code" }, { status: 500 });
  }

  // Email the code + every attached condition to the customer (reseller
  // report cmqa6lls1). MARKETING-CONSENT GATED: an opted-out customer gets
  // nothing — the coupon still appears in their account dashboard. Sent
  // fire-and-forget after the response so a slow/down Resend never blocks
  // the admin UI; `emailed` tells the admin whether a send was queued.
  const emailed = !!(customer.email && customer.marketingConsent);
  if (emailed) {
    const createdCoupon = coupon;
    after(async () => {
      try {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            name: true, slug: true, currency: true, defaultLanguage: true,
            email: true, phone: true,
            subdomain: true, customDomain: true, customDomainStatus: true,
          },
        });
        if (!restaurant) return;
        const orderUrl = restaurantOrderUrl(restaurant, "");
        await sendCouponAssignedEmail({
          to: customer.email!,
          customerName: customer.name,
          restaurantName: restaurant.name,
          code: createdCoupon.code,
          discountType: discountType as "percentage" | "fixed",
          discountValue,
          currency: restaurant.currency,
          minimumOrder,
          maxUses,
          expiresAt,
          description: body.description?.toString().slice(0, 200) || null,
          orderUrl,
          restaurantUrl: orderUrl,
          restaurantEmail: restaurant.email,
          restaurantPhone: restaurant.phone,
          locale: restaurant.defaultLanguage,
        });
      } catch (e) {
        console.error("[assign-coupon] email send failed:", e);
      }
    });
  }

  return NextResponse.json({ ok: true, coupon, emailed });
}
