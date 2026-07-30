import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const users = await p.user.findMany({
    where: { email: { contains: "luigi", mode: "insensitive" } },
    select: { email: true, role: true, restaurantId: true, passwordHash: true, isActive: true, emailVerifiedAt: true, lockedUntil: true, failedLoginCount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Users with "luigi" in email: ${users.length}`);
  for (const u of users) {
    console.log(`  email=${JSON.stringify(u.email)} role=${u.role} rid=${u.restaurantId || "-"} isActive=${u.isActive} verified=${!!u.emailVerifiedAt} hasPw=${!!u.passwordHash} locked=${u.lockedUntil || "no"} fails=${u.failedLoginCount}`);
  }
  const exact = await p.user.findUnique({ where: { email: "info@luigislasagna.com" }, select: { email: true } });
  console.log(`\nauthorize-style findUnique("info@luigislasagna.com") => ${exact ? "FOUND (" + JSON.stringify(exact.email) + ")" : "NOT FOUND"}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
