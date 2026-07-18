/**
 * DEV-ONLY end-to-end verification for the driver Earnings tab (v1.1 Phase 5).
 *
 * Seeds DELIVERED DeliveryAssignments for the demo driver (driver@demo.com)
 * across TWO restaurants with DIFFERENT currencies (demo-pizza-palace = usd,
 * fee-free-demo-restaurant temporarily flipped to eur and RESTORED at the
 * end), spread over today / earlier this week / last week / one 40 days old,
 * then drives http://localhost:3001/driver at 390x844 with a minted
 * next-auth.driver-session-token cookie and asserts:
 *   1. Earnings tab exists in the bottom nav and opens
 *   2. Today: correct delivery count + TWO SEPARATE per-currency tip lines
 *      ($ and € both present, NO cross-currency combined figure)
 *   3. Active time == the seeded accepted→delivered spans (h/m rendering)
 *   4. This week / Last week pills change counts to the exact expected values
 *   5. daily breakdown rows appear on the week views (with per-currency tips)
 *   6. the 40-day-old row never appears in any period (and a >35-day API
 *      range is rejected with 400)
 *   7. HelpTip ⓘ present on the Active time tile (opens a tooltip)
 *   +  direct API check: per-row groups, activeSeconds, and late=1 for the
 *      seeded late row (grace mirror sanity)
 *
 * Seed rows are tagged customerEmail=playseed@demo.local, WIPED at the start
 * of every run and left in place afterwards for manual poking. Refuses to
 * run against prod (dawn-tree). NOTE: the start-of-run wipe also clears the
 * _verify-driver-history.ts seed (same playseed tag + terminal-assignment
 * determinism guard) — re-run that script to re-seed History.
 *
 * Run: npx tsx scripts/_verify-driver-earnings.ts
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
const EUR_SLUG = "fee-free-demo-restaurant";
const USD_SLUG = "demo-pizza-palace";

/** Normalize all whitespace (incl. NBSP / narrow NBSP that Intl emits for
 *  "3,00 €") so Node-side formatCurrency strings compare equal to innerText. */
