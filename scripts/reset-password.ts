/**
 * Reset a user's password directly in the database. Use when the owner
 * has lost access and the email-based forgot-password flow isn't an option
 * (e.g., email delivery is broken or unconfigured).
 *
 * Reads the email + new password as args so nothing ends up in shell
 * history if you pass the password via a here-string or env var.
 *
 * Usage:
 *   npx tsx scripts/reset-password.ts <email> <new-password> <database-url>
 *
 * Example:
 *   npx tsx scripts/reset-password.ts admin@feefreeordering.com 'MyNewP@ss123' "$PROD_URL"
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const [, , email, password, url] = process.argv;
if (!email || !password || !url) {
  console.error("Usage: npx tsx scripts/reset-password.ts <email> <new-password> <database-url>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true },
  });
  if (!user) {
    console.error(`No user with email ${email} on this DB.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, isActive: true },
  });

  console.log(`✅ Password reset for ${email}  (role=${user.role})`);
  console.log("   You can now log in with the new password.");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
