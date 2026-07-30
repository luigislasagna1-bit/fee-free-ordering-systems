/** Read-only login diagnostic: is <email> a valid restaurant-OWNER login, and
 *  what is the actual owner email for Luigi's store? Prints; never logs secrets. */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const email = (process.argv[2] || "info@luigislasagna.com").trim().toLowerCase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, role: true, restaurantId: true, emailVerifiedAt: true, passwordHash: true, lockedUntil: true, failedLoginCount: true },
  });
  console.log(`\n=== USER lookup for "${email}" ===`);
  if (!user) {
    console.log("  ❌ No USER (admin/owner/staff) account with this email — this can't log in at /login.");
  } else {
    console.log(`  ✓ user id=${user.id}`);
    console.log(`    role=${user.role} | restaurantId=${user.restaurantId ?? "(none)"} | emailVerified=${!!user.emailVerifiedAt} | hasPassword=${!!user.passwordHash}`);
    console.log(`    lockedUntil=${user.lockedUntil ?? "(no)"} | failedLoginCount=${user.failedLoginCount ?? 0}`);
  }

  // Is it a CUSTOMER (the CARTBACK-offer recipient)?
  const customers = await prisma.customer.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, restaurantId: true, restaurant: { select: { name: true } } },
    take: 5,
  });
  console.log(`\n=== CUSTOMER lookup for "${email}" (${customers.length}) ===`);
  for (const c of customers) console.log(`  customer of "${c.restaurant?.name}" (${c.restaurantId})`);

  // Who actually owns Luigi's store(s)?
  const rests = await prisma.restaurant.findMany({
    where: { name: { contains: "luigi", mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
    take: 5,
  });
  console.log(`\n=== Restaurants matching "luigi" (${rests.length}) — owner logins ===`);
  for (const r of rests) {
    const owners = await prisma.user.findMany({
      where: { restaurantId: r.id, role: "restaurant_admin" },
      select: { email: true },
    });
    console.log(`  "${r.name}" (slug ${r.slug})`);
    for (const u of owners) console.log(`     owner login: ${u.email}`);
    if (owners.length === 0) console.log("     (no restaurant_admin user)");
  }
  console.log();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
