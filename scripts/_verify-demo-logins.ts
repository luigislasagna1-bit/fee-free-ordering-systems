/**
 * READ-ONLY: verify the reviewer demo logins actually authenticate — fetches the
 * kitchen demo user + demo driver and bcrypt-compares the given passwords against
 * the live hashes. Also confirms the demo restaurant is reviewer-usable (published).
 *   npx tsx scripts/run-on-prod.ts scripts/_verify-demo-logins.ts '<kitchenPw>' '<driverPw>'
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const [kitchenPw, driverPw] = [process.argv[2], process.argv[3]];
  if (!kitchenPw || !driverPw) throw new Error("Usage: _verify-demo-logins.ts '<kitchenPw>' '<driverPw>'");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.user.findUnique({
    where: { email: "demo@feefreeordering.com" },
    select: { passwordHash: true, role: true, restaurant: { select: { slug: true, publishedAt: true } } },
  });
  const driver = await prisma.driver.findUnique({
    where: { email: "demo.driver@feefreeordering.com" },
    select: { passwordHash: true, isActive: true },
  });

  const kOk = user?.passwordHash ? await bcrypt.compare(kitchenPw, user.passwordHash) : false;
  const dOk = driver?.passwordHash ? await bcrypt.compare(driverPw, driver.passwordHash) : false;
  console.log(`kitchen demo@feefreeordering.com  password verifies: ${kOk} (role ${user?.role}, restaurant ${user?.restaurant?.slug}, publishedAt ${user?.restaurant?.publishedAt?.toISOString() ?? "NULL — reviewers can't order!"})`);
  console.log(`driver  demo.driver@feefreeordering.com password verifies: ${dOk} (active ${driver?.isActive})`);
  if (!kOk || !dOk) process.exit(1);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
