/** DEV-ONLY: find (or create) a throwaway per-restaurant Customer at the given
 *  slug on the local dev DB and print a signed ff_rest_account session token,
 *  so /order/[slug]/account can be verified in the browser without the login
 *  form. Usage: npx tsx scripts/_mint-dev-rest-customer-session.ts [slug]
 *  (slug defaults to demo-pizza-palace). Sibling of _mint-dev-customer-session
 *  (which mints the MARKETPLACE ff_customer token instead). */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import jwt from "jsonwebtoken";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/prod/i.test(url)) throw new Error("refusing: DATABASE_URL looks like prod");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const slug = process.argv[2] || "demo-pizza-palace";
  const restaurant = await p.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) throw new Error(`no restaurant with slug "${slug}" on this DB — seed it first`);
  const email = "dev-addressbook-check@example.com";
  let customer = await p.customer.findFirst({ where: { restaurantId: restaurant.id, email } });
  if (!customer) {
    customer = await p.customer.create({
      data: { restaurantId: restaurant.id, name: "Dev AddressBook Check", email, passwordHash: "!disabled-no-login" },
    });
    console.log("created throwaway per-restaurant customer");
  }
  const token = jwt.sign(
    { customerId: customer.id, restaurantId: restaurant.id },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: 60 * 60 },
  );
  console.log(`RESTAURANT=${restaurant.name}`);
  console.log(`TOKEN=${token}`);
}
main();
