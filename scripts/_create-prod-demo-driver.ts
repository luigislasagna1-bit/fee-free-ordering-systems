/**
 * Create/refresh the DEMO DRIVER account for Play/App Store reviewers (driver app
 * "Fee Free Delivery" App-access field). Idempotent upsert; password passed as an
 * arg so it never lands in git — it lives only in the store consoles.
 *   npx tsx scripts/run-on-prod.ts scripts/_create-prod-demo-driver.ts '<password>'
 * (Works on dev too — the adapter auto-detects Neon vs local like _set-demo-password.ts.)
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "demo.driver@feefreeordering.com";

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 8) throw new Error("Usage: _create-prod-demo-driver.ts '<password (8+ chars)>'");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // Home store = the reviewer demo restaurant (nice-to-have; null is fine too).
  const home = await prisma.restaurant.findFirst({ where: { slug: "fee-free-demo-restaurant" }, select: { id: true } });
  const passwordHash = await bcrypt.hash(password, 12);
  const driver = await prisma.driver.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: "Demo Driver", passwordHash, homeRestaurantId: home?.id ?? null, isActive: true },
    update: { passwordHash, isActive: true },
  });
  console.log(`✓ demo driver ready: ${EMAIL} (id ${driver.id}, active ${driver.isActive}, home ${home?.id ?? "none"})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
