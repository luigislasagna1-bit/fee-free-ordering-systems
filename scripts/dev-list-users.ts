import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`Connected: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, restaurantId: true, isActive: true, restaurant: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`Users (${users.length}):`);
  for (const u of users) {
    console.log(`  ${u.email.padEnd(40)}  role=${u.role.padEnd(20)}  active=${u.isActive}  restaurant=${u.restaurant?.slug ?? "—"} (${u.restaurant?.name ?? "—"})`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
