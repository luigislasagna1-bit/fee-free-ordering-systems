/**
 * Dev-only: seed the demo restaurant with Smart Links (GrowthNet / Marketing
 * Studio) so the marketing screenshot shows real scan→order→revenue analytics
 * instead of "No smart links yet". Idempotent (upsert by code).
 * Run: npx tsx scripts/_seed-demo-smartlinks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  const u = await prisma.user.findFirst({ where: { email: "demo@feefreeordering.com" }, select: { restaurantId: true } });
  const restaurantId = u?.restaurantId;
  if (!restaurantId) throw new Error("demo restaurant not found");

  const links = [
    { code: "demo-ig", name: "Instagram bio link", channelHint: "instagram", utmSource: "instagram", scanCount: 412, orderCount: 86, revenueCents: 274300 },
    { code: "demo-flyer", name: "Downtown flyer QR", channelHint: "qr", utmSource: "flyer", scanCount: 238, orderCount: 41, revenueCents: 131900 },
    { code: "demo-google", name: "Google Business Profile", channelHint: "google", utmSource: "google", scanCount: 327, orderCount: 73, revenueCents: 229400 },
    { code: "demo-bag", name: "Takeout bag sticker", channelHint: "qr", utmSource: "bag", scanCount: 156, orderCount: 38, revenueCents: 118800 },
  ];
  for (const l of links) {
    const data = { ...l, restaurantId, targetPath: "/", utmMedium: "smartlink", isActive: true };
    await prisma.smartLink.upsert({ where: { code: l.code }, update: data, create: data });
  }
  console.log(`seeded ${links.length} smart links`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
