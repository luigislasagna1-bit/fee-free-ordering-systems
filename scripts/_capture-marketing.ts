/**
 * Dev-only: capture marketing screenshots to PNG files from PUBLIC URLs.
 * Uses Playwright (installed --no-save). Run: npx tsx scripts/_capture-marketing.ts
 * Saves into public/marketing/screenshots/.
 */
import { chromium, type Browser } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "public/marketing/screenshots";
const SALES = "https://luigis.feefreeordering.com/";
const ORDER = "https://luigis.feefreeordering.com/order/luigis-lasagna-pizzeria?from=hosted";

function ua(mobile: boolean) {
  return mobile
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    : undefined;
}

/** Plain top-of-page shot (header + service tabs + menu) — clean now promos are off. */
async function topShot(browser: Browser, url: string, file: string, mobile: boolean, full = false) {
  try {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 412, height: 880 } : { width: 1440, height: 950 }, deviceScaleFactor: 2, userAgent: ua(mobile) });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
    console.log(`OK   ${file}`);
    await ctx.close();
  } catch (e) { console.log(`FAIL ${file}  ${String(e).slice(0, 130)}`); }
}

/** Expanded menu, scrolled to the pizzas (real items + photos). */
async function menuShot(browser: Browser, file: string, mobile: boolean) {
  try {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 412, height: 880 } : { width: 1440, height: 950 }, deviceScaleFactor: 2, userAgent: ua(mobile) });
    const page = await ctx.newPage();
    await page.goto(ORDER, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    try { await page.getByText("Expand all", { exact: false }).first().click({ timeout: 5000 }); await page.waitForTimeout(1200); } catch {}
    let ok = false;
    for (const name of ["PIZZAS", "PASTAS", "SPECIALS"]) {
      try { await page.locator(`text=${name}`).last().scrollIntoViewIfNeeded({ timeout: 4000 }); ok = true; break; } catch {}
    }
    if (!ok) await page.evaluate(() => window.scrollTo(0, 1100));
    await page.evaluate(() => window.scrollBy(0, -30));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log(`OK   ${file}`);
    await ctx.close();
  } catch (e) { console.log(`FAIL ${file}  ${String(e).slice(0, 130)}`); }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // Clean ordering-page tops (promos disabled) — header + service tabs + menu in one frame
  await topShot(browser, ORDER, "luigis-order-top-desktop.png", false);
  await topShot(browser, ORDER, "luigis-order-top-mobile.png", true);
  // Sales site hero (above-fold) — refresh
  await topShot(browser, SALES, "luigis-root-desktop.png", false);
  // Expanded pizza menu
  await menuShot(browser, "luigis-menu-mobile.png", true);
  await menuShot(browser, "luigis-menu-desktop.png", false);
  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
