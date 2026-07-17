/**
 * Verify (a) the Tawk chat never injects on /driver (waits past its 12s
 * lazy-load fallback), (b) the driver queue header renders with its new
 * self-carried safe-area padding. DEV-only.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";

const BASE = "http://localhost:3001";
const OUT = "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/63a4dc99-87d7-47ca-a0f0-ffe6a340a9da/scratchpad";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const driver = await prisma.driver.findUnique({ where: { email: "driver@demo.com" }, select: { id: true, name: true, email: true } });
  if (!driver) throw new Error("demo driver missing");
  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });
  await prisma.$disconnect();

  const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 450, height: 900 }, deviceScaleFactor: 2 });
  const cookie = await encode({
    token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  await ctx.addCookies([{ name: "next-auth.driver-session-token", value: cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Wiggle the mouse (an "interaction") then wait past Tawk's 12s fallback.
  await page.mouse.move(200, 300);
  await page.waitForTimeout(15000);
  const tawkLoader = await page.evaluate(() => !!document.getElementById("tawk-loader"));
  const tawkIframe = await page.evaluate(() => document.querySelectorAll('iframe[src*="tawk"]').length);
  const headerPad = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? getComputedStyle(h).paddingTop : "no-header";
  });
  console.log(`tawk script injected: ${tawkLoader} | tawk iframes: ${tawkIframe} | header paddingTop: ${headerPad}`);
  await page.screenshot({ path: `${OUT}/driver-tawk-safearea.png` });
  console.log(tawkLoader || tawkIframe > 0 ? "FAIL: tawk present on /driver" : "PASS: no tawk on /driver");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
