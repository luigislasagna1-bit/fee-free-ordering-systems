/* DEV-ONLY seed for visually verifying the billing invoice page: gives the
 * demo restaurant a paid SubscriptionInvoice + fills the platform company
 * block + an EU (Italy) VIES-validated billing profile so EVERY invoice
 * element renders (customer no, payment ref, qty table, sub-total, 0% tax,
 * Art. 44 note, issuer legal footer). Idempotent — safe to re-run.
 *   npx tsx scripts/_seed-demo-invoice.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) {
    throw new Error("Refusing to run against PROD (dawn-tree).");
  }
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, name: true } });
  if (!r) throw new Error("demo-pizza-palace not found in this DB");

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  await prisma.platformSettings.update({
    where: { id: "singleton" },
    data: {
      companyLegalName: "Fee Free Ordering Inc.",
      companyTaxId: "GST/HST No: 809409832RT0001",
      companyAddress: "123 Example St, Toronto, ON M5V 0A1, Canada",
      companySupportEmail: "support@feefreeordering.com",
      companyRegistryNo: "Corporation No: 1234567-8",
      companyWebsite: "www.feefreeordering.com",
    },
  });

  await prisma.restaurantBillingProfile.upsert({
    where: { restaurantId: r.id },
    create: {
      restaurantId: r.id,
      legalName: "Demo Pizza Palace S.R.L.",
      taxId: "IT03982530135",
      taxIdType: "eu_vat",
      billingEmail: "accounting@pizzapalace.com",
      addressLine1: "Corso Roma 2",
      city: "Cologno Monzese",
      state: "MI",
      postalCode: "20093",
      country: "IT",
      taxIdViesValid: true,
      taxIdViesCheckedAt: new Date(),
    },
    update: {
      legalName: "Demo Pizza Palace S.R.L.",
      taxId: "IT03982530135",
      country: "IT",
      taxIdViesValid: true,
      taxIdViesCheckedAt: new Date(),
    },
  });

  const inv = await prisma.subscriptionInvoice.upsert({
    where: { stripeInvoiceId: "in_demo_invoice_layout_check" },
    create: {
      restaurantId: r.id,
      stripeInvoiceId: "in_demo_invoice_layout_check",
      amountPaid: 2900,
      amountDue: 0,
      currency: "usd",
      status: "paid",
      paidAt: new Date(),
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
    update: { status: "paid", paidAt: new Date() },
  });
  console.log(`✓ Seeded. Invoice URL: /billing-invoice/${inv.id}`);
}

main().finally(() => prisma.$disconnect());
