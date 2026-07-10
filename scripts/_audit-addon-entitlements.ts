/** READ-ONLY: every RestaurantAddOn row + each restaurant's plan/customer-id
 *  state — who keeps what after the platform's test→live Stripe switch.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-addon-entitlements.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.restaurantAddOn.findMany({
    select: {
      status: true, stripeSubscriptionId: true, currentPeriodEnd: true, graceEndsAt: true,
      cancelAtPeriodEnd: true, activatedAt: true,
      addOn: { select: { slug: true, monthlyPriceCents: true } },
      restaurant: { select: { name: true, slug: true, stripeCustomerId: true, subscriptionStatus: true } },
    },
    orderBy: [{ restaurantId: "asc" }],
    take: 200,
  });
  console.log(`RestaurantAddOn rows: ${rows.length}`);
  let cur = "";
  for (const r of rows) {
    if (r.restaurant.slug !== cur) {
      cur = r.restaurant.slug;
      console.log(`\n${r.restaurant.name} (${r.restaurant.slug})  subStatus=${r.restaurant.subscriptionStatus}  stripeCustomer=${r.restaurant.stripeCustomerId ? r.restaurant.stripeCustomerId.slice(0, 9) + "…" + r.restaurant.stripeCustomerId.slice(-4) : "NONE"}`);
    }
    console.log(`  - ${r.addOn.slug} ($${(r.addOn.monthlyPriceCents / 100).toFixed(2)}/mo)  status=${r.status}${r.cancelAtPeriodEnd ? " cancelAtPeriodEnd" : ""}  sub=${r.stripeSubscriptionId ? r.stripeSubscriptionId.slice(0, 7) + "…" : "NONE (comped/manual)"}  periodEnd=${r.currentPeriodEnd?.toISOString().slice(0, 10) ?? "-"}  activated=${r.activatedAt.toISOString().slice(0, 10)}`);
  }

  const restos = await prisma.restaurant.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { name: true, slug: true, stripeCustomerId: true },
  });
  console.log(`\nrestaurants with a stored stripeCustomerId: ${restos.length} (all created on the OLD test account unless re-created after tonight)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 400)); process.exit(1); });
