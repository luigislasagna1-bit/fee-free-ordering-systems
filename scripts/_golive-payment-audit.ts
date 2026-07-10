/** READ-ONLY go-live audit for luigis-lasagna-pizzeria: which payment methods
 *  are enabled, whether Stripe keys are present and TEST vs LIVE (publishable
 *  prefix only — secrets are never decrypted or printed).
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_golive-payment-audit.ts */
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

  const r = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: {
      name: true, slug: true, currency: true, taxRate: true, country: true,
      paymentMethods: true,
      acceptsPickup: true, acceptsDelivery: true,
      paypalAccountStatus: true, paypalEnvironment: true,
      paymentProvider: { select: { provider: true, mode: true, publishableKey: true, secretKeyEnc: true, isActive: true, connectMethod: true, lastTestedAt: true, lastTestStatus: true } },
    },
  });
  if (!r) { console.log("restaurant not found"); await prisma.$disconnect(); return; }

  const pp = r.paymentProvider;
  const pk = pp?.publishableKey ?? "";
  const pkMode = pk.startsWith("pk_live_") ? "LIVE" : pk.startsWith("pk_test_") ? "TEST" : pk ? "UNKNOWN-FORMAT" : "NOT SET";
  console.log(`RESTAURANT: ${r.name} (${r.slug})  country=${r.country ?? "-"}  currency=${r.currency}  tax=${r.taxRate}%`);
  console.log(`services: pickup=${r.acceptsPickup} delivery=${r.acceptsDelivery}`);
  console.log(`paypal: status=${(r as any).paypalAccountStatus ?? "-"}  env=${(r as any).paypalEnvironment ?? "-"}`);
  console.log(`paymentMethods: ${r.paymentMethods}`);
  if (!pp) { console.log("paymentProvider: NOT SET UP (no row)"); }
  else {
    console.log(`paymentProvider: ${pp.provider}  mode=${pp.mode}  method=${pp.connectMethod}  isActive=${pp.isActive}`);
    console.log(`  publishableKey: ${pkMode}${pk ? ` (…${pk.slice(-4)})` : ""}`);
    console.log(`  secretKey stored: ${pp.secretKeyEnc ? "YES (encrypted)" : "NO"}`);
    console.log(`  lastTested: ${pp.lastTestedAt ? pp.lastTestedAt.toISOString() : "never"}  status=${pp.lastTestStatus ?? "-"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
