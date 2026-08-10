/**
 * DEV-ONLY seed so the Nabil dashboard can be clicked through locally.
 *
 * Grants the demo restaurant the phone_ordering add-on, creates a
 * VoiceAgentConfig + VoiceNumber, a couple of FAQs / text links / upsells, and
 * a handful of VoiceCalls with transcripts, summaries, sentiment and one linked
 * order — so every tab (Overview / Calls / detail / Menu / Settings) has real
 * content to render.
 *
 *   npx tsx scripts/_seed-nabil-dashboard-demo.ts [restaurantSlug]
 *
 * REFUSES to run against a production database.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = process.argv[2] || "demo-pizza-palace";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/ep-dawn-tree/i.test(url)) {
    console.error("REFUSING: that is the production branch. Run without run-on-prod.ts.");
    process.exit(1);
  }
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!r) {
    const all = await prisma.restaurant.findMany({ select: { slug: true }, take: 20 });
    console.error(`No restaurant "${SLUG}". Available: ${all.map((x) => x.slug).join(", ")}`);
    process.exit(1);
  }
  console.log("restaurant:", r.name, r.id);

  // 1. Entitlement — the add-on row grants phone_ordering_agent.
  const addOn = await prisma.addOn.findFirst({ where: { slug: "phone_ordering" }, select: { id: true } });
  if (!addOn) { console.error("addOn phone_ordering missing — run the add-on seed first."); process.exit(1); }
  await prisma.restaurantAddOn.upsert({
    where: { restaurantId_addOnId: { restaurantId: r.id, addOnId: addOn.id } },
    create: { restaurantId: r.id, addOnId: addOn.id, status: "active" },
    update: { status: "active" },
  });

  // 2. Config + number.
  await prisma.voiceAgentConfig.upsert({
    where: { restaurantId: r.id },
    create: { restaurantId: r.id, enabled: true, openGreeting: "Thanks for calling Pizza Palace, this is Nabil. Pickup or delivery?", recordCalls: true },
    update: { enabled: true },
  });
  await prisma.voiceNumber.upsert({
    where: { phoneNumber: "+15550001234" },
    create: { restaurantId: r.id, phoneNumber: "+15550001234", status: "active" },
    update: { restaurantId: r.id, status: "active" },
  });

  // 3. FAQs (incl. one AI-recommended awaiting approval) + text links + upsells.
  const faqs = [
    { question: "Do you have gluten-free crust?", answer: "Yes — gluten-free crust is available on any small pizza for $3 more.", category: "dietary", source: "owner" },
    { question: "Where do I park?", answer: "There is free parking behind the building, entrance on Mill Street.", category: "operational", source: "owner" },
    { question: "Do you take credit cards over the phone?", answer: "", category: "business_info", source: "recommended" },
  ];
  for (const [i, f] of faqs.entries()) {
    const existing = await prisma.voiceFaq.findFirst({ where: { restaurantId: r.id, question: f.question } });
    if (!existing) await prisma.voiceFaq.create({ data: { restaurantId: r.id, ...f, sortOrder: i, active: f.source === "owner" } });
  }
  for (const [i, k] of ["order_online", "menu"].entries()) {
    const existing = await prisma.voiceTextLink.findFirst({ where: { restaurantId: r.id, kind: k } });
    if (!existing) await prisma.voiceTextLink.create({ data: { restaurantId: r.id, kind: k, label: k === "menu" ? "Our menu" : "Order online", sortOrder: i } });
  }
  const items = await prisma.menuItem.findMany({ where: { restaurantId: r.id, isAvailable: true }, take: 2, select: { id: true, name: true } });
  for (const [i, it] of items.entries()) {
    await prisma.voiceUpsell.upsert({
      where: { restaurantId_menuItemId: { restaurantId: r.id, menuItemId: it.id } },
      create: { restaurantId: r.id, menuItemId: it.id, note: i === 0 ? "Great with any pizza" : null, sortOrder: i },
      update: {},
    });
  }
  console.log("upsells seeded from:", items.map((i) => i.name).join(", ") || "(no menu items)");

  // 4. Calls — one per outcome so every chip/filter has data.
  const someOrder = await prisma.order.findFirst({
    where: { restaurantId: r.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNumber: true },
  });
  const now = Date.now();
  const mk = (n: number) => new Date(now - n * 3600_000);
  const calls = [
    {
      callSid: "CAdemo0001", outcome: "order_placed", durationSeconds: 96, startedAt: mk(3), sentiment: "positive",
      orderId: someOrder?.id ?? null, orderNumber: someOrder?.orderNumber ?? null, upsellCents: 450,
      summary: "Returning caller ordered a large pepperoni for pickup and added garlic bread when Nabil suggested it. Friendly, no issues.",
      transcript: [
        { role: "assistant", text: "Thanks for calling Pizza Palace, this is Nabil. Pickup or delivery?", ts: mk(3).getTime() },
        { role: "user", text: "Pickup please. A large pepperoni.", ts: mk(3).getTime() + 6000 },
        { role: "assistant", text: "Got it. Our garlic bread goes great with that — want to add one for $4.50?", ts: mk(3).getTime() + 12000 },
        { role: "user", text: "Sure, add it.", ts: mk(3).getTime() + 18000 },
      ],
    },
    {
      callSid: "CAdemo0002", outcome: "reservation_booked", durationSeconds: 74, startedAt: mk(6), sentiment: "positive",
      reservationCode: null, summary: "Caller booked a table for four on Friday at 7pm.",
      transcript: [
        { role: "assistant", text: "Thanks for calling Pizza Palace.", ts: mk(6).getTime() },
        { role: "user", text: "Can I book a table for four Friday at seven?", ts: mk(6).getTime() + 5000 },
      ],
    },
    {
      callSid: "CAdemo0003", outcome: "faq_answered", durationSeconds: 41, startedAt: mk(9), sentiment: "neutral",
      summary: "Caller asked about gluten-free options and parking. Both answered from the FAQ; no order placed.",
      transcript: [
        { role: "user", text: "Do you do gluten free?", ts: mk(9).getTime() },
        { role: "assistant", text: "Yes — gluten-free crust is available on any small pizza for $3 more.", ts: mk(9).getTime() + 4000 },
      ],
    },
    {
      callSid: "CAdemo0004", outcome: "transferred", durationSeconds: 55, startedAt: mk(26), sentiment: "negative",
      transferReason: "Caller wanted to dispute a charge from last week", summary: "Caller was unhappy about a previous order and asked for a manager; Nabil transferred the call.",
      transcript: [
        { role: "user", text: "I need to speak to a manager about my order last week.", ts: mk(26).getTime() },
        { role: "assistant", text: "Of course — let me put you through to someone right now.", ts: mk(26).getTime() + 4000 },
      ],
    },
    { callSid: "CAdemo0005", outcome: "abandoned", durationSeconds: 6, startedAt: mk(30), transcript: [] },
    {
      callSid: "CAdemo0006", outcome: "error", durationSeconds: 88, startedAt: mk(50), sentiment: "negative",
      summary: "Nabil could not place the order — the kitchen had ordering paused. Caller hung up without an alternative.",
      transcript: [
        { role: "user", text: "Two mediums for delivery.", ts: mk(50).getTime() },
        { role: "assistant", text: "I'm sorry — the kitchen has ordering paused right now.", ts: mk(50).getTime() + 7000 },
      ],
    },
  ];
  for (const c of calls) {
    const { callSid, ...rest } = c as any;
    await prisma.voiceCall.upsert({
      where: { callSid },
      create: {
        callSid, restaurantId: r.id, fromNumber: "+15551239876", toNumber: "+15550001234",
        language: "en", model: "claude-sonnet-5", tokensIn: 4200, tokensOut: 800, costCents: 2,
        endedAt: new Date((rest.startedAt as Date).getTime() + (rest.durationSeconds ?? 0) * 1000),
        ...rest,
      },
      update: { ...rest },
    });
  }
  console.log(`seeded ${calls.length} calls; order linked: ${someOrder?.orderNumber ?? "(none found)"}`);
  console.log("\nOpen http://localhost:3001/admin/phone-ordering (sign in as the demo owner).");
}

main().catch((e) => { console.error(e); process.exit(1); });
