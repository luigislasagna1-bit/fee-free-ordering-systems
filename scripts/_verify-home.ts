import { chromium } from "playwright";

async function load(lang: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { "Accept-Language": lang }, viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 220)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 220)));
  const resp = await page.goto("http://localhost:3001/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  const h1 = await page.$eval("h1", (el) => (el.textContent || "").trim()).catch(() => "(no h1)");
  const h2count = await page.$$eval("h2", (els) => els.length).catch(() => 0);
  const bodyLen = await page.evaluate(() => document.body.innerText.length);
  const hasGrowthNet = await page.evaluate(() => document.body.innerText.includes("GrowthNet"));
  console.log(`[${lang}] status=${resp?.status()} h1="${h1}" h2s=${h2count} bodyLen=${bodyLen} growthnet=${hasGrowthNet} errors=${errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log("   ⚠️ " + e));
  await page.screenshot({ path: `scripts/_home-${lang}.png` });
  await browser.close();
}

async function main() {
  await load("en");
  await load("ar");
}
main().catch((e) => { console.error(e); process.exit(1); });
