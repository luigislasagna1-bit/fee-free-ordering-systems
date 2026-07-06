import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const restaurants = await prisma.restaurant.findMany({
    where: { name: { contains: "Luigi", mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  for (const r of restaurants) {
    const tokens = await prisma.kitchenPushToken.findMany({
      where: { restaurantId: r.id },
      orderBy: { lastSeenAt: "desc" },
      select: { platform: true, createdAt: true, lastSeenAt: true, token: true },
    });
    console.log(`\n${r.name} (${r.slug})`);
    if (tokens.length === 0) console.log("  NO push tokens registered");
    for (const t of tokens) {
      console.log(
        `  platform=${t.platform} lastSeen=${t.lastSeenAt.toISOString()} created=${t.createdAt.toISOString()} token=${t.token.slice(0, 18)}…`,
      );
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
