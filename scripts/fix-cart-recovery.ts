/** One-off: for restaurants with cart-abandonment enabled, ensure the CARTBACK
 *  recovery promo exists + default the cart_abandonment campaign's couponId to it
 *  (only if unset). Both Neon branches. npx tsx scripts/fix-cart-recovery.ts */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

function urls(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function run(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  let touched = 0;
  try {
    const states = await prisma.autopilotState.findMany({
      where: { cartAbandonmentEnabled: true },
      select: { restaurantId: true },
    });
    for (const { restaurantId } of states) {
      let promo = await prisma.promotion.findFirst({
        where: { restaurantId, campaignRef: "autopilot_cart_recovery" },
        select: { id: true },
      });
      if (!promo) {
        promo = await prisma.promotion.create({
          data: {
            restaurantId,
            name: "10% off — finish your order",
            description: "Come back and finish your order!",
            promotionType: "percentage_off",
            isActive: true,
            stackingRule: "master",
            orderType: "both",
            customerType: "any",
            minimumOrder: 0,
            ruleConfig: { discountPercent: 10 },
            autoApply: false,
            showOnBanner: false,
            displayMode: "hidden_coupon_only",
            couponCode: "CARTBACK",
            channel: "website",
            campaignRef: "autopilot_cart_recovery",
          },
          select: { id: true },
        });
      }
      await prisma.autopilotCampaign.upsert({
        where: { restaurantId_campaignType: { restaurantId, campaignType: "cart_abandonment" } },
        update: {},
        create: { restaurantId, campaignType: "cart_abandonment", isEnabled: true, couponId: promo.id, subject: "", emailBody: "", delayHours: 2 },
      });
      await prisma.autopilotCampaign.updateMany({
        where: { restaurantId, campaignType: "cart_abandonment", couponId: null },
        data: { couponId: promo.id },
      });
      touched++;
    }
    console.log(`  ✅ ${masked} — ensured cart-recovery for ${touched} restaurant(s)`);
  } catch (e) {
    console.error(`  ❌ ${masked}`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => { for (const u of urls()) await run(u); })();
