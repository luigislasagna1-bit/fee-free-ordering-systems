/**
 * Set the password on the demo reviewer restaurant login (demo@feefreeordering.com)
 * so App Store / Play reviewers can sign into the Kitchen app. Idempotent-create
 * won't change an existing account's password, so this dedicated reset does.
 *   npx tsx scripts/run-on-prod.ts scripts/_set-demo-password.ts '<password>'
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "demo@feefreeordering.com";

async function main() {
  const password = process.argv[2];
  if (!password) throw new Error("Usage: _set-demo-password.ts '<password>'");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true, restaurantId: true } });
  if (!user) { console.log(`no user ${EMAIL} — run create-demo-restaurant.ts first`); return; }
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, emailVerifiedAt: new Date() } });
  console.log(`✓ password set for ${EMAIL} (role=${user.role}, restaurantId=${user.restaurantId})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
