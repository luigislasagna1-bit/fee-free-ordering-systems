/** DEV-ONLY data-level equivalence check for the Phase 6 ops-lib extraction. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (/dawn-tree/.test(url)) throw new Error("PROD url — aborting");
  // Dynamic import AFTER dotenv so the app's db singleton (module-load) sees env.
  const { getFeeFreeDeliveryOpsData } = await import("../src/lib/feefree-delivery-ops");
  const prismaMod = await import("../src/lib/db");
  const prisma: any = prismaMod.default;

  const rest = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, name: true, currency: true, lat: true, lng: true } });
  if (!rest) throw new Error("demo-pizza-palace not found");
  console.log(`restaurant ${rest.id} (${rest.name}) currency=${rest.currency} lat=${rest.lat} lng=${rest.lng}`);

  const data = await getFeeFreeDeliveryOpsData(rest.id);

  console.log("\n--- rendered numbers (as the JSX would show) ---");
  console.log(`amountOwed  usd(owed)          = ${usd(data.owed)}   (raw cents=${data.owed})`);
  console.log(`deliveriesThisWeek             = ${data.deliveredThisWeek}`);
  console.log(`nextCharge  charge.toLocaleDate= ${data.charge.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}   (ISO=${data.charge.toISOString()})`);
  console.log(`held.length                    = ${data.held.length}`);
  console.log(`active.length                  = ${data.active.length}`);
  console.log(`rest                           = ${JSON.stringify(data.rest)}`);

  const problems: string[] = [];
  if (typeof data.owed !== "number") problems.push("owed not number");
  if (typeof data.deliveredThisWeek !== "number") problems.push("deliveredThisWeek not number");
  if (!(data.charge instanceof Date) || isNaN(+data.charge)) problems.push("charge not valid Date");
  if (!Array.isArray(data.held)) problems.push("held not array");
  if (!Array.isArray(data.active)) problems.push("active not array");
  if (!("rest" in data)) problems.push("rest missing");
  for (const o of data.held) for (const k of ["id", "orderNumber", "customerName"]) if (!(k in o)) problems.push(`held.${k} missing`);
  for (const a of data.active) {
    for (const k of ["id", "status", "driver", "order"]) if (!(k in a)) problems.push(`active.${k} missing`);
    if (a.order) for (const k of ["orderNumber", "customerName", "deliveryLat", "deliveryLng"]) if (!(k in a.order)) problems.push(`active.order.${k} missing`);
    if (a.driver) for (const k of ["name", "ratingPct"]) if (!(k in a.driver)) problems.push(`active.driver.${k} missing`);
  }

  if (data.active[0]) { const a = data.active[0]; console.log(`\nfirst active row: #${a.order.orderNumber} · ${a.order.customerName} · driver=${a.driver?.name ?? "(unassigned)"} rating=${a.driver?.ratingPct ?? "-"} status=${a.status} lat=${a.order.deliveryLat} lng=${a.order.deliveryLng}`); }
  if (data.held[0]) { const h = data.held[0]; console.log(`first held row:   #${h.orderNumber} · ${h.customerName} paymentStatus=${h.paymentStatus} total=${h.total}`); }

  console.log(`\nRESULT: ${problems.length === 0 ? "SHAPE OK — every render-consumed field present, no exceptions" : "PROBLEMS: " + problems.join("; ")}`);
  await prisma.$disconnect?.();
}
main().catch((e) => { console.error(e); process.exit(1); });
