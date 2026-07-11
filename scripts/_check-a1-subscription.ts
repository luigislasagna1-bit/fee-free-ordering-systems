/**
 * A1 verification (read-only): does Luigi's restaurant have a real (paying)
 * Online Payments subscription + saved card + invoice?
 *   npx tsx scripts/run-on-prod.ts scripts/_check-a1-subscription.ts
 */
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

  const restaurants = await prisma.restaurant.findMany({
    where: { name: { contains: "Luigi", mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
    take: 5,
  });
  for (const r of restaurants) {
    console.log(`\n=== ${r.name} (${r.slug}) [${r.id}] ===`);

    const addons = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: r.id },
      include: { addOn: { select: { slug: true, name: true, monthlyPriceCents: true } } },
      orderBy: { updatedAt: "desc" },
    });
    console.log(`Add-on subscriptions (${addons.length}):`);
    for (const a of addons) {
      console.log(
        `  ${a.addOn.slug.padEnd(22)} status=${a.status.padEnd(9)} stripeSub=${a.stripeSubscriptionId ?? "(none)"}\n` +
        `    ${"".padEnd(22)} trialEndsAt=${a.trialEndsAt?.toISOString() ?? "-"} periodEnd=${a.currentPeriodEnd?.toISOString() ?? "-"} cancelAtPeriodEnd=${a.cancelAtPeriodEnd} activated=${a.activatedAt.toISOString()} updated=${a.updatedAt.toISOString()}`
      );
    }

    const invoices = await prisma.subscriptionInvoice.findMany({
      where: { restaurantId: r.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { stripeInvoiceId: true, stripeSubscriptionId: true, amountPaid: true, amountDue: true, currency: true, status: true, paidAt: true, periodStart: true, periodEnd: true, createdAt: true },
    });
    console.log(`Recent invoices (${invoices.length}):`);
    for (const i of invoices) {
      console.log(
        `  ${i.createdAt.toISOString()} ${i.status.padEnd(6)} paid=${(i.amountPaid / 100).toFixed(2)} due=${(i.amountDue / 100).toFixed(2)} ${i.currency} sub=${i.stripeSubscriptionId ?? "-"} paidAt=${i.paidAt?.toISOString() ?? "-"}`
      );
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
