/**
 * Dev-only: seed the demo restaurant with Promotions + a CRM of Customers so the
 * marketing screenshots (Promotions engine + Customer database) show rich, real
 * data. Idempotent (wipes prior seed rows tagged with the __demo_seed__ marker).
 * Run: npx tsx scripts/_seed-demo-marketing.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const MARKER = "__demo_seed__";

function pct(discountPercent: number) {
  return { rules: JSON.stringify({ discountPercent, groups: [] }), ruleConfig: { groups: [], discountPercent } };
}

async function main() {
  const u = await prisma.user.findFirst({ where: { email: "demo@feefreeordering.com" }, select: { restaurantId: true } });
  const restaurantId = u?.restaurantId;
  if (!restaurantId) throw new Error("demo restaurant not found");
  const cats = await prisma.menuCategory.findMany({ where: { restaurantId }, select: { id: true }, take: 2 });

  // ── wipe prior seed rows (marker now lives in campaignRef, not the visible description) ──
  await prisma.promotion.deleteMany({ where: { restaurantId, OR: [{ description: MARKER }, { campaignRef: MARKER }] } });
  await prisma.customer.deleteMany({ where: { restaurantId, notes: MARKER } });

  // ── Promotions ──
  const base = { restaurantId, campaignRef: MARKER, isActive: true, showOnBanner: true, displayMode: "menu_visible" as const };
  const promos: any[] = [
    { ...base, name: "First order — 15% off", description: "15% off for first-time customers — welcome them in.", promotionType: "percentage_off", customerType: "new", bannerHeadline: "15% off your first order 🎉", usedCount: 64, ...pct(15) },
    { ...base, name: "Lunch special — 10% off", description: "10% off every order placed between 11am and 3pm.", promotionType: "percentage_off", usableHourStart: 660, usableHourEnd: 900, bannerHeadline: "Lunch 11–3 · 10% off", usedCount: 138, ...pct(10) },
    { ...base, name: "Spend $40, save 20%", description: "Spend $40 or more and save 20% on the order.", promotionType: "percentage_off", minimumOrder: 40, bannerHeadline: "Spend $40 → 20% off", usedCount: 47, ...pct(20) },
    { ...base, name: "Weekend pizza — 20% off", description: "20% off every Friday, Saturday and Sunday.", promotionType: "percentage_off", daysOfWeek: JSON.stringify(["friday", "saturday", "sunday"]), bannerHeadline: "Weekend pizza deal", usedCount: 91, ...pct(20) },
    { ...base, name: "WELCOME10 coupon", description: "10% off when customers enter code WELCOME10 at checkout.", promotionType: "percentage_off", couponCode: "WELCOME10", autoApply: false, showOnBanner: false, bannerHeadline: null, usedCount: 212, ...pct(10) },
    { ...base, name: "Pickup perk — 12% off", description: "12% off every pickup order — no delivery fee, faster service.", promotionType: "percentage_off", orderType: "pickup", bannerHeadline: "Skip the line · 12% off pickup", usedCount: 73, ...pct(12) },
  ];
  if (cats.length >= 1) {
    const ids = cats.map((c) => c.id);
    const groups = [
      { id: "g1_seed", label: "", categoryIds: ids, itemIds: [], role: "paid" },
      { id: "g2_seed", label: "", categoryIds: ids, itemIds: [], role: "free" },
    ];
    const rc = { groups, discountStrategy: "cheapest", cheapestDiscount: 100 };
    promos.push({ ...base, name: "Buy one get one free", description: "Buy one pizza or pasta, get one free.", promotionType: "bogo", bannerHeadline: "BOGO — buy 1 get 1 free", usedCount: 58, rules: JSON.stringify(rc), ruleConfig: rc });
  }
  for (const p of promos) await prisma.promotion.create({ data: p });

  // ── Customers (CRM) ──
  const first = ["Sofia", "James", "Aisha", "Marco", "Liam", "Emma", "Noah", "Olivia", "Ethan", "Mia", "Lucas", "Ava", "Daniel", "Chloe", "Mateo", "Zoe", "Omar", "Layla", "Hassan", "Nina", "Diego", "Priya", "Tariq", "Hana", "Leo", "Ruby", "Sam", "Yara", "Felix", "Isla", "Karim", "Maya", "Theo", "Anya", "Ravi", "Lena", "Bruno", "Tara", "Niko", "Elsa"];
  const last = ["Marchetti", "Thompson", "Khan", "Pereira", "O'Brien", "Rossi", "Bauer", "Silva", "Walsh", "Lombardi", "Dubois", "Costa", "Fischer", "Nguyen", "Garcia", "Adler", "Haddad", "Romano", "Yilmaz", "Novak", "Mendez", "Sharma", "Aziz", "Sato", "Bianchi", "Reyes", "Park", "Hassan", "Weber", "Murphy"];
  const customers: any[] = [];
  for (let i = 0; i < 42; i++) {
    const name = `${first[i % first.length]} ${last[(i * 3 + 1) % last.length]}`;
    // segment spread: ~36% new, ~46% regular, ~18% VIP
    const seg = i % 11 < 4 ? "new" : i % 11 < 9 ? "regular" : "vip";
    const orders = seg === "new" ? 1 + (i % 2) : seg === "regular" ? 3 + (i % 7) : 12 + (i % 30);
    const avg = 24 + ((i * 7) % 22);
    const totalSpent = +(orders * avg).toFixed(2);
    const daysAgo = seg === "vip" ? 1 + (i % 6) : seg === "regular" ? 2 + (i % 20) : 1 + (i % 40);
    customers.push({
      restaurantId, notes: MARKER, name,
      email: `${first[i % first.length].toLowerCase()}.${last[(i * 3 + 1) % last.length].toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
      phone: `+1 416 555 ${String(1000 + i).slice(-4)}`,
      totalOrders: orders, totalSpent, lastOrderAt: new Date(Date.now() - daysAgo * 86400000),
      marketingConsent: i % 5 !== 0, marketingConsentAt: i % 5 !== 0 ? new Date(Date.now() - daysAgo * 86400000) : null,
      createdAt: new Date(Date.now() - (daysAgo + 30 + (i % 90)) * 86400000),
    });
  }
  for (const c of customers) await prisma.customer.create({ data: c });

  console.log(`seeded ${promos.length} promotions + ${customers.length} customers`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
