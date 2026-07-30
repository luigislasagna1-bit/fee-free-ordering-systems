/** Dev E2E fixtures for the cms0gyexp batch:
 *  arg "it"    → flip demo-pizza-palace defaultLanguage to Italian (for the
 *                account-fallback + staff-email checks)
 *  arg "en"    → flip it back
 *  arg "resv"  → create a CONFIRMED walk-up reservation with a future alertAt
 *                (the kitchen OPENS-IN chip must NOT show) + a PENDING one
 *                with future alertAt (chip MUST show)
 *  arg "check" → print demo restaurant language + latest reservation/order
 *                customerLocale values
 *   npx tsx --env-file=.env --env-file=.env.local scripts/_e2e-cms0gyexp-setup.ts <arg>
 */
import prisma from "../src/lib/db";

async function main() {
  const mode = process.argv[2] || "check";
  const r = await prisma.restaurant.findUnique({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, defaultLanguage: true },
  });
  if (!r) throw new Error("demo-pizza-palace not found");

  if (mode === "it" || mode === "en") {
    await prisma.restaurant.update({ where: { id: r.id }, data: { defaultLanguage: mode } });
    console.log(`defaultLanguage → ${mode}`);
    return;
  }
  if (mode === "resv") {
    const alertAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const d = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    for (const [status, code] of [["confirmed", "CHIPOFF"], ["pending", "CHIPON"]] as const) {
      await prisma.reservation.create({
        data: {
          restaurantId: r.id, confirmationCode: `${code}${Date.now().toString().slice(-4)}`,
          customerName: `[TEST] ${status} parked`, customerEmail: null, customerPhone: "+15550103000",
          partySize: 2, date: d, time: "20:00", status, alertAt,
        },
      });
      console.log(`created ${status} reservation with future alertAt`);
    }
    return;
  }
  // check
  console.log("defaultLanguage:", r.defaultLanguage);
  const lastResv = await prisma.reservation.findFirst({
    where: { restaurantId: r.id }, orderBy: { createdAt: "desc" },
    select: { customerName: true, status: true, customerLocale: true },
  });
  console.log("latest reservation:", JSON.stringify(lastResv));
  const lastOrder = await prisma.order.findFirst({
    where: { restaurantId: r.id }, orderBy: { createdAt: "desc" },
    select: { orderNumber: true, customerLocale: true },
  });
  console.log("latest order:", JSON.stringify(lastOrder));
}
main().finally(() => prisma.$disconnect());
