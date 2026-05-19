/**
 * Full audit of every account-bearing row in the DB. Not just User —
 * also Restaurant rows (which might point at a User that was deleted),
 * Customer rows, RestaurantAccess rows, etc.
 *
 * Use when you suspect users were lost or you want a complete map of
 * who can log in.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL!;
const adapter = new PrismaNeon({ connectionString: url });
const prisma = new PrismaClient({ adapter } as any);

console.log(`DB: ${url.replace(/:[^:@]+@/, ":***@")}\n`);

async function main() {
  // ALL users — no filters, no ordering.
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      restaurantId: true,
      createdAt: true,
      emailVerifiedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`=== USERS (${users.length}) ===`);
  for (const u of users) {
    console.log(
      `  ${u.email.padEnd(40)} role=${u.role.padEnd(18)} active=${u.isActive ? "Y" : "N"} verified=${u.emailVerifiedAt ? "Y" : "N"} created=${u.createdAt.toISOString().slice(0, 10)} restaurantId=${u.restaurantId ?? "-"}`,
    );
  }

  // RestaurantAccess — users with access to multiple restaurants (multi-loc UX).
  const access = await prisma.restaurantAccess.findMany({
    include: { user: { select: { email: true } }, restaurant: { select: { name: true, slug: true } } },
  });
  console.log(`\n=== RESTAURANT ACCESS (${access.length}) ===`);
  for (const a of access) {
    console.log(`  ${a.user.email} → ${a.restaurant.name} (${a.restaurant.slug})  role=${a.role}`);
  }

  // Restaurants
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentRestaurantId: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n=== RESTAURANTS (${restaurants.length}) ===`);
  for (const r of restaurants) {
    console.log(
      `  ${r.name.padEnd(30)} slug=${r.slug.padEnd(35)} active=${r.isActive ? "Y" : "N"} parent=${r.parentRestaurantId ?? "-"}`,
    );
  }

  // Customers (these are end-user customers, not login accounts, but FYI)
  const customerCount = await prisma.customer.count();
  console.log(`\n=== CUSTOMERS (end-users — order history) ===`);
  console.log(`  Total: ${customerCount}`);

  // Reseller profiles
  const resellers = await prisma.resellerProfile.findMany({
    select: { id: true, companyName: true, status: true },
  });
  console.log(`\n=== RESELLER PROFILES (${resellers.length}) ===`);
  for (const r of resellers) {
    console.log(`  ${r.companyName ?? "(no name)"} status=${r.status}`);
  }
}

main()
  .catch((e: any) => {
    console.error("FAILED:", e.message);
    console.error(e.stack);
  })
  .finally(() => process.exit(0));