const norm = (s: string) => s.replace(/[\s  ]+/g, " ").trim();

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Mirror of DriverEarnings.activeLabel (en messages: "{m} min" / "{h}h {m}m"). */
function activeLabelFor(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

type SeedRun = {
  key: string;
  slug: string; // which restaurant
  currency: string;
  deliveredAt: Date;
  tip: number;
  spanMin: number; // acceptedAt = deliveredAt - spanMin
  late?: boolean; // estimatedReady = deliveredAt - 25min (grace = 10)
};

async function main() {
  if (!SECRET) throw new Error("No NEXTAUTH_SECRET");
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url (dawn-tree) — dev-only, aborting.");
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  const results: string[] = [];
  const ok = (cond: boolean, label: string) => {
    results.push(`${cond ? "PASS" : "FAIL"}  ${label}`);
    if (!cond) process.exitCode = 1;
  };

  // --- Driver + the two restaurants ---
  const driver = await prisma.driver.findUnique({
    where: { email: "driver@demo.com" },
    select: { id: true, name: true, email: true },
  });
  if (!driver) throw new Error("demo driver not found — run _create-demo-driver.ts first");
  const usdRest = await prisma.restaurant.findFirst({
    where: { slug: USD_SLUG },
    select: { id: true, name: true, currency: true, lat: true, lng: true },
  });
  const eurRest = await prisma.restaurant.findFirst({
    where: { slug: EUR_SLUG },
    select: { id: true, name: true, currency: true },
  });
  if (!usdRest || !eurRest) throw new Error("demo restaurants not found");
  const rLat = usdRest.lat ?? 43.5183;
  const rLng = usdRest.lng ?? -79.8774;

  // --- TEMP currency flip (restored in finally, even on failure) ---
  const eurRestOriginalCurrency = eurRest.currency; // e.g. "cad"
  await prisma.restaurant.update({ where: { id: eurRest.id }, data: { currency: "eur" } });
  console.log(`flipped ${EUR_SLUG} currency ${eurRestOriginalCurrency} -> eur (will restore)`);

  let browser: Browser | null = null;
  try {
    const usdCur = usdRest.currency || "usd";
    const eurCur = "eur";
    const sym = (c: string) => formatCurrency(0, c).replace(/[\d.,\s  ]/g, "");
    const usdSym = sym(usdCur); // "$"
    const eurSym = sym(eurCur); // "€"
    if (usdSym === eurSym) throw new Error(`currencies do not differ visually (${usdSym})`);

    // --- Wipe prior playseed rows (assignments -> items -> orders) ---
    const stale = await prisma.order.findMany({ where: { customerEmail: SEED_EMAIL }, select: { id: true } });
    if (stale.length) {
      const ids = stale.map((o: { id: string }) => o.id);
      await prisma.deliveryAssignment.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      console.log(`wiped ${ids.length} prior ${SEED_EMAIL} orders (+assignments/items)`);
    }
    // Determinism guard (same as _verify-driver-history.ts): any other
    // terminal assignments for the demo driver would break exact-count math.
    const extras = await prisma.deliveryAssignment.deleteMany({
      where: { driverId: driver.id, status: { in: ["delivered", "failed", "returned"] }, completedAt: { not: null } },
    });
    if (extras.count) console.log(`removed ${extras.count} non-seed terminal assignments for the demo driver`);

    // --- Date anchors (device-local, Monday-start weeks — mirrors rangeFor) ---
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const elapsed = Math.max(now.getTime() - startOfToday.getTime(), 10 * 60_000);
    const todayAt = (f: number) => new Date(startOfToday.getTime() + elapsed * f);
    const dowFromMonday = (now.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dowFromMonday);
    const lastMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
    const dayAt = (base: Date, plusDays: number, h: number, min = 0) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + plusDays, h, min);

    const todayStr = localDateStr(now);
    const mondayStr = localDateStr(monday);
    const lastMondayStr = localDateStr(lastMonday);
    const lastSundayStr = localDateStr(dayAt(monday, -1, 0));

    // Earlier-this-week anchor: 2 days back when the week allows it, else
    // today (dynamic expectations below stay correct either way).
    const w1At =
      dowFromMonday >= 2 ? dayAt(startOfToday, -2, 12, 0) : dowFromMonday === 1 ? dayAt(startOfToday, -1, 12, 0) : todayAt(0.3);

    const RUNS: SeedRun[] = [
      // today — usd 5.00 + 2.50 (the 2.50 run is the LATE one), eur 3.00
      { key: "T1", slug: USD_SLUG, currency: usdCur, deliveredAt: todayAt(0.9), tip: 5.0, spanMin: 30 },
      { key: "T2", slug: USD_SLUG, currency: usdCur, deliveredAt: todayAt(0.7), tip: 2.5, spanMin: 45, late: true },
      { key: "T3", slug: EUR_SLUG, currency: eurCur, deliveredAt: todayAt(0.5), tip: 3.0, spanMin: 25 },
      // earlier this week — usd 4.00
      { key: "W1", slug: USD_SLUG, currency: usdCur, deliveredAt: w1At, tip: 4.0, spanMin: 40 },
      // last week — eur 2.00 + usd 1.25
      { key: "L1", slug: EUR_SLUG, currency: eurCur, deliveredAt: dayAt(lastMonday, 2, 14, 0), tip: 2.0, spanMin: 35 },
      { key: "L2", slug: USD_SLUG, currency: usdCur, deliveredAt: dayAt(lastMonday, 4, 18, 30), tip: 1.25, spanMin: 20 },
      // OUTSIDE the 35-day window — must never appear anywhere
      { key: "OLD", slug: USD_SLUG, currency: usdCur, deliveredAt: dayAt(startOfToday, -40, 15, 0), tip: 99.0, spanMin: 60 },
    ];

    // --- Seed ---
    const restBySlug: Record<string, { id: string }> = { [USD_SLUG]: usdRest, [EUR_SLUG]: eurRest };
    let n = 0;
    for (const run of RUNS) {
      n++;
      const rest = restBySlug[run.slug];
      const acceptedAt = new Date(run.deliveredAt.getTime() - run.spanMin * 60_000);
      const total = Math.round((20 + n * 2 + run.tip) * 100) / 100;
      const order = await prisma.order.create({
        data: {
          restaurantId: rest.id,
          orderNumber: `E${String(n).padStart(2, "0")}`,
          status: "completed",
          type: "delivery",
          customerName: `Earnings Seed ${n}`,
          customerEmail: SEED_EMAIL,
          customerPhone: "+12895551234",
          deliveryAddress: "12 Playseed Way",
          deliveryCity: "Milton",
          deliveryZip: "L9T 2X5",
          deliveryLat: rLat + 0.01,
          deliveryLng: rLng - 0.008,
          subtotal: Math.round((total - run.tip - 3.99) * 100) / 100,
          total,
          tip: run.tip,
          paymentStatus: "paid",
          paymentMethod: "card",
          // Late rule: promised = COALESCE(scheduledFor, estimatedReady);
          // late when delivered > promised + 10min grace. 25 min late here.
          estimatedReady: run.late ? new Date(run.deliveredAt.getTime() - 25 * 60_000) : null,
          createdAt: new Date(run.deliveredAt.getTime() - 90 * 60_000),
        },
        select: { id: true },
      });
      await prisma.deliveryAssignment.create({
        data: {
          orderId: order.id,
          restaurantId: rest.id,
          driverId: driver.id,
          status: "delivered",
          assignedAt: new Date(acceptedAt.getTime() - 5 * 60_000),
          acceptedAt,
          startedAt: new Date(acceptedAt.getTime() + 5 * 60_000),
          pickedUpAt: new Date(acceptedAt.getTime() + 10 * 60_000),
          deliveredAt: run.deliveredAt,
          completedAt: run.deliveredAt,
          platformFeeCents: 799,
          customerFeeChargedCents: 799,
          createdAt: new Date(acceptedAt.getTime() - 10 * 60_000),
        },
      });
    }
    console.log(`seeded ${RUNS.length} delivered runs (usd + eur, today/this week/last week/40d-old)`);

    // --- Expected aggregates per pill (computed from what we ACTUALLY seeded) ---
    const inRange = (r: SeedRun, from: string, to: string) => {
      const d = localDateStr(r.deliveredAt);
      return d >= from && d <= to;
    };
    const expect = (from: string, to: string) => {
      const rows = RUNS.filter((r) => inRange(r, from, to));
      const tips = new Map<string, number>();
      for (const r of rows) tips.set(r.currency, (tips.get(r.currency) ?? 0) + r.tip);
      return {
        deliveries: rows.length,
        seconds: rows.reduce((s, r) => s + r.spanMin * 60, 0),
        tips: [...tips.entries()].sort(([a], [b]) => a.localeCompare(b)),
        days: new Set(rows.map((r) => localDateStr(r.deliveredAt))).size,
      };
    };
    const expToday = expect(todayStr, todayStr);
    const expThisWeek = expect(mondayStr, todayStr);
    const expLastWeek = expect(lastMondayStr, lastSundayStr);
    // Sanity on the seed design itself:
    ok(expToday.deliveries === 3, `seed sanity: 3 runs land today (got ${expToday.deliveries})`);
    ok(expThisWeek.deliveries === 4, `seed sanity: 4 runs land this week (got ${expThisWeek.deliveries})`);
    ok(expLastWeek.deliveries === 2, `seed sanity: 2 runs land last week (got ${expLastWeek.deliveries})`);
    console.log(
      `expected — today: ${JSON.stringify(expToday)} | thisWeek: ${JSON.stringify(expThisWeek)} | lastWeek: ${JSON.stringify(expLastWeek)}`,
    );

    // --- Mint the driver session ---
    const driverSessionToken = randomUUID();
    await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });
    const dCookie = await encode({
      token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken },
      secret: SECRET,
    });

    // --- Direct API checks (row-level: groups, seconds, late, range clamp) ---
    const tzNow = new Date().getTimezoneOffset();
    const apiGet = (from: string, to: string) =>
      fetch(`${BASE}/api/driver/earnings?from=${from}&to=${to}&tz=${tzNow}`, {
        headers: { cookie: `next-auth.driver-session-token=${dCookie}` },
      });
    const wkRes = await apiGet(mondayStr, todayStr);
    ok(wkRes.ok, `API this-week responds 200 (got ${wkRes.status})`);
    const wk = (await wkRes.json()) as { rows: { day: string; currency: string; deliveries: number; tips: number; activeSeconds: number; late: number }[] };
    const wkDeliveries = wk.rows.reduce((s, r) => s + r.deliveries, 0);
    const wkSeconds = wk.rows.reduce((s, r) => s + r.activeSeconds, 0);
    const wkLate = wk.rows.reduce((s, r) => s + r.late, 0);
    const wkCurrencies = new Set(wk.rows.map((r) => r.currency));
    ok(wkDeliveries === expThisWeek.deliveries, `API this-week deliveries = ${expThisWeek.deliveries} (got ${wkDeliveries})`);
    ok(wkSeconds === expThisWeek.seconds, `API this-week activeSeconds = ${expThisWeek.seconds} (got ${wkSeconds})`);
    ok(wkLate === 1, `API this-week late count = 1 — SQL late CASE mirrors the 10-min grace (got ${wkLate})`);
    ok(wkCurrencies.has("usd") && wkCurrencies.has("eur"), `API groups by currency (got ${[...wkCurrencies].join(",")})`);
    const wideRes = await apiGet(localDateStr(dayAt(startOfToday, -41, 0)), todayStr);
    ok(wideRes.status === 400, `API rejects a >35-day range with 400 (got ${wideRes.status}) — the 40d-old row is unreachable`);

    // --- Drive the app at 390x844 ---
    try {
      browser = await chromium.launch();
    } catch {
      browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.grantPermissions(["geolocation"], { origin: BASE });
    await ctx.setGeolocation({ latitude: rLat + 0.01, longitude: rLng });
    await ctx.addCookies([
      { name: "next-auth.driver-session-token", value: dCookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const },
    ]);
    const page = await ctx.newPage();
    // tsx/esbuild runs with keep-names, which wraps named const arrows (e.g.
    // `tileByLabel` inside readEarnings) in a `__name(fn, "…")` helper call.
    // That helper is a bundler injection that doesn't exist in the browser, so
    // any evaluate carrying such a function throws `__name is not defined`.
    // Shim it as identity in every page execution context before navigation.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__name = (window as any).__name || ((fn: any) => fn);
    });
    await page.goto(`${BASE}/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    // (1) Earnings tab in the bottom nav
    const earningsTab = page.locator("nav button", { hasText: "Earnings" });
    const tabCount = await earningsTab.count();
    ok(tabCount === 1, `Earnings tab present in bottom nav (found ${tabCount})`);
    if (tabCount !== 1) throw new Error("no Earnings tab — aborting the rest");
    await earningsTab.click();

    // Read the VISIBLE main's earnings surface (hidden Jobs tab stays in DOM).
    const readEarnings = (p: Page) =>
      p.evaluate(() => {
        const mains = [...document.querySelectorAll("main")].filter((m) => (m as HTMLElement).offsetParent !== null);
        const main = mains[0];
        if (!main) return null;
        const grid = main.querySelector("section.grid");
        if (!grid) return { ready: false, pageText: main.innerText };
        const tiles = [...grid.children] as HTMLElement[];
        const tileByLabel = (label: string) => tiles.find((tl) => tl.innerText.includes(label));
        const deliveriesTile = tileByLabel("Deliveries");
        const activeTile = tileByLabel("Active time");
        const tipsTile = tileByLabel("Tips");
        const tipLines = tipsTile
          ? ([...tipsTile.querySelectorAll(".text-amber-400")] as HTMLElement[]).map((el) => el.innerText)
          : [];
        const helpBtn = activeTile?.querySelector("button[aria-label]") as HTMLElement | null;
        const breakdown = ([...main.querySelectorAll("section.space-y-2 > div")] as HTMLElement[]).map((el) =>
          el.innerText.replace(/\s+/g, " "),
        );
        const pressed = ([...main.querySelectorAll("button[aria-pressed='true']")] as HTMLElement[]).map((b) => b.innerText);
        return {
          ready: true,
          deliveries: deliveriesTile ? (deliveriesTile.querySelector(".text-2xl") as HTMLElement | null)?.innerText ?? "" : "",
          activeLabel: activeTile ? (activeTile.querySelector(".text-2xl") as HTMLElement | null)?.innerText ?? "" : "",
          tipLines,
          helpAria: helpBtn?.getAttribute("aria-label") ?? null,
          hasHelpIcon: !!activeTile?.querySelector("button svg"),
          breakdown,
          activePill: pressed[0] ?? "",
          pageText: main.innerText,
        };
      });

    const waitReady = async (expectedDeliveries: number, label: string) => {
      await page
        .waitForFunction(
          (exp) => {
            const mains = [...document.querySelectorAll("main")].filter((m) => (m as HTMLElement).offsetParent !== null);
            const main = mains[0];
            const grid = main?.querySelector("section.grid");
            if (!grid) return false;
            const tile = ([...grid.children] as HTMLElement[]).find((tl) => tl.innerText.includes("Deliveries"));
            return tile?.querySelector(".text-2xl")?.textContent === String(exp);
          },
          expectedDeliveries,
          { timeout: 20000 },
        )
        .catch(async () => {
          await page.screenshot({ path: `${OUT}\\13-earnings-0-debug-${label}.png`, fullPage: true });
          const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 800));
          console.log(`DEBUG (${label}) body: ${body}`);
        });
      await page.waitForTimeout(500);
    };

    // (2)+(3) Today
    await waitReady(expToday.deliveries, "today");
    const today = await readEarnings(page);
    ok(!!today?.ready, "Earnings tab opened (stat tiles rendered)");
    if (!today?.ready) throw new Error("earnings surface never rendered");
    ok(today.activePill.trim() === "Today", `Today pill active by default ("${today.activePill.trim()}")`);
    ok(today.deliveries === String(expToday.deliveries), `Today deliveries = ${expToday.deliveries} (got "${today.deliveries}")`);
    const expTodayTipStrings = expToday.tips.map(([c, a]) => norm(formatCurrency(a, c)));
    const gotTodayTips = today.tipLines.map(norm);
    ok(
      gotTodayTips.length === 2 &&
        expTodayTipStrings.every((s) => gotTodayTips.includes(s)),
      `Today tips = TWO SEPARATE lines [${expTodayTipStrings.join(" | ")}] (got [${gotTodayTips.join(" | ")}])`,
    );
    const todayText = norm(today.pageText);
    ok(todayText.includes(usdSym) && todayText.includes(eurSym), `both currency symbols on screen (${usdSym} and ${eurSym})`);
    const combinedNum = expToday.tips.reduce((s, [, a]) => s + a, 0); // 10.50 — a cross-currency sum must NOT exist
    ok(
      !todayText.includes(norm(formatCurrency(combinedNum, usdCur))) && !todayText.includes(norm(formatCurrency(combinedNum, eurCur))),
      `NO combined cross-currency figure (${norm(formatCurrency(combinedNum, usdCur))} / ${norm(formatCurrency(combinedNum, eurCur))} absent)`,
    );
    const expTodayActive = activeLabelFor(expToday.seconds);
    ok(norm(today.activeLabel) === expTodayActive, `Today active time = "${expTodayActive}" (got "${norm(today.activeLabel)}")`);
    ok(today.breakdown.length === 0, `no daily breakdown on the Today view (got ${today.breakdown.length} rows)`);
    // (7) HelpTip on Active time
    ok(today.hasHelpIcon && !!today.helpAria, `HelpTip present on Active time (aria: "${(today.helpAria ?? "").slice(0, 50)}...")`);
    ok(
      (today.helpAria ?? "").includes("not your full shift hours"),
      "HelpTip carries the honest active-time explainer text",
    );
    await page.screenshot({ path: `${OUT}\\13-earnings-1-today.png`, fullPage: true });
    // Reveal the tooltip for the screenshot + role=tooltip assertion. HelpTip
    // opens on hover/focus/click; we HOVER (not click) because Playwright's
    // .click() hovers first (onMouseEnter → open) then fires onClick, whose
    // toggle immediately closes it again — netting a CLOSED tooltip. Hover is
    // exactly how a real cursor reveals it.
    await page.locator("main:visible section.grid button[aria-label]").first().hover();
    await page.waitForTimeout(400);
    const tooltipVisible = await page.evaluate(() => {
      const tip = document.querySelector("[role='tooltip']") as HTMLElement | null;
      return tip ? tip.innerText : null;
    });
    ok(!!tooltipVisible && tooltipVisible.includes("not your full shift hours"), "hovering ⓘ opens the tooltip");
    await page.screenshot({ path: `${OUT}\\13-earnings-2-helptip.png`, fullPage: true });
    // Move the cursor off the icon so the tooltip closes before the next step.
    await page.mouse.move(10, 10);

    // (4)+(5) This week
    await page.locator("main:visible button", { hasText: "This week" }).click();
    await waitReady(expThisWeek.deliveries, "thisweek");
    const thisWeek = await readEarnings(page);
    if (!thisWeek?.ready) throw new Error("this-week view never rendered");
    ok(thisWeek.deliveries === String(expThisWeek.deliveries), `This week deliveries = ${expThisWeek.deliveries} (got "${thisWeek.deliveries}")`);
    const expWkTips = expThisWeek.tips.map(([c, a]) => norm(formatCurrency(a, c)));
    const gotWkTips = thisWeek.tipLines.map(norm);
    ok(
      gotWkTips.length === expWkTips.length && expWkTips.every((s) => gotWkTips.includes(s)),
      `This week tips per currency = [${expWkTips.join(" | ")}] (got [${gotWkTips.join(" | ")}])`,
    );
    ok(norm(thisWeek.activeLabel) === activeLabelFor(expThisWeek.seconds), `This week active time = "${activeLabelFor(expThisWeek.seconds)}" (got "${norm(thisWeek.activeLabel)}")`);
    ok(
      thisWeek.breakdown.length === expThisWeek.days,
      `daily breakdown on This week: ${expThisWeek.days} day rows (got ${thisWeek.breakdown.length})`,
    );
    ok(
      thisWeek.breakdown.some((b) => /deliver/i.test(b)),
      "breakdown rows carry the per-day delivery count",
    );
    await page.screenshot({ path: `${OUT}\\13-earnings-3-thisweek.png`, fullPage: true });

    // (4)+(5) Last week
    await page.locator("main:visible button", { hasText: "Last week" }).click();
    await waitReady(expLastWeek.deliveries, "lastweek");
    const lastWeek = await readEarnings(page);
    if (!lastWeek?.ready) throw new Error("last-week view never rendered");
    ok(lastWeek.deliveries === String(expLastWeek.deliveries), `Last week deliveries = ${expLastWeek.deliveries} (got "${lastWeek.deliveries}")`);
    const expLwTips = expLastWeek.tips.map(([c, a]) => norm(formatCurrency(a, c)));
    const gotLwTips = lastWeek.tipLines.map(norm);
    ok(
      gotLwTips.length === expLwTips.length && expLwTips.every((s) => gotLwTips.includes(s)),
      `Last week tips per currency = [${expLwTips.join(" | ")}] (got [${gotLwTips.join(" | ")}])`,
    );
    ok(norm(lastWeek.activeLabel) === activeLabelFor(expLastWeek.seconds), `Last week active time = "${activeLabelFor(expLastWeek.seconds)}" (got "${norm(lastWeek.activeLabel)}")`);
    ok(
      lastWeek.breakdown.length === expLastWeek.days,
      `daily breakdown on Last week: ${expLastWeek.days} day rows (got ${lastWeek.breakdown.length})`,
    );
    const lwEurLine = norm(formatCurrency(2.0, eurCur));
    ok(
      lastWeek.breakdown.some((b) => norm(b).includes(lwEurLine)),
      `last-week breakdown shows the eur day line (${lwEurLine})`,
    );
    // (6) the 40-day-old row's money never shows anywhere we looked
    const allText = [todayText, norm(thisWeek.pageText), norm(lastWeek.pageText)].join(" || ");
    ok(!allText.includes(norm(formatCurrency(99.0, usdCur))), "40d-old row's $99.00 tip appears in NO period view");
    ok(
      today.deliveries === String(expToday.deliveries) &&
        thisWeek.deliveries === String(expThisWeek.deliveries) &&
        lastWeek.deliveries === String(expLastWeek.deliveries),
      "40d-old row inflates NO period's delivery count (all three exact)",
    );
    await page.screenshot({ path: `${OUT}\\13-earnings-4-lastweek.png`, fullPage: true });

    await ctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    // ALWAYS restore the temporarily-flipped currency.
    await prisma.restaurant
      .update({ where: { id: eurRest.id }, data: { currency: eurRestOriginalCurrency } })
      .then(() => console.log(`restored ${EUR_SLUG} currency -> ${eurRestOriginalCurrency}`))
      .catch((e: unknown) => console.error(`FAILED to restore ${EUR_SLUG} currency (was ${eurRestOriginalCurrency}):`, e));
    await prisma.$disconnect();
  }

  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots -> ${OUT}\\13-earnings-*.png`);
  console.log("Seed rows LEFT IN PLACE tagged playseed@demo.local (local dev) for re-runs.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
