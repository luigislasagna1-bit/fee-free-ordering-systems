import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  const BASE = process.env.TAWK_BASE || "https://feefreeordering.com";
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(7000);
  const data = await page.evaluate(() => {
    const items: any[] = [];
    document.querySelectorAll("iframe").forEach((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      items.push({ kind: "iframe", id: e.id || null, title: (e as HTMLIFrameElement).title || null, cls: (typeof e.className === "string" ? e.className : "").slice(0, 80) || null, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents, vis: cs.visibility });
    });
    document.querySelectorAll("[id*='tawk' i],[class*='tawk' i]").forEach((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      items.push({ kind: "tawkEl", tag: e.tagName.toLowerCase(), id: (e as HTMLElement).id || null, cls: (typeof e.className === "string" ? e.className : "").slice(0, 80) || null, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents });
    });
    const el = document.elementFromPoint(120, 440) as HTMLElement | null;
    return { items, atCTA: el ? { tag: el.tagName.toLowerCase(), id: el.id || null, cls: (typeof el.className === "string" ? el.className : "").slice(0, 70) } : null, vw: window.innerWidth, vh: window.innerHeight };
  });
  console.log(JSON.stringify(data, null, 2));
  await page.screenshot({ path: "scripts/_tawk-mobile.png" });
  console.log("screenshot -> scripts/_tawk-mobile.png");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
