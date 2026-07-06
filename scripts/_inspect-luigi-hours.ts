/** Read-only: dump OpeningHours rows + tz for Luigi's prod restaurant.
 *   npx tsx scripts/run-on-prod.ts scripts/_inspect-luigi-hours.ts */
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

  const r = await prisma.restaurant.findUnique({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: {
      id: true, name: true, timezone: true, hoursFormat: true,
      openingHours: { orderBy: [{ service: "asc" }, { dayOfWeek: "asc" }] },
    },
  });
  if (!r) { console.log("restaurant not found"); return; }
  console.log("tz:", r.timezone, "| fmt:", r.hoursFormat, "| rows:", r.openingHours.length);
  for (const h of r.openingHours) {
    console.log(
      `svc=${(h as any).service ?? "GENERAL"} dow=${h.dayOfWeek} open=${h.openTime} close=${h.closeTime} isOpen=${h.isOpen}` +
      ` intervals=${JSON.stringify((h as any).intervals ?? null)} id=${h.id}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
