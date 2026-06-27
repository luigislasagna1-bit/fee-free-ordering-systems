/** READ-ONLY: does Luigi's prod restaurant have a custom Kitchen Alert Sound set?
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-luigi-sound.ts
 */
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
  const prisma = new PrismaClient({ adapter } as any);
  const rs = await prisma.restaurant.findMany({
    where: { slug: { in: ["luigis-lasagna-pizzeria", "luigis-lasagna", "luigispizzapastawings"] } },
    select: { id: true, name: true, slug: true, kitchenAlertSoundUrl: true },
  });
  for (const r of rs) {
    console.log(`${r.name} (${r.slug})`);
    console.log(`  kitchenAlertSoundUrl: ${r.kitchenAlertSoundUrl ? r.kitchenAlertSoundUrl : "(none — uses built-in GloriaFood)"}`);
  }
  if (rs.length === 0) console.log("No matching restaurant.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
