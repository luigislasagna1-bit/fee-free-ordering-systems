/** Read-only: Fabrizio's restaurant(s) currency + Stripe connect currency, to
 *  confirm whether the €/$ display is already correct on prod. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const rows = await p.restaurant.findMany({
    where: { OR: [
      { slug: { contains: "ristorante", mode: "insensitive" } },
      { name: { contains: "japanese", mode: "insensitive" } },
      { name: { contains: "kaori", mode: "insensitive" } },
    ] },
    select: { id: true, slug: true, name: true, currency: true, stripeAccountId: true, updatedAt: true },
  });
  for (const r of rows) {
    console.log(`${r.name}  (slug=${r.slug})`);
    console.log(`   currency = ${JSON.stringify(r.currency)}   stripeAccountId = ${r.stripeAccountId ?? "—"}`);
    console.log(`   updated  = ${r.updatedAt.toISOString().slice(0,16)}\n`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
