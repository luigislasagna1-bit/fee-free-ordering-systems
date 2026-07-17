/**
 * DEV-ONLY end-to-end verification for the driver History tab (v1.1 Phase 4).
 *
 * Seeds ~35 TERMINAL DeliveryAssignments (delivered / failed / returned) for
 * the demo driver (driver@demo.com) on demo-pizza-palace in the LOCAL dev DB,
 * then drives http://localhost:3001/driver in a 390x844 mobile viewport with a
 * minted next-auth.driver-session-token cookie and asserts:
 *   1. History tab exists in the bottom nav and opens
 *   2. day-group headers render with rows under them
 *   3. 30 rows on page 1 + Load more -> remaining rows, no dupes / no gaps
 *   4. failed + returned rows show their distinct chips
 *   5. the null-city row shows NO address text (and the street address is
 *      NEVER anywhere on the page)
 *   6. row tap opens the detail overlay: timeline + money card + Late badge
 *   7. money strings carry the restaurant's currency symbol
 *
 * Seed rows are tagged customerEmail=playseed@demo.local and are WIPED at the
 * start of every run (assignments + orderItems + orders), then left in place
 * afterwards for re-runs / manual poking. Refuses to run against prod.
 *
 * Run: npx tsx scripts/_verify-driver-history.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium, type Browser, type Page } from "playwright-core";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { formatCurrency } from "../src/lib/utils";

const BASE = "http://localhost:3001";
const OUT = String.raw`C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\226c8de2-7139-4e3e-8253-79b2ca677b81\scratchpad\verify`;
const SECRET = process.env.NEXTAUTH_SECRET!;
const SEED_EMAIL = "playseed@demo.local";
// Deliberately distinctive so a single page-wide grep proves the street
// address never leaks into the History surface.
const SEED_STREET = "742 Evergreen Terrace";
const SEED_CITY = "Milton";
const TOTAL = 35; // page 1 = 30, page 2 = 5
const PAGE1 = 30;

// Special rows by seed index (0 = newest). All are inside page 1 (first 30).
const FAILED_IDX = new Set([2, 8]);
const RETURNED_IDX = new Set([11]);
const NULLCITY_IDX = 5; // delivered, deliveryCity = null
const LATE_IDX = 3; // delivered 25 min after estimatedReady (grace is 10)
const TIPS = [0, 2.5, 3.75, 5.0, 1.25];

const num = (i: number) => `H${String(i + 1).padStart(2, "0")}`;

async function main() {
  if (!SECRET) throw new Error("No NEXTAUTH_SECRET");
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url (dawn-tree) — dev-only, aborting.");
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  // --- Driver + restaurant ---
  const driver = await prisma.driver.findUnique({
    where: { email: "driver@demo.com" },
    select: { id: true, name: true, email: true },
  });
  if (!driver) throw new Error("demo driver not found — run _create-demo-driver.ts first");
  const rest = await prisma.restaurant.findFirst({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, name: true, currency: true, lat: true, lng: true },
  });
  if (!rest) throw new Error("demo-pizza-palace not found");
  const rLat = rest.lat ?? 43.5183;
  const rLng = rest.lng ?? -79.8774;
  if (rest.lat == null || rest.lng == null) {
    await prisma.restaurant.update({ where: { id: rest.id }, data: { lat: rLat, lng: rLng } });
  }
  const currency = rest.currency || "usd";
  // The symbol formatCurrency renders for this currency (strip digits/seps).
  const symbol = formatCurrency(0, currency).replace(/[\d.,\s ]/g, "");

  // --- Wipe our own prior seed rows (assignments -> items -> orders) ---
  const stale = await prisma.order.findMany({ where: { customerEmail: SEED_EMAIL }, select: { id: true } });
  if (stale.length) {
    const ids = stale.map((o: { id: string }) => o.id);
    await prisma.deliveryAssignment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`wiped ${ids.length} prior ${SEED_EMAIL} orders (+assignments/items)`);
  }
  // Determinism guard: any OTHER terminal history rows for this driver (from
  // older ad-hoc seeds) would break the exact 30/35 page math — drop those
  // assignment rows too (local dev only; their orders are left alone).
  const extras = await prisma.deliveryAssignment.deleteMany({
    where: {
      driverId: driver.id,
      status: { in: ["delivered", "failed", "returned"] },
      completedAt: { not: null },
    },
  });
  if (extras.count) console.log(`removed ${extras.count} non-seed terminal assignments for the demo driver`);

  // --- Seed 35 terminal runs spread across ~8 days (several per day) ---
  const now = Date.now();
  const H = 3600_000;
  const seeded: { orderNumber: string; status: string }[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const status = FAILED_IDX.has(i) ? "failed" : RETURNED_IDX.has(i) ? "returned" : "delivered";
    const completedAt = new Date(now - 3 * H - i * 5.5 * H); // ~4 rows/day
    const tip = TIPS[i % TIPS.length];
    const total = Math.round((18 + (i % 9) * 2.75 + tip) * 100) / 100;
    const isLate = i === LATE_IDX;
    const order = await prisma.order.create({
      data: {
        restaurantId: rest.id,
        orderNumber: num(i),
        status: "completed",
        type: "delivery",
        customerName: `Seed Customer ${i + 1}`,
        customerEmail: SEED_EMAIL,
        customerPhone: "+12895551234",
        deliveryAddress: SEED_STREET,
        deliveryCity: i === NULLCITY_IDX ? null : SEED_CITY,
        deliveryZip: i === NULLCITY_IDX ? null : "L9T 2X5",
        deliveryLat: rLat + 0.01 + (i % 7) * 0.004,
        deliveryLng: rLng - 0.008 + (i % 5) * 0.003,
        subtotal: Math.round((total - tip - 3.99) * 100) / 100,
        total,
        tip,
        paymentStatus: "paid",
        paymentMethod: "card",
        // Late rule: promised = scheduledFor ?? estimatedReady; late when the
        // terminal stamp lands > 10 min past it. 25 min late on the late row;
        // everyone else has NO promised time -> never late.
        estimatedReady: isLate ? new Date(completedAt.getTime() - 25 * 60_000) : null,
        createdAt: new Date(completedAt.getTime() - 90 * 60_000),
      },
      select: { id: true },
    });
    await prisma.deliveryAssignment.create({
      data: {
        orderId: order.id,
        restaurantId: rest.id,
        driverId: driver.id,
        status,
        assignedAt: new Date(completedAt.getTime() - 55 * 60_000),
        acceptedAt: new Date(completedAt.getTime() - 50 * 60_000),
        startedAt: new Date(completedAt.getTime() - 35 * 60_000),
        pickedUpAt: new Date(completedAt.getTime() - 20 * 60_000),
        deliveredAt: status === "delivered" ? completedAt : null,
        failedAt: status === "failed" ? completedAt : null,
        returnedAt: status === "returned" ? completedAt : null,
        completedAt,
        platformFeeCents: status === "delivered" ? 799 : null,
        customerFeeChargedCents: status === "delivered" ? 799 : null,
        createdAt: new Date(completedAt.getTime() - 60 * 60_000),
      },
    });
    seeded.push({ orderNumber: num(i), status });
  }
  console.log(
    `seeded ${seeded.length} terminal assignments (delivered=${seeded.filter((s) => s.status === "delivered").length}, failed=${seeded.filter((s) => s.status === "failed").length}, returned=${seeded.filter((s) => s.status === "returned").length}) | currency=${currency} symbol="${symbol}"`,
  );

  // --- Mint the driver session (capture-play-shots cookie shape) ---
  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });
  await prisma.$disconnect();
  const dCookie = await encode({
    token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken },
    secret: SECRET,
  });

  // --- Drive the app ---
  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  }
  const results: string[] = [];
  const ok = (cond: boolean, label: string) => {
    results.push(`${cond ? "PASS" : "FAIL"}  ${label}`);
    if (!cond) process.exitCode = 1;
  };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(["geolocation"], { origin: BASE });
  await ctx.setGeolocation({ latitude: rLat + 0.01, longitude: rLng });
  await ctx.addCookies([
    { name: "next-auth.driver-session-token", value: dCookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const },
  ]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  // (1) History tab in the bottom nav
  const historyTab = page.locator("nav button", { hasText: "History" });
  const tabCount = await historyTab.count();
  ok(tabCount === 1, `History tab present in bottom nav (found ${tabCount})`);
  if (tabCount !== 1) throw new Error("no History tab — aborting the rest");
  await historyTab.click();
  // Wait for the history list (visible main with row buttons) — the tab shows
  // a spinner div (no <main>) while page 1 loads.
  await page
    .waitForFunction(
      () => {
        const mains = [...document.querySelectorAll("main")].filter((m) => (m as HTMLElement).offsetParent !== null);
        return mains.some((m) => m.querySelectorAll("button.w-full.text-left").length > 0);
      },
      { timeout: 20000 },
    )
    .catch(async () => {
      await page.screenshot({ path: `${OUT}\\11-history-0-debug.png`, fullPage: true });
      const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 600));
      console.log(`DEBUG body text: ${body}`);
    });
  await page.waitForTimeout(1000);

  // Everything below reads the VISIBLE main (the hidden Jobs tab stays in the
  // DOM, so selectors must be scoped to offsetParent !== null).
  const readList = (p: Page) =>
    p.evaluate(() => {
      const mains = [...document.querySelectorAll("main")].filter((m) => (m as HTMLElement).offsetParent !== null);
      const main = mains[0];
      if (!main) return null;
      const rowBtns = [...main.querySelectorAll("button.w-full.text-left")] as HTMLElement[];
      const rows = rowBtns.map((b) => ({
        num: (b.innerText.match(/#(H\d+)/) || [])[1] ?? null,
        text: b.innerText.replace(/\s+/g, " "),
      }));
      const headers = ([...main.querySelectorAll("section > h2")] as HTMLElement[]).map((h) => ({
        label: h.innerText,
        rowsUnder: h.parentElement ? h.parentElement.querySelectorAll("button.w-full.text-left").length : 0,
      }));
      const loadMoreBtn = [...main.querySelectorAll("button")].find((b) => /Load more/i.test((b as HTMLElement).innerText));
      return { rows, headers, hasLoadMore: !!loadMoreBtn, pageText: main.innerText.replace(/\s+/g, " ") };
    });

  const p1 = await readList(page);
  ok(!!p1, "History list rendered (visible main found)");
  if (!p1) throw new Error("no visible main after opening History");

  // (2) day-group headers with rows under them
  ok(p1.headers.length >= 3, `day-group headers render (${p1.headers.length} groups across days)`);
  ok(p1.headers.every((h) => h.rowsUnder > 0), `every day-group header has rows under it (${p1.headers.map((h) => h.rowsUnder).join(",")})`);

  // (3a) first page = 30 rows + Load more
  ok(p1.rows.length === PAGE1, `first page shows exactly ${PAGE1} rows (got ${p1.rows.length})`);
  ok(p1.hasLoadMore, "Load more button present after page 1");
  const p1Nums = p1.rows.map((r) => r.num);
  const expectedP1 = new Set(Array.from({ length: PAGE1 }, (_, i) => num(i)));
  ok(
    p1Nums.every((n) => n && expectedP1.has(n)) && new Set(p1Nums).size === PAGE1,
    `page 1 = the 30 NEWEST rows ${num(0)}..${num(PAGE1 - 1)}, all unique`,
  );
  await page.screenshot({ path: `${OUT}\\11-history-1-page1.png`, fullPage: true });

  // (3b) Load more -> remaining rows, no dupes, no gaps
  await page.locator("main:visible button", { hasText: "Load more" }).click();
  await page.waitForTimeout(3000);
  const p2 = await readList(page);
  if (!p2) throw new Error("visible main vanished after Load more");
  const allNums = p2.rows.map((r) => r.num);
  const expectedAll = seeded.map((s) => s.orderNumber);
  const uniq = new Set(allNums);
  ok(p2.rows.length === TOTAL, `after Load more: ${TOTAL} rows total (got ${p2.rows.length})`);
  ok(uniq.size === allNums.length, `NO duplicate rows across pages (${allNums.length} rows, ${uniq.size} unique)`);
  const missing = expectedAll.filter((n) => !uniq.has(n));
  ok(missing.length === 0, `NO gaps — every seeded order present (missing: ${missing.join(",") || "none"})`);
  ok(!p2.hasLoadMore, "Load more button gone once the list is exhausted");
  await page.screenshot({ path: `${OUT}\\11-history-2-page2.png`, fullPage: true });

  // (4) distinct chips on failed / returned rows (+ delivered control)
  const rowByNum = new Map(p2.rows.map((r) => [r.num, r.text]));
  for (const i of FAILED_IDX) {
    const txt = rowByNum.get(num(i)) ?? "";
    ok(/Failed/.test(txt) && !/Delivered|Returned/.test(txt), `failed row ${num(i)} shows the Failed chip ("${txt.slice(0, 60)}")`);
  }
  for (const i of RETURNED_IDX) {
    const txt = rowByNum.get(num(i)) ?? "";
    ok(/Returned/.test(txt) && !/Delivered|Failed/.test(txt), `returned row ${num(i)} shows the Returned chip ("${txt.slice(0, 60)}")`);
  }
  ok(/Delivered/.test(rowByNum.get(num(0)) ?? ""), `delivered row ${num(0)} shows the Delivered chip`);

  // (5) null-city row shows NO address text; street address NOWHERE on the page
  const nullCityTxt = rowByNum.get(num(NULLCITY_IDX)) ?? "";
  ok(nullCityTxt !== "" && !nullCityTxt.includes(SEED_CITY), `null-city row ${num(NULLCITY_IDX)} shows no city ("${nullCityTxt.slice(0, 70)}")`);
  ok(!p2.pageText.includes("Evergreen"), "street address never appears anywhere in the History list");
  const cityTxt = rowByNum.get(num(1)) ?? "";
  ok(cityTxt.includes(SEED_CITY), `city-bearing row ${num(1)} DOES show its city (control)`);

  // (7 – list half) money strings carry the restaurant currency symbol
  const totalRow0 = formatCurrency(18 + (0 % 9) * 2.75 + TIPS[0], currency);
  ok((rowByNum.get(num(0)) ?? "").includes(symbol), `row money uses the "${symbol}" symbol (currency=${currency})`);
  ok((rowByNum.get(num(0)) ?? "").includes(totalRow0), `row ${num(0)} shows its exact formatted total (${totalRow0})`);

  // (6) tap the LATE delivered row -> detail overlay: timeline + money + Late badge
  await page.locator(`main:visible button.w-full.text-left`, { hasText: `#${num(LATE_IDX)}` }).click();
  await page.waitForTimeout(1500);
  const detail = await page.evaluate(() => {
    const ov = document.querySelector("div.fixed.inset-0.z-40") as HTMLElement | null;
    return ov ? ov.innerText.replace(/\s+/g, " ") : null;
  });
  ok(!!detail, "detail overlay opens on row tap");
  const d = detail ?? "";
  ok(d.includes(`#${num(LATE_IDX)}`) && d.includes(rest.name), "overlay header shows order # + restaurant");
  ok(/Accepted/.test(d) && /Started driving/.test(d) && /Picked up/.test(d) && /Delivered/.test(d), "timeline renders all four stages");
  ok(/\bLate\b/.test(d) && !/On time/.test(d), "late delivered row shows the Late badge (not On time)");
  const lateTip = TIPS[LATE_IDX % TIPS.length];
  const lateTotal = formatCurrency(18 + (LATE_IDX % 9) * 2.75 + lateTip, currency);
  ok(d.includes("Total") && d.includes(lateTotal), `money card shows Total ${lateTotal}`);
  ok(d.includes("Tip") && d.includes(formatCurrency(lateTip, currency)), `money card shows Tip ${formatCurrency(lateTip, currency)}`);
  ok(d.includes(symbol), `overlay money uses the "${symbol}" symbol`);
  ok(!d.includes("Evergreen"), "street address never appears in the detail overlay");
  await page.screenshot({ path: `${OUT}\\11-history-3-detail.png`, fullPage: true });

  await ctx.close();
  await browser.close();
  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots -> ${OUT}\\11-history-*.png`);
  console.log("Seed rows LEFT IN PLACE (local dev) for re-runs.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
