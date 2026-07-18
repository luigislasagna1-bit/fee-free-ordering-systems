/**
 * DEV-ONLY end-to-end verification for driver-app sounds (Luigi 2026-07-17).
 *
 * driver-sounds.ts is pure WebAudio; every ACTUALLY-played sound is recorded
 * on `window.__ffdLastSound = { kind, at }` precisely so this script can
 * assert without audio capture. Flow verified here:
 *   1. Seed ONE unaccepted queued assignment (driverId=null) → open /driver as
 *      the demo driver. Before any gesture NOTHING may play (autoplay policy:
 *      the chime is queued as pendingChime).
 *   2. Click a neutral spot (user gesture) → the queued new-order chime plays
 *      → __ffdLastSound.kind === "newOrder" within ~3s.
 *   3. Flip the assignment to driverId=demo / status=accepted directly in the
 *      DB → the 8s queue-mirror poll picks it up → "my job advanced" → a
 *      "tick" is recorded (at > the newOrder stamp).
 *   4. Toggle the Profile mute switch OFF (muted) → flip status to picked_up
 *      in the DB → after the next poll NO new sound is recorded (kind AND at
 *      unchanged) + localStorage carries ffd-sounds-muted=1.
 *
 * Seed rows are tagged customerEmail=playseed@demo.local and WIPED at the
 * start of every run (same pattern as _verify-driver-history.ts), plus a
 * determinism guard: leftover unclaimed queued assignments (the pool is
 * GLOBAL in /api/driver/assignments) or open demo-driver assignments would
 * fire extra chimes / keep the 20s repeat alive, so they're dropped too.
 * At the end the seeded assignment is flipped to delivered so no open job
 * lingers for manual sessions. Refuses to run against prod.
 *
 * Run: npx tsx scripts/_verify-driver-sounds.ts
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
import { ASSIGNMENT_TERMINAL } from "../src/lib/driver-assignment";

const BASE = "http://localhost:3001";
const OUT = String.raw`C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\226c8de2-7139-4e3e-8253-79b2ca677b81\scratchpad\verify`;
const SECRET = process.env.NEXTAUTH_SECRET!;
const SEED_EMAIL = "playseed@demo.local";

type LastSound = { kind: string; at: number } | null;

const readLastSound = (p: Page): Promise<LastSound> =>
  p.evaluate(() => (window as unknown as { __ffdLastSound?: { kind: string; at: number } }).__ffdLastSound ?? null);

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
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!rest) throw new Error("demo-pizza-palace not found");
  const rLat = rest.lat ?? 43.5183;
  const rLng = rest.lng ?? -79.8774;
  if (rest.lat == null || rest.lng == null) {
    await prisma.restaurant.update({ where: { id: rest.id }, data: { lat: rLat, lng: rLng } });
  }

  // --- Wipe our own prior seed rows (assignments -> items -> orders) ---
  const stale = await prisma.order.findMany({ where: { customerEmail: SEED_EMAIL }, select: { id: true } });
  if (stale.length) {
    const ids = stale.map((o: { id: string }) => o.id);
    await prisma.deliveryAssignment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`wiped ${stale.length} prior ${SEED_EMAIL} orders (+assignments/items)`);
  }
  // Determinism guard: the driver queue pool is GLOBAL (any queued/driverId
  // null row rings) and any open demo-driver job would tick — drop both so
  // exactly ONE queued job exists and every sound below is ours.
  const noise = await prisma.deliveryAssignment.deleteMany({
    where: {
      OR: [
        { status: "queued", driverId: null },
        { driverId: driver.id, status: { notIn: [...ASSIGNMENT_TERMINAL] as string[] } },
      ],
    },
  });
  if (noise.count) console.log(`removed ${noise.count} noise assignments (stray queued pool rows / open demo jobs)`);

  // --- Seed ONE unaccepted queued assignment (NOT mine: driverId=null) ---
  const now = new Date();
  const order = await prisma.order.create({
    data: {
      restaurantId: rest.id,
      orderNumber: "SND1",
      status: "preparing",
      type: "delivery",
      customerName: "Sound Seed Customer",
      customerEmail: SEED_EMAIL,
      customerPhone: "+12895551234",
      deliveryAddress: "12 Chime Court",
      deliveryCity: "Milton",
      deliveryZip: "L9T 2X5",
      deliveryLat: rLat + 0.012,
      deliveryLng: rLng - 0.006,
      subtotal: 21.5,
      total: 27.99,
      tip: 3.0,
      paymentStatus: "paid",
      paymentMethod: "card",
      createdAt: now,
    },
    select: { id: true },
  });
  const assignment = await prisma.deliveryAssignment.create({
    data: {
      orderId: order.id,
      restaurantId: rest.id,
      driverId: null,
      status: "queued",
      assignedAt: now,
      createdAt: now,
    },
    select: { id: true },
  });
  console.log(`seeded 1 queued unclaimed assignment ${assignment.id} (order SND1)`);

  // --- Mint the driver session (capture-play-shots cookie shape) ---
  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });
  const dCookie = await encode({
    token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken },
    secret: SECRET,
  });

  // --- Drive the app (mobile viewport) ---
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
  // Let the first queue load + mirror land (the chime request gets QUEUED as
  // pendingChime — no gesture yet, so nothing may actually play).
  await page.waitForTimeout(5000);

  // Sanity: the seeded job actually rendered (otherwise nothing below means anything).
  const bodyTxt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  ok(bodyTxt.includes("SND1"), `seeded queued job #SND1 visible on the Jobs tab`);

  // (1) Autoplay discipline: NO sound recorded before any user gesture.
  const preGesture = await readLastSound(page);
  ok(preGesture === null, `no sound recorded before the unlock gesture (got ${JSON.stringify(preGesture)})`);
  await page.screenshot({ path: `${OUT}\\12-sounds-1-pregesture.png`, fullPage: true });

  // (2) User gesture (click the header title area — no buttons there) →
  // pendingChime plays → newOrder recorded within ~3s.
  await page.mouse.click(80, 30);
  let newOrderOk = true;
  await page
    .waitForFunction(
      () => (window as unknown as { __ffdLastSound?: { kind: string } }).__ffdLastSound?.kind === "newOrder",
      { timeout: 3000 },
    )
    .catch(() => {
      newOrderOk = false;
    });
  const afterClick = await readLastSound(page);
  ok(
    newOrderOk && afterClick?.kind === "newOrder",
    `new-order chime fires within ~3s of the unlock click (__ffdLastSound=${JSON.stringify(afterClick)})`,
  );
  const newOrderAt = afterClick?.at ?? 0;

  // (3) Accept via the DB (mirror path, not the button): driverId=demo,
  // status=accepted → next 8s poll diffs "newly mine" → tick.
  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: { driverId: driver.id, status: "accepted", acceptedAt: new Date() },
  });
  console.log("flipped assignment -> driverId=demo-driver, status=accepted (awaiting 8s mirror poll)");
  let tickOk = true;
  await page
    .waitForFunction(
      (prevAt) => {
        const s = (window as unknown as { __ffdLastSound?: { kind: string; at: number } }).__ffdLastSound;
        return !!s && s.kind === "tick" && s.at > prevAt;
      },
      newOrderAt,
      { timeout: 15000 },
    )
    .catch(() => {
      tickOk = false;
    });
  const afterAccept = await readLastSound(page);
  ok(
    tickOk && afterAccept?.kind === "tick" && afterAccept.at > newOrderAt,
    `tick fires after the accepted flip reaches the 8s mirror poll (__ffdLastSound=${JSON.stringify(afterAccept)})`,
  );
  await page.screenshot({ path: `${OUT}\\12-sounds-2-tick.png`, fullPage: true });

  // (4) Profile → mute switch OFF.
  await page.locator("nav button", { hasText: "Profile" }).click();
  await page.locator('button[role="switch"]').waitFor({ timeout: 15000 });
  const checkedBefore = await page.locator('button[role="switch"]').getAttribute("aria-checked");
  ok(checkedBefore === "true", `sounds switch starts ON (aria-checked=${checkedBefore})`);
  await page.locator('button[role="switch"]').click();
  await page.waitForTimeout(400);
  const checkedAfter = await page.locator('button[role="switch"]').getAttribute("aria-checked");
  const lsFlag = await page.evaluate(() => {
    try {
      return localStorage.getItem("ffd-sounds-muted");
    } catch {
      return "unreadable";
    }
  });
  ok(checkedAfter === "false", `mute toggle flips the switch OFF (aria-checked=${checkedAfter})`);
  ok(lsFlag === "1", `mute persisted to localStorage ffd-sounds-muted=1 (got ${JSON.stringify(lsFlag)})`);
  await page.screenshot({ path: `${OUT}\\12-sounds-3-muted.png`, fullPage: true });

  // (5) Muted: flip to picked_up (a forward stage move that WOULD tick) →
  // wait past the next poll → __ffdLastSound must be UNCHANGED.
  const beforeMutedFlip = await readLastSound(page);
  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: { status: "picked_up", startedAt: new Date(), pickedUpAt: new Date() },
  });
  console.log("flipped assignment -> status=picked_up while MUTED (waiting 13s > one 8s poll)");
  await page.waitForTimeout(13000);
  const afterMutedFlip = await readLastSound(page);
  ok(
    !!beforeMutedFlip &&
      !!afterMutedFlip &&
      afterMutedFlip.kind === beforeMutedFlip.kind &&
      afterMutedFlip.at === beforeMutedFlip.at,
    `NO new sound while muted after the picked_up flip (before=${JSON.stringify(beforeMutedFlip)} after=${JSON.stringify(afterMutedFlip)})`,
  );
  // Belt-and-braces: the mirror DID refresh (the job advanced on screen) — so
  // silence above is the mute, not a dead poll. Jobs tab still shows the job.
  await page.locator("nav button", { hasText: "Jobs" }).click();
  await page.waitForTimeout(600);
  const jobsTxt = await page.evaluate(() => {
    const mains = [...document.querySelectorAll("main")].filter((m) => (m as HTMLElement).offsetParent !== null);
    return mains[0] ? mains[0].innerText.replace(/\s+/g, " ") : document.body.innerText.replace(/\s+/g, " ");
  });
  ok(jobsTxt.includes("SND1"), `mirror stayed live while muted — job #SND1 still on the Jobs tab post-flip`);
  await page.screenshot({ path: `${OUT}\\12-sounds-4-muted-pickedup.png`, fullPage: true });

  await ctx.close();
  await browser.close();

  // Leave no open job behind for manual sessions (rows themselves stay, tagged
  // playseed, and get wiped at the start of the next run).
  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: { status: "delivered", deliveredAt: new Date(), completedAt: new Date() },
  });
  await prisma.$disconnect();

  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots -> ${OUT}\\12-sounds-*.png`);
  console.log("Seed assignment closed out as delivered; rows left in place (wiped on next run).");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
