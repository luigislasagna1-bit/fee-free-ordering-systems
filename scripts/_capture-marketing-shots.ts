/**
 * Dev-only: capture clean, populated marketing screenshots from the local demo
 * restaurant (seed orders first via scripts/_seed-demo-orders.ts).
 *
 * Mints BOTH the admin NextAuth session AND the separate kitchen session, hides
 * the onboarding chrome (setup banner + sidebar card via the /admin/setup/next
 * link, the guided-setup pill via its sessionStorage dismiss key, the Next.js
 * dev badge via CSS), and screenshots each surface at the right viewport.
 *
 * Run: npx tsx scripts/_capture-marketing-shots.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium, type BrowserContext } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const OUT = "public/marketing/screenshots";
const BASE = "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET!;

// CSS that strips onboarding chrome so the shots read like a finished product.
const HIDE_CHROME = `
  a[href="/admin/setup/next"] { display: none !important; }
  nextjs-portal, [data-next-badge-root], [data-next-badge], [data-nextjs-toast],
  #__next-dev-tools-indicator, [data-nextjs-dev-tools-button] { display: none !important; }
`;

async function adminCookie(u: { id: string; email: string; name: string | null; role: string; restaurantId: string | null; restaurantSlug?: string | null }) {
  const token = await encode({
    token: { sub: u.id, name: u.name ?? u.email, email: u.email, role: u.role, restaurantId: u.restaurantId ?? undefined, restaurantSlug: u.restaurantSlug ?? undefined },
    secret: SECRET,
  });
  return { name: "next-auth.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
}

async function kitchenCookie(u: { id: string; email: string; name: string | null; role: string; restaurantId: string; restaurantSlug?: string | null; kitchenSessionToken: string }) {
  const token = await encode({
    token: { sub: u.id, name: u.name ?? u.email, email: u.email, role: u.role, restaurantId: u.restaurantId, restaurantSlug: u.restaurantSlug ?? undefined, kitchenSessionToken: u.kitchenSessionToken },
    secret: SECRET,
  });
  return { name: "next-auth.kitchen-session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
}

async function newCtx(browser: any, viewport: { width: number; height: number }) {
  const ctx: BrowserContext = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("ffo:guided-setup-pill-dismissed-at", "999999"); } catch {}
    // Pre-enable kitchen sound gate so no "tap to enable" overlay covers the shot.
    try { localStorage.setItem("kds-sound-armed", "1"); } catch {}
  });
  return ctx;
}

async function shot(ctx: BrowserContext, path: string, file: string, opts: { wait?: number; css?: string } = {}) {
  const page = await ctx.newPage();
  const css = HIDE_CHROME + (opts.css ?? "");
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.addStyleTag({ content: css }).catch(() => {});
    await page.waitForTimeout(opts.wait ?? 4500);
    await page.addStyleTag({ content: css }).catch(() => {}); // re-assert after hydration
    const url = page.url();
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log(`${/login/.test(url) ? "REDIR→login" : "OK  "}  ${file}  ${url.replace(BASE, "")}`);
  } catch (e) {
    console.log(`FAIL  ${file}  ${String(e).slice(0, 140)}`);
  } finally {
    await page.close();
  }
}

async function main() {
  if (!SECRET) { console.error("No NEXTAUTH_SECRET"); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!demo?.restaurantId) throw new Error("demo user/restaurant not found");

  // Mint a kitchen session token + persist it so getSessionUser({preferKitchen}) accepts it.
  const kitchenSessionToken = randomUUID();
  await prisma.restaurant.update({ where: { id: demo.restaurantId }, data: { kitchenSessionToken } });
  console.log("demo:", demo.email, "| rid:", demo.restaurantId, "| slug:", demo.restaurant?.slug);
  await prisma.$disconnect();

  const browser = await chromium.launch();

  // --- Admin (browser) ---
  const admin = await newCtx(browser, { width: 1440, height: 900 });
  await admin.addCookies([await adminCookie({ ...demo, restaurantSlug: demo.restaurant?.slug })]);
  await shot(admin, "/admin/reports", "app-reports.png", { wait: 6000 });
  await shot(admin, "/admin/menu/import-gloriafood", "app-import.png");
  // Hide the localhost smart-link URLs (font-mono copy buttons) so the shot reads as production.
  await shot(admin, "/admin/marketing-studio", "app-growthnet.png", { css: '[class*="font-mono"]{display:none !important}' });
  await shot(admin, "/admin/promotions", "app-promotions.png", { wait: 5500 });
  await shot(admin, "/admin/customers", "app-customers.png", { wait: 5500 });
  await admin.close();

  // --- Kitchen (phone) ---
  const kitchen = await newCtx(browser, { width: 412, height: 892 });
  // Mark the first-run tour as already completed for this restaurant so its
  // welcome modal doesn't cover the order list.
  await kitchen.addInitScript((rid) => { try { localStorage.setItem("ffo:kitchen-tour-completed:" + rid, "1"); } catch {} }, demo.restaurantId);
  await kitchen.addCookies([await kitchenCookie({ ...demo, restaurantId: demo.restaurantId, restaurantSlug: demo.restaurant?.slug, kitchenSessionToken })]);
  await shot(kitchen, "/kitchen", "app-kitchen.png", { wait: 7000 });
  await kitchen.close();

  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
