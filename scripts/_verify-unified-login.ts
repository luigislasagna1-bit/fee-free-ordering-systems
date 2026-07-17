/**
 * v1.1 Phase 1 gate — unified-login verification matrix (plan §7.1) executed
 * against the LOCAL dev server through the real form with real credentials.
 * DEV-only. Success cases run before failure cases so in-memory rate-limit
 * counters (login-protection.ts: 10 fails / 5 min per scope, ip + email) can't
 * contaminate earlier assertions; case 8's exhaust uses ?as=driver so ONLY the
 * driver scope burns, proving the cascade's fall-through afterwards.
 *   npx tsx scripts/_verify-unified-login.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { chromium, type Browser, type BrowserContext } from "playwright-core";

const BASE = "http://localhost:3001";
const DRIVER = { email: "driver@demo.com", pw: "driver1234" };
const RESTO = { email: "demo@feefreeordering.com", pw: "DemoPlay1234!" };
const DRIVER_MARK = "Demo Driver";
const DISPATCH_MARK = "Fee Free Demo Restaurant";

let browser: Browser;
let failed = 0;
function report(pass: boolean, label: string, extra = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!pass) failed++;
}

async function login(ctx: BrowserContext, email: string, pw: string, path = "/driver/login") {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  const body = (await page.evaluate(() => document.body.innerText).catch(() => "")) ?? "";
  const url = page.url();
  await page.close();
  return { body, url };
}

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only.");
  browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });

  // PRE-WARM the dev server's lazy-compiled routes so case 1's timing isn't a
  // cold-compile flake, and note: run this suite ONCE per server restart — the
  // failure cases deliberately saturate the in-memory login rate limiter
  // (5-min window), so back-to-back runs fail on the limiter, not the form.
  console.log("warming routes…");
  await fetch(`${BASE}/driver/login`).catch(() => {});
  await fetch(`${BASE}/api/auth/csrf`).catch(() => {});
  await fetch(`${BASE}/api/auth/driver/csrf`).catch(() => {});
  await new Promise((r) => setTimeout(r, 12000));

  // ── Case 1: driver creds → queue ─────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    const r = await login(ctx, DRIVER.email, DRIVER.pw);
    report(r.url.endsWith("/driver") && r.body.includes(DRIVER_MARK), "1 driver creds → queue", r.url);
    await ctx.close();
  }

  // ── Case 2: restaurant creds → dispatch + pref cookie ────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    const r = await login(ctx, RESTO.email, RESTO.pw);
    const cookies = await ctx.cookies(BASE);
    const pref = cookies.find((c) => c.name === "ffd-role-pref")?.value;
    report(
      r.url.endsWith("/driver") && r.body.includes(DISPATCH_MARK) && pref === "restaurant",
      "2 restaurant creds → dispatch + pref=restaurant",
      `url=${r.url} pref=${pref}`,
    );
    await ctx.close();
  }

  // ── Case 6: dual-session device — owner login, driver session survives ───
  {
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    await login(ctx, DRIVER.email, DRIVER.pw); // driver session
    const r2 = await login(ctx, RESTO.email, RESTO.pw, "/driver/login?as=restaurant"); // owner signs in on same device
    const dispatchOk = r2.body.includes(DISPATCH_MARK);
    // Flip pref back to driver — the queue must render WITHOUT re-login.
    await ctx.addCookies([{ name: "ffd-role-pref", value: "driver", domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/driver`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const body = (await page.evaluate(() => document.body.innerText)) ?? "";
    const stillDriver = body.includes(DRIVER_MARK) && page.url().endsWith("/driver");
    await page.close();
    report(dispatchOk && stillDriver, "6 dual-session: owner→dispatch, driver session survives + switcher returns", `dispatch=${dispatchOk} driverBack=${stillDriver}`);
    await ctx.close();
  }

  // ── Case 9 (trimmed): restaurant-first ordering doesn't burn driver scope ─
  {
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "ffd-role-pref", value: "restaurant", domain: "localhost", path: "/" }]);
      await login(ctx, RESTO.email, RESTO.pw);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    const r = await login(ctx, DRIVER.email, DRIVER.pw);
    report(r.body.includes(DRIVER_MARK), "9 repeat restaurant logins, then driver login still succeeds", r.url);
    await ctx.close();
  }

  // ── Case 4: four wrong-credential permutations → byte-identical toast ────
  {
    const wrongs = [
      { email: "nobody@example.com", pw: "wrongwrong1" },
      { email: DRIVER.email, pw: "wrongwrong1" },
      { email: RESTO.email, pw: "wrongwrong1" },
      { email: "nobody2@example.com", pw: "alsowrong2" },
    ];
    const toasts: string[] = [];
    for (const w of wrongs) {
      const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/driver/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.fill('input[type="email"]', w.email);
      await page.fill('input[type="password"]', w.pw);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4500);
      const toast = await page.evaluate(() => {
        const el = document.querySelector('[role="status"], [class*="go318386747"], [id^="_rht_"]');
        return el?.textContent ?? document.body.innerText.split("\n").find((l) => l.includes("couldn't sign you in")) ?? "";
      });
      toasts.push((toast ?? "").trim());
      await page.close();
      await ctx.close();
    }
    const allSame = toasts.every((tt) => tt && tt === toasts[0]);
    report(allSame, "4 four wrong-credential permutations → byte-identical toast", allSame ? `"${toasts[0].slice(0, 50)}…"` : JSON.stringify(toasts.map((x) => x.slice(0, 40))));
  }

  // ── Case 8: exhaust driver scope via ?as=driver, correct restaurant creds still get through ─
  {
    for (let i = 0; i < 10; i++) {
      const ctx = await browser.newContext();
      await login(ctx, "exhaust-me@example.com", "wrongpw" + i, "/driver/login?as=driver");
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 450, height: 900 } });
    const r = await login(ctx, RESTO.email, RESTO.pw); // cascade: driver leg now rate-limited → falls through
    report(r.body.includes(DISPATCH_MARK), "8 driver scope exhausted → restaurant cascade fall-through succeeds", r.url);
    await ctx.close();
  }

  await browser.close();
  console.log(failed === 0 ? "ALL MATRIX CASES PASS" : `${failed} CASE(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
