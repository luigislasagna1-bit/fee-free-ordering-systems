/**
 * Dev-only: audit marketing links on the LIVE site for broken/covered CTAs.
 * For each page (mobile + desktop) it finds every <a href>, and for the ones
 * in the viewport checks whether the element at the link's center is actually
 * the link (i.e. not covered by an overlay that would eat taps).
 * Run: npx tsx scripts/_audit-links.ts
 */
import { chromium, type Browser } from "playwright";

const BASE = process.env.AUDIT_BASE || "https://feefreeordering.com";
const PAGES = ["/", "/features", "/pricing", "/demo", "/faq", "/partners", "/marketplace"];

async function auditPage(browser: Browser, path: string, mobile: boolean) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3800);
    const result = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const total = links.length;
      const badHref: { text: string; href: string }[] = [];
      const covered: { text: string; href: string; by: string }[] = [];
      // scan twice: top of page, then scrolled down, so we cover most CTAs
      const checkpoints = [0, Math.round(document.body.scrollHeight / 3), Math.round((document.body.scrollHeight / 3) * 2)];
      const seen = new Set<HTMLAnchorElement>();
      for (const y of checkpoints) {
        window.scrollTo(0, y);
        for (const a of links) {
          if (seen.has(a)) continue;
          const href = a.getAttribute("href") || "";
          if (!href || href === "#" || href.startsWith("javascript:")) { badHref.push({ text: (a.textContent || "").trim().slice(0, 24), href }); seen.add(a); continue; }
          const r = a.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const cy = r.top + r.height / 2;
          if (cy < 4 || cy > window.innerHeight - 4) continue; // not in viewport at this scroll
          const cx = r.left + r.width / 2;
          const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
          const inside = !!el && (el === a || a.contains(el) || (el.closest && el.closest("a") === a));
          seen.add(a);
          if (!inside) {
            const by = el ? `${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean).slice(0, 3).join(".")}` : "null";
            covered.push({ text: (a.textContent || "").trim().slice(0, 24), href, by });
          }
        }
      }
      return { total, checked: seen.size, badHref, covered };
    });
    const tag = `${mobile ? "📱" : "🖥️"} ${path}`;
    console.log(`${tag}  (${resp?.status()}) links=${result.total} checked=${result.checked}`);
    result.badHref.forEach((b) => console.log(`     ✗ EMPTY/HASH href: "${b.text}" → "${b.href}"`));
    result.covered.forEach((c) => console.log(`     ⚠️ COVERED: "${c.text}" → ${c.href}  by ${c.by}`));
    if (!result.badHref.length && !result.covered.length) console.log(`     ✓ no blocked/empty links in viewport`);
  } catch (e) {
    console.log(`${mobile ? "📱" : "🖥️"} ${path}  FAIL ${String(e).slice(0, 110)}`);
  }
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  for (const mobile of [true, false]) {
    console.log(`\n================= ${mobile ? "MOBILE 390px" : "DESKTOP 1280px"} =================`);
    for (const p of PAGES) await auditPage(browser, p, mobile);
  }
  await browser.close();
  console.log("\ndone");
}
main().catch((e) => { console.error(e); process.exit(1); });
