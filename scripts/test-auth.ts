// Direct test of the authorize() flow: loads a user, runs bcrypt.compare,
// reports result. Bypasses NextAuth so we can see the real failure mode.
//
// Usage:
//   npx tsx scripts/test-auth.ts <email> <password>
//   npx tsx scripts/test-auth.ts <email> <password> <database-url>
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const [, , email, password, explicitUrl] = process.argv;
if (!email || !password) {
  console.error("Usage: tsx scripts/test-auth.ts <email> <password> [database-url]");
  process.exit(1);
}

if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Looking up user: ${email}`);
  console.log(`Against DB: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  // Mirror the EXACT query from src/lib/auth.ts authorize()
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true, resellerProfile: { select: { id: true } } },
    });
  } catch (e: any) {
    console.error("❌ Prisma query THREW:", e.message);
    console.error(e.stack);
    process.exit(1);
  }

  if (!user) {
    console.log("❌ User not found in DB.");
    process.exit(0);
  }

  console.log("User row:");
  console.log(`  id:                ${user.id}`);
  console.log(`  email:             ${user.email}`);
  console.log(`  role:              ${user.role}`);
  console.log(`  isActive:          ${user.isActive}`);
  console.log(`  restaurantId:      ${user.restaurantId ?? "—"}`);
  console.log(`  resellerProfileId: ${user.resellerProfile?.id ?? "—"}`);
  console.log(`  passwordHash:      ${user.passwordHash.slice(0, 25)}... (len=${user.passwordHash.length})`);
  console.log();

  if (!user.isActive) {
    console.log("❌ User is inactive — authorize() would reject.");
    process.exit(0);
  }

  console.log("Checking bcrypt password...");
  const valid = await bcrypt.compare(password, user.passwordHash);
  console.log(`  bcrypt.compare result: ${valid ? "✅ VALID" : "❌ MISMATCH"}`);

  if (!valid) {
    console.log("\n  Suggested fixes:");
    console.log("   - Reset this user's password via /forgot-password");
    console.log("   - OR run a password-reset script for admin");
  } else {
    console.log("\n✅ This account CAN log in. If the UI still shows 'Invalid email or password',");
    console.log("   the bug is elsewhere (cookie/CSRF/NEXTAUTH_SECRET mismatch).");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
