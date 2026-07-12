/**
 * READ-ONLY: everything the ShipDay onboarding walkthrough needs to know
 * about a restaurant — entitlements, delivery service, payment gate, and
 * the ShipdayConfig row (token/verified state, no secrets).
 *   npx tsx scripts/run-on-prod.ts scripts/_check-shipday-config.ts <name-or-slug>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const q = process.argv[2] || "demo-pizza-palace";
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // Exact id or exact slug first (contains-matching can hit stale copies of
  // the same restaurant name), then fuzzy fallback.
  const r =
    (await prisma.restaurant.findFirst({
      where: { OR: [{ id: q }, { slug: q }] },
      select: { id: true, name: true, slug: true, acceptsDelivery: true, paypalAccountStatus: true },
    })) ??
    (await prisma.restaurant.findFirst({
      where: { OR: [{ slug: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
      select: { id: true, name: true, slug: true, acceptsDelivery: true, paypalAccountStatus: true },
    }));
  if (!r) { console.log(`no restaurant matching "${q}"`); return; }
  console.log(`=== ${r.name} (${r.slug}) ===`);
  console.log(`acceptsDelivery=${r.acceptsDelivery}`);

  const addons = await prisma.restaurantAddOn.findMany({
    where: { restaurantId: r.id, addOn: { slug: { in: ["driver_pool", "online_payments", "marketplace"] } } },
    select: { status: true, trialEndsAt: true, addOn: { select: { slug: true } } },
  });
  for (const a of addons) console.log(`addon ${a.addOn.slug}: status=${a.status} trialEnds=${a.trialEndsAt?.toISOString() ?? "-"}`);
  if (addons.length === 0) console.log("addon rows: NONE of driver_pool / online_payments / marketplace");

  const pp = await prisma.paymentProvider.findUnique({
    where: { restaurantId: r.id },
    select: { isActive: true, mode: true, publishableKey: true },
  });
  console.log(`paymentProvider: active=${pp?.isActive} mode=${pp?.mode} pk=${pp?.publishableKey ? pp.publishableKey.slice(0, 8) + "…" : "-"} paypal=${r.paypalAccountStatus ?? "-"}`);

  const cfg = await prisma.shipdayConfig.findUnique({ where: { restaurantId: r.id } });
  console.log(cfg
    ? `shipdayConfig: enabled=${cfg.enabled} source=${cfg.deliverySource} hasKey=${!!cfg.apiKeyEnc} feeMode=${cfg.deliveryFeeMode} token=${cfg.webhookToken ? "minted" : "-"} verified=${cfg.webhookVerifiedAt?.toISOString() ?? "-"} partnerNotified=${cfg.partnerNotifiedAt?.toISOString() ?? "-"}`
    : "shipdayConfig: (no row yet)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
