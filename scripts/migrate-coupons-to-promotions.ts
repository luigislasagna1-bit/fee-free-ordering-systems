/**
 * P1.2 data migration — fold standalone Coupon rows into Promotions.
 *
 * Each ACTIVE Coupon becomes a HIDDEN promotion carrying the coupon CODE:
 *   - percentage  → promotionType "percentage_off", ruleConfig.discountPercent
 *   - fixed       → promotionType "fixed_cart",     ruleConfig.discountAmount
 *   - displayMode "hidden_coupon_only", autoApply=false, showOnBanner=false, couponCode=CODE
 *   - minimumOrder, usageLimit=maxUses, usedCount, endsAt=expiresAt carried over
 *   - campaignRef "migrated_coupon" (idempotency marker + audit)
 * PERSONAL coupons (customerId set) additionally get a CustomerCoupon GRANT keyed by
 *   the customer's email/phone (status "granted") + onceLifetimePerClient=true, so the
 *   P1.5 code+email-match redemption recognises them (no public leak).
 *
 * The original Coupon rows are NOT deleted — Order.couponId FKs + historical receipts
 * still reference them (kept read-only).
 *
 * DRY RUN:  npx tsx scripts/run-on-prod.ts scripts/migrate-coupons-to-promotions.ts
 * APPLY:    APPLY=1 npx tsx scripts/run-on-prod.ts scripts/migrate-coupons-to-promotions.ts
 * Run on BOTH Neon branches at deploy, AFTER P1.5 (the redemption resolver) is live.
 */
import { config } from "dotenv";
import { randomUUID } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const APPLY = process.env.APPLY === "1";
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`mode: ${APPLY ? "APPLY (mutating)" : "DRY RUN (read-only)"}\n`);

  const coupons = await prisma.coupon.findMany({
    where: { isActive: true },
    include: { customer: { select: { id: true, email: true, phone: true } } } as any,
  });
  console.log(`active coupons: ${coupons.length}  (open: ${coupons.filter((c: any) => !c.customerId).length}, personal: ${coupons.filter((c: any) => c.customerId).length})\n`);

  let created = 0, grants = 0, skipped = 0, collisions = 0;
  for (const c of coupons as any[]) {
    const code = String(c.code).toUpperCase().trim();
    // Idempotency: already migrated?
    const existing = await prisma.promotion.findFirst({ where: { restaurantId: c.restaurantId, couponCode: code, campaignRef: "migrated_coupon" }, select: { id: true } });
    if (existing) { skipped++; continue; }
    // Code collision with a NON-migrated promotion → suffix to avoid the unique-ish clash.
    const clash = await prisma.promotion.findFirst({ where: { restaurantId: c.restaurantId, couponCode: code }, select: { id: true } });
    const finalCode = clash ? `${code}-C${String(c.id).slice(-4).toUpperCase()}` : code;
    if (clash) collisions++;

    const isPct = c.discountType === "percentage";
    const ruleConfig = isPct ? { discountPercent: c.discountValue } : { discountAmount: c.discountValue };
    const personal = !!c.customerId;

    if (!APPLY) { created++; if (personal) grants++; continue; }

    const promo = await prisma.promotion.create({
      data: {
        restaurantId: c.restaurantId,
        name: c.description?.trim() || `Code ${finalCode}`,
        description: c.description || null,
        promotionType: isPct ? "percentage_off" : "fixed_cart",
        isActive: true,
        stackingRule: "standard",
        orderType: "both",
        customerType: "any",
        minimumOrder: c.minimumOrder ?? 0,
        rules: "{}",
        ruleConfig: ruleConfig as object,
        usageLimit: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
        autoApply: false,
        couponCode: finalCode,
        scope: c.scope === "brand" ? "brand" : "location",
        channel: "website",
        showOnBanner: false,
        displayMode: "hidden_coupon_only",
        onceLifetimePerClient: personal,
        endsAt: c.expiresAt ?? null,
        campaignRef: "migrated_coupon",
        limitedShowtimeSchedules: [],
      },
    });
    created++;

    if (personal && c.customer) {
      await prisma.customerCoupon.create({
        data: {
          id: randomUUID(),
          restaurantId: c.restaurantId,
          promotionId: promo.id,
          campaignRef: "migrated_coupon",
          email: c.customer.email ?? null,
          phone: c.customer.phone ?? null,
          customerId: c.customer.id,
          code: finalCode,
          autoApply: false,
          status: "granted",
          grantSource: "migrated:coupon",
        } as any,
      });
      grants++;
    }
  }

  console.log(`promotions to create: ${created}  | personal grants: ${grants}  | already-migrated skipped: ${skipped}  | code collisions suffixed: ${collisions}`);
  if (!APPLY) console.log("\n(dry run — nothing changed; re-run with APPLY=1)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
