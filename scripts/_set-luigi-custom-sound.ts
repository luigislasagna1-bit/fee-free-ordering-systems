/** Set (or --clear) a CUSTOM Kitchen Alert Sound on Luigi's prod restaurant, to reproduce
 *  Fabrizio's custom-ringtone scenario for the S23 test. The chosen sound is a SHORT chime,
 *  audibly distinct from the long built-in alarm, so any overlap would be obvious by ear.
 *    set:    npx tsx scripts/run-on-prod.ts scripts/_set-luigi-custom-sound.ts
 *    clear:  npx tsx scripts/run-on-prod.ts scripts/_set-luigi-custom-sound.ts --clear
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const CLEAR = process.argv.includes("--clear");
const SOUND_URL = "https://feefreeordering.com/sounds/gloriafood-new-order.mp3";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true, kitchenAlertSoundUrl: true } });
  if (!r) { console.log("luigis-lasagna-pizzeria not found"); await prisma.$disconnect(); return; }
  console.log(`${r.name} — before: kitchenAlertSoundUrl = ${r.kitchenAlertSoundUrl ?? "(none)"}`);
  await prisma.restaurant.update({ where: { id: r.id }, data: { kitchenAlertSoundUrl: CLEAR ? null : SOUND_URL } });
  console.log(`✓ ${CLEAR ? "CLEARED" : "SET"} → kitchenAlertSoundUrl = ${CLEAR ? "(none — built-in GloriaFood)" : SOUND_URL}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
