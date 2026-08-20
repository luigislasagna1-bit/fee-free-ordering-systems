/**
 * READ-ONLY. Incident 2026-08-17: card orders reaching the kitchen as
 * "accepted" with no online payment captured.
 *
 * 1) Dump ORD-906017021 + every order today from the same customer.
 * 2) SCALE: every card/paypal order in the last 30d that is accepted/preparing/
 *    ready/completed while paymentStatus != paid.
 * 3) For each, ask Stripe whether a PaymentIntent actually exists.
 *
 * Run: npx tsx scripts/run-on-prod.ts scripts/_audit-unpaid-accepted-2026-08-17.ts
 * Prints NO key material.
 */
import { config } from "dotenv";
import Stripe from "stripe";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { decrypt } from "../src/lib/encrypt";

config({ path: ".env.local" });
config({ path: ".env" });

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "null");

const SELECT = {
  id: true,
  orderNumber: true,
  restaurantId: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  paymentIntentId: true,
  paypalOrderId: true,
  paypalCaptureId: true,
  createdAt: true,
  acceptedAt: true,
  notifiedAt: true,
  completedAt: true,
  total: true,
  creditApplied: true,
  channel: true,
  type: true,
  idempotencyKey: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  restaurant: { select: { name: true, slug: true, currency: true } },
} as const;

function line(o: any) {
  return `   ${o.orderNumber}  ${iso(o.createdAt)}  ${o.restaurant?.name ?? "-"}  ${o.status}/${o.paymentStatus}  method=${o.paymentMethod}  ch=${o.channel ?? "-"}  ${o.type}  $${o.total} (credit ${o.creditApplied})  ${o.customerName} <${o.customerEmail ?? "-"}> ${o.customerPhone ?? "-"}  accepted=${iso(o.acceptedAt)} notified=${iso(o.notifiedAt)}  intent=${o.paymentIntentId ?? "NONE"} paypal=${o.paypalCaptureId ?? "-"}`;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ── 1) The reported order + siblings ─────────────────────────────────────
  const target = await prisma.order.findFirst({
    where: { orderNumber: "ORD-906017021" },
    select: SELECT,
  });
  console.log(`\n=== ORD-906017021 ===`);
  console.log(target ? line(target) : "   NOT FOUND");

  if (target) {
    const siblings = await prisma.order.findMany({
      where: {
        restaurantId: target.restaurantId,
        OR: [
          { customerEmail: target.customerEmail ?? "___none___" },
          { customerPhone: target.customerPhone ?? "___none___" },
        ],
        createdAt: { gte: new Date(target.createdAt.getTime() - 7 * 24 * 3600_000) },
      },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    });
    console.log(`\n=== SAME CUSTOMER, last 7d: ${siblings.length} ===`);
    for (const s of siblings) console.log(line(s));

    // Payment rows for the target order
    const pays = await (prisma as any).payment?.findMany?.({
      where: { orderId: target.id },
    }).catch(() => null);
    if (pays) {
      console.log(`\n=== Payment rows for target: ${pays.length} ===`);
      for (const p of pays) console.log(`   ${JSON.stringify(p)}`);
    }
  }

  // ── 2) SCALE — released/progressed but not paid ──────────────────────────
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const bad = await prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      paymentMethod: { notIn: ["cash", "cash_on_delivery"] },
      status: { in: ["accepted", "preparing", "ready", "completed"] },
      paymentStatus: { notIn: ["paid", "refunded", "partially_refunded"] },
    },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  console.log(`\n=== UNPAID BUT PROGRESSED (30d, non-cash, status>=accepted, paymentStatus!=paid): ${bad.length} ===`);
  const byBucket = new Map<string, number>();
  let money = 0;
  for (const o of bad) {
    const k = `${o.paymentMethod}/${o.status}/${o.paymentStatus}/${o.channel ?? "-"}`;
    byBucket.set(k, (byBucket.get(k) ?? 0) + 1);
    money += o.total;
  }
  for (const [k, v] of [...byBucket.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(56)} ${v}`);
  }
  console.log(`   TOTAL AT RISK: $${money.toFixed(2)}`);
  for (const o of bad.slice(0, 80)) console.log(line(o));
  if (bad.length > 80) console.log(`   … +${bad.length - 80} more`);

  // ── 3) Stripe truth for the target restaurant, today ─────────────────────
  if (target) {
    const pp = await prisma.paymentProvider.findUnique({ where: { restaurantId: target.restaurantId } });
    if (!pp?.secretKeyEnc || !pp.secretKeyIv || !pp.secretKeyTag) {
      console.log(`\nNo Stripe secret key on file for ${target.restaurant?.name} — cannot query Stripe. (provider row exists: ${!!pp})`);
    } else {
      const secret = decrypt(pp.secretKeyEnc, pp.secretKeyIv, pp.secretKeyTag);
      const stripe = new Stripe(secret, { apiVersion: "2025-09-30.clover" as any });
      console.log(`\n=== STRIPE (mode=${pp.mode}) intents for orderId=${target.id} ===`);
      try {
        const found = await stripe.paymentIntents.search({
          query: `metadata['orderId']:'${target.id}'`,
          limit: 10,
        });
        if (found.data.length === 0) console.log("   NO PaymentIntent with this orderId → no money was ever taken.");
        for (const pi of found.data) {
          console.log(`   ${pi.id} status=${pi.status} amount=${pi.amount / 100} received=${pi.amount_received / 100} capture=${pi.capture_method} created=${new Date(pi.created * 1000).toISOString()} err=${pi.last_payment_error?.message ?? "-"}`);
        }
      } catch (e) {
        console.log("   search failed: " + (e instanceof Error ? e.message : String(e)));
      }

      const from = Math.floor(target.createdAt.getTime() / 1000) - 7200;
      const to = Math.floor(target.createdAt.getTime() / 1000) + 7200;
      const list = await stripe.paymentIntents.list({ created: { gte: from, lte: to }, limit: 50 });
      console.log(`\n   --- all intents ${new Date(from * 1000).toISOString()} .. ${new Date(to * 1000).toISOString()} ---`);
      for (const pi of list.data) {
        console.log(`   ${pi.id} status=${pi.status} ${pi.amount / 100} ${pi.currency} orderId=${pi.metadata?.orderId ?? "-"} orderNumber=${pi.metadata?.orderNumber ?? "-"} created=${new Date(pi.created * 1000).toISOString()}`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
