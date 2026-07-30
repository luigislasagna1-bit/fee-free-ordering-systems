/** DEV-ONLY: mint a next-auth session cookie for the local demo owner so the
 *  domain-switch flow can be browser-verified without typing a password.
 *  Prints the cookie name + value. Refuses to run against prod-looking URLs. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { encode } from "next-auth/jwt";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const u = await p.user.findFirst({
    where: { email: "owner@pizzapalace.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!u) throw new Error("demo owner not found on this DB");
  const token = await encode({
    token: {
      sub: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      restaurantId: u.restaurantId,
      restaurantSlug: u.restaurant?.slug ?? null,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: 60 * 60,
  });
  console.log(`COOKIE next-auth.session-token=${token}`);
}
main();
