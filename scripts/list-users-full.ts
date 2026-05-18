/**
 * Read-only: list every User with isActive + emailVerifiedAt status.
 *
 * Usage:
 *   npx tsx scripts/list-users-full.ts <database-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.argv[2];
if (!url) { console.error("Usage: npx tsx scripts/list-users-full.ts <database-url>"); process.exit(1); }

async function main() {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const users = await prisma.user.findMany({
    select: {
      email: true, role: true, isActive: true,
      emailVerifiedAt: true, passwordHash: true, createdAt: true,
      restaurantId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Database (host masked): ${url.replace(/:[^:@]+@.*?\./, ":****@***.").slice(0, 80)}…`);
  console.log(`User rows: ${users.length}\n`);
  console.log("isActive | verified | role                  | email                                   | pw");
  console.log("---------+----------+-----------------------+-----------------------------------------+-----");
  for (const u of users) {
    const active = u.isActive ? "✅" : "❌ FALSE!";
    const ver = u.emailVerifiedAt ? "✅" : "❌";
    const pw = u.passwordHash ? u.passwordHash.slice(0, 7) : "(none)";
    console.log(`${active.padEnd(8)} | ${ver.padEnd(8)} | ${u.role.padEnd(21)} | ${u.email.padEnd(39)} | ${pw}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
