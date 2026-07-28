/** READ-ONLY: Android versions of all kitchen devices (prod) — who can receive
 *  the minSdk-26 vc23 Play update vs who stays on their installed build. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function prodUrl(): string | null {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && m[1].includes("dawn-tree")) return m[1];
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl()! }) } as any);
  try {
    const devices = await prisma.kitchenDevice.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 30,
      select: { userAgent: true, label: true, lastSeenAt: true, restaurant: { select: { slug: true } } },
    });
    for (const d of devices) {
      const ua = d.userAgent ?? "";
      const android = ua.match(/Android ([\d.]+)/)?.[1];
      const verdict = android
        ? parseFloat(android) >= 8
          ? `Android ${android} → CAN take vc23`
          : `Android ${android} → STAYS on installed build (minSdk 26 gate)`
        : ua.match(/iPhone|iPad|Mac/) ? "iOS/Mac (browser)" : "unknown";
      console.log(`${d.restaurant.slug.padEnd(26)} ${String(d.label ?? "-").padEnd(16)} lastSeen=${d.lastSeenAt.toISOString().slice(0, 10)}  ${verdict}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
