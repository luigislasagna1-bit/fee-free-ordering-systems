/**
 * DEV-ONLY visual verification for Fabrizio cmrj664ru round 2 (2026-07-17):
 *   E1 — checkout modal footer must have the SAME internal spacing as the dish
 *        modal footer ("same distance as when opening any dish").
 *   E2 — DESKTOP: opening the cart after scrolling must NOT blank/move the
 *        background (html-overflow lock), and closing must keep the scroll.
 *   C  — MOBILE (touch): the position:fixed lock Fabrizio already verified must
 *        still behave byte-identically (freeze + exact restore).
 *
 * Captures PNGs to the session scratchpad + prints measured assertions.
 * Run: npx tsx scripts/_verify-cmrj664ru-fixes.ts
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SLUG = "/order/fee-free-demo-restaurant";
const OUT = String.raw`C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\226c8de2-7139-4e3e-8253-79b2ca677b81\scratchpad\verify`;

const HIDE_CHROME = `
  nextjs-portal, [data-next-badge-root], [data-next-badge], [data-nextjs-toast],
  #__next-dev-tools-indicator, [data-nextjs-dev-tools-button] { display: none !important; }
`;

async function addItem(page: any) {
  await page.waitForSelector("button:has(svg.lucide-plus)", { timeout: 30000 });
  await page.locator("button:has(svg.lucide-plus)").first().click();
  await page.waitForTimeout(700);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results: string[] = [];
  const ok = (cond: boolean, label: string) => {
    results.push(`${cond ? "PASS" : "FAIL"}  ${label}`);
    if (!cond) process.exitCode = 1;
  };

  // ───────────────────────── DESKTOP (fine pointer) ─────────────────────────
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desk.newPage();
  await page.goto(BASE + SLUG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.addStyleTag({ content: HIDE_CHROME }).catch(() => {});
  await page.waitForTimeout(4000);

  // E1a — dish modal (the reference): screenshot + measure button→modal-bottom gap
  await addItem(page);
  const dishGap = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter(b => /add to cart/i.test(b.textContent || ""));
    const btn = btns[btns.length - 1]!;
    const modal = btn.closest('div[class*="bg-white"]')!;
    return Math.round(modal.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom);
  });
  await page.screenshot({ path: `${OUT}\\1-dish-modal-desktop.png` });
  await page.locator("button", { hasText: /add to cart/i }).last().click();
  await page.waitForTimeout(600);

  // E1b — checkout modal: same measurement on the place-order footer
  await page.locator("button", { hasText: /view cart/i }).first().click();
  await page.waitForTimeout(600);
  await page.locator("button", { hasText: /proceed|checkout/i }).first().click();
  await page.waitForTimeout(1500);
  const checkoutGap = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b => /place order/i.test(b.textContent || ""))!;
    const modal = btn.closest('div[class*="max-h"]')!;
    return Math.round(modal.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom);
  });
  await page.screenshot({ path: `${OUT}\\2-checkout-modal-desktop.png` });
  ok(Math.abs(checkoutGap - dishGap) <= 6, `E1 footer parity: dish gap ${dishGap}px vs checkout gap ${checkoutGap}px (±6px)`);
  // close checkout + cart
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>(".fixed.inset-0 svg.lucide-x").forEach(x => (x.closest("button") as HTMLElement)?.click());
  });
  await page.waitForTimeout(500);

  // E2 — scrolled cart open: background intact, scroll preserved
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}\\3-scrolled-before-open.png` });
  const before = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wrapperTop: Math.round(document.querySelector(".min-h-screen")!.getBoundingClientRect().top),
  }));
  await page.locator("button", { hasText: /view cart/i }).first().click();
  await page.waitForTimeout(800);
  const during = await page.evaluate(() => ({
    scrollY: window.scrollY,
    docH: document.documentElement.scrollHeight,
    htmlOverflow: document.documentElement.style.overflow,
    bodyPos: document.body.style.position || "",
    wrapperTop: Math.round(document.querySelector(".min-h-screen")!.getBoundingClientRect().top),
  }));
  await page.screenshot({ path: `${OUT}\\4-scrolled-cart-open.png` });
  ok(during.scrollY === before.scrollY, `E2 scrollY preserved while open (${before.scrollY} → ${during.scrollY})`);
  ok(during.wrapperTop === before.wrapperTop, `E2 background did not move (wrapperTop ${before.wrapperTop} → ${during.wrapperTop})`);
  ok(during.htmlOverflow === "hidden" && during.bodyPos === "", `E2 desktop uses html-overflow lock (html=${during.htmlOverflow || "unset"}, bodyPos=${during.bodyPos || "unset"})`);
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>(".fixed.inset-0 svg.lucide-x").forEach(x => (x.closest("button") as HTMLElement)?.click());
  });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ scrollY: window.scrollY, htmlOverflow: document.documentElement.style.overflow }));
  await page.screenshot({ path: `${OUT}\\5-scrolled-after-close.png` });
  ok(after.scrollY === before.scrollY, `E2 scroll restored after close (${after.scrollY})`);
  ok(after.htmlOverflow === "", "E2 html overflow cleared after close");
  await desk.close();

  // ───────────────────────── MOBILE re-test (coarse pointer) ─────────────────────────
  const mob = await browser.newContext({
    viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mp = await mob.newPage();
  await mp.goto(BASE + SLUG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await mp.addStyleTag({ content: HIDE_CHROME }).catch(() => {});
  await mp.waitForTimeout(4000);
  await addItem(mp);
  await mp.locator("button", { hasText: /add to cart/i }).last().click();
  await mp.waitForTimeout(600);
  await mp.evaluate(() => window.scrollTo(0, 1200));
  await mp.waitForTimeout(400);
  const mBefore = await mp.evaluate(() => window.scrollY);
  await mp.locator("button", { hasText: /view cart/i }).first().click();
  await mp.waitForTimeout(800);
  const mDuring = await mp.evaluate(() => ({
    bodyPos: document.body.style.position, bodyTop: document.body.style.top,
    coarse: window.matchMedia("(pointer: coarse)").matches,
  }));
  await mp.screenshot({ path: `${OUT}\\6-mobile-cart-open.png` });
  ok(mDuring.coarse, "mobile context reports pointer:coarse");
  ok(mDuring.bodyPos === "fixed" && mDuring.bodyTop === `-${mBefore}px`, `mobile keeps the verified position:fixed lock (pos=${mDuring.bodyPos}, top=${mDuring.bodyTop})`);
  await mp.evaluate(() => {
    document.querySelectorAll<HTMLElement>(".fixed.inset-0 svg.lucide-x").forEach(x => (x.closest("button") as HTMLElement)?.click());
  });
  await mp.waitForTimeout(500);
  const mAfter = await mp.evaluate(() => window.scrollY);
  ok(mAfter === mBefore, `mobile scroll restored after close (${mBefore} → ${mAfter})`);
  await mob.close();

  await browser.close();
  console.log("\n" + results.join("\n"));
  console.log(`\nScreenshots → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
