// Verifies which DB the app is reading from. Run with:
//   DATABASE_URL="file:./dev.db" npx tsx scripts/check-restaurants.ts
//
// If this prints zero rows, your .env is loading a different DATABASE_URL
// than the one your dev server uses.

import prisma from "../src/lib/db";

async function main() {
  const rs = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, isActive: true, subscriptionStatus: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("Total restaurants in DB:", rs.length);
  rs.forEach((r, i) => console.log((i + 1) + ".", JSON.stringify(r)));
  await prisma.$disconnect();
}

main().catch(console.error);
