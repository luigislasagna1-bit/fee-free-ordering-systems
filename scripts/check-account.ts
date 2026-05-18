/**
 * Diagnostic: check whether a given email can pass the same checks as
 * NextAuth's credentials provider. Read-only. Doesn't reveal passwords.
 *
 * Usage:
 *   npx tsx scripts/check-account.ts <email> <password> [<db-url>]
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const email = process.argv[2];
const password = process.argv[3];
const explicitUrl = process.argv[4];

if (!email || !password) {
  console.error("Usage: npx tsx scripts/check-account.ts <email> <password> [<db-url>]");
  process.exit(1);
}

if (!explicitUrl) dotenvConfig({ path: ".env.local" });

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const masked = url!.replace(/:[^:@]+@/, ":****@");
  console.log(`Database: ${masked}`);
  console.log(`Email:    ${email}`);
  console.log("");

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, isActive: true, passwordHash: true, emailVerifiedAt: true },
  });

  if (!user) {
    console.log("❌ User NOT FOUND on this database. NextAuth returns null → 'Invalid email or password'.");
    await prisma.$disconnect();
    return;
  }

  console.log(`✅ User found:  id=${user.id}  role=${user.role}  isActive=${user.isActive}`);
  console.log(`   emailVerifiedAt: ${user.emailVerifiedAt ? "Y" : "N"}`);
  console.log(`   passwordHash format: ${user.passwordHash.slice(0, 7)}…  (length ${user.passwordHash.length})`);

  if (!user.isActive) {
    console.log("❌ isActive=false. NextAuth refuses to authenticate.");
    await prisma.$disconnect();
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (valid) {
    console.log("\n✅ PASSWORD MATCHES. NextAuth should let you in. If still failing, the issue is cookies/NEXTAUTH_URL/Vercel runtime.");
  } else {
    console.log("\n❌ PASSWORD DOES NOT MATCH. The password you typed is wrong, OR the hash was created against a different password.");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
