/**
 * DEV-ONLY: E2E verification for v1.1 Phase 8 — Drivers tab + restaurant
 * rating write path (plan §4.4).
 *
 * API checks (fetch + minted admin session cookie):
 *   A1. GET /drivers → 200; demo driver row has phone + deliveriesForYou≥1 +
 *       lastDeliveredAt; zero-runs home-store driver appears with
 *       deliveriesForYou=0, isHomeStore=true, isActive=false, myRating=null
 *   A2. GET /deliveries?driverId= filter returns only that driver's rows;
 *       malformed driverId → 400
 *   A3. POST /feedback happy path → ok:true + numeric ratingPct
 *   A4. Re-submit with different stars → SAME single DB row updated
 *       (upsert, no duplicate) AND driver.ratingPct visibly moves
 *   A5. POST on a non-terminal assignment → 400 not_terminal
 *   A6. POST on a nonexistent/foreign assignment id → 404
 *   A7. stars 0 / 6 / 2.5 → 400 bad_stars; comment >500 → 400 bad_comment
 *   A8. No session → 401 on GET /drivers and POST /feedback
 *   A9. GET /deliveries/[id] → canRate:true + myFeedback prefill +
 *       driver.phone present (Phase 8 additions)
 *
 * Browser checks (390×844):
 *   B1. Nav has 4 tabs: Dispatch / Deliveries / Drivers / Account
 *   B2. Drivers tab renders driver cards (demo driver + zero-runs driver)
 *   B3. Tapping a card opens the driver sheet (phone subtitle + recent
 *       deliveries for this restaurant)
 *   B4. Rating from the delivery detail overlay UI: tap a star → submit →
 *       "Rating saved" confirmation; DB row reflects the UI-chosen stars
 *
 * Seeding (idempotent, tagged playseed@phase8.local, wipes own rows):
 *   • 1 delivered assignment (rateable) + 1 picked_up assignment (not)
 *   • zero-runs inactive home-store driver zero@phase8.local
 *   • all restaurant-source DriverFeedback for the demo restaurant wiped
 *     so myRating assertions start clean
 * Requires demo driver (driver@demo.com) + dev server on :3001.
 * Refuses PROD (dawn-tree guard).
 * Screenshots → store-assets/phase8-screenshots/
 *
 * npx tsx scripts/_verify-phase8-drivers.ts
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
const SEED_EMAIL = "playseed@phase8.local";
const ZERO_DRIVER_EMAIL = "zero@phase8.local";
const OUT_DIR = resolve("store-assets/phase8-screenshots");

type Check = { name: string; pass: boolean; note: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, note: string) {
  checks.push({ name, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`       ${note}`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(dbUrl)) throw new Error("PROD url — dev-only, aborting.");
  if (!SECRET) throw new Error("NEXTAUTH_SECRET not set.");
  mkdirSync(OUT_DIR, { recursive: true });

  // ── 1. DB setup ─────────────────────────────────────────────────────────
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: dbUrl }),
  } as any);

  const pizzaR = await prisma.restaurant.findFirst({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, lat: true, lng: true },
  });
  if (!pizzaR) throw new Error("demo-pizza-palace not found — run seed scripts first.");

  let owner = await prisma.user.findFirst({
    where: { email: "owner@pizzapalace.com" },
    select: {
      id: true, email: true, name: true, role: true, restaurantId: true,
      restaurant: { select: { slug: true } },
    },
  });
  if (!owner?.restaurantId) {
    owner = await prisma.user.findFirst({
      where: { restaurantId: pizzaR.id, role: { in: ["admin", "owner"] } },
      select: {
        id: true, email: true, name: true, role: true, restaurantId: true,
        restaurant: { select: { slug: true } },
      },
    });
  }
  if (!owner?.restaurantId) throw new Error("No admin user for demo-pizza-palace.");
  console.log(`owner  ${owner.email} → restaurant ${owner.restaurantId}`);

  const driver = await prisma.driver.findUnique({
    where: { email: "driver@demo.com" },
    select: { id: true, name: true, passwordHash: true },
  });
  if (!driver) throw new Error("Demo driver not found — run scripts/_create-demo-driver.ts");
  // Phone must be set for the tap-to-call assertions; home store = demo
  // restaurant so isHomeStore lands true for the main card.
  await prisma.driver.update({
    where: { id: driver.id },
    data: { phone: "+12895550999", homeRestaurantId: pizzaR.id, isActive: true },
  });
  console.log(`driver ${driver.id} (${driver.name}) phone+home set`);

  // Zero-runs inactive home-store driver — exercises the home-store union
  // branch (appears with 0 deliveries) + the Inactive chip.
  const staleZero = await prisma.driver.findUnique({
    where: { email: ZERO_DRIVER_EMAIL }, select: { id: true },
  });
  if (staleZero) {
    await prisma.driverFeedback.deleteMany({ where: { driverId: staleZero.id } });
    await prisma.deliveryAssignment.deleteMany({ where: { driverId: staleZero.id } });
    await prisma.driver.delete({ where: { id: staleZero.id } });
  }
  const zeroDriver = await prisma.driver.create({
    data: {
      email: ZERO_DRIVER_EMAIL,
      name: "ZeroRuns Z.",
      passwordHash: driver.passwordHash,
      homeRestaurantId: pizzaR.id,
      isActive: false,
      phone: null,
    },
    select: { id: true, name: true },
  });

  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId: pizzaR.id },
    create: { restaurantId: pizzaR.id, enabled: true, autoSend: false },
    update: { enabled: true, autoSend: false },
  });

  // ── 2. Wipe own seed rows + restaurant-source feedback (clean slate) ─────
  await prisma.driverFeedback.deleteMany({
    where: { restaurantId: pizzaR.id, source: "restaurant" },
  });
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
  }

  const rLat = pizzaR.lat ?? 43.5183;
  const rLng = pizzaR.lng ?? -79.8774;
  const now = Date.now();

  // ── 3. Seed: 1 delivered (rateable) + 1 picked_up (not rateable) ─────────
  const deliveredAt = new Date(now - 3 * 3_600_000);
  const compOrder = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id, orderNumber: "P8C01", status: "completed",
      type: "delivery", customerName: "RateMe D.", customerEmail: SEED_EMAIL,
      customerPhone: "+12895550801", deliveryAddress: "12 Rating Rd",
      deliveryCity: "Milton", deliveryZip: "L9T 1B1",
      deliveryLat: rLat + 0.01, deliveryLng: rLng + 0.01,
      subtotal: 20, total: 24, tip: 3, paymentStatus: "paid", paymentMethod: "card",
    },
    select: { id: true },
  });
  const compAssign = await prisma.deliveryAssignment.create({
    data: {
      orderId: compOrder.id, restaurantId: pizzaR.id, driverId: driver.id,
      status: "delivered",
      assignedAt: new Date(deliveredAt.getTime() - 50 * 60_000),
      acceptedAt: new Date(deliveredAt.getTime() - 45 * 60_000),
      startedAt: new Date(deliveredAt.getTime() - 30 * 60_000),
      pickedUpAt: new Date(deliveredAt.getTime() - 15 * 60_000),
      deliveredAt, completedAt: deliveredAt,
      platformFeeCents: 799, customerFeeChargedCents: 799,
    },
    select: { id: true },
  });
  const activeOrder = await prisma.order.create({
    data: {
      restaurantId: pizzaR.id, orderNumber: "P8A01", status: "accepted",
      type: "delivery", customerName: "StillMoving D.", customerEmail: SEED_EMAIL,
      customerPhone: "+12895550802", deliveryAddress: "34 Transit Way",
      deliveryCity: "Milton", deliveryZip: "L9T 2C2",
      deliveryLat: rLat + 0.02, deliveryLng: rLng - 0.01,
      subtotal: 15, total: 18, tip: 2, paymentStatus: "paid", paymentMethod: "card",
    },
    select: { id: true },
  });
  const activeAssign = await prisma.deliveryAssignment.create({
    data: {
      orderId: activeOrder.id, restaurantId: pizzaR.id, driverId: driver.id,
      status: "picked_up",
      assignedAt: new Date(now - 900_000), acceptedAt: new Date(now - 840_000),
      startedAt: new Date(now - 600_000), pickedUpAt: new Date(now - 300_000),
    },
    select: { id: true },
  });
  console.log(`seeded: delivered=${compAssign.id} active=${activeAssign.id}`);

  // ── 4. Mint admin session ────────────────────────────────────────────────
  const adminJwt = await encode({
    token: {
      sub: owner.id, name: owner.name ?? owner.email, email: owner.email,
      role: owner.role, restaurantId: owner.restaurantId ?? undefined,
      restaurantSlug: owner.restaurant?.slug ?? undefined,
    },
    secret: SECRET,
  });
  const COOKIE = `next-auth.session-token=${adminJwt}`;
  const api = (path: string, init?: RequestInit) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Cookie: COOKIE,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  // ── A1. GET /drivers shape ────────────────────────────────────────────────
  const dRes = await api("/api/admin/feefree-delivery/drivers");
  const dBody = await dRes.json();
  const rows: any[] = dBody.drivers ?? [];
  const demoRow = rows.find((r) => r.id === driver.id);
  const zeroRow = rows.find((r) => r.id === zeroDriver.id);
  check(
    "A1. GET /drivers: demo driver + zero-runs home-store driver, right fields",
    dRes.status === 200 &&
      !!demoRow && demoRow.phone === "+12895550999" &&
      demoRow.deliveriesForYou >= 1 && demoRow.lastDeliveredAt !== null &&
      demoRow.isHomeStore === true && demoRow.myRating === null &&
      !!zeroRow && zeroRow.deliveriesForYou === 0 &&
      zeroRow.isHomeStore === true && zeroRow.isActive === false &&
      zeroRow.myRating === null,
    `status=${dRes.status} demoRow=${JSON.stringify(demoRow)} zeroRow=${JSON.stringify(zeroRow)}`,
  );

  // ── A2. deliveries?driverId= filter ──────────────────────────────────────
  const fRes = await api(
    `/api/admin/feefree-delivery/deliveries?driverId=${encodeURIComponent(driver.id)}`,
  );
  const fBody = await fRes.json();
  const fRows: any[] = fBody.rows ?? [];
  const allDemo = fRows.length >= 1 && fRows.every((r) => r.driver?.name === driver.name);
  const hasPhoneInList = fRows.some((r) => r.driver?.phone === "+12895550999");
  const badRes = await api("/api/admin/feefree-delivery/deliveries?driverId=bad*id!");
  check(
    "A2. ?driverId= filter: only that driver's rows (+phone); malformed → 400",
    fRes.status === 200 && allDemo && hasPhoneInList && badRes.status === 400,
    `status=${fRes.status} rows=${fRows.length} allDemo=${allDemo} phone=${hasPhoneInList} bad=${badRes.status}`,
  );

  // ── A3. POST /feedback happy path ────────────────────────────────────────
  const p1 = await api("/api/admin/feefree-delivery/feedback", {
    method: "POST",
    body: JSON.stringify({ assignmentId: compAssign.id, stars: 5, comment: "Great run" }),
  });
  const p1Body = await p1.json();
  check(
    "A3. POST /feedback (5★) → ok + numeric ratingPct",
    p1.status === 200 && p1Body.ok === true && typeof p1Body.ratingPct === "number",
    `status=${p1.status} body=${JSON.stringify(p1Body)}`,
  );
  const ratingPct1 = p1Body.ratingPct;

  // ── A4. Re-submit different stars → same row updated + rating moves ──────
  const p2 = await api("/api/admin/feefree-delivery/feedback", {
    method: "POST",
    body: JSON.stringify({ assignmentId: compAssign.id, stars: 1, comment: null }),
  });
  const p2Body = await p2.json();
  const fbRows = await prisma.driverFeedback.findMany({
    where: { assignmentId: compAssign.id, source: "restaurant" },
    select: { stars: true, comment: true },
  });
  check(
    "A4. Re-submit (1★) → ONE row, stars updated, ratingPct visibly moved",
    p2.status === 200 && fbRows.length === 1 && fbRows[0].stars === 1 &&
      fbRows[0].comment === null && typeof p2Body.ratingPct === "number" &&
      p2Body.ratingPct !== ratingPct1,
    `status=${p2.status} rows=${fbRows.length} stars=${fbRows[0]?.stars} pct1=${ratingPct1} pct2=${p2Body.ratingPct}`,
  );

  // ── A5–A7. Rejection paths ───────────────────────────────────────────────
  const nt = await api("/api/admin/feefree-delivery/feedback", {
    method: "POST",
    body: JSON.stringify({ assignmentId: activeAssign.id, stars: 5 }),
  });
  const ntBody = await nt.json();
  check(
    "A5. Non-terminal assignment → 400 not_terminal",
    nt.status === 400 && ntBody.error === "not_terminal",
    `status=${nt.status} body=${JSON.stringify(ntBody)}`,
  );

  const nf = await api("/api/admin/feefree-delivery/feedback", {
    method: "POST",
    body: JSON.stringify({ assignmentId: "nope_does_not_exist_123", stars: 5 }),
  });
  check("A6. Nonexistent/foreign assignment → 404", nf.status === 404, `status=${nf.status}`);

  const starTests = await Promise.all(
    [0, 6, 2.5].map((s) =>
      api("/api/admin/feefree-delivery/feedback", {
        method: "POST",
        body: JSON.stringify({ assignmentId: compAssign.id, stars: s }),
      }).then((r) => r.status),
    ),
  );
  const longComment = await api("/api/admin/feefree-delivery/feedback", {
    method: "POST",
    body: JSON.stringify({ assignmentId: compAssign.id, stars: 5, comment: "x".repeat(501) }),
  });
  check(
    "A7. stars 0/6/2.5 → 400 ×3; comment 501 chars → 400",
    starTests.every((s) => s === 400) && longComment.status === 400,
    `stars=[${starTests.join(",")}] comment=${longComment.status}`,
  );

  // ── A8. No session → 401 ─────────────────────────────────────────────────
  const anonG = await fetch(`${BASE}/api/admin/feefree-delivery/drivers`);
  const anonP = await fetch(`${BASE}/api/admin/feefree-delivery/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentId: compAssign.id, stars: 5 }),
  });
  check(
    "A8. No session → 401 on GET /drivers + POST /feedback",
    anonG.status === 401 && anonP.status === 401,
    `get=${anonG.status} post=${anonP.status}`,
  );

  // ── A9. Detail payload: canRate + myFeedback + driver.phone ──────────────
  const det = await api(`/api/admin/feefree-delivery/deliveries/${compAssign.id}`);
  const detBody = await det.json();
  check(
    "A9. GET /deliveries/[id]: canRate + myFeedback prefill + driver.phone",
    det.status === 200 && detBody.canRate === true &&
      detBody.myFeedback?.stars === 1 && detBody.myFeedback?.comment === null &&
      detBody.driver?.phone === "+12895550999",
    `status=${det.status} canRate=${detBody.canRate} myFeedback=${JSON.stringify(detBody.myFeedback)} phone=${detBody.driver?.phone}`,
  );

  await prisma.$disconnect();

  // ── 5. Browser ────────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = `
      nextjs-portal, [data-next-badge-root], [data-next-badge],
      [data-nextjs-toast], #__next-dev-tools-indicator,
      [data-nextjs-dev-tools-button] { display: none !important; }
    `;
    document.head?.appendChild(css);
  });
  await ctx.addCookies([
    {
      name: "next-auth.session-token", value: adminJwt, domain: "localhost",
      path: "/", httpOnly: true, sameSite: "Lax" as const,
    },
    {
      name: "ffd-role-pref", value: "restaurant", domain: "localhost",
      path: "/", httpOnly: false, sameSite: "Lax" as const,
    },
  ]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/driver`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3_000);

  // ── B1. 4-tab nav ─────────────────────────────────────────────────────────
  const navLabels: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("nav.fixed button")).map(
      (b) => b.textContent?.trim() ?? "",
    ),
  );
  check(
    "B1. Nav: Dispatch / Deliveries / Drivers / Account (4 tabs)",
    navLabels.length === 4 && /drivers/i.test(navLabels[2] ?? ""),
    `labels=[${navLabels.join(" | ")}]`,
  );

  // ── B2. Drivers tab renders cards ─────────────────────────────────────────
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav.fixed button"));
    (btns[2] as HTMLButtonElement)?.click();
  });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${OUT_DIR}/16-drivers-tab.png` });
  const driversText = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    return mains[0]?.innerText ?? "";
  });
  check(
    "B2. Drivers tab: demo driver card + zero-runs card + Inactive chip",
    driversText.includes(driver.name) && driversText.includes(zeroDriver.name) &&
      /Inactive/i.test(driversText) && /delivery for you|deliveries for you/i.test(driversText),
    `text=${driversText.replace(/\s+/g, " ").slice(0, 300)}`,
  );

  // ── B3. Driver sheet: phone subtitle + recent deliveries ─────────────────
  await page.evaluate((driverName: string) => {
    const mains = Array.from(document.querySelectorAll("main")).filter(
      (m) => (m as HTMLElement).offsetParent !== null,
    );
    const cards = Array.from(mains[0]?.querySelectorAll('[role="button"]') ?? []);
    const target = cards.find((c) => (c as HTMLElement).innerText.includes(driverName));
    (target as HTMLElement)?.click();
  }, driver.name);
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${OUT_DIR}/16-driver-sheet.png` });
  const sheetText = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"));
    return overlays.length
      ? (overlays[overlays.length - 1] as HTMLElement).innerText
      : "";
  });
  check(
    "B3. Driver sheet: phone + recent deliveries list with seeded row",
    sheetText.includes("+12895550999") && /RateMe D\./i.test(sheetText),
    `sheet=${sheetText.replace(/\s+/g, " ").slice(0, 300)}`,
  );

  // ── B4. Rate from the delivery detail overlay UI ──────────────────────────
  // Tap the seeded delivered row inside the sheet → shell detail overlay
  // stacks on top (later in DOM).
  await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"));
    const sheet = overlays[overlays.length - 1] as HTMLElement | undefined;
    if (!sheet) return;
    const rows = Array.from(sheet.querySelectorAll("button"));
    const target = rows.find((b) => /RateMe D\./i.test((b as HTMLElement).innerText));
    (target as HTMLButtonElement)?.click();
  });
  await page.waitForTimeout(3_000);

  // Star 4 via aria-label ("4 stars"), then submit (Update rating — a
  // rating already exists from A3/A4), then wait for "Rating saved".
  const uiRate = await page.evaluate(async () => {
    const overlays = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"));
    const detail = overlays[overlays.length - 1] as HTMLElement | undefined;
    if (!detail) return { ok: false, step: "no-detail-overlay" };
    const star = detail.querySelector('button[aria-label="4 stars"]') as HTMLButtonElement | null;
    if (!star) return { ok: false, step: "no-star-button" };
    star.click();
    await new Promise((r) => setTimeout(r, 300));
    const submit = Array.from(detail.querySelectorAll("button")).find((b) =>
      /Submit rating|Update rating/i.test((b as HTMLElement).innerText),
    ) as HTMLButtonElement | undefined;
    if (!submit) return { ok: false, step: "no-submit-button" };
    submit.click();
    return { ok: true, step: "submitted" };
  });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${OUT_DIR}/16-rate-saved.png` });
  const savedText = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"));
    return overlays.length
      ? (overlays[overlays.length - 1] as HTMLElement).innerText
      : "";
  });
  const prisma2 = new PrismaClient({
    adapter: new PrismaPg({ connectionString: dbUrl }),
  } as any);
  const finalRows = await prisma2.driverFeedback.findMany({
    where: { assignmentId: compAssign.id, source: "restaurant" },
    select: { stars: true },
  });
  await prisma2.$disconnect();
  check(
    "B4. UI rating: 4★ submit → 'Rating saved' + single DB row stars=4",
    uiRate.ok && /Rating saved/i.test(savedText) &&
      finalRows.length === 1 && finalRows[0].stars === 4,
    `uiRate=${JSON.stringify(uiRate)} savedVisible=${/Rating saved/i.test(savedText)} rows=${finalRows.length} stars=${finalRows[0]?.stars}`,
  );

  await browser.close();

  // ── Report ────────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n=== Phase 8 Drivers tab + rating — E2E ===`);
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}\n       ${c.note}`);
  console.log(`\nScreenshots → ${OUT_DIR}`);
  console.log(failed.length === 0 ? "ALL CHECKS PASS" : `${failed.length} CHECK(S) FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
