/**
 * DEV-ONLY: E2E verification for the Phase 6 Restaurant shell in /driver.
 *
 * Verifies (390×844 viewport):
 *   1. The RestaurantApp shell renders dark (bg-gray-900, NOT the old light panel
 *      RestaurantDispatch — confirmed by BottomNav presence + no bg-white card).
 *   2. Dispatch is the default tab and shows held + active deliveries with the
 *      held-count badge on the Dispatch nav button.
 *   3. GET /api/admin/feefree-delivery/ops returns 200 with all expected payload keys.
 *   4. Account tab shows the enable + auto-send toggles (role=switch) + billing
 *      summary (owed / this week / next charge) formatted in PLATFORM_CURRENCY.
 *   5. Deliveries + Drivers are NOT dead blank tabs — in Phase 6 R1 they are
 *      absent from the nav (2 tabs only), never rendered as a blank screen.
 *   6. No per-tab network intervals beyond the single 10 s ops poll (no other
 *      API path is called more than once in a 15 s observation window).
 *
 * Seeding (idempotent, tagged playseed@demo.local, wipes own rows on start):
 *   • 2 held orders (accepted, no assignment, paymentStatus=paid)
 *   • 2 active delivery assignments (picked_up + assigned statuses)
 * Fee Free Delivery is force-enabled (autoSend=false → held queue populated).
 *
 * Refuses PROD (dawn-tree guard).
 * Screenshots → store-assets/phase6-screenshots/14-restaurant-*.png
 *
 * npx tsx scripts/_verify-restaurant-shell.ts
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
const SEED_EMAIL = "playseed@demo.local";
const OUT_DIR = resolve("store-assets/phase6-screenshots");

// Convenience: named screenshot promise
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

  // ── 1. DB setup ────────────────────────────────────────────────────────────
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

  // Locate the admin owner for this restaurant.  Prefer the canonical demo owner
  // email from _mint-admin-token; fall back to any admin with this restaurantId.
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
      "Ensure owner@pizzapalace.com exists or any admin is assigned to this restaurant."
    );
  }
  console.log(`owner  ${owner.email} (${owner.id}) → restaurant ${owner.restaurantId}`);

  // ── 2. Enable Fee Free Delivery (manual dispatch, autoSend=false) ──────────
  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId: pizzaR.id },
    create: { restaurantId: pizzaR.id, enabled: true, autoSend: false },
    update: { enabled: true, autoSend: false },
  });
  console.log("FFD enabled (autoSend=false) on demo-pizza-palace");

  // ── 3. Seed: wipe own rows first (idempotent) ─────────────────────────────
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

  // Held order 1 — accepted, no assignment, paid.
  const held1 = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "SH001",
      status: "accepted",
      type: "delivery",
      customerName: "Alice T.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895551001",
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

  // Held order 2 — accepted, no assignment, paid.
  const held2 = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "SH002",
      status: "accepted",
      type: "delivery",
      customerName: "Ben K.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895551002",
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
  console.log(`seeded held orders: #${held1.orderNumber}, #${held2.orderNumber}`);

  // Active order 1 — picked_up (en route).
  const active1Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "SA001",
      status: "accepted",
      type: "delivery",
      customerName: "Clara M.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895551003",
      deliveryAddress: "15 Thompson Rd",
      deliveryCity: "Milton",
      deliveryZip: "L9T 4W5",
      deliveryLat: rLat + 0.018,
      deliveryLng: rLng + 0.003,
      subtotal: 31.0,
      total: 35.0,
      tip: 4.5,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: active1Order.id,
      restaurantId: pizzaR.id,
      status: "picked_up",
      acceptedAt: new Date(Date.now() - 900_000),
      pickedUpAt: new Date(Date.now() - 300_000),
    },
  });

  // Active order 2 — assigned (accepted but not yet picked up).
  const active2Order = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id,
      orderNumber: "SA002",
      status: "accepted",
      type: "delivery",
      customerName: "Dan R.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895551004",
      deliveryAddress: "23 Bronte St S",
      deliveryCity: "Milton",
      deliveryZip: "L9T 5V5",
      deliveryLat: rLat + 0.031,
      deliveryLng: rLng - 0.015,
      subtotal: 24.5,
      total: 28.5,
      tip: 4.0,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  await prisma.deliveryAssignment.create({
    data: {
      orderId: active2Order.id,
      restaurantId: pizzaR.id,
      status: "assigned",
      acceptedAt: new Date(Date.now() - 600_000),
    },
  });
  console.log(`seeded active orders: #${active1Order.orderNumber} (picked_up), #${active2Order.orderNumber} (assigned)`);

  // ── 4. Mint admin session (next-auth.session-token) ───────────────────────
  // Token shape mirrors _capture-play-shots.ts kitchen cookie and
  // _verify-role-pref.ts adminCookie (sub, name, email, role, restaurantId,
  // restaurantSlug).  No kitchenSessionToken needed — this is an admin session.
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

  // ── 5. Browser ─────────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });

  // Suppress Next.js dev overlay so it doesn't cover assertions.
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
  // pref=restaurant ensures the admin session wins even if a stale driver
  // session cookie is sitting in the browser.
  await ctx.addCookies([{
    name: "ffd-role-pref",
    value: "restaurant",
    domain: "localhost",
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
  }]);

  const page = await ctx.newPage();

  // Collect all API requests for cadence check (check 6).
  const apiRequestCounts: Record<string, number> = {};
  page.on("request", (req: any) => {
    try {
      const u = new URL(req.url());
      if (u.pathname.startsWith("/api/")) {
        apiRequestCounts[u.pathname] = (apiRequestCounts[u.pathname] ?? 0) + 1;
      }
    } catch { /* non-URL requests ignored */ }
  });

  // Navigate and wait for the shell to load fully.
  await page.goto(`${BASE}/driver`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(4_000);

  const screenshots: string[] = [];

  // ── Screenshot 1: initial shell state ──────────────────────────────────────
  screenshots.push(await snap(page, "14-restaurant-shell.png"));

  // ── Check 1: dark shell (bg-gray-900 container, no bg-white outer card) ───
  const darkContainerExists = await page.evaluate(() => {
    // The RestaurantApp root: <div class="min-h-screen ... bg-gray-900 text-white">
    const nodes = document.querySelectorAll("div");
    for (const n of Array.from(nodes)) {
      if (n.className?.includes?.("bg-gray-900") && n.className?.includes?.("min-h-screen")) return true;
    }
    return false;
  });
  const bottomNavExists = await page.evaluate(() => {
    // Phase 6 shell has a BottomNav (fixed bottom-0).  Old RestaurantDispatch had none.
    return !!document.querySelector("nav.fixed");
  });
  const oldLightPanel = await page.evaluate(() => {
    // Old RestaurantDispatch's not-enabled card: bg-white rounded-2xl
    return !!document.querySelector(".bg-white.rounded-2xl");
  });
  const check1Pass = darkContainerExists && bottomNavExists && !oldLightPanel;

  // ── Check 2: Dispatch is default tab + held + active + badge ──────────────
  const tabCount = await page.evaluate(() => {
    const nav = document.querySelector("nav.fixed");
    return nav ? nav.querySelectorAll("button").length : 0;
  });
  const activeTabLabel = await page.evaluate(() => {
    const btn = document.querySelector("nav.fixed button[aria-current='page']");
    return btn?.textContent?.trim() ?? "";
  });
  const heldBadge = await page.evaluate(() => {
    // BottomNav renders count as a span.absolute inside the first nav button.
    const firstBtn = document.querySelector("nav.fixed button");
    return firstBtn?.querySelector("span.absolute")?.textContent?.trim() ?? "";
  });
  const pageText = await page.evaluate(() => document.body.innerText);
  const hasHeld = /Alice T\.|SH001/i.test(pageText);
  const hasActive = /Clara M\.|SA001|Dan R\.|SA002/i.test(pageText);
  const check2Pass = tabCount === 2 && /dispatch/i.test(activeTabLabel) && hasHeld && hasActive && Number(heldBadge) >= 2;

  // ── Screenshot 2: dispatch tab with data ───────────────────────────────────
  screenshots.push(await snap(page, "14-restaurant-dispatch.png"));

  // ── Check 3: /ops endpoint ─────────────────────────────────────────────────
  const opsResult = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/admin/feefree-delivery/ops", { cache: "no-store" });
      const body = await r.json();
      return { status: r.status, keys: Object.keys(body), body };
    } catch (e: any) {
      return { status: -1, keys: [], body: {}, error: String(e) };
    }
  });
  const EXPECTED_KEYS = [
    "enabled", "autoSend", "owedCents", "deliveredThisWeek",
    "nextChargeAt", "currency", "held", "active", "restLat", "restLng",
  ];
  const missingKeys = EXPECTED_KEYS.filter((k) => !opsResult.keys.includes(k));
  const check3Pass = opsResult.status === 200 && missingKeys.length === 0 &&
    Array.isArray(opsResult.body.held) && Array.isArray(opsResult.body.active) &&
    typeof opsResult.body.owedCents === "number" &&
    typeof opsResult.body.currency === "string";

  // ── Check 4: Account tab — toggles + billing ──────────────────────────────
  // Click the second nav button (Account).
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav.fixed button"));
    (btns[1] as HTMLButtonElement)?.click();
  });
  await page.waitForTimeout(1_500);

  // Screenshot 3: account tab
  screenshots.push(await snap(page, "14-restaurant-account.png"));

  const switchCount = await page.evaluate(() =>
    document.querySelectorAll("[role='switch']").length
  );
  const accountText = await page.evaluate(() => document.body.innerText);
  // Check billing fields are rendered.  Keys come from the PLATFORM_CURRENCY
  // (formatCurrency) output — USD format is "$0.00".
  const hasBillingText =
    /\$[\d,]+\.\d{2}/.test(accountText) ||  // e.g. "$0.00" or "$7.99"
    /owed|this week|next charge/i.test(accountText);
  const check4Pass = switchCount >= 2 && hasBillingText;

  // ── Check 5: Deliveries + Drivers NOT in nav (absent, never dead) ─────────
  const navLabels: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("nav.fixed button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
  });
  const hasDeliveriesOrDriversTab = navLabels.some((l) =>
    /Deliveries|Drivers/i.test(l)
  );
  // Phase 6 R1: exactly 2 tabs — Dispatch + Account.  Deliveries/Drivers are
  // absent (per plan §7 "your call" clause), which satisfies the "never a blank
  // screen" requirement since they cannot be reached.
  const check5Pass = tabCount === 2 && !hasDeliveriesOrDriversTab;

  // ── Check 6: No per-tab intervals beyond the ops poll ─────────────────────
  // Switch back to Dispatch, then observe the network for ~15 s (~1.5 cycles).
  // Reset the counters captured before navigation for a clean window.
  const preCounts = { ...apiRequestCounts };
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav.fixed button"));
    (btns[0] as HTMLButtonElement)?.click();
  });
  const windowCounts: Record<string, number> = {};
  const onRequest = (req: any) => {
    try {
      const u = new URL(req.url());
      if (u.pathname.startsWith("/api/")) {
        windowCounts[u.pathname] = (windowCounts[u.pathname] ?? 0) + 1;
      }
    } catch { /* ignore */ }
  };
  page.on("request", onRequest);
  await page.waitForTimeout(15_000);
  page.off("request", onRequest);

  // The ops poll fires once in the first 10s, possibly twice in 15s (ok).
  // No other API should appear more than once.
  const extras = Object.entries(windowCounts)
    .filter(([k, n]) => !k.includes("/ops") && n > 1);
  const check6Pass = extras.length === 0;

  // Screenshot 4: final state after observation window
  screenshots.push(await snap(page, "14-restaurant-final.png"));

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────────────
  const checks = [
    {
      name: "1. Dark shell (bg-gray-900, BottomNav, no old light panel)",
      pass: check1Pass,
      note: `darkContainer=${darkContainerExists} bottomNav=${bottomNavExists} oldLightPanel=${oldLightPanel}`,
    },
    {
      name: "2. Dispatch default, held + active rows visible, held-count badge",
      pass: check2Pass,
      note: `tabCount=${tabCount} activeTab="${activeTabLabel}" heldBadge="${heldBadge}" hasHeld=${hasHeld} hasActive=${hasActive}`,
    },
    {
      name: "3. GET /ops → 200 with all expected payload keys",
      pass: check3Pass,
      note: `status=${opsResult.status} missing=[${missingKeys.join(",") || "none"}] held.len=${opsResult.body.held?.length ?? "?"} active.len=${opsResult.body.active?.length ?? "?"}`,
    },
    {
      name: "4. Account tab: ≥2 switches + billing summary (PLATFORM_CURRENCY)",
      pass: check4Pass,
      note: `switchCount=${switchCount} hasBillingText=${hasBillingText}`,
    },
    {
      name: "5. Deliveries + Drivers absent from nav (not dead blank screen)",
      pass: check5Pass,
      note: `navTabs=[${navLabels.join(" | ")}] hasDeliveriesOrDriversTab=${hasDeliveriesOrDriversTab}`,
    },
    {
      name: "6. No per-tab intervals beyond single 10 s ops poll",
      pass: check6Pass,
      note: `window=[${Object.entries(windowCounts).map(([k, n]) => `${k}×${n}`).join(",")}] extras=[${extras.map(([k, n]) => `${k}×${n}`).join(",") || "none"}]`,
    },
  ];

  console.log("\n=== Phase 6 Restaurant Shell — E2E Verification ===");
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    console.log(`       ${c.note}`);
    if (!c.pass) failed++;
  }
  console.log(`\nScreenshots → ${OUT_DIR}`);
  screenshots.forEach((s) => console.log(`  ${s}`));
  console.log(`\n${failed === 0 ? "ALL 6 CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
