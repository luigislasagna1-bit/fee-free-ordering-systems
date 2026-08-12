/**
 * READ-ONLY. Two questions:
 *  1) Sharon's order ORD-710341102 — does a Stripe PaymentIntent exist, and is
 *     money sitting on her card right now?
 *  2) SCALE — how many card orders were created but NEVER released to the
 *     kitchen (notifiedAt null)? Those are orders the store never saw.
 *
 * Run: npx tsx scripts/run-on-prod.ts scripts/_audit-stranded-card-orders-2026-08-11.ts
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

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ── 2) SCALE first (pure DB) ──────────────────────────────────────────────
  const since = new Date(Date.now() - 60 * 24 * 3600_000);
  const stranded = await prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      paymentMethod: { in: ["card", "online_card"] },
      notifiedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, orderNumber: true, restaurantId: true, status: true, paymentStatus: true,
      paymentIntentId: true, createdAt: true, total: true, customerName: true,
      customerEmail: true, acceptedAt: true, completedAt: true,
      restaurant: { select: { name: true, slug: true, currency: true } },
    },
  });

  const byBucket = new Map<string, number>();
  let ghostMoney = 0;
  const ghosts: typeof stranded = [];
  for (const o of stranded) {
    const k = `${o.status}/${o.paymentStatus}`;
    byBucket.set(k, (byBucket.get(k) ?? 0) + 1);
    // "Ghost" = auto-completed (or still accepted) but never released and never paid.
    if ((o.status === "completed" || o.status === "accepted") && o.paymentStatus !== "paid") {
      ghosts.push(o);
      ghostMoney += o.total;
    }
  }

  console.log(`\n=== STRANDED CARD ORDERS (last 60d, notifiedAt IS NULL) : ${stranded.length} ===`);
  for (const [k, v] of [...byBucket.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   status/paymentStatus ${k.padEnd(28)} ${v}`);
  }
  console.log(`\n=== GHOSTS (accepted|completed, never released, never paid): ${ghosts.length}  total $${ghostMoney.toFixed(2)} ===`);
  for (const g of ghosts.slice(0, 60)) {
    console.log(
      `   ${g.orderNumber}  ${iso(g.createdAt)}  ${g.restaurant.name}  ${g.status}/${g.paymentStatus}  $${g.total}  ${g.customerName} <${g.customerEmail ?? "-"}>  completedAt=${iso(g.completedAt)}  intent=${g.paymentIntentId ?? "NONE"}`,
    );
  }
  if (ghosts.length > 60) console.log(`   … +${ghosts.length - 60} more`);

  // How many stranded orders even have an intent id stored? (Expect ~0 — the
  // create route never writes it back.)
  const withIntent = stranded.filter((o) => o.paymentIntentId).length;
  console.log(`\n   stranded orders WITH a stored paymentIntentId: ${withIntent} / ${stranded.length}`);

  // ── 1) Sharon's order against live Stripe ────────────────────────────────
  const target = await prisma.order.findFirst({
    where: { orderNumber: "ORD-710341102" },
    select: { id: true, restaurantId: true, total: true, createdAt: true },
  });
  if (!target) { console.log("\nORD-710341102 not found"); await prisma.$disconnect(); return; }

  const pp = await prisma.paymentProvider.findUnique({ where: { restaurantId: target.restaurantId } });
  if (!pp?.secretKeyEnc || !pp.secretKeyIv || !pp.secretKeyTag) {
    console.log("\nNo Stripe secret key on file for this restaurant — cannot query Stripe.");
    await prisma.$disconnect();
    return;
  }
  const secret = decrypt(pp.secretKeyEnc, pp.secretKeyIv, pp.secretKeyTag);
  const stripe = new Stripe(secret, { apiVersion: "2025-09-30.clover" as any });

  console.log(`\n=== STRIPE lookup for ORD-710341102 (orderId=${target.id}) — mode=${pp.mode} ===`);
  try {
    const found = await stripe.paymentIntents.search({
      query: `metadata['orderId']:'${target.id}'`,
      limit: 10,
    });
    if (found.data.length === 0) {
      console.log("   NO PaymentIntent exists with this orderId → the customer NEVER reached/completed the card form. No money was taken.");
    }
    for (const pi of found.data) {
      console.log(
        `   ${pi.id}  status=${pi.status}  amount=${pi.amount / 100} ${pi.currency}  captured=${pi.amount_received / 100}  created=${new Date(pi.created * 1000).toISOString()}  capture_method=${pi.capture_method}  last_error=${pi.last_payment_error?.message ?? "-"}`,
      );
    }
  } catch (e) {
    console.log("   search failed (falling back to list): " + (e instanceof Error ? e.message : String(e)));
  }

  // Belt-and-braces: list intents created in a window around the order.
  const from = Math.floor(target.createdAt.getTime() / 1000) - 900;
  const to = Math.floor(target.createdAt.getTime() / 1000) + 3600;
  const list = await stripe.paymentIntents.list({ created: { gte: from, lte: to }, limit: 50 });
  console.log(`\n   --- all intents on this account between ${new Date(from * 1000).toISOString()} and ${new Date(to * 1000).toISOString()} ---`);
  for (const pi of list.data) {
    console.log(
      `   ${pi.id}  status=${pi.status}  ${pi.amount / 100} ${pi.currency}  orderId=${pi.metadata?.orderId ?? "-"}  orderNumber=${pi.metadata?.orderNumber ?? "-"}  created=${new Date(pi.created * 1000).toISOString()}`,
    );
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
