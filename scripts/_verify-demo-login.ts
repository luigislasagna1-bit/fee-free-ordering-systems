/** READ-ONLY: verify the App Review demo login actually works, the same way
 *  the kitchen app's login (src/lib/auth-kitchen.ts) checks it. No mutations.
 *    npx tsx scripts/run-on-prod.ts scripts/_verify-demo-login.ts demo@feefreeordering.com 'AppReview2026!'
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = (process.argv[2] || "demo@feefreeordering.com").trim().toLowerCase();
  const password = process.argv[3] || "AppReview2026!";
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { restaurant: { select: { id: true, name: true, isActive: true, slug: true } } },
  });

  console.log(`\nVerifying kitchen login for: ${email}`);
  if (!user) { console.log("  ❌ No User with this email on production."); await prisma.$disconnect(); return; }
  const pwOk = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  console.log(`  User exists:      ✓  (role=${user.role})`);
  console.log(`  isActive:         ${user.isActive ? "✓" : "❌ NO (login blocked)"}`);
  console.log(`  Has restaurant:   ${user.restaurant ? `✓  "${user.restaurant.name}" (slug=${user.restaurant.slug}, active=${user.restaurant.isActive})` : "❌ NO"}`);
  console.log(`  Password matches: ${pwOk ? "✓" : "❌ NO — the stored password is different"}`);

  const willLogIn = !!user && user.isActive && !!user.restaurant && pwOk;
  console.log(`\n  => Reviewer can log in with this password: ${willLogIn ? "YES ✓" : "NO ✗"}\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
