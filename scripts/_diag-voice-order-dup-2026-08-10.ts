/**
 * READ-ONLY: diagnose Luigi's duplicate voice order / print storm report.
 * Prints today's voice-channel orders for luigis-lasagna-pizzeria with every
 * field the notification/print/dispatch paths read, plus VoiceCall rows and
 * any near-duplicate orders (same phone/items within 30 min).
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-voice-order-dup-2026-08-10.ts
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

  const r = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, name: true },
  });
  if (!r) { console.log("restaurant not found"); return; }

  const since = new Date(Date.now() - 48 * 3600 * 1000);

  const voiceOrders = await prisma.order.findMany({
    where: { restaurantId: r.id, channel: "voice", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, orderNumber: true, createdAt: true, updatedAt: true, status: true,
      type: true, total: true, paymentMethod: true, paymentStatus: true,
      customerName: true, customerPhone: true, customerEmail: true,
      acceptedAt: true, scheduledFor: true, cancelledBy: true, rejectionReason: true,
      items: { select: { id: true, name: true, quantity: true, subtotal: true } },
    },
  });
  console.log(`=== voice orders last 48h: ${voiceOrders.length} ===`);
  for (const o of voiceOrders) {
    console.log(JSON.stringify({
      orderNumber: o.orderNumber, id: o.id, createdAt: o.createdAt, status: o.status,
      type: o.type, total: o.total, pm: o.paymentMethod, ps: o.paymentStatus,
      name: o.customerName, phone: o.customerPhone, acceptedAt: o.acceptedAt,
      items: o.items.map(i => `${i.quantity}x ${i.name} $${i.subtotal}`),
    }));
  }

  // any same-phone orders (any channel) in the window — catch double submission
  const phones = [...new Set(voiceOrders.map(o => o.customerPhone).filter(Boolean))] as string[];
  if (phones.length) {
    const sameCaller = await prisma.order.findMany({
      where: { restaurantId: r.id, customerPhone: { in: phones }, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { orderNumber: true, channel: true, createdAt: true, status: true, total: true, customerPhone: true },
    });
    console.log(`=== all orders from those phones (any channel): ${sameCaller.length} ===`);
    for (const o of sameCaller) console.log(JSON.stringify(o));
  }

  const calls = await prisma.voiceCall.findMany({
    where: { restaurantId: r.id, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { callSid: true, fromNumber: true, outcome: true, durationSeconds: true, orderId: true, endedAt: true, transcript: true },
  });
  console.log(`=== voice calls last 48h: ${calls.length} ===`);
  for (const c of calls) {
    const t = Array.isArray(c.transcript) ? (c.transcript as any[]).length : 0;
    console.log(JSON.stringify({ callSid: c.callSid.slice(0, 12), from: c.fromNumber, outcome: c.outcome, dur: c.durationSeconds, orderId: c.orderId, turns: t }));
  }

  // print-related persistence, if any exists for this store
  const models = (prisma as any)._runtimeDataModel?.models ?? {};
  const printModels = Object.keys(models).filter(m => /print/i.test(m));
  console.log(`=== print-ish models in schema: ${printModels.join(", ") || "(none)"} ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
