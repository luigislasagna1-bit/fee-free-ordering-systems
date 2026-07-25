/**
 * READ-ONLY diagnostic: what `platform` did each KitchenPushToken register as, on
 * BOTH Neon branches? src/lib/push.ts sends iOS an ALERT push (rings even when the
 * app is force-quit) but sends anything else the Android DATA-ONLY payload, which
 * iOS delivers silently to a backgrounded app and NOT AT ALL to a swiped-away one.
 * If an iPhone registered as "android" (native-push.ts getPlatform() fallback),
 * that's the "ring didn't continue after force-quit" bug.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function urls(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function main() {
  for (const url of urls()) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const branch = url.includes("dawn-tree") ? "PROD (dawn-tree)" : url.includes("purple-brook") ? "dev (purple-brook)" : url.slice(0, 40);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const prisma = new PrismaClient({ adapter } as any);
    console.log(`\n=== ${branch} ===`);
    try {
      const rows = await prisma.kitchenPushToken.findMany({
        select: { platform: true, createdAt: true, lastSeenAt: true, token: true, restaurantId: true },
        orderBy: { lastSeenAt: "desc" },
        take: 40,
      });
      if (rows.length === 0) { console.log("(no KitchenPushToken rows)"); }
      const byPlatform: Record<string, number> = {};
      const slugs = new Map<string, string>();
      for (const id of [...new Set(rows.map((r) => r.restaurantId))]) {
        const r = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });
        slugs.set(id, r?.slug ?? id);
      }
      for (const r of rows) {
        byPlatform[String(r.platform)] = (byPlatform[String(r.platform)] ?? 0) + 1;
        const flag = r.platform === "ios" ? "" : "   <-- NOT ios (would get the SILENT android payload)";
        console.log(`${(slugs.get(r.restaurantId) ?? "?").padEnd(24)} platform=${String(r.platform).padEnd(9)} tok=${r.token.slice(0, 10)}… lastSeen=${r.lastSeenAt?.toISOString().slice(0, 16) ?? "-"}${flag}`);
      }
      console.log(`  → platform counts: ${JSON.stringify(byPlatform)}`);
    } catch (e: any) {
      console.error("FAIL", e?.message);
    } finally {
      await prisma.$disconnect();
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
