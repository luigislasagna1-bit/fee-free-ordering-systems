/**
 * DEV-ONLY: capture Play Store phone screenshots for BOTH native apps from the
 * seeded local demo data.
 *   Kitchen  → /kitchen  (restaurant demo@feefreeordering.com / fee-free-demo-restaurant)
 *   Driver   → /driver   (driver@demo.com, jobs on demo-pizza-palace)
 *
 * Prereqs (run first): _seed-demo-orders.ts, _create-demo-driver.ts,
 * _enable-feefree-demo.ts on. This script stages the driver assignments itself
 * (idempotent — it wipes its own __play_seed__ rows on each run).
 *
 * Viewport 450×800 @2x → 900×1600 px = exact 9:16 portrait (Play-valid: 320–3840
 * per side, 9:16). Mobile layout (width < sm breakpoint).
 *
 * Run: npx tsx scripts/_capture-play-shots.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium, type BrowserContext } from "playwright-core";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const OUT = "store-assets/play-screenshots";
const BASE = "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET!;
// Tag staged rows via customerEmail (NOT notes — notes are visible in the app and
// a "__seed__" marker there looks unprofessional in a store screenshot).
const SEED_EMAIL = "playseed@demo.local";
const VP = { width: 450, height: 800 };

const HIDE_CHROME = `
  a[href="/admin/setup/next"] { display: none !important; }
  nextjs-portal, [data-next-badge-root], [data-next-badge], [data-nextjs-toast],
  #__next-dev-tools-indicator, [data-nextjs-dev-tools-button] { display: none !important; }
`;

async function shot(ctx: BrowserContext, path: string, file: string, opts: { wait?: number; css?: string; before?: (p: any) => Promise<void> } = {}) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.addStyleTag({ content: HIDE_CHROME + (opts.css ?? "") }).catch(() => {});
    await page.waitForTimeout(opts.wait ?? 5000);
    await page.addStyleTag({ content: HIDE_CHROME + (opts.css ?? "") }).catch(() => {});
    if (opts.before) await opts.before(page).catch((e: any) => console.log(`  before() note: ${String(e).slice(0, 80)}`));
    const url = page.url();
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log(`${/login/.test(url) ? "REDIR→login  " : "OK  "}${file}  ${url.replace(BASE, "")}`);
    return page;
  } catch (e) {
    console.log(`FAIL  ${file}  ${String(e).slice(0, 140)}`);
    await page.close();
    return null;
  }
}

async function main() {
  if (!SECRET) throw new Error("No NEXTAUTH_SECRET");
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only, aborting.");
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  // --- Kitchen restaurant + session ---
  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!demo?.restaurantId) throw new Error("demo kitchen user not found");
  const kitchenSessionToken = randomUUID();
  await prisma.restaurant.update({ where: { id: demo.restaurantId }, data: { kitchenSessionToken } });

  // --- Driver + demo-pizza-palace restaurant (make its card look complete) ---
  const driver = await prisma.driver.findUnique({ where: { email: "driver@demo.com" }, select: { id: true, name: true, email: true } });
  if (!driver) throw new Error("demo driver not found — run _create-demo-driver.ts");
  const pizzaR = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, lat: true, lng: true, address: true, phone: true, city: true, state: true, zip: true } });
  if (!pizzaR) throw new Error("demo-pizza-palace not found");
  await prisma.restaurant.update({
    where: { id: pizzaR.id },
    data: {
      address: pizzaR.address ?? "120 Main St E",
      city: pizzaR.city ?? "Milton",
      state: pizzaR.state ?? "ON",
      zip: pizzaR.zip ?? "L9T 1N4",
      phone: pizzaR.phone ?? "+19055550142",
      lat: pizzaR.lat ?? 43.5183,
      lng: pizzaR.lng ?? -79.8774,
    },
  });
  const rLat = pizzaR.lat ?? 43.5183, rLng = pizzaR.lng ?? -79.8774;

  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });

  // Clean slate on demo-pizza-palace: drop ALL delivery assignments (kills any
  // leftover claimed/queued jobs from earlier test seeds), then delete the seed/
  // test delivery orders they pointed at.
  await prisma.deliveryAssignment.deleteMany({ where: { restaurantId: pizzaR.id } });
  const staleDeliv = await prisma.order.findMany({
    where: { restaurantId: pizzaR.id, type: "delivery", customerEmail: { in: [SEED_EMAIL, "customer@example.com", "test-customer@example.com"] } },
    select: { id: true },
  });
  if (staleDeliv.length) {
    const ids = staleDeliv.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  async function makeJob(orderNumber: string, customerName: string, addr: string, dLat: number, dLng: number, total: number, tip: number, note: string) {
    const order = await prisma.order.create({
      data: {
        restaurantId: pizzaR!.id, orderNumber, status: "accepted", type: "delivery",
        customerName, customerEmail: SEED_EMAIL, customerPhone: "+12895551234",
        deliveryAddress: addr, deliveryCity: "Milton", deliveryZip: "L9T 2X5",
        deliveryLat: dLat, deliveryLng: dLng, notes: note,
        subtotal: total - 3.99, total, tip, paymentStatus: "paid", paymentMethod: "card",
      },
      select: { id: true, orderNumber: true },
    });
    return order;
  }
  // Job A → stays open (queued, unclaimed). Job B → becomes the driver's active run.
  const jobA = await makeJob("204871", "Priya S.", "42 Maple Ave", rLat + 0.018, rLng + 0.006, 31.5, 5.0, "Leave at the door");
  const jobB = await makeJob("204872", "Marcus L.", "8 Bronte St S", rLat + 0.03, rLng - 0.01, 27.99, 4.0, "Ring the bell twice");
  const asgA = await prisma.deliveryAssignment.create({ data: { orderId: jobA.id, restaurantId: pizzaR.id, status: "queued" }, select: { id: true } });
  const asgB = await prisma.deliveryAssignment.create({ data: { orderId: jobB.id, restaurantId: pizzaR.id, status: "queued" }, select: { id: true } });

  // --- Kitchen: strip the internal seed marker from any note it could render,
  //     then stage 2 FRESH pending orders so the app shows live incoming orders
  //     (not the auto-rejected "MISSED" leftovers). Fresh pending won't be
  //     auto-rejected in the few seconds before capture (3-min accept window).
  await prisma.order.updateMany({ where: { restaurantId: demo.restaurantId, notes: "__demo_seed__" }, data: { notes: null } });
  const priorK = await prisma.order.findMany({ where: { restaurantId: demo.restaurantId, orderNumber: { in: ["N1", "N2"] } }, select: { id: true } });
  if (priorK.length) {
    const ids = priorK.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  const menu = await prisma.menuItem.findMany({ where: { restaurantId: demo.restaurantId, isAvailable: true }, select: { id: true, name: true, price: true }, take: 6 });
  async function makeKitchenOrder(orderNumber: string, customerName: string, email: string, note: string | null, picks: number[]) {
    const lines = picks.map((i) => menu[i % menu.length]).map((it) => ({ name: it.name, price: it.price, quantity: 1, subtotal: it.price, menuItemId: it.id }));
    const subtotal = +lines.reduce((s, l) => s + l.subtotal, 0).toFixed(2);
    const taxAmount = +(subtotal * 0.13).toFixed(2);
    const now = new Date();
    await prisma.order.create({
      data: {
        restaurantId: demo!.restaurantId!, orderNumber, status: "pending", type: "pickup",
        customerName, customerEmail: email, customerPhone: "+12895550117",
        subtotal, taxAmount, total: +(subtotal + taxAmount).toFixed(2),
        paymentStatus: "paid", paymentMethod: "card", notes: note,
        notifiedAt: now, createdAt: now,
        items: { create: lines },
      },
    });
  }
  await makeKitchenOrder("N1", "Emma R.", "emma.reyes@gmail.com", "No cutlery, thanks", [0, 2, 4]);
  await makeKitchenOrder("N2", "Noah B.", "noah.brooks@gmail.com", null, [1, 3]);

  console.log(`kitchen rid ${demo.restaurantId} (${demo.restaurant?.slug}) | driver ${driver.id} | jobs A=${asgA.id} B=${asgB.id} | menu ${menu.length}`);
  await prisma.$disconnect();

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });

  // ============ KITCHEN (phone) ============
  const kitchen = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  await kitchen.addInitScript(() => {
    try { sessionStorage.setItem("ffo:guided-setup-pill-dismissed-at", "999999"); } catch {}
    try { localStorage.setItem("kds-sound-armed", "1"); } catch {}
  });
  await kitchen.addInitScript((rid) => { try { localStorage.setItem("ffo:kitchen-tour-completed:" + rid, "1"); } catch {} }, demo.restaurantId);
  const kCookie = await encode({ token: { sub: demo.id, name: demo.name ?? demo.email, email: demo.email, role: demo.role, restaurantId: demo.restaurantId, restaurantSlug: demo.restaurant?.slug, kitchenSessionToken }, secret: SECRET });
  await kitchen.addCookies([{ name: "next-auth.kitchen-session-token", value: kCookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);

  await shot(kitchen, "/kitchen", "kitchen-1-orders.png", { wait: 7000 });
  // Second kitchen shot: open the first order's detail by clicking its row.
  const kp = await shot(kitchen, "/kitchen", "kitchen-2-order-detail.png", {
    wait: 7000,
    before: async (page) => {
      const row = page.locator('[class*="min-h-[80px]"]').first();
      await row.click({ timeout: 5000 });
      await page.waitForTimeout(1800);
    },
  });
  if (kp) await kp.close();
  await kitchen.close();

  // ============ DRIVER (phone) ============
  const dctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  await dctx.grantPermissions(["geolocation"], { origin: BASE });
  await dctx.setGeolocation({ latitude: rLat + 0.02, longitude: rLng - 0.005 });
  const dCookie = await encode({ token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken }, secret: SECRET });
  await dctx.addCookies([{ name: "next-auth.driver-session-token", value: dCookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);

  // Shot 1: open queue (both jobs unclaimed → "Open queue" with available work).
  await shot(dctx, "/driver", "driver-1-queue.png", { wait: 6000 });

  // Promote job B to an active run for this driver, then shot 2: on-a-delivery.
  const p2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  await p2.deliveryAssignment.update({
    where: { id: asgB.id },
    data: { driverId: driver.id, status: "picked_up", acceptedAt: new Date(Date.now() - 600000), pickedUpAt: new Date(Date.now() - 120000) },
  });
  await p2.$disconnect();
  await shot(dctx, "/driver", "driver-2-active-delivery.png", { wait: 7000 });
  await dctx.close();

  await browser.close();
  console.log("done → " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
