/** DEV-only: print a NextAuth session token for the demo admin (preview verification). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const u = await prisma.user.findUnique({
    where: { email: "owner@pizzapalace.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!u) throw new Error("demo admin not found");
  const token = await encode({
    token: {
      sub: u.id, name: u.name ?? u.email, email: u.email, role: u.role,
      restaurantId: u.restaurantId ?? undefined, restaurantSlug: u.restaurant?.slug ?? undefined,
    },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  console.log("TOKEN " + token);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
