/**
 * Diagnose why the Combo tab isn't showing: list a restaurant's active
 * add-ons + the union of features they grant, and whether
 * advanced_promo_types (required by combos) is present.
 *   npx tsx scripts/run-on-prod.ts scripts/diag-combo-entitlement.ts <email>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) throw new Error("Pass an email");

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, restaurantId: true },
  });
  let restaurantId = user?.restaurantId ?? null;
  if (!restaurantId) {
    const r = await prisma.restaurant.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) { console.log(`No restaurant for ${email}`); return; }

  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, slug: true } });
  console.log(`Restaurant: ${r?.name} (${r?.slug})  id=${restaurantId}`);

  const rows = await prisma.restaurantAddOn.findMany({
    where: { restaurantId },
    select: { status: true, addOn: { select: { slug: true, name: true, enabledFeatures: true } } },
  });
  console.log(`\nAdd-on rows (${rows.length}):`);
  const featureSet = new Set<string>();
  for (const row of rows) {
    let feats: unknown = [];
    try { feats = JSON.parse(row.addOn.enabledFeatures || "[]"); } catch {}
    const granting = ["active", "trialing"].includes(row.status);
    if (granting && Array.isArray(feats)) for (const f of feats) if (typeof f === "string") featureSet.add(f);
    console.log(`  - ${row.addOn.slug} [${row.status}] ${granting ? "(GRANTING)" : "(not granting)"}  feats=${row.addOn.enabledFeatures}`);
  }
  console.log(`\nUnion of granted features: ${[...featureSet].join(", ") || "(none)"}`);
  console.log(`\n>>> Combo tab requires "advanced_promo_types": ${featureSet.has("advanced_promo_types") ? "✅ PRESENT" : "❌ MISSING"}`);

  // Also show the advanced_promos AddOn row definition regardless of grant.
  const ap = await prisma.addOn.findUnique({ where: { slug: "advanced_promos" }, select: { name: true, enabledFeatures: true } });
  console.log(`\nAddOn 'advanced_promos' definition: feats=${ap?.enabledFeatures}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
