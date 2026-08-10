/**
 * READ-ONLY: does info@luigislasagna.com have Nabil AI dashboard access?
 * Prints the user row, its restaurant, the phone_ordering add-on status,
 * VoiceAgentConfig / VoiceNumber / VoiceCall / VoiceFaq state.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-nabil-access-2026-08-10.ts
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

  const user = await prisma.user.findUnique({
    where: { email: "info@luigislasagna.com" },
    select: { id: true, email: true, role: true, restaurantId: true, isActive: true, emailVerifiedAt: true },
  });
  console.log("user:", JSON.stringify(user));
  if (!user?.restaurantId) { console.log("-> no restaurantId, stopping"); return; }

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, name: true, slug: true },
  });
  console.log("restaurant:", JSON.stringify(r));

  const addOns = await prisma.restaurantAddOn.findMany({
    where: { restaurantId: user.restaurantId },
    select: { status: true, stripeSubscriptionId: true, currentPeriodEnd: true, graceEndsAt: true, addOn: { select: { slug: true, name: true } } },
  });
  console.log("addOns:", JSON.stringify(addOns, null, 2));

  const cfg = await prisma.voiceAgentConfig.findUnique({ where: { restaurantId: user.restaurantId } });
  console.log("voiceAgentConfig:", cfg ? JSON.stringify({ enabled: cfg.enabled, primaryLanguage: cfg.primaryLanguage, canTakeOrders: cfg.canTakeOrders, openGreeting: cfg.openGreeting?.slice(0, 60) }) : "(none)");

  const num = await prisma.voiceNumber.findFirst({ where: { restaurantId: user.restaurantId } });
  console.log("voiceNumber:", num ? JSON.stringify({ phoneNumber: num.phoneNumber, status: num.status, enabled: num.enabled }) : "(none)");

  const [calls, faqs] = await Promise.all([
    prisma.voiceCall.count({ where: { restaurantId: user.restaurantId } }),
    prisma.voiceFaq.count({ where: { restaurantId: user.restaurantId } }),
  ]);
  console.log(`voiceCalls=${calls} voiceFaqs=${faqs}`);

  const recent = await prisma.voiceCall.findMany({
    where: { restaurantId: user.restaurantId },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { startedAt: true, fromNumber: true, outcome: true, durationSeconds: true, summary: true },
  });
  console.log("recentCalls:", JSON.stringify(recent, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
