/**
 * Create a superadmin user in whichever database DATABASE_URL points at.
 *
 * Usage:
 *   npx tsx scripts/create-superadmin.ts <email> <password>
 *
 * Example (creating on PRODUCTION — temporarily point DATABASE_URL at prod):
 *   $env:DATABASE_URL="postgresql://...prod-url..."
 *   npx tsx scripts/create-superadmin.ts you@yourdomain.com 'StrongPasswordHere!'
 *
 * If a user with that email already exists, the script promotes them to
 * superadmin and updates their password — no duplicate row, no destructive
 * action on their other data.
 *
 * Safety checks:
 *   - Refuses to run if email/password missing
 *   - Password must be at least 8 chars (basic floor)
 *   - Always prints which DB host it's writing to, so you can abort if wrong
 */

import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error("✗ Usage: npx tsx scripts/create-superadmin.ts <email> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("✗ Password must be at least 8 characters.");
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("✗ Email looks invalid.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set.");
  process.exit(1);
}

const host = url.match(/@([^/]+)\//)?.[1] ?? "(unknown)";
console.log(`Writing to DB host: ${host}\n`);

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await (prisma as any).user.findUnique({ where: { email } });

  if (existing) {
    await (prisma as any).user.update({
      where: { email },
      data: { passwordHash, role: "superadmin", isActive: true, restaurantId: null },
    });
    console.log(`✓ Updated existing user ${email} → role=superadmin, password reset.`);
  } else {
    await (prisma as any).user.create({
      data: {
        email,
        name: "Super Admin",
        passwordHash,
        role: "superadmin",
        isActive: true,
        restaurantId: null,
      },
    });
    console.log(`✓ Created superadmin ${email}.`);
  }

  console.log(`\nLog in at /login with that email + password.`);
  console.log(`After signing in, you'll be redirected to /superadmin.`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
