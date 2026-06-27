/**
 * Dev-only: capture the LIGHT admin + superadmin screens locally.
 * Mints a NextAuth session cookie for a dev account (no password entry, dev DB
 * only), sets it in a headless browser, and screenshots admin pages on the
 * local dev server (localhost:3001). Run: npx tsx scripts/_capture-admin.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium, type BrowserContext } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "public/marketing/screenshots";
const BASE = "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET!;

const ADMIN_PAGES = [
  { path: "/admin", file: "admin-dashboard.png" },
  { path: "/admin/menu", file: "admin-menu.png" },
  { path: "/admin/reports", file: "admin-reports.png" },
  { path: "/admin/marketing-studio", file: "admin-marketing-studio.png" },
  { path: "/admin/promotions", file: "admin-promotions.png" },
  { path: "/admin/autopilot", file: "admin-autopilot.png" },
  { path: "/admin/menu/import-gloriafood", file: "admin-import.png" },
  { path: "/admin/orders", file: "admin-orders.png" },
];
const SUPERADMIN_PAGES = [
  { path: "/superadmin", file: "superadmin-dashboard.png" },
  { path: "/superadmin/restaurants", file: "superadmin-restaurants.png" },
];

async function mintCookie(u: { id: string; email: string; name: string | null; role: string; restaurantId: string | null; restaurantSlug?: string | null; resellerProfileId?: string | null }) {
  const token = await encode({
    token: {
      sub: u.id,
      name: u.name ?? u.email,
      email: u.email,
      role: u.role,
      restaurantId: u.restaurantId ?? undefined,
      restaurantSlug: u.restaurantSlug ?? undefined,
      resellerProfileId: u.resellerProfileId ?? undefined,
    },
    secret: SECRET,
  });
  return { name: "next-auth.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
}

async function capture(ctx: BrowserContext, pages: { path: string; file: string }[]) {
  for (const p of pages) {
    try {
      const page = await ctx.newPage();
      const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);
      const finalUrl = page.url();
      const redirected = /\/login/.test(finalUrl);
      await page.screenshot({ path: `${OUT}/${p.file}` });
      console.log(`${redirected ? "REDIR→login" : "OK "}  ${p.file}  (${resp?.status()})  ${finalUrl.replace(BASE, "")}`);
      await page.close();
    } catch (e) {
      console.log(`FAIL ${p.file}  ${String(e).slice(0, 120)}`);
    }
  }
}

async function main() {
  if (!SECRET) { console.error("No NEXTAUTH_SECRET in env"); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  const superadmin = await prisma.user.findFirst({
    where: { role: "superadmin" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true },
  });
  console.log("demo:", demo?.email, "| role:", demo?.role, "| rid:", demo?.restaurantId);
  console.log("superadmin:", superadmin?.email);
  await prisma.$disconnect();

  const browser = await chromium.launch();

  if (demo) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
    await ctx.addCookies([await mintCookie({ ...demo, restaurantSlug: demo.restaurant?.slug })]);
    await capture(ctx, ADMIN_PAGES);
    await ctx.close();
  }
  if (superadmin) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
    await ctx.addCookies([await mintCookie(superadmin)]);
    await capture(ctx, SUPERADMIN_PAGES);
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
