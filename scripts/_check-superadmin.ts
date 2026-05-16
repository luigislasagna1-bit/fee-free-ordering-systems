import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const u = await (prisma as any).user.findUnique({ where: { email: "admin@feefreeordering.com" } });
  console.log("Superadmin in DB:", u ? { email: u.email, role: u.role, isActive: u.isActive } : "MISSING");
  if (u) console.log("Password 'admin123' matches:", bcrypt.compareSync("admin123", u.passwordHash));
  await prisma.$disconnect();
}
main();
