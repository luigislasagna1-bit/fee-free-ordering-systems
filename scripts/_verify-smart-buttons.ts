/** DEV-ONLY end-to-end check for the reservation "smart buttons" (cmsajnvkm):
 *  turns the questions ON for the demo store, POSTs a booking through the REAL
 *  public route with every section filled, then reads the row back and prints
 *  what each surface would show. Also proves the server drops sections whose
 *  toggle is OFF. Leaves the settings as it found them.
 *
 *    npx tsx scripts/_verify-smart-buttons.ts
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readReservationDetails, formatDetailRows } from "../src/lib/reservation-details";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const SLUG = "demo-pizza-palace";
const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3001";

function tomorrow(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function book(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/public/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const r = await prisma.restaurant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true, acceptsReservations: true } });
  if (!r) { console.error(`No restaurant "${SLUG}" — run npm run seed first.`); process.exit(1); }
  const before = await prisma.reservationSettings.findUnique({ where: { restaurantId: r.id } });
  if (!before) { console.error("No reservation settings row."); process.exit(1); }

  console.log(`Store: ${r.name} (acceptsReservations=${r.acceptsReservations})`);
  const restoreRestaurant = r.acceptsReservations;
  if (!r.acceptsReservations) await prisma.restaurant.update({ where: { id: r.id }, data: { acceptsReservations: true } });

  // ── ALL questions ON ──────────────────────────────────────────────────
  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: {
      splitAdultsChildren: true, childDefinitionMode: "age", childDefinitionValue: 8,
      askChildSeating: true, askAllergies: true, askOccasion: true, askAccessibility: true,
      minGuests: 1, maxGuests: 20, minNoticeMinutes: 0,
    },
  });

  const payload = {
    restaurantSlug: SLUG,
    customerName: "Smart Buttons", customerEmail: "smart-buttons@example.com", customerPhone: "9055550100",
    partySize: 99, // deliberately WRONG — the server must recompute from the split
    adults: 3, children: 2,
    date: tomorrow(), time: "19:00",
    notes: "Window table if possible",
    details: {
      childSeating: { highChairs: 2, strollers: 1 },
      allergies: "Shellfish and peanuts",
      occasion: "anniversary",
      accessibility: "Step-free seating please",
      bogusKey: "should be dropped",
    },
  };
  const a = await book(payload);
  console.log(`\nA) all questions ON  → HTTP ${a.status} ${a.ok ? "OK" : JSON.stringify(a.data)}`);
  if (a.ok) {
    const row = await prisma.reservation.findFirst({ where: { confirmationCode: a.data.confirmationCode } });
    const det = readReservationDetails(row?.details);
    console.log(`   partySize stored: ${row?.partySize}  (client sent 99; expected 5 = 3+2)`);
    console.log(`   adults/children:  ${row?.adultsCount}/${row?.childrenCount}`);
    const t = (k: string, v?: Record<string, string | number>) => {
      const leaf = k.split(".").pop()!;
      return v ? `${leaf}(${JSON.stringify(v)})` : leaf;
    };
    for (const line of formatDetailRows(det, t as any, "kitchen")) {
      console.log(`   • ${line.label}: ${line.value}`);
    }
    console.log(`   bogus key dropped: ${det && !("bogusKey" in (det as object)) ? "yes" : "NO — leak!"}`);
  }

  // ── Questions OFF: the same payload must store nothing extra ───────────
  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: { splitAdultsChildren: false, askChildSeating: false, askAllergies: false, askOccasion: false, askAccessibility: false },
  });
  const b = await book({ ...payload, partySize: 4, customerEmail: "smart-buttons-off@example.com" });
  console.log(`\nB) all questions OFF → HTTP ${b.status} ${b.ok ? "OK" : JSON.stringify(b.data)}`);
  if (b.ok) {
    const row = await prisma.reservation.findFirst({ where: { confirmationCode: b.data.confirmationCode } });
    console.log(`   partySize stored: ${row?.partySize} (classic path, expected 4)`);
    console.log(`   adultsCount: ${row?.adultsCount ?? "null"}  childrenCount: ${row?.childrenCount ?? "null"}  details: ${row?.details ? JSON.stringify(row.details) : "null"}`);
    console.log(`   → ${row?.adultsCount == null && row?.details == null ? "correctly ignored (server-side filter works)" : "LEAK — toggles not enforced!"}`);
  }

  // ── restore ───────────────────────────────────────────────────────────
  await prisma.reservationSettings.update({
    where: { restaurantId: r.id },
    data: {
      splitAdultsChildren: before.splitAdultsChildren, childDefinitionMode: before.childDefinitionMode,
      childDefinitionValue: before.childDefinitionValue, askChildSeating: before.askChildSeating,
      askAllergies: before.askAllergies, askOccasion: before.askOccasion, askAccessibility: before.askAccessibility,
      minGuests: before.minGuests, maxGuests: before.maxGuests, minNoticeMinutes: before.minNoticeMinutes,
    },
  });
  if (!restoreRestaurant) await prisma.restaurant.update({ where: { id: r.id }, data: { acceptsReservations: false } });
  console.log("\nSettings restored.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
