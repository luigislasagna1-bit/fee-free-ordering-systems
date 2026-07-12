/**
 * READ-ONLY: list superadmin accounts + whether support@feefreeordering.com
 * is free to become the superadmin login email (unique constraint check).
 *   npx tsx scripts/run-on-prod.ts scripts/_check-superadmin-account.ts
 */
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

  const supers = await prisma.user.findMany({
    where: { role: "superadmin" },
    select: { id: true, email: true, name: true, createdAt: true, restaurantId: true },
  });
  console.log(`superadmin accounts (${supers.length}):`);
  for (const u of supers) console.log(`  ${u.email}  name=${u.name ?? "-"} restaurantId=${u.restaurantId ?? "null"} created=${u.createdAt.toISOString()}`);

  const support = await prisma.user.findUnique({
    where: { email: "support@feefreeordering.com" },
    select: {
      id: true, role: true, name: true, createdAt: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });
  console.log(
    support
      ? `support@feefreeordering.com: EXISTS role=${support.role} name=${support.name ?? "-"} restaurant=${support.restaurant?.name ?? "-"} (${support.restaurant?.slug ?? "-"}) created=${support.createdAt.toISOString()}`
      : "support@feefreeordering.com: free",
  );
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
