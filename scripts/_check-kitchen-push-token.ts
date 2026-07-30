/**
 * READ-ONLY: what platform did each kitchen device register as?
 *
 * src/lib/push.ts branches on KitchenPushToken.platform: "ios" gets an ALERT
 * push (rings even when the app is force-quit); anything else gets the Android
 * DATA-ONLY payload, which iOS delivers silently to a backgrounded app and NOT
 * AT ALL to a swiped-away one. native-push.ts getPlatform() falls back to
 * "android" if Capacitor.getPlatform() is unavailable, so a mis-registered
 * iPhone shows up here as android — that's the bug this script diagnoses.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_check-kitchen-push-token.ts
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

  // KitchenPushToken has no `restaurant` relation — just restaurantId.
  const rows = await prisma.kitchenPushToken.findMany({
    select: { platform: true, createdAt: true, lastSeenAt: true, token: true, restaurantId: true },
    orderBy: { lastSeenAt: "desc" },
    take: 25,
  });

  if (rows.length === 0) {
    console.log("No KitchenPushToken rows at all — no device has registered for push.");
  }
  const names = new Map<string, string>();
  for (const id of [...new Set(rows.map((r) => r.restaurantId))]) {
    const r = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });
    names.set(id, r?.slug ?? id);
  }
  for (const r of rows) {
    const flag = r.platform === "ios" ? "" : "   <-- NOT ios: gets the SILENT android payload";
    console.log(
      `${(names.get(r.restaurantId) ?? "?").padEnd(28)} platform=${String(r.platform).padEnd(8)} ` +
      `token=${r.token.slice(0, 12)}… lastSeen=${r.lastSeenAt?.toISOString() ?? "-"}${flag}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
