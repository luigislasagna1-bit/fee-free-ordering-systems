/** Read-only: notification recipients + language for Fabrizio's restaurants,
 *  to diagnose why his staff "new reservation" email rendered in English
 *  (report cms0gyexp #1). Prints emailLanguage + defaultLanguage per store. */
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

  const owners = await p.user.findMany({
    where: { email: { in: ["fabrx900@hotmail.it", "fabrx900@gmail.com"], mode: "insensitive" } },
    select: { email: true, restaurantId: true },
  });
  const restaurants = await p.restaurant.findMany({
    where: {
      OR: [
        { id: { in: owners.map((o) => o.restaurantId).filter((x): x is string => !!x) } },
        { name: { contains: "Japanese", mode: "insensitive" } },
        { slug: { contains: "ristorante-test" } },
      ],
    },
    select: {
      id: true, name: true, slug: true, defaultLanguage: true,
      notificationRecipients: { select: { email: true, name: true, isActive: true, emailLanguage: true, tableReservationConfirmed: true } },
    },
  });
  for (const r of restaurants) {
    console.log(`\n${r.name} (${r.slug}) defaultLanguage=${r.defaultLanguage}`);
    for (const n of r.notificationRecipients) {
      console.log(`  recipient ${n.email} active=${n.isActive} emailLanguage=${n.emailLanguage} resvToggle=${n.tableReservationConfirmed}`);
    }
    if (!r.notificationRecipients.length) console.log("  (no recipients)");
  }
}
main();
