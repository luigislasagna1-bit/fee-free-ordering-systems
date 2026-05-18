/**
 * Diagnostic: list every User row in a given DB so we can figure out
 * which branch has which accounts. Read-only.
 *
 * Usage:
 *   npx tsx scripts/find-login.ts <database-url>
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const explicitUrl = process.argv[2];
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const masked = url.replace(/:[^:@]+@/, ":****@");
  console.log(`Database: ${masked}\n`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const users = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
      restaurantId: true,
      emailVerifiedAt: true,
      createdAt: true,
      passwordHash: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`User rows: ${users.length}\n`);
  for (const u of users) {
    const hashFingerprint = u.passwordHash ? u.passwordHash.slice(0, 7) + "…" : "(none)";
    console.log(`  ${u.email.padEnd(45)} role=${u.role.padEnd(20)} verified=${u.emailVerifiedAt ? "Y" : "N"}  pw=${hashFingerprint}  created=${u.createdAt.toISOString().slice(0, 10)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
