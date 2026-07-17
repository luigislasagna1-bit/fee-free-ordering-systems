/**
 * v1.1 Phase 0 gate: execute the ffd-role-pref truth table (plan §2.3) against
 * the local dev server with real minted cookies. DEV-only.
 *   npx tsx scripts/_verify-role-pref.ts
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

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const SECRET = process.env.NEXTAUTH_SECRET!;

  const driver = await prisma.driver.findUnique({ where: { email: "driver@demo.com" }, select: { id: true, name: true, email: true } });
  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true, name: true } } },
  });
  if (!driver || !demo?.restaurantId) throw new Error("demo driver/restaurant missing");

  const driverSessionToken = randomUUID();
  await prisma.driver.update({ where: { id: driver.id }, data: { driverSessionToken } });
  const driverCookie = {
    name: "next-auth.driver-session-token",
    value: await encode({ token: { sub: driver.id, driverId: driver.id, driverName: driver.name, email: driver.email, driverSessionToken }, secret: SECRET }),
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const,
  };
  const adminCookie = {
    name: "next-auth.session-token",
    value: await encode({ token: { sub: demo.id, name: demo.name ?? demo.email, email: demo.email, role: demo.role, restaurantId: demo.restaurantId, restaurantSlug: demo.restaurant?.slug }, secret: SECRET }),
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const,
  };
  const superadminCookie = {
    name: "next-auth.session-token",
    value: await encode({ token: { sub: "sa-test", name: "SA", email: "admin@feefreeordering.com", role: "superadmin" }, secret: SECRET }),
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const,
  };
  const pref = (v: string) => ({ name: "ffd-role-pref", value: v, domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" as const });
  await prisma.$disconnect();

  const DRIVER_MARK = driver.name; // "Demo Driver" in the queue header
  const DISPATCH_MARK = demo.restaurant?.name ?? "___"; // restaurant name in dispatch header

  const CASES: { label: string; cookies: any[]; expect: "driver" | "dispatch" | RegExp }[] = [
    { label: "driver only, no pref", cookies: [driverCookie], expect: "driver" },
    { label: "driver only, pref=restaurant (fallback)", cookies: [driverCookie, pref("restaurant")], expect: "driver" },
    { label: "admin only, no pref", cookies: [adminCookie], expect: "dispatch" },
    { label: "both, no pref (today's behavior)", cookies: [driverCookie, adminCookie], expect: "driver" },
    { label: "both, pref=driver", cookies: [driverCookie, adminCookie, pref("driver")], expect: "driver" },
    { label: "both, pref=restaurant (the fix)", cookies: [driverCookie, adminCookie, pref("restaurant")], expect: "dispatch" },
    { label: "no sessions", cookies: [], expect: /\/driver\/login/ },
    { label: "superadmin only", cookies: [superadminCookie], expect: /\/superadmin/ },
  ];

  const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  let failed = 0;
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    if (c.cookies.length) await ctx.addCookies(c.cookies);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const body = (await page.evaluate(() => document.body.innerText)) ?? "";
    const url = page.url();
    let pass: boolean;
    if (c.expect === "driver") pass = body.includes(DRIVER_MARK) && !body.includes(DISPATCH_MARK);
    else if (c.expect === "dispatch") pass = body.includes(DISPATCH_MARK) && !body.includes(DRIVER_MARK);
    else pass = c.expect.test(url);
    console.log(`${pass ? "PASS" : "FAIL"}  ${c.label}  →  ${c.expect === "driver" || c.expect === "dispatch" ? c.expect : url}`);
    if (!pass) { failed++; console.log(`   url=${url} body[0..120]=${body.slice(0, 120).replace(/\n/g, " | ")}`); }
    await ctx.close();
  }
  await browser.close();
  console.log(failed === 0 ? "ALL CASES PASS" : `${failed} CASE(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
