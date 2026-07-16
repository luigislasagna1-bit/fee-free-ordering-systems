/** DEV verify: /driver web view still renders the queue and does NOT show the
 *  native-only bg-location disclosure modal. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const d = await prisma.driver.findUnique({ where: { email: "driver@demo.com" }, select: { id: true, name: true, email: true } });
  if (!d) throw new Error("demo driver missing");
  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: d.id }, data: { driverSessionToken } });
  // Ensure at least one ACTIVE assignment for this driver so the GPS effect runs.
  const pizza = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const active = await prisma.deliveryAssignment.findFirst({ where: { driverId: d.id, status: "picked_up" }, select: { id: true } });
  if (!active) {
    const anyQueued = await prisma.deliveryAssignment.findFirst({ where: { restaurantId: pizza!.id, status: "queued" }, select: { id: true } });
    if (anyQueued) await prisma.deliveryAssignment.update({ where: { id: anyQueued.id }, data: { driverId: d.id, status: "picked_up", acceptedAt: new Date(), pickedUpAt: new Date() } });
  }
  await prisma.$disconnect();

  const token = await encode({ token: { sub: d.id, driverId: d.id, driverName: d.name, email: d.email, driverSessionToken }, secret: process.env.NEXTAUTH_SECRET! });
  const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 450, height: 800 } });
  await ctx.addCookies([{ name: "next-auth.driver-session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto("http://localhost:3001/driver", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000); // poll + GPS effect settle
  const body = await page.innerText("body");
  const hasQueue = /MY DELIVERIES|AVAILABLE JOBS/i.test(body);
  const hasModal = /Share your location for deliveries|collects location data/i.test(body);
  console.log("queue renders:", hasQueue);
  console.log("disclosure modal visible on WEB (must be false):", hasModal);
  await page.screenshot({ path: "store-assets/play-screenshots/_verify-driver-web.png" });
  await browser.close();
  if (!hasQueue || hasModal) process.exit(1);
  console.log("WEB PATH OK — no modal, queue intact");
}
main().catch((e) => { console.error(e); process.exit(1); });
