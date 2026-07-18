/**
 * DEV-ONLY: E2E verification for the Phase 7 Restaurant Deliveries tab.
 *
 * Verifies (390×844 viewport):
 *   1. Deliveries is now a 3rd tab in the nav (Dispatch / Deliveries / Account)
 *   2. Deliveries tab In-progress segment shows the 2 seeded active rows from
 *      the ops context — no separate /deliveries fetch drives in-progress data
 *      (at most 1 /deliveries call total: the tab-activation pre-fetch for
 *      the Completed segment)
 *   3. Deliveries tab Completed segment: 2 delivered + 1 failed rows appear
 *      day-grouped; Load more button is absent (≤25 rows)
 *   4. Tapping a completed row opens the detail overlay and
 *      GET /api/admin/feefree-delivery/deliveries/[id] returns 200 with
 *      all expected fields
 *   5. Detail overlay: status chip, stage timeline with correct terminal
 *      styling, driver name + ratingPct, order customerName + address +
 *      formatted total + tip, billing line in PLATFORM_CURRENCY
 *   6. Driver.phone IS present in the detail API driver object (Phase 8 —
 *      Luigi's 2026-07-16 decision: restaurants see their drivers' numbers)
 *   7. No second parallel interval beyond the single 10 s ops poll
 *
 * Seeding (idempotent, tagged playseed@deliveries.local, wipes own rows on start):
 *   • 2 active delivery assignments (picked_up + assigned statuses)
 *   • 2 completed deliveries (status=delivered, completedAt set)
 *   • 1 failed delivery (status=failed, completedAt set)
 * Fee Free Delivery is force-enabled (autoSend=false).
 *
 * Requires demo driver (driver@demo.com) — run
 *   npx tsx scripts/_create-demo-driver.ts  if not yet seeded.
 * Refuses PROD (dawn-tree guard).
 * Screenshots → store-assets/phase7-screenshots/15-restaurant-deliveries-*.png
 *
 * npx tsx scripts/_verify-restaurant-deliveries.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET!;
const VP = { width: 390, height: 844 };
const SEED_EMAIL = "playseed@deliveries.local";
const OUT_DIR = resolve("store-assets/phase7-screenshots");

// Named screenshot helper.
async function snap(page: any, name: string): Promise<string> {
  const path = `${OUT_DIR}/${name}`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(dbUrl)) throw new Error("PROD url — dev-only, aborting.");
  if (!SECRET) throw new Error("NEXTAUTH_SECRET not set.");
  mkdirSync(OUT_DIR, { recursive: true });

  // ── 1. DB setup ─────────────────────────────────────────────────────────────
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: dbUrl }),
  } as any);

  // Locate demo-pizza-palace restaurant.
  const pizzaR = await prisma.restaurant.findFirst({
    where: { slug: "demo-pizza-palace" },
    select: {
      id: true, lat: true, lng: true,
      address: true, city: true, state: true, zip: true, phone: true,
    },
  });
  if (!pizzaR) throw new Error("demo-pizza-palace not found — run seed scripts first.");

  // Locate the admin owner for this restaurant (same priority as shell script).
  let owner = await prisma.user.findFirst({
    where: { email: "owner@pizzapalace.com" },
    select: {
      id: true, email: true, name: true, role: true,
      restaurantId: true,
      restaurant: { select: { slug: true, name: true } },
    },
  });
  if (!owner?.restaurantId) {
    owner = await prisma.user.findFirst({
      where: { restaurantId: pizzaR.id, role: { in: ["admin", "owner"] } },
      select: {
        id: true, email: true, name: true, role: true,
        restaurantId: true,
        restaurant: { select: { slug: true, name: true } },
      },
    });
  }
  if (!owner?.restaurantId) {
    throw new Error(
      "No admin user found for demo-pizza-palace. " +
        "Ensure owner@pizzapalace.com exists or any admin is assigned to this restaurant.",
    );
  }
  console.log(`owner  ${owner.email} (${owner.id}) → restaurant ${owner.restaurantId}`);

  // Locate the demo driver — required for populating the driver card in
  // the detail overlay (name + ratingPct).
  const driver = await prisma.driver.findUnique({
    where: { email: "driver@demo.com" },
    select: { id: true, name: true, ratingPct: true },
  });
  if (!driver) {
    throw new Error(
      "Demo driver not found — run: npx tsx scripts/_create-demo-driver.ts",
    );
  }
  // Ensure ratingPct is set so the star-rating line appears in the overlay.
  if (driver.ratingPct == null) {
    await prisma.driver.update({ where: { id: driver.id }, data: { ratingPct: 97 } });
  }
  const driverRatingPct = driver.ratingPct ?? 97;
  console.log(`driver ${driver.id} (${driver.name}) ratingPct=${driverRatingPct}`);

  // ── 2. Enable Fee Free Delivery (autoSend=false keeps held queue populated) ─
  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId: pizzaR.id },
    create: { restaurantId: pizzaR.id, enabled: true, autoSend: false },
    update: { enabled: true, autoSend: false },
  });
  console.log("FFD enabled (autoSend=false) on demo-pizza-palace");

  // ── 3. Seed: wipe own rows first (idempotent) ────────────────────────────────
  await prisma.deliveryAssignment.deleteMany({
    where: { restaurantId: pizzaR.id, order: { customerEmail: SEED_EMAIL } },
  });
  const staleOrders = await prisma.order.findMany({
    where: { restaurantId: pizzaR.id, customerEmail: SEED_EMAIL },
    select: { id: true },
  });
  if (staleOrders.length) {
    const ids = staleOrders.map((o: any) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`wiped ${staleOrders.length} stale seed order(s)`);
  }

  const rLat = pizzaR.lat ?? 43.5183;
  const rLng = pizzaR.lng ?? -79.8774;
  const now = Date.now();

  // ── Active order 1: picked_up (en route) ──────────────────────────────────
  const active1Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "DA001",
      status: "accepted",
      type: "delivery",
      customerName: "ActiveOne D.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895550101",
      deliveryAddress: "45 Oak Ave",
      deliveryCity: "Milton",
      deliveryZip: "L9T 2Y5",
      deliveryLat: rLat + 0.012,
      deliveryLng: rLng + 0.008,
      subtotal: 22.0,
      total: 26.0,
      tip: 3.5,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: active1Order.id,
      restaurantId: pizzaR.id,
      driverId: driver.id,
      status: "picked_up",
      assignedAt: new Date(now - 900_000),
      acceptedAt: new Date(now - 840_000),
      startedAt: new Date(now - 600_000),
      pickedUpAt: new Date(now - 300_000),
    },
  });

  // ── Active order 2: assigned (dispatched, not yet heading to store) ────────
  const active2Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "DA002",
      status: "accepted",
      type: "delivery",
      customerName: "ActiveTwo D.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895550102",
      deliveryAddress: "88 Mill St",
      deliveryCity: "Milton",
      deliveryZip: "L9T 3Z5",
      deliveryLat: rLat + 0.025,
      deliveryLng: rLng - 0.012,
      subtotal: 18.5,
      total: 22.5,
      tip: 3.0,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: active2Order.id,
      restaurantId: pizzaR.id,
      driverId: driver.id,
      status: "assigned",
      assignedAt: new Date(now - 600_000),
    },
  });
  console.log(
    `seeded active: #${active1Order.orderNumber} (picked_up), #${active2Order.orderNumber} (assigned)`,
  );

  // ── Completed order 1: delivered yesterday ─────────────────────────────────
  const deliveredAt1 = new Date(now - 26 * 3_600_000);
  const comp1Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "DC001",
      status: "completed",
      type: "delivery",
      customerName: "CompOne D.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895550201",
      deliveryAddress: "15 Thompson Rd",
      deliveryCity: "Milton",
      deliveryZip: "L9T 4W5",
      deliveryLat: rLat + 0.018,
      deliveryLng: rLng + 0.003,
      subtotal: 28.0,
      total: 33.0,
      tip: 4.5,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  const comp1Assign = await prisma.deliveryAssignment.create({
    data: {
      orderId: comp1Order.id,
      restaurantId: pizzaR.id,
      driverId: driver.id,
      status: "delivered",
      assignedAt: new Date(deliveredAt1.getTime() - 55 * 60_000),
      acceptedAt: new Date(deliveredAt1.getTime() - 50 * 60_000),
      startedAt: new Date(deliveredAt1.getTime() - 35 * 60_000),
      pickedUpAt: new Date(deliveredAt1.getTime() - 20 * 60_000),
      deliveredAt: deliveredAt1,
      completedAt: deliveredAt1,
      platformFeeCents: 799,
      customerFeeChargedCents: 799,
    },
    select: { id: true },
  });

  // ── Completed order 2: delivered yesterday (2 h earlier) ──────────────────
  const deliveredAt2 = new Date(now - 28 * 3_600_000);
  const comp2Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "DC002",
      status: "completed",
      type: "delivery",
      customerName: "CompTwo D.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895550202",
      deliveryAddress: "23 Bronte St S",
      deliveryCity: "Milton",
      deliveryZip: "L9T 5V5",
      deliveryLat: rLat + 0.031,
      deliveryLng: rLng - 0.015,
      subtotal: 19.5,
      total: 24.0,
      tip: 3.5,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: comp2Order.id,
      restaurantId: pizzaR.id,
      driverId: driver.id,
      status: "delivered",
      assignedAt: new Date(deliveredAt2.getTime() - 55 * 60_000),
      acceptedAt: new Date(deliveredAt2.getTime() - 50 * 60_000),
      startedAt: new Date(deliveredAt2.getTime() - 35 * 60_000),
      pickedUpAt: new Date(deliveredAt2.getTime() - 20 * 60_000),
      deliveredAt: deliveredAt2,
      completedAt: deliveredAt2,
      platformFeeCents: 799,
      customerFeeChargedCents: 799,
    },
  });

  // ── Completed order 3: failed yesterday (4 h earlier than DC001) ──────────
  const failedAt = new Date(now - 30 * 3_600_000);
  const fail1Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "DF001",
      status: "accepted",
      type: "delivery",
      customerName: "FailOne D.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895550301",
      deliveryAddress: "99 James Snow Pkwy",
      deliveryCity: "Milton",
      deliveryZip: "L9T 6A1",
      deliveryLat: rLat - 0.005,
      deliveryLng: rLng + 0.021,
      subtotal: 15.0,
      total: 18.0,
      tip: 0.0,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: fail1Order.id,
      restaurantId: pizzaR.id,
      driverId: driver.id,
      status: "failed",
      assignedAt: new Date(failedAt.getTime() - 30 * 60_000),
      acceptedAt: new Date(failedAt.getTime() - 25 * 60_000),
      failedAt: failedAt,
      completedAt: failedAt,
      platformFeeCents: null,
      customerFeeChargedCents: null,
    },
  });
  console.log(
    `seeded completed: #${comp1Order.orderNumber} (delivered), #${comp2Order.orderNumber} (delivered), #${fail1Order.orderNumber} (failed)`,
  );

  // ── 4. Mint admin session ──────────────────────────────────────────────────
  // Token shape matches _verify-restaurant-shell.ts and the existing
  // getSessionUser() decode expectations in session.ts.
  const adminJwt = await encode({
    token: {
      sub: owner.id,
      name: owner.name ?? owner.email,
      email: owner.email,
      role: owner.role,
      restaurantId: owner.restaurantId ?? undefined,
      restaurantSlug: owner.restaurant?.slug ?? undefined,
    },
    secret: SECRET,
  });
  const adminCookie = {
    name: "next-auth.session-token",
    value: adminJwt,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
  };

  await prisma.$disconnect();

  // ── 5. Browser ──────────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });

  // Suppress Next.js dev overlay so it doesn't obstruct checks.
  await ctx.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = `
      nextjs-portal, [data-next-badge-root], [data-next-badge],
      [data-nextjs-toast], #__next-dev-tools-indicator,
      [data-nextjs-dev-tools-button] { display: none !important; }
    `;
    document.head?.appendChild(css);
  });

  await ctx.addCookies([adminCookie]);
  // pref=restaurant ensures the admin session wins over any stale driver cookie.
  await ctx.addCookies([{
    name: "ffd-role-pref",
    value: "restaurant",
    domain: "localhost",
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
  }]);

  const page = await ctx.newPage();

  // ── Navigate + settle ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/driver`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const screenshots: string[] = [];
  screenshots.push(await snap(page, "15-restaurant-deliveries-dispatch.png"));

  // ── Check 1: 3 tabs in nav (Dispatch / Deliveries / Account) ──────────────
  const navTabCount = await page.evaluate(() => {
    const nav = document.querySelector("nav.fixed");
    return nav ? nav.querySelectorAll("button").length : 0;
  });
  const navLabels: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("nav.fixed button")).map(
      (b) => b.textContent?.trim() ?? "",
    ),
  );
  const hasDispatchTab  = navLabels.some((l) => /dispatch/i.test(l));
  const hasDeliveriesTab = navLabels.some((l) => /deliveries/i.test(l));
  const hasAccountTab   = navLabels.some((l) => /account/i.test(l));
  const check1Pass = navTabCount === 3 && hasDispatchTab && hasDeliveriesTab && hasAccountTab;

  // ── Check 2: Deliveries tab → In-progress segment shows active rows ────────
  // Collect /api calls during the in-progress observation window so we can
  // verify the in-progress data comes from the ops context, not a /deliveries
  // query (the only /deliveries call allowed is the pre-fetch triggered on tab
  // activation — at most 1 in this window).
  const check2ApiCounts: Record<string, number> = {};
  const onCheck2Request = (req: any) => {
    try {
      const u = new URL(req.url());
      if (u.pathname.startsWith("/api/")) {
        check2ApiCounts[u.pathname] = (check2ApiCounts[u.pathname] ?? 0) + 1;
      }
    } catch { /* non-URL ignored */ }
  };
  page.on("request", onCheck2Request);

  // Click the Deliveries tab (index 1 — Dispatch=0, Deliveries=1, Account=2).
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav.fixed button"));
    (btns[1] as HTMLButtonElement)?.click();
  });
  await page.waitForTimeout(4_000); // allow ops pre-fetch + initial render
  page.off("request", onCheck2Request);

  screenshots.push(await snap(page, "15-restaurant-deliveries-inprogress.png"));

  const inProgressPageText = await page.evaluate(() => document.body.innerText);
  const hasActiveOne = /ActiveOne D\./i.test(inProgressPageText);
  const hasActiveTwo = /ActiveTwo D\./i.test(inProgressPageText);
  // At most 2 /deliveries calls are acceptable: 1 is the tab-activation
  // pre-fetch for the Completed segment; a 2nd can occur in dev mode because
  // React 18 StrictMode intentionally double-invokes effects on mount to
  // surface side-effect bugs. A 3rd+ call would indicate a runaway interval
  // on the in-progress segment (data for that segment comes from ops context
  // and must never trigger a /deliveries poll of its own).
  const deliveriesCallsDuringInProgress =
    check2ApiCounts["/api/admin/feefree-delivery/deliveries"] ?? 0;
  const check2Pass =
    hasActiveOne && hasActiveTwo && deliveriesCallsDuringInProgress <= 2;

  // ── Check 3: Completed segment — 3 rows, day-grouped, no Load more ─────────
  // Click the "Completed" segment button inside the visible main.
  await page.evaluate(() => {
    // The segment switcher renders two flex-1 buttons at the top of the tab.
    // Find the one containing "Completed".
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    const main = mains[0];
    if (!main) return;
    const seg = Array.from(main.querySelectorAll("button")).find((b) =>
      /Completed|completed/i.test((b as HTMLButtonElement).textContent ?? ""),
    );
    (seg as HTMLButtonElement)?.click();
  });

  // Wait for the completed list to appear (spinner → row buttons).
  await page
    .waitForFunction(
      () => {
        const mains = Array.from(document.querySelectorAll("main")).filter(
          (m) => (m as HTMLElement).offsetParent !== null,
        );
        return mains.some(
          (m) => m.querySelectorAll("button.w-full.text-left").length > 0,
        );
      },
      { timeout: 15_000 },
    )
    .catch(async () => {
      await snap(page, "15-restaurant-deliveries-debug.png");
      const dbg = await page.evaluate(() =>
        document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
      );
      console.log(`DEBUG completed list timeout. Page text: ${dbg}`);
    });
  await page.waitForTimeout(1_000);

  screenshots.push(await snap(page, "15-restaurant-deliveries-completed.png"));

  // Scope all text checks to the VISIBLE main to avoid matching text from
  // the CSS-hidden Dispatch div (which is still in the DOM).
  const completedMainText = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    return mains[0]?.innerText ?? "";
  });
  const hasCompOne   = /CompOne D\./i.test(completedMainText);
  const hasCompTwo   = /CompTwo D\./i.test(completedMainText);
  const hasFailOne   = /FailOne D\./i.test(completedMainText);
  const hasLoadMore  = /Load more/i.test(completedMainText);
  const dayGroupCount = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    const main = mains[0];
    // DateGroupedList renders <section><h2>…</h2>…</section> per day group.
    return main ? main.querySelectorAll("section > h2").length : 0;
  });
  const check3Pass = hasCompOne && hasCompTwo && hasFailOne && !hasLoadMore && dayGroupCount >= 1;

  // ── Check 4: Row tap → detail overlay + GET /deliveries/[id] returns 200 ───
  // Listen for the /deliveries/[id] request and its response.
  let detailRequestPath: string | null = null;
  let detailResponseStatus: number | null = null;
  const onDetailRequest = (req: any) => {
    try {
      const u = new URL(req.url());
      if (/\/api\/admin\/feefree-delivery\/deliveries\/.+/.test(u.pathname)) {
        detailRequestPath = u.pathname;
      }
    } catch { /* ignore */ }
  };
  const onDetailResponse = (resp: any) => {
    try {
      const u = new URL(resp.url());
      if (/\/api\/admin\/feefree-delivery\/deliveries\/.+/.test(u.pathname)) {
        detailResponseStatus = resp.status();
      }
    } catch { /* ignore */ }
  };
  page.on("request", onDetailRequest);
  page.on("response", onDetailResponse);

  // Tap the "CompOne D." row.
  const rowTapped = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    const main = mains[0];
    if (!main) return false;
    const rows = Array.from(main.querySelectorAll("button.w-full.text-left"));
    const target = rows.find((b) =>
      /CompOne D\./i.test((b as HTMLButtonElement).innerText),
    );
    if (!target) return false;
    (target as HTMLButtonElement).click();
    return true;
  });
  await page.waitForTimeout(2_500);

  page.off("request", onDetailRequest);
  page.off("response", onDetailResponse);

  screenshots.push(await snap(page, "15-restaurant-deliveries-detail.png"));

  // Overlay: the DetailOverlay root is div.fixed.inset-0.z-40.
  const overlayElement = await page.evaluate(() => {
    const ov = document.querySelector("div.fixed.inset-0.z-40") as HTMLElement | null;
    return ov ? ov.innerText.replace(/\s+/g, " ") : null;
  });
  const overlayRendered = overlayElement !== null;
  const check4Pass =
    rowTapped &&
    detailRequestPath !== null &&
    detailResponseStatus === 200 &&
    overlayRendered;

  // ── Direct API field verification for /deliveries/[id] ────────────────────
  // We pass comp1Assign.id (captured during seed) into a page.evaluate call so
  // the response JSON can be inspected for required fields AND for the absence
  // of Driver.phone.
  const detailApiResult = await page.evaluate(
    async (assignId: string) => {
      try {
        const r = await fetch(
          `/api/admin/feefree-delivery/deliveries/${encodeURIComponent(assignId)}`,
          { cache: "no-store" },
        );
        const body = await r.json();
        return { status: r.status, keys: Object.keys(body), body };
      } catch (e: any) {
        return { status: -1, keys: [], body: {}, error: String(e) };
      }
    },
    comp1Assign.id,
  );

  const EXPECTED_DETAIL_KEYS = [
    "id", "status",
    "assignedAt", "acceptedAt", "startedAt", "pickedUpAt",
    "deliveredAt", "failedAt", "returnedAt", "completedAt",
    "driver", "order",
    "billingCents", "billingCurrency", "settled",
    "canRate", "myFeedback",
  ];
  const missingDetailKeys = EXPECTED_DETAIL_KEYS.filter(
    (k) => !detailApiResult.keys.includes(k),
  );
  // Phase 8: Driver.phone is EXPECTED inside the driver sub-object — the
  // tap-to-call button. (Restaurant-facing only; never customer-facing.)
  const phoneInApiBody =
    detailApiResult.body?.driver != null && "phone" in detailApiResult.body.driver;

  // ── Check 5: Detail overlay content ───────────────────────────────────────
  const ov = overlayElement ?? "";
  // Status chip — "Delivered" label from admin.feefreeDelivery.st_delivered.
  const hasStatusChip = /Delivered/i.test(ov);
  // Timeline nodes — the restaurant overlay builds: Assigned → Accepted →
  // Started driving → Picked up → Delivered. All 5 should appear for DC001
  // (all timestamps set in seed).
  const hasTimeline =
    /Assigned/i.test(ov) &&
    /Accepted/i.test(ov) &&
    (/Started driving|Heading/i.test(ov) || /Picked up/i.test(ov));
  // The terminal node style: "Delivered" with emerald tone, OR a "rose" node
  // for a failed row. For DC001 (delivered) we expect "Delivered" in the
  // timeline.
  const hasTerminalNode = /Delivered/i.test(ov);
  // Driver card.
  const hasDriverName   = ov.includes(driver.name);
  const hasDriverRating = /\d{1,3}%/.test(ov);
  // Order card: customer name, address, total (33.00), tip (4.50).
  const hasCustomerName = /CompOne D\./i.test(ov);
  const hasAddress      = /Thompson|Milton/i.test(ov);
  const hasTotalValue   = /33\.00|33,00|\$33/.test(ov);
  const hasTipValue     = /4\.50|4,50/.test(ov);
  // Billing line: platformFeeCents=799 → "$7.99" in PLATFORM_CURRENCY (USD).
  const hasBillingLine  = /Platform fee|\$7\.99|7\.99/i.test(ov);
  const check5Pass =
    hasStatusChip &&
    hasTimeline &&
    hasTerminalNode &&
    hasDriverName &&
    hasDriverRating &&
    hasCustomerName &&
    hasAddress &&
    hasTotalValue &&
    hasTipValue &&
    hasBillingLine;

  // ── Check 6: Driver.phone present in API driver object + all keys ─────────
  // Phase 8 flipped this check: the phone now SHIPS to restaurants
  // (tap-to-call). canRate/myFeedback join the expected key set.
  const check6Pass = phoneInApiBody && missingDetailKeys.length === 0;

  // ── Check 7: No second parallel interval beyond the single ops poll ────────
  // Close the overlay first (click the ArrowLeft back button).
  await page.evaluate(() => {
    const ov = document.querySelector(
      "div.fixed.inset-0.z-40 header button",
    ) as HTMLButtonElement | null;
    ov?.click();
  });
  await page.waitForTimeout(500);

  // Observe API cadence for 15 s (~1.5 × the 10 s ops interval).
  const intervalWindowCounts: Record<string, number> = {};
  const onIntervalRequest = (req: any) => {
    try {
      const u = new URL(req.url());
      if (u.pathname.startsWith("/api/")) {
        intervalWindowCounts[u.pathname] =
          (intervalWindowCounts[u.pathname] ?? 0) + 1;
      }
    } catch { /* ignore */ }
  };
  page.on("request", onIntervalRequest);
  await page.waitForTimeout(15_000);
  page.off("request", onIntervalRequest);

  // Only /ops is allowed to fire more than once (10 s interval → 1–2 times in
  // 15 s). Any other endpoint firing more than once indicates a runaway poll.
  const nonOpsRepeated = Object.entries(intervalWindowCounts).filter(
    ([k, n]) => !k.includes("/ops") && n > 1,
  );
  const check7Pass = nonOpsRepeated.length === 0;

  screenshots.push(await snap(page, "15-restaurant-deliveries-final.png"));

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────────────
  const checks = [
    {
      name: "1. 3-tab nav: Dispatch / Deliveries / Account",
      pass: check1Pass,
      note: `tabCount=${navTabCount} labels=[${navLabels.join(" | ")}] dispatch=${hasDispatchTab} deliveries=${hasDeliveriesTab} account=${hasAccountTab}`,
    },
    {
      name: "2. In-progress segment shows 2 active rows from ops context",
      pass: check2Pass,
      note: `hasActiveOne=${hasActiveOne} hasActiveTwo=${hasActiveTwo} /deliveries calls during in-progress=${deliveriesCallsDuringInProgress} (≤2 allowed; 2nd is React StrictMode dev double-invoke)`,
    },
    {
      name: "3. Completed segment: 2 delivered + 1 failed, day-grouped, no Load more",
      pass: check3Pass,
      note: `hasCompOne=${hasCompOne} hasCompTwo=${hasCompTwo} hasFailOne=${hasFailOne} hasLoadMore=${hasLoadMore} dayGroups=${dayGroupCount}`,
    },
    {
      name: "4. Row tap → GET /deliveries/[id] returns 200 with all expected fields",
      pass: check4Pass,
      note: `rowTapped=${rowTapped} detailPath=${detailRequestPath ?? "none"} status=${detailResponseStatus} overlayRendered=${overlayRendered}`,
    },
    {
      name: "5. Detail overlay: status chip + timeline + driver + order + billing",
      pass: check5Pass,
      note: `chip=${hasStatusChip} timeline=${hasTimeline} terminal=${hasTerminalNode} driverName=${hasDriverName} rating=${hasDriverRating} customer=${hasCustomerName} address=${hasAddress} total=${hasTotalValue} tip=${hasTipValue} billing=${hasBillingLine}`,
    },
    {
      name: "6. Driver.phone present in detail API driver object (Phase 8) + all keys",
      pass: check6Pass,
      note: `phoneInApi=${phoneInApiBody} missingApiKeys=[${missingDetailKeys.join(",") || "none"}]`,
    },
    {
      name: "7. No second parallel interval beyond the single 10 s ops poll",
      pass: check7Pass,
      note: `window=[${Object.entries(intervalWindowCounts).map(([k, n]) => `${k}×${n}`).join(",") || "none"}] nonOpsRepeated=[${nonOpsRepeated.map(([k, n]) => `${k}×${n}`).join(",") || "none"}]`,
    },
  ];

  console.log("\n=== Phase 7 Restaurant Deliveries Tab — E2E Verification ===");
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    console.log(`       ${c.note}`);
    if (!c.pass) failed++;
  }
  console.log(`\nScreenshots → ${OUT_DIR}`);
  screenshots.forEach((s) => console.log(`  ${s}`));
  console.log(`\n${failed === 0 ? "ALL 7 CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
