/**
 * Reproduces exactly what NextAuth's `authorize()` does in src/lib/auth.ts,
 * to isolate whether the failure is in the Prisma query (silently throws
 * and NextAuth shows "Invalid email or password") or somewhere else.
 *
 * Usage:
 *   npx tsx scripts/simulate-login.ts <email> <db-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const [, , email, url] = process.argv;
if (!email || !url) {
  console.error("Usage: npx tsx scripts/simulate-login.ts <email> <db-url>");
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log("1. findUnique with include — this is what authorize() does:");
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true, resellerProfile: { select: { id: true } } },
    });
    if (!user) {
      console.log("   ❌ User not found.");
    } else {
      console.log("   ✅ Query succeeded.");
      console.log(`      id=${user.id}`);
      console.log(`      role=${user.role}`);
      console.log(`      isActive=${user.isActive}`);
      console.log(`      restaurant=${user.restaurant ? user.restaurant.slug : "(none)"}`);
      console.log(`      resellerProfile=${user.resellerProfile ? user.resellerProfile.id : "(none)"}`);
      console.log(`      emailVerifiedAt=${user.emailVerifiedAt}`);
      console.log(`      emailVerifyToken=${user.emailVerifyToken ? "present" : "null"}`);
    }
  } catch (e: any) {
    console.log("   ❌ THREW:", e?.message || e);
    console.log("   This is what NextAuth would see — it returns null → 'Invalid email or password'.");
  }

  console.log("\n2. Listing all User columns Prisma sees:");
  try {
    const cols: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='User'
      ORDER BY ordinal_position
    `);
    for (const c of cols) console.log("   ", c.column_name);
  } catch (e: any) {
    console.log("   ❌ Couldn't list:", e?.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error("Top-level error:", e); process.exit(1); });
