/** Dev helper: flip the reservation "smart buttons" ON/OFF for the demo store
 *  so the customer form can be eyeballed in a browser (cmsajnvkm).
 *    npx tsx scripts/_toggle-smart-buttons.ts on|off
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const on = (process.argv[2] ?? "on") !== "off";

async function main() {
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) { console.error("demo-pizza-palace not found"); process.exit(1); }
  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: on
      ? { splitAdultsChildren: true, childDefinitionMode: "age", childDefinitionValue: 8,
          askChildSeating: true, askAllergies: true, askOccasion: true, askAccessibility: true, minNoticeMinutes: 0 }
      : { splitAdultsChildren: false, childDefinitionMode: "none", childDefinitionValue: null,
          askChildSeating: false, askAllergies: false, askOccasion: false, askAccessibility: false },
  });
  console.log(`booking questions ${on ? "ENABLED" : "disabled"} for demo-pizza-palace`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
