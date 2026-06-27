/**
 * POST /api/admin/customer-groups/[id]/assign-promotion
 *
 * Assign ONE promotion to EVERY member of a VIP group at once (Program 3).
 * Creates a single hidden Promotion with a SHARED code, then grants it to each
 * member via grantCoupon() with autoApply:true — so a signed-in member gets it
 * applied automatically (no code), while guests redeem the shared code + their
 * email (resolveAssignedPromoByCode). Reuses the exact 1:1 assign machinery.
 *
 * Body: {
 *   discountType: "percentage" | "fixed", discountValue: number,
 *   description?, minimumOrder?, expiresAt?, orderType?, stackingRule?,
 *   code?: string,                        // optional custom shared code
 *   oncePerCustomer?: boolean,            // default false (ongoing member perk)
 *   deliveryMode?: "email_and_account" | "account_only",  // default email_and_account
 * }
 */
import { NextResponse, after } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { grantCoupon } from "@/lib/coupon-ledger";
import { sendCouponAssignedEmail } from "@/lib/email";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { normalizeOrderType, normalizeStackingRule } from "@/lib/promo-fields";

function slugBase(name: string): string {
  return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14) || "VIP";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;

  const group = await prisma.customerGroup.findUnique({
    where: { id: groupId },
    select: { id: true, restaurantId: true, name: true },
  });
  if (!group || group.restaurantId !== restaurantId) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Validate the discount (same rules as the 1:1 assign) ─────────────────
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: "discountValue must be a positive number" }, { status: 400 });
  }
  if (discountType === "percentage" && discountValue > 100) {
    return NextResponse.json({ error: "Percentage discount can't exceed 100" }, { status: 400 });
  }
  const minimumOrder = Math.max(0, Number(body.minimumOrder ?? 0));
  const description = body.description?.toString().slice(0, 200) || `${group.name} VIP offer`;
  let expiresAt: Date | null = null;
  if (body.expiresAt) { const d = new Date(body.expiresAt); if (!Number.isNaN(d.getTime())) expiresAt = d; }
  const orderType = normalizeOrderType(body.orderType ?? "both");
  const stackingRule = normalizeStackingRule(body.stackingRule);
  const oncePerCustomer = body.oncePerCustomer === true; // default false = ongoing member perk
  const deliveryEmail = body.deliveryMode !== "account_only"; // default email_and_account
  const ruleConfig = discountType === "percentage" ? { discountPercent: discountValue } : { discountAmount: discountValue };

  // ── Members ──────────────────────────────────────────────────────────────
  const members = await prisma.customerGroupMember.findMany({
    where: { groupId },
    select: { customerId: true, email: true, phone: true, name: true, customer: { select: { email: true, phone: true, name: true } } },
  });
  if (members.length === 0) return NextResponse.json({ error: "This group has no members yet." }, { status: 400 });

  // ── Shared code (custom or generated), unique per restaurant ─────────────
  const customCode = typeof body.code === "string" ? body.code.trim().toUpperCase().replace(/\s+/g, "").slice(0, 32) : "";
  let code: string | null = null;
  if (customCode) {
    const clash = await prisma.promotion.findFirst({ where: { restaurantId, couponCode: customCode }, select: { id: true } });
    if (clash) return NextResponse.json({ error: "That code is already in use — pick another.", code: "code_taken" }, { status: 409 });
    code = customCode;
  } else {
    const base = slugBase(group.name);
    for (let attempt = 0; attempt < 6 && !code; attempt++) {
      const candidate = `${base}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const clash = await prisma.promotion.findFirst({ where: { restaurantId, couponCode: candidate }, select: { id: true } });
      if (!clash) code = candidate;
    }
  }
  if (!code) return NextResponse.json({ error: "Could not generate a unique code" }, { status: 500 });

  // ── Create ONE hidden promotion for the whole group ──────────────────────
  // Promotion.autoApply = FALSE so it NEVER leaks to non-members via the general
  // pool; each member's GRANT carries autoApply:true (surfaced by findActiveGrants
  // at checkout) so signed-in members get it with no code. Luigi 2026-06-27.
  const campaignRef = `assigned_group:${groupId}`;
  const promo = await prisma.promotion.create({
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
      channel: "both",
      showOnBanner: false,
      displayMode: "hidden_coupon_only",
      onceLifetimePerClient: oncePerCustomer,
      endsAt: expiresAt,
      campaignRef,
      customerGroupId: groupId,
      limitedShowtimeSchedules: [],
    },
    select: { id: true, couponCode: true },
  });

  // ── Grant to every member (autoApply:true so signed-in members auto-get it) ─
  const emailTargets: Array<{ email: string; name: string }> = [];
  let granted = 0;
  for (const m of members) {
    const email = m.email ?? m.customer?.email ?? null;
    const phone = m.phone ?? m.customer?.phone ?? null;
    if (!email && !phone && !m.customerId) continue;
    await grantCoupon({
      restaurantId,
      promotionId: promo.id,
      email,
      phone,
      customerId: m.customerId,
      code: promo.couponCode,
      autoApply: true,
      campaignRef,
      grantSource: `group:${groupId}`,
      expiresAt,
    });
    granted++;
    if (deliveryEmail && email) emailTargets.push({ email, name: m.name ?? m.customer?.name ?? email });
  }

  // ── Email the members (only in email_and_account mode) ───────────────────
  const emailed = emailTargets.length;
  if (deliveryEmail && emailTargets.length > 0) {
    const sharedCode = promo.couponCode!;
    const rawDescription = body.description?.toString().slice(0, 200) || null;
    after(async () => {
      try {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { name: true, slug: true, currency: true, defaultLanguage: true, email: true, phone: true, subdomain: true, customDomain: true, customDomainStatus: true },
        });
        if (!restaurant) return;
        const orderUrl = restaurantOrderUrl(restaurant, "");
        for (const t of emailTargets) {
          try {
            await sendCouponAssignedEmail({
              to: t.email,
              customerName: t.name,
              restaurantName: restaurant.name,
              code: sharedCode,
              discountType: discountType as "percentage" | "fixed",
              discountValue,
              currency: restaurant.currency,
              minimumOrder,
              maxUses: oncePerCustomer ? 1 : undefined,
              expiresAt,
              description: rawDescription,
              orderUrl,
              restaurantUrl: orderUrl,
              restaurantEmail: restaurant.email,
              restaurantPhone: restaurant.phone,
              locale: restaurant.defaultLanguage,
            });
          } catch (e) { console.error("[assign-to-group] one email failed:", e); }
        }
      } catch (e) { console.error("[assign-to-group] email batch failed:", e); }
    });
  }

  return NextResponse.json({ ok: true, promotionId: promo.id, code: promo.couponCode, granted, emailed });
}
