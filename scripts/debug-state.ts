// Diagnostic: dump DB state to figure out why login is broken.
// Run: npx tsx scripts/debug-state.ts
//
// Loads .env.local + .env BEFORE importing the Prisma client (which reads
// DATABASE_URL on construction). We use dynamic import so dotenv runs first.
import { config as dotenvConfig } from "dotenv";
import { PrismaClient as PostgresPrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// CLI usage:
//   npx tsx scripts/debug-state.ts           → uses .env.local DATABASE_URL (dev)
//   npx tsx scripts/debug-state.ts <url>     → uses the explicit URL (e.g. prod)
const explicitUrl = process.argv[2];

if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL — pass it as an arg or set in .env.local");
    process.exit(1);
  }

  // Use the generated client directly with an explicit url so we bypass
  // src/lib/db's singleton + env loading.
  // Prisma 7 with the pg driver adapter — see src/lib/db.ts for the same pattern.
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PostgresPrismaClient({ adapter } as any);

  console.log("=== DATABASE URL ===");
  console.log(url.replace(/:[^:@]+@/, ":****@"));

  console.log("\n=== USERS ===");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      restaurantId: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    console.log(
      `  ${u.email.padEnd(40)} role=${u.role.padEnd(20)} restaurantId=${u.restaurantId ?? "—"} active=${u.isActive}`
    );
  }
  console.log(`  total users: ${users.length}`);

  console.log("\n=== RESTAURANTS ===");
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      subscriptionStatus: true,
      parentRestaurantId: true,
      resellerProfileId: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  for (const r of restaurants) {
    console.log(
      `  ${r.slug.padEnd(30)} ${r.name.padEnd(40)} status=${r.subscriptionStatus.padEnd(12)} parent=${r.parentRestaurantId ?? "—"} reseller=${r.resellerProfileId ?? "—"}`
    );
  }
  console.log(`  total restaurants: ${restaurants.length}`);

  console.log("\n=== RESELLER PROFILES ===");
  const profiles = await prisma.resellerProfile.findMany({
    include: { user: { select: { email: true } }, _count: { select: { restaurants: true } } },
  });
  for (const p of profiles) {
    console.log(
      `  ${p.user.email.padEnd(40)} status=${p.status.padEnd(12)} restaurants=${p._count.restaurants} customRate=${p.customCommissionRate ?? "—"}`
    );
  }
  console.log(`  total profiles: ${profiles.length}`);

  console.log("\n=== PRISMA SCHEMA-vs-DB CHECK ===");
  try {
    await prisma.restaurant.findFirst({ select: { parentRestaurantId: true } });
    console.log("  Restaurant.parentRestaurantId column exists: OK");
  } catch (e: any) {
    console.log("  Restaurant.parentRestaurantId column exists: FAIL —", e.message);
  }
  try {
    await prisma.resellerProfile.findFirst({ select: { customCommissionRate: true } });
    console.log("  ResellerProfile.customCommissionRate column exists: OK");
  } catch (e: any) {
    console.log("  ResellerProfile.customCommissionRate column exists: FAIL —", e.message);
  }
  try {
    // The query that login does — exact same shape.
    await prisma.user.findFirst({
      include: { restaurant: true, resellerProfile: { select: { id: true } } },
    });
    console.log("  Login-shape query (include restaurant + resellerProfile.id): OK");
  } catch (e: any) {
    console.log("  Login-shape query: FAIL —", e.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
