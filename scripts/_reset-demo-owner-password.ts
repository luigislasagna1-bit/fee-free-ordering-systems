/**
 * DEV-ONLY: reset the demo restaurant owner's password so E2E sessions can
 * log in (the old seed password rotated at some point). Refuses PROD.
 *   npx tsx scripts/_reset-demo-owner-password.ts [email] [password]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = process.argv[2] || "owner@pizzapalace.com";
  const password = process.argv[3] || "restaurant123";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL");
  try {
    const envLocal = readFileSync(".env.local", "utf8");
    const m = envLocal.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m);
    if (m && url === m[1]) throw new Error("REFUSING to run: active DATABASE_URL is the PROD database.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REFUSING")) throw e;
  }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const passwordHash = await bcrypt.hash(password, 12);
  const res = await prisma.user.updateMany({ where: { email }, data: { passwordHash } });
  console.log(res.count === 1 ? `✓ password reset for ${email}` : `✗ no user with email ${email}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
