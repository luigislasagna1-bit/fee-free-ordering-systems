/**
 * Verify Fabrizio cmrldhwep #4: a DONE order with an expired countdown must NOT
 * show the frozen "00:00" chip under the service icon on the In Progress tab.
 * Stages on the local DEV demo restaurant, screenshots the In Progress tab.
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
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only, aborting.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!demo?.restaurantId) throw new Error("demo not found");
  const rid = demo.restaurantId;

  // Clean prior runs, then stage: (a) DONE order with expired due time — the bug
  // row; (b) live accepted order with expired due time — fallback must NOT
  // regress (its right column shows the locked 00:00 on In Progress).
  const prior = await prisma.order.findMany({ where: { restaurantId: rid, orderNumber: { in: ["Z1", "Z2"] } }, select: { id: true } });
  if (prior.length) {
    const ids = prior.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  const past = new Date(Date.now() - 10 * 60000); // due 10 min ago
  const created = new Date(Date.now() - 40 * 60000);
  const mk = (orderNumber: string, status: string, customerName: string) =>
    prisma.order.create({
      data: {
        restaurantId: rid, orderNumber, status, type: "pickup",
        customerName, customerEmail: "zchip@demo.local",
        subtotal: 20, taxAmount: 2.6, total: 22.6, paymentStatus: "paid", paymentMethod: "card",
        estimatedReady: past, notifiedAt: created, createdAt: created,
        ...(status === "completed" ? { completedAt: new Date() } : {}),
      },
    });
  await mk("Z1", "completed", "Zed Done");
  await mk("Z2", "accepted", "Zed Live");

  const kitchenSessionToken = randomUUID();
  await prisma.restaurant.update({ where: { id: rid }, data: { kitchenSessionToken } });
  await prisma.$disconnect();

  const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 450, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((r: string) => {
    try { localStorage.setItem("ffo:kitchen-tour-completed:" + r, "1"); } catch {}
    try { localStorage.setItem("kds-sound-armed", "1"); } catch {}
  }, rid);
  const cookie = await encode({
    token: { sub: demo.id, name: demo.name ?? demo.email, email: demo.email, role: demo.role, restaurantId: rid, restaurantSlug: demo.restaurant?.slug, kitchenSessionToken },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  await ctx.addCookies([{ name: "next-auth.kitchen-session-token", value: cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/kitchen`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.locator('button:has-text("In Progress")').first().click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/inprogress-after-fix.png` });
  console.log("shot →", `${OUT}/inprogress-after-fix.png`, page.url());
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
