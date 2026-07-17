/**
 * DEV-ONLY visual verification for Fabrizio cmrmbgtd1 (Night Mode):
 * relaunching the kitchen with a SAVED dark theme must render the WHOLE
 * display dark (header/tabs/tiles — the SSR'd surfaces that used to stay
 * light), and the saved preference must survive the relaunch (persist-guard).
 * Also sanity-checks the light default is untouched.
 * Run: npx tsx scripts/_verify-nightmode-relaunch.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const OUT = String.raw`C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\226c8de2-7139-4e3e-8253-79b2ca677b81\scratchpad\verify`;
const SECRET = process.env.NEXTAUTH_SECRET!;

function luminance(rgb: string): number {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 255;
  return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only, aborting.");
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const demo = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true, restaurant: { select: { slug: true } } },
  });
  if (!demo?.restaurantId) throw new Error("demo kitchen user not found");
  const kitchenSessionToken = randomUUID();
  await prisma.restaurant.update({ where: { id: demo.restaurantId }, data: { kitchenSessionToken } });
  await prisma.$disconnect();

  const kCookie = await encode({ token: { sub: demo.id, name: demo.name ?? demo.email, email: demo.email, role: demo.role, restaurantId: demo.restaurantId, restaurantSlug: demo.restaurant?.slug, kitchenSessionToken }, secret: SECRET });

  const browser = await chromium.launch();
  const results: string[] = [];
  const ok = (cond: boolean, label: string) => { results.push(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) process.exitCode = 1; };

  async function loadKitchen(theme: "dark" | "light" | null, file: string) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies([{ name: "next-auth.kitchen-session-token", value: kCookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }]);
    if (theme) await ctx.addInitScript(`localStorage.setItem("kds-theme", "${theme}")`);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/kitchen`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const probe = await page.evaluate(() => {
      const root = document.querySelector("body > div") as HTMLElement;
      const header = document.querySelector("header, [class*='border-b']") as HTMLElement | null;
      return {
        url: location.pathname,
        rootBg: root ? getComputedStyle(root).backgroundColor : "none",
        headerBg: header ? getComputedStyle(header).backgroundColor : "none",
        savedTheme: localStorage.getItem("kds-theme"),
      };
    });
    await page.screenshot({ path: `${OUT}\\${file}` });
    await ctx.close();
    return probe;
  }

  const dark = await loadKitchen("dark", "7-kitchen-dark-relaunch.png");
  ok(dark.url === "/kitchen", `dark run stayed on /kitchen (${dark.url})`);
  ok(luminance(dark.rootBg) < 90, `dark relaunch: ROOT is dark from load (bg ${dark.rootBg})`);
  ok(dark.savedTheme === "dark", `dark relaunch: saved theme NOT clobbered (still "${dark.savedTheme}")`);

  const light = await loadKitchen(null, "8-kitchen-light-default.png");
  ok(luminance(light.rootBg) > 160, `light default: ROOT is light (bg ${light.rootBg})`);

  await browser.close();
  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
