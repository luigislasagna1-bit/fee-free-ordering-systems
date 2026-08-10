/**
 * READ-ONLY: dump the transcript of the double-order call CA20b5873393… plus
 * the two orders' full money fields, to see why place_order ran twice.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-voice-transcript-2026-08-10.ts
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

  const call = await prisma.voiceCall.findFirst({
    where: { callSid: { startsWith: "CA20b5873393" } },
  });
  if (!call) { console.log("call not found"); return; }
  console.log(`call ${call.callSid} outcome=${call.outcome} dur=${call.durationSeconds}s orderId=${call.orderId}`);
  const t = (call.transcript as any[]) ?? [];
  for (const turn of t) {
    const text = String(turn.text ?? "").replace(/\s+/g, " ").slice(0, 300);
    console.log(`[${turn.role}] ${text}`);
  }

  for (const num of ["ORD-233787293", "ORD-235548666"]) {
    const o = await prisma.order.findFirst({
      where: { orderNumber: num },
      select: {
        orderNumber: true, createdAt: true, total: true, subtotal: true, taxAmount: true,
        deliveryFee: true, tip: true, creditApplied: true, idempotencyKey: true,
        status: true, scheduledFor: true,
      },
    });
    console.log(JSON.stringify(o));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
