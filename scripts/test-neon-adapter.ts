/**
 * Sanity check: connects via PrismaNeon and runs the same User.findUnique
 * the auth flow does. If this returns a user row, the new adapter works.
 *
 * Usage:
 *   npx tsx scripts/test-neon-adapter.ts <email> <db-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const [, , email, url] = process.argv;
if (!email || !url) {
  console.error("Usage: npx tsx scripts/test-neon-adapter.ts <email> <db-url>");
  process.exit(1);
}

async function main() {
  console.log("Connecting via PrismaNeon (HTTP adapter)…");
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const start = Date.now();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { restaurant: true, resellerProfile: { select: { id: true } } },
  });
  const ms = Date.now() - start;

  if (user) {
    console.log(`✅ findUnique succeeded in ${ms}ms.`);
    console.log(`   id=${user.id}  role=${user.role}  isActive=${user.isActive}`);
  } else {
    console.log(`❌ User ${email} not found (query OK, ${ms}ms).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error("Threw:", e); process.exit(1); });
