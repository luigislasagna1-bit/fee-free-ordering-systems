/**
 * Grant the Advanced Promo Marketing add-on (advanced_promo_types) to a
 * restaurant by owner/account email. Idempotent.
 *   npx tsx scripts/run-on-prod.ts scripts/grant-advanced-promos.ts <email>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) throw new Error("Pass an email: ... grant-advanced-promos.ts <email>");

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // Resolve the restaurant: try a User account first, then a restaurant's own email.
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
  if (!restaurantId) {
    console.log(`No restaurant found for ${email} (checked User.email and Restaurant.email).`);
    return;
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, slug: true } });
  const addOn = await prisma.addOn.findUnique({ where: { slug: "advanced_promos" }, select: { id: true, name: true, enabledFeatures: true } });
  if (!addOn) throw new Error("advanced_promos add-on row not found in this DB.");

  const existing = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId, addOnId: addOn.id } },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status !== "active") {
      await prisma.restaurantAddOn.update({ where: { id: existing.id }, data: { status: "active", cancelAtPeriodEnd: false } });
      console.log(`Re-activated existing add-on (was ${existing.status}).`);
    } else {
      console.log("Already active — nothing to do.");
    }
  } else {
    await prisma.restaurantAddOn.create({
      data: { restaurantId, addOnId: addOn.id, status: "active" },
    });
    console.log("Granted advanced_promos (active).");
  }

  console.log(`\n✅ Advanced Promo Marketing enabled for "${restaurant?.name}" (${restaurant?.slug}) [${email}]`);
  console.log(`   add-on features: ${addOn.enabledFeatures}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
