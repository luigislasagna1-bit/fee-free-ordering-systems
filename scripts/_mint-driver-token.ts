/**
 * DEV-only: print a NextAuth driver-session token (cookie
 * next-auth.driver-session-token) for the demo driver — mirrors the kitchen/admin
 * mint scripts for browser verification. Rotates driverSessionToken so the minted
 * JWT is the single active session.
 *   npx tsx scripts/_mint-driver-token.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "crypto";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const d = await prisma.driver.findUnique({ where: { email: "driver@demo.com" }, select: { id: true, name: true, email: true } });
  if (!d) throw new Error("demo driver not found — run scripts/_create-demo-driver.ts first");
  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: d.id }, data: { driverSessionToken } });
  const token = await encode({
    token: { sub: d.id, driverId: d.id, driverName: d.name, email: d.email, driverSessionToken },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  console.log("COOKIE_NAME next-auth.driver-session-token");
  console.log("TOKEN " + token);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
