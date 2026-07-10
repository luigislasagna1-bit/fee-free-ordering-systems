/** LOCAL-ONLY verification: replicate the signup route's create against the
 *  dev DB with a fresh Prisma client, then read the row back. Proves the
 *  signedUpAt stamp + schema are correct even if the long-running dev server
 *  holds a stale client. Cleans up after itself. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) { console.log("SAFETY: refusing to run against prod"); process.exit(1); }
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) { console.log("demo restaurant not found in dev DB"); process.exit(1); }

  // Did the earlier HTTP 500 leave a partial row?
  const leftover = await prisma.customer.findFirst({
    where: { restaurantId: r.id, email: "phonetest-gate@example.com" },
    select: { id: true, phone: true, signedUpAt: true, passwordHash: true },
  });
  console.log("row from HTTP attempt:", leftover ? { ...leftover, passwordHash: !!leftover.passwordHash } : null);

  // Fresh-client create with signedUpAt — proves schema + generated client agree.
  const created = await prisma.customer.create({
    data: {
      restaurantId: r.id, email: "signup-stamp-check@example.com", name: "Stamp Check",
      phone: "6475550143", passwordHash: "x", signedUpAt: new Date(),
    },
    select: { id: true, signedUpAt: true },
  });
  console.log("fresh-client create OK, signedUpAt =", created.signedUpAt?.toISOString());
  await prisma.customer.delete({ where: { id: created.id } });
  console.log("cleaned up");
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERROR:", e?.message?.slice(0, 300)); process.exit(1); });
