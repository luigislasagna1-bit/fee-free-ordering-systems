/**
 * PROD WRITE (disclosed — Luigi's GO 2026-07-19 "sen that to erick, make sure it
 * will work"): stage Erik's $10 make-good WITHOUT sending anything.
 *   1. Clear restaurant.vipMemberLabel ("Bruce Trail Staff" → null) so the VIP
 *      email reads the default "VIP member". Old value printed for restore.
 *      (Only group "VIP" exists: memberLabel null + 0 promotions → nothing else
 *      reads the restaurant-level label today.)
 *   2. Create the hidden one-time $10 promo (idempotent on couponCode).
 *      Hidden + autoApply:false + unguessable code + usageLimit:1 +
 *      onceLifetimePerClient → inert until VIP-attached, dead after one use.
 *   3. Attach a TEST identity target (owner's +alias email) so the live preview
 *      can prove the auto-apply — deleted again by _prove-erick-gift.ts.
 *      Erik himself is NOT attached here: the individuals POST only emails
 *      NEWLY-added targets, and the email must fire from LUIGI's click.
 * Run: npx tsx scripts/_stage-erick-gift.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL not found");

const RESTAURANT_ID = "cmp7xhd3900000al2jz0db5vi"; // Luigi's Lasagna & Pizzeria (verified read-only)
const CODE = "SORRY10-ERIK"; // throwaway; never shown to Erik (VIP email renders code:"")
const TEST_EMAIL = "luigislasagna1+erickcheck@gmail.com";

const DESCRIPTION =
  "Your first order should have included our 10% first-order discount, and it didn't come through — " +
  "that's on us. To make it right, here's $10 off your next order. Using it is easy: " +
  "1) Tap the Order now button below. 2) Add your food to the cart. " +
  "3) At checkout, enter this same email address — the $10 comes off automatically, no code to enter. " +
  "One more thing: create a free account with this email and you'll earn 5% back in Luigi Bucks " +
  "on every order, to spend like cash next time you order.";

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);

  // 1. Member label → default "VIP member"
  const before = await p.restaurant.findUnique({
    where: { id: RESTAURANT_ID },
    select: { vipMemberLabel: true, slug: true },
  });
  if (!before) throw new Error("restaurant not found");
  if (before.vipMemberLabel !== null) {
    await p.restaurant.update({ where: { id: RESTAURANT_ID }, data: { vipMemberLabel: null } });
    console.log(`vipMemberLabel cleared (was: ${JSON.stringify(before.vipMemberLabel)}) → email will say "VIP member"`);
  } else {
    console.log("vipMemberLabel already null — no change");
  }

  // 2. The promo (idempotent on couponCode)
  let promo = await p.promotion.findFirst({
    where: { restaurantId: RESTAURANT_ID, couponCode: CODE },
    select: { id: true },
  });
  if (!promo) {
    promo = await p.promotion.create({
      data: {
        restaurantId: RESTAURANT_ID,
        name: "Sorry we missed your discount — $10 on us",
        description: DESCRIPTION,
        promotionType: "fixed_cart",
        ruleConfig: { discountAmount: 10 },
        rules: "{}",
        isActive: true,
        stackingRule: "standard",
        orderType: "both",
        customerType: "any", // NOT "new" — Erik counts as returning now
        channel: "both",
        scope: "location",
        minimumOrder: 0,
        displayMode: "hidden_coupon_only",
        autoApply: false,
        showOnBanner: false,
        couponCode: CODE,
        onceLifetimePerClient: true,
        usageLimit: 1, // global kill-switch: dead after Erik's one redemption
        startsAt: null,
        endsAt: null,
      },
      select: { id: true },
    });
    console.log("promo CREATED:", promo.id);
  } else {
    console.log("promo already exists (reusing):", promo.id);
  }

  // 3. Test-identity target (email-only individual; groupId null)
  const existing = await p.customerGroupPromotion.findFirst({
    where: { promotionId: promo.id, restaurantId: RESTAURANT_ID, groupId: null, email: TEST_EMAIL },
    select: { id: true },
  });
  if (!existing) {
    const tgt = await p.customerGroupPromotion.create({
      data: { promotionId: promo.id, restaurantId: RESTAURANT_ID, groupId: null, email: TEST_EMAIL },
      select: { id: true },
    });
    console.log("test target CREATED:", tgt.id);
  } else {
    console.log("test target already exists:", existing.id);
  }

  console.log(JSON.stringify({ promoId: promo.id, slug: before.slug }, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
