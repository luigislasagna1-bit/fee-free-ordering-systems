/**
 * READ-ONLY platform sweep: which OTHER restaurants were hit by the
 * auto-accept dispatch hole (fixed cf88e72e 2026-08-10)?
 * A victim = ShipDay-dispatching (or FeeFree-enabled) restaurant with
 * autoAcceptOrders=true that has delivery orders since 2026-07-06 (when
 * capture-on-authorize made auto-accept viable) that never dispatched.
 *   npx tsx scripts/run-on-prod.ts scripts/_sweep-autoaccept-dispatch-victims-2026-08-10.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SINCE = new Date("2026-07-06T00:00:00Z");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const shipdayConfigs = await prisma.shipdayConfig.findMany({
    where: { enabled: true },
    select: { restaurantId: true, deliverySource: true, activeDispatchMode: true, apiKeyEnc: true },
  });
  const feefreeConfigs = await prisma.feeFreeDeliveryConfig.findMany({
    where: { enabled: true },
    select: { restaurantId: true },
  });
  const ids = [...new Set([...shipdayConfigs.map((c) => c.restaurantId), ...feefreeConfigs.map((c) => c.restaurantId)])];
  console.log(`ShipDay-enabled configs: ${shipdayConfigs.length}; FeeFree-enabled: ${feefreeConfigs.length}; distinct restaurants: ${ids.length}`);

  for (const rid of ids) {
    const r = await prisma.restaurant.findUnique({
      where: { id: rid },
      select: { name: true, slug: true, autoAcceptOrders: true },
    });
    if (!r) continue;
    const sd = shipdayConfigs.find((c) => c.restaurantId === rid);
    const dispatches = sd
      ? sd.deliverySource === "shipday" || (sd.deliverySource === "both" && sd.activeDispatchMode === "shipday")
      : false;
    const ff = feefreeConfigs.some((c) => c.restaurantId === rid);
    const [total, missed] = await Promise.all([
      prisma.order.count({ where: { restaurantId: rid, type: "delivery", createdAt: { gte: SINCE } } }),
      prisma.order.count({
        where: {
          restaurantId: rid, type: "delivery", createdAt: { gte: SINCE },
          shipdayOrderId: null, deliveryAssignment: { is: null },
          status: { in: ["accepted", "preparing", "ready", "completed"] },
          paymentStatus: "paid",
        },
      }),
    ]);
    const flag = r.autoAcceptOrders && (dispatches || ff) && missed > 0 ? "  <-- VICTIM?" : "";
    console.log(
      `${r.name} (${r.slug}) autoAccept=${r.autoAcceptOrders} shipdayDispatch=${dispatches ?? false} feefree=${ff} ` +
      `deliveryOrdersSince0706=${total} paidLiveNeverDispatched=${missed}${flag}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
