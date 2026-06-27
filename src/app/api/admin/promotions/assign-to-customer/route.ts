/**
 * POST /api/admin/promotions/assign-to-customer
 *
 * Restaurant-admin action: create a personal promotion for ONE customer and
 * grant it to them (Luigi 2026-06-26 — replaces the retired "assign coupon").
 *
 * The promotion is HIDDEN + code-required (so it never shows on the menu) and
 * once-per-lifetime. A CustomerCoupon grant is keyed by the customer's
 * email/phone, so they redeem it WITHOUT logging in: at checkout they enter the
 * code and, if the email/phone matches, it applies (the P1.5 resolver). Works
 * whether or not they already have an account.
 *
 * Body: {
 *   customerId?: string,            // existing Customer.id  — OR —
 *   email?: string, phone?: string, name?: string,   // a not-yet-a-customer
 *   discountType: "percentage" | "fixed",
 *   discountValue: number,
 *   description?: string,
 *   minimumOrder?: number,
 *   expiresAt?: ISO date,
 *   orderType?: string,             // "both" | "pickup" | "delivery" | ... (Fabrizio: per-service)
 *   stackingRule?: "standard" | "exclusive" | "master",
 * }
 *
 * The notification email ALWAYS sends (it's a 1:1 owner-curated gift, not a bulk
 * blast — Luigi's call), regardless of marketingConsent.
 */
import { NextResponse, after } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { grantCoupon } from "@/lib/coupon-ledger";
import { sendCouponAssignedEmail } from "@/lib/email";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { normalizeOrderType, normalizeStackingRule } from "@/lib/promo-fields";

function makePrefix(name: string): string {
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "GIFT";
}
function makeCode(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Resolve the target identity (existing customer OR an email) ──────────
  let target: { customerId: string | null; email: string | null; phone: string | null; name: string } | null = null;
  if (body.customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: String(body.customerId) },
      select: { id: true, restaurantId: true, name: true, email: true, phone: true },
    });
    if (!c || c.restaurantId !== restaurantId) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    target = { customerId: c.id, email: c.email, phone: c.phone, name: c.name || c.email || "there" };
  } else if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    // Reuse an existing per-restaurant customer row if this email already ordered here.
    const existing = await prisma.customer.findFirst({
      where: { restaurantId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, phone: true },
    });
    target = existing
      ? { customerId: existing.id, email: existing.email, phone: existing.phone, name: existing.name || email }
      : { customerId: null, email, phone: typeof body.phone === "string" ? body.phone.trim() || null : null, name: (body.name?.toString().trim()) || email };
  }
  if (!target) return NextResponse.json({ error: "Provide a customerId or an email" }, { status: 400 });
  if (!target.email && !target.phone) {
    return NextResponse.json({ error: "The customer needs an email or phone to receive the offer." }, { status: 400 });
  }

  // ── Validate the discount ───────────────────────────────────────────────
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: "discountValue must be a positive number" }, { status: 400 });
  }
  if (discountType === "percentage" && discountValue > 100) {
    return NextResponse.json({ error: "Percentage discount can't exceed 100" }, { status: 400 });
  }
  const minimumOrder = Math.max(0, Number(body.minimumOrder ?? 0));
  const description = body.description?.toString().slice(0, 200) || `Gift for ${target.name}`;
  let expiresAt: Date | null = null;
  if (body.expiresAt) { const d = new Date(body.expiresAt); if (!Number.isNaN(d.getTime())) expiresAt = d; }
  const orderType = normalizeOrderType(body.orderType ?? "both");
  const stackingRule = normalizeStackingRule(body.stackingRule);
  const ruleConfig = discountType === "percentage" ? { discountPercent: discountValue } : { discountAmount: discountValue };

  // ── Create the HIDDEN, code-required, once-per-lifetime promotion ────────
  // Generate a unique couponCode (retry on collision vs existing promo codes).
  const prefix = makePrefix(target.name);
  let promo: { id: string; couponCode: string | null } | null = null;
  for (let attempt = 0; attempt < 6 && !promo; attempt++) {
    const code = makeCode(prefix);
    const clash = await prisma.promotion.findFirst({ where: { restaurantId, couponCode: code }, select: { id: true } });
    if (clash) continue;
    promo = await prisma.promotion.create({
      data: {
        restaurantId,
        name: description,
        description,
        promotionType: discountType === "percentage" ? "percentage_off" : "fixed_cart",
        isActive: true,
        stackingRule,
        orderType,
        customerType: "any",
        minimumOrder,
        rules: "{}",
        ruleConfig: ruleConfig as object,
        autoApply: false,
        couponCode: code,
        scope: "location",
        // A 1:1 assigned gift is channel-agnostic — "both" so the code still
        // redeems on a marketplace-channel order instead of silently dropping
        // to $0 (audit B9). It's code-required + hidden regardless of channel.
        channel: "both",
        showOnBanner: false,
        displayMode: "hidden_coupon_only",
        onceLifetimePerClient: true,
        endsAt: expiresAt,
        campaignRef: "assigned_manual",
        limitedShowtimeSchedules: [],
      },
      select: { id: true, couponCode: true },
    });
  }
  if (!promo) return NextResponse.json({ error: "Could not generate a unique code" }, { status: 500 });

  // ── Grant it to the customer (email/phone keyed; no login needed) ────────
  await grantCoupon({
    restaurantId,
    promotionId: promo.id,
    email: target.email,
    phone: target.phone,
    customerId: target.customerId,
    code: promo.couponCode,
    autoApply: false,
    campaignRef: "assigned_manual",
    grantSource: "assigned:manual",
    expiresAt,
  });

  // ── Email it (ALWAYS — 1:1 solicited gift; Luigi 2026-06-26) ─────────────
  const emailed = !!target.email;
  if (emailed) {
    const code = promo.couponCode!;
    const customerEmail = target.email!;
    const customerName = target.name;
    after(async () => {
      try {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true, subdomain: true, customDomain: true, customDomainStatus: true },
        });
        if (!restaurant) return;
        const orderUrl = restaurantOrderUrl(restaurant, "");
        await sendCouponAssignedEmail({
          to: customerEmail,
          customerName,
          restaurantName: restaurant.name,
          code,
          discountType: discountType as "percentage" | "fixed",
          discountValue,
          currency: restaurant.currency,
          minimumOrder,
          maxUses: 1,
          expiresAt,
          description: body.description?.toString().slice(0, 200) || null,
          orderUrl,
          restaurantUrl: orderUrl,
          restaurantEmail: restaurant.email,
          restaurantPhone: restaurant.phone,
          locale: restaurant.defaultLanguage,
        });
      } catch (e) {
        console.error("[assign-to-customer] email send failed:", e);
      }
    });
  }

  return NextResponse.json({ ok: true, promotionId: promo.id, code: promo.couponCode, emailed });
}
