/**
 * Read-only check: list all User rows for a given email, with role +
 * restaurantId. Used to diagnose "I logged in as X but the app thinks
 * I'm superadmin" type bugs.
 *
 * Run:
 *   npx tsx scripts/check-user-role.ts <email> "<postgres-url>"
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const email = process.argv[2];
  const url = process.argv[3];
  if (!email || !url) {
    console.error('Usage: check-user-role.ts <email> "<postgres-url>"');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
  try {
    const users = await prisma.user.findMany({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        restaurantId: true,
        emailVerifiedAt: true,
        createdAt: true,
        restaurant: { select: { name: true, slug: true } },
      },
    });
    console.log(`Found ${users.length} User row(s) for "${email}":\n`);
    for (const u of users) {
      console.log(`  id:                ${u.id}`);
      console.log(`  role:              ${u.role}`);
      console.log(`  restaurantId:      ${u.restaurantId ?? "(none)"}`);
      if (u.restaurant) console.log(`  restaurant:        ${u.restaurant.name} (${u.restaurant.slug})`);
      console.log(`  emailVerified:     ${u.emailVerifiedAt?.toISOString() ?? "(no)"}`);
      console.log(`  createdAt:         ${u.createdAt.toISOString()}`);
      console.log("");
    }

    if (users.length === 0) {
      console.log(`No User row exists for that email — login would have failed.`);
    } else if (users.length > 1) {
      console.log(`Multiple User rows for this email — login picks ONE deterministically. Possible cause of role confusion.`);
    } else if (users[0].role === "superadmin") {
      console.log(`This user IS a superadmin. /admin/* routes will path-map to /superadmin/* per proxy.ts.`);
      console.log(`To prevent: change their role to "restaurant_admin" OR log in with a different account.`);
    } else {
      console.log(`This user is NOT a superadmin. /admin/* should pass through cleanly.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
