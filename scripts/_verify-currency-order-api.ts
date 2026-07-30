/** DEV-ONLY: prove the €/$ bug + fix on /api/orders/[id].
 *  Fabrizio cmrkmtva: a EUR restaurant's pay screen showed "$" because the
 *  SIGNED-IN branch of the order API selected a restaurant object WITHOUT
 *  `currency` (the owner tests his own store while logged into admin), so the
 *  payment page fell back to "usd". Asserts currency is now returned on BOTH
 *  the signed-in and public branches. Logs in for real via NextAuth credentials. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = "http://localhost:3001";
const EMAIL = "owner@pizzapalace.com";
const PASSWORD = "Verify123!";

function cookiesFrom(res: Response): string {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  return raw.map((c: string) => c.split(";")[0]).join("; ");
}

async function login(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { cache: "no-store" });
  const { csrfToken } = await csrfRes.json();
  let jar = cookiesFrom(csrfRes);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false", json: "true" }),
    redirect: "manual",
  });
  const fresh = cookiesFrom(res);
  if (fresh) jar = [jar, fresh].filter(Boolean).join("; ");
  return jar;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — aborting.");
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, currency: true } });
  if (!r) throw new Error("demo-pizza-palace not found");
  const original = r.currency;
  await p.restaurant.update({ where: { id: r.id }, data: { currency: "eur" } }); // simulate Fabrizio's EUR store

  const order = await p.order.create({
    data: {
      restaurantId: r.id, orderNumber: "CU" + String(Date.now()).slice(-5),
      status: "pending", type: "pickup", customerName: "Currency Check",
      customerEmail: "cur@example.com", customerPhone: "+12895550003",
      subtotal: 60, total: 67.2, paymentStatus: "pending", paymentMethod: "card",
    },
    select: { id: true },
  });

  let pass = 0, fail = 0;
  const chk = (n: string, c: boolean, got: any) => {
    if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} — got ${JSON.stringify(got)}`); }
  };

  // 1) PUBLIC branch (a real customer, not signed in) — was already correct.
  const pub = await fetch(`${BASE}/api/orders/${order.id}`, { cache: "no-store" }).then((x) => x.json());
  chk("public branch returns restaurant.currency = eur", pub?.restaurant?.currency === "eur", pub?.restaurant?.currency);

  // 2) SIGNED-IN branch (the owner testing his own store) — THE BUG.
  const jar = await login();
  const inRes = await fetch(`${BASE}/api/orders/${order.id}`, { cache: "no-store", headers: { Cookie: jar } });
  const signedIn = await inRes.json();
  chk("logged-in fetch is authorized (not the public shape)", inRes.status === 200, inRes.status);
  chk("SIGNED-IN branch returns restaurant.currency = eur  <-- the fix", signedIn?.restaurant?.currency === "eur", signedIn?.restaurant?.currency);
  // The payment page also reads these off the same object; they were missing too.
  chk("signed-in branch also returns rewardsEnabled (was missing)", signedIn?.restaurant?.rewardsEnabled !== undefined, signedIn?.restaurant?.rewardsEnabled);

  // What PaymentPageClient would render: formatCurrency(total, currency ?? "usd")
  const eff = (signedIn?.restaurant?.currency || "usd").toLowerCase();
  const rendered = new Intl.NumberFormat(eff === "eur" ? "it-IT" : "en-US", { style: "currency", currency: eff.toUpperCase() }).format(67.2);
  chk(`pay screen renders EUR not $  (${rendered})`, !rendered.includes("$"), rendered);

  await p.order.delete({ where: { id: order.id } }).catch(() => {});
  await p.restaurant.update({ where: { id: r.id }, data: { currency: original } });
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  await p.$disconnect();
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
