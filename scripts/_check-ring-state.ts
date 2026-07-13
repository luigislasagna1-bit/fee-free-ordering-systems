/**
 * READ-ONLY: what could be driving a kitchen "ghost ring" for a restaurant —
 * any order the kitchen ring logic treats as still-alerting (pending, or
 * recently notified/alerted and not yet terminal), plus pending reservations.
 *   npx tsx scripts/run-on-prod.ts scripts/_check-ring-state.ts <restaurantIdOrSlugOrEmail>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const q = process.argv[2];
  if (!q) throw new Error("pass restaurant id / slug / contact email");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({
    where: { OR: [{ id: q }, { slug: q }, { email: { equals: q, mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true, email: true },
  });
  if (!r) { console.log(`no restaurant matching "${q}"`); return; }
  console.log(`=== ${r.name} (${r.slug}) [${r.id}] email=${r.email} ===`);

  const now = Date.now();
  // Anything NOT terminal — the kitchen shows + can ring for these.
  const live = await prisma.order.findMany({
    where: { restaurantId: r.id, status: { in: ["pending", "accepted", "preparing", "ready"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      orderNumber: true, status: true, createdAt: true, type: true,
      notifiedAt: true, alertAt: true, acceptedAt: true, scheduledFor: true,
    },
  });
  console.log(`\nNON-TERMINAL orders (${live.length}) — these are what the kitchen list + ring see:`);
  for (const o of live) {
    const anchor = (o as any).alertAt ?? o.notifiedAt;
    const ageMin = anchor ? Math.round((now - new Date(anchor).getTime()) / 60000) : null;
    console.log(
      `  ${o.orderNumber.padEnd(16)} status=${o.status.padEnd(9)} type=${o.type} ` +
      `created=${o.createdAt.toISOString()} accepted=${o.acceptedAt?.toISOString() ?? "-"} ` +
      `alertAnchor=${anchor ? new Date(anchor).toISOString() : "-"} ageMin=${ageMin ?? "-"} sched=${o.scheduledFor ? new Date(o.scheduledFor).toISOString() : "-"}`
    );
  }
  const pendingCount = live.filter((o) => o.status === "pending").length;
  console.log(`\nPENDING (ring-worthy) count: ${pendingCount}`);

  // Pending reservations also ring.
  const resv = await prisma.reservation.findMany({
    where: { restaurantId: r.id, status: { in: ["pending", "requested"] } as any },
    orderBy: { createdAt: "desc" }, take: 10,
    select: { id: true, status: true, createdAt: true, partySize: true },
  }).catch(() => []);
  console.log(`Pending reservations: ${resv.length}`);
  for (const rv of resv) console.log(`  resv ${rv.id} status=${rv.status} created=${rv.createdAt.toISOString()} party=${rv.partySize}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
