/** DEV-ONLY: prove the smart-button fields survive the RESERVE-THEN-ORDER path
 *  (the 6-seam chain where a missed hop silently drops data — cms0gyexp #12
 *  bug class). Posts a real order with an attached `reservation` payload and
 *  reads the linked Reservation row back. cmsajnvkm.
 *
 *    npx tsx scripts/_verify-smart-buttons-preorder.ts
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readReservationDetails } from "../src/lib/reservation-details";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const SLUG = "demo-pizza-palace";
const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3001";

function tomorrow(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const r = await prisma.restaurant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!r) { console.error("seed demo-pizza-palace first"); process.exit(1); }
  const before = await prisma.reservationSettings.findUnique({ where: { restaurantId: r.id } });
  if (!before) { console.error("no settings row"); process.exit(1); }

  // Pre-order + all questions ON.
  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: {
      allowPreOrder: true, autoConfirm: true, minNoticeMinutes: 0, minGuests: 1, maxGuests: 20,
      splitAdultsChildren: true, childDefinitionMode: "height", childDefinitionValue: 130,
      askChildSeating: true, askAllergies: true, askOccasion: true, askAccessibility: true,
    },
  });
  await prisma.restaurant.update({ where: { id: r.id }, data: { acceptsReservations: true } });

  // Cheapest available item.
  const item = await prisma.menuItem.findFirst({
    where: { category: { menu: { restaurantId: r.id, isActive: true } }, isAvailable: true, price: { gt: 0 } },
    orderBy: { price: "asc" },
    select: { id: true, name: true, price: true },
  });
  if (!item) { console.error("no menu item"); process.exit(1); }

  const body = {
    restaurantSlug: SLUG,
    customerName: "PreOrder Test", customerEmail: "preorder-smart@example.com", customerPhone: "9055550199",
    type: "dine_in",
    paymentMethod: "cash",
    items: [{ menuItemId: item.id, quantity: 1, price: item.price, modifiers: [] }],
    subtotal: item.price, taxAmount: 0, deliveryFee: 0, tip: 0, total: item.price,
    reservation: {
      date: tomorrow(), time: "19:30",
      partySize: 77,                       // wrong on purpose — server must recompute
      notes: "Booth please",
      adults: 4, children: 3,
      details: {
        childSeating: { highChairs: 3, strollers: 2 },
        allergies: "Nut allergy",
        occasion: "friends",
        accessibility: "Wide aisle",
      },
    },
  };

  const res = await fetch(`${BASE}/api/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`POST /api/orders → HTTP ${res.status} ${res.ok ? `order ${data.orderNumber ?? data.id}` : JSON.stringify(data).slice(0, 300)}`);

  if (res.ok) {
    const booking = await prisma.reservation.findFirst({
      where: { orderId: data.id ?? data.orderId },
      select: { partySize: true, adultsCount: true, childrenCount: true, details: true, notes: true },
    });
    if (!booking) { console.log("   ✗ NO linked reservation row created"); }
    else {
      const det = readReservationDetails(booking.details);
      console.log(`   partySize: ${booking.partySize} (client sent 77; expected 7 = 4+3)`);
      console.log(`   adults/children: ${booking.adultsCount}/${booking.childrenCount}`);
      console.log(`   notes: ${booking.notes}`);
      console.log(`   details: ${JSON.stringify(det)}`);
      const ok = booking.partySize === 7 && booking.adultsCount === 4 && booking.childrenCount === 3
        && det?.allergies === "Nut allergy" && det?.occasion === "friends"
        && det?.accessibility === "Wide aisle" && det?.childSeating?.highChairs === 3;
      console.log(`   → ${ok ? "ALL 6 SEAMS OK — nothing dropped" : "MISSING DATA — a seam drops fields"}`);
    }
  }

  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: {
      allowPreOrder: before.allowPreOrder, autoConfirm: before.autoConfirm,
      minNoticeMinutes: before.minNoticeMinutes, minGuests: before.minGuests, maxGuests: before.maxGuests,
      splitAdultsChildren: before.splitAdultsChildren, childDefinitionMode: before.childDefinitionMode,
      childDefinitionValue: before.childDefinitionValue, askChildSeating: before.askChildSeating,
      askAllergies: before.askAllergies, askOccasion: before.askOccasion, askAccessibility: before.askAccessibility,
    },
  });
  console.log("Settings restored.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
