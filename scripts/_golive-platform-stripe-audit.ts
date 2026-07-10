/** READ-ONLY: platform Stripe (PlatformSettings) state — mode, enabled, key
 *  presence + publishable prefix. No secrets decrypted or printed.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_golive-platform-stripe-audit.ts */
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

  const s = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { stripeMode: true, stripeEnabled: true, stripePublishableKey: true, stripeSecretKeyEnc: true, stripeWebhookSecretEnc: true, updatedAt: true } as any,
  });
  if (!s) { console.log("PlatformSettings: NO ROW (env-var fallback in use)"); }
  else {
    const pk = s.stripePublishableKey ?? "";
    const pkMode = pk.startsWith("pk_live_") ? "LIVE" : pk.startsWith("pk_test_") ? "TEST" : pk ? "UNKNOWN" : "NOT SET";
    console.log(`stripeMode=${s.stripeMode ?? "-"}  enabled=${s.stripeEnabled}`);
    console.log(`publishableKey: ${pkMode}${pk ? ` (…${pk.slice(-4)})` : ""}`);
    console.log(`secretKey stored: ${s.stripeSecretKeyEnc ? "YES (encrypted)" : "NO"}`);
    console.log(`webhookSecret stored: ${s.stripeWebhookSecretEnc ? "YES (encrypted)" : "NO"}`);
    console.log(`last saved: ${(s as any).updatedAt?.toISOString?.() ?? "-"}`);
  }
  // Add-on live price IDs state (runbook step 6) — how many add-ons have a price id set.
  const addOns = await prisma.addOn.findMany({ select: { slug: true, stripePriceId: true, monthlyPriceCents: true } }).catch((e) => { console.log("addOn query failed:", e?.message?.slice(0,120)); return null; });
  if (addOns) {
    console.log(`addOns: ${addOns.length} total, ${addOns.filter((a) => a.stripePriceId).length} with a stripePriceId`);
    for (const a of addOns) console.log(`  - ${(a as any).slug}: $${((a as any).monthlyPriceCents/100).toFixed(2)}/mo  priceId=${a.stripePriceId ? a.stripePriceId.slice(0, 10) + "…" : "NONE"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
