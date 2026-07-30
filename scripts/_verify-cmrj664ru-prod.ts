/**
 * PROD verification of the cmrj664ru fixes ON FABRIZIO'S STORE
 * (Japanese Restaurant | TEST → /order/ristorante-test), desktop viewport —
 * his exact reported conditions. Cart is client-side localStorage only; the
 * browser context is discarded — NO order is placed, nothing is written.
 * Run: npx tsx scripts/_verify-cmrj664ru-prod.ts
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "https://www.feefreeordering.com";
const SLUG = "/order/ristorante-test";
const OUT = String.raw`C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\226c8de2-7139-4e3e-8253-79b2ca677b81\scratchpad\verify`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results: string[] = [];
  const ok = (cond: boolean, label: string) => { results.push(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) process.exitCode = 1; };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(BASE + SLUG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dismiss the launch promo popup(s) that cover the page (e.g. "MENU PRANZO —
  // scopri ora") — they intercept all clicks until closed.
  for (let i = 0; i < 3; i++) {
    const hasOverlay = await page.evaluate(() => !!document.querySelector(".fixed.inset-0"));
    if (!hasOverlay) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>(".fixed.inset-0 svg.lucide-x").forEach(x => (x.closest("button") as HTMLElement)?.click());
    });
    await page.waitForTimeout(700);
  }

  // Add a simple item (try up to 4 plus buttons until an add-to-cart modal shows)
  let dishGap = -1;
  for (let i = 0; i < 4 && dishGap < 0; i++) {
    const plus = page.locator("button:has(svg.lucide-plus)").nth(i);
    await plus.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await plus.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    const added = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].filter(b => /add to cart|aggiungi al carrello/i.test(b.textContent || ""));
      if (!btns.length) return -1;
      const btn = btns[btns.length - 1]!;
      const modal = btn.closest('div[class*="bg-white"]')!;
      return Math.round(modal.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom);
    });
    if (added >= 0) {
      dishGap = added;
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")].filter(b => /add to cart|aggiungi al carrello/i.test(b.textContent || ""));
        (btns[btns.length - 1] as HTMLElement).click();
      });
      await page.waitForTimeout(700);
    } else {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  ok(dishGap >= 0, `added an item on his store (dish modal footer gap ${dishGap}px)`);

  // E2 on his store: scroll deep, open cart, background must hold
  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const target = Math.max(600, Math.min(2000, maxScroll - 100));
  await page.evaluate(y => window.scrollTo(0, y), target);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({ scrollY: window.scrollY, wrapperTop: Math.round(document.querySelector(".min-h-screen")!.getBoundingClientRect().top) }));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /view cart|vedi carrello/i.test(x.textContent || ""));
    (b as HTMLElement).click();
  });
  await page.waitForTimeout(900);
  const during = await page.evaluate(() => ({
    scrollY: window.scrollY, htmlOverflow: document.documentElement.style.overflow,
    bodyPos: document.body.style.position || "",
    wrapperTop: Math.round(document.querySelector(".min-h-screen")!.getBoundingClientRect().top),
  }));
  await page.screenshot({ path: `${OUT}\\9-PROD-his-store-scrolled-cart.png` });
  ok(during.scrollY === before.scrollY && during.wrapperTop === before.wrapperTop,
    `PROD background locked in place (scrollY ${before.scrollY}→${during.scrollY}, wrapperTop ${before.wrapperTop}→${during.wrapperTop})`);
  ok(during.htmlOverflow === "hidden" && during.bodyPos === "", `PROD html-overflow lock active (html=${during.htmlOverflow}, bodyPos=${during.bodyPos || "unset"})`);

  // E1 on his store: open checkout, measure the footer gap
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /proceed|checkout|procedi/i.test(x.textContent || ""));
    (b as HTMLElement).click();
  });
  await page.waitForTimeout(2000);
  const checkoutGap = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b => /place order|effettua ordine/i.test(b.textContent || ""));
    if (!btn) return -1;
    const modal = btn.closest('div[class*="max-h"]')!;
    return Math.round(modal.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom);
  });
  await page.screenshot({ path: `${OUT}\\10-PROD-his-store-checkout.png` });
  ok(checkoutGap >= 15, `PROD checkout footer gap ${checkoutGap}px (was 0 — must be ≥15)`);
  ok(Math.abs(checkoutGap - dishGap) <= 8, `PROD parity with dish modal (dish ${dishGap}px vs checkout ${checkoutGap}px)`);

  await ctx.close();
  await browser.close();
  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
