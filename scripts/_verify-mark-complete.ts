/** DEV-ONLY: reproduce Fabrizio cmrlvvg7d — "Mark Complete" does nothing on an
 *  order whose timer hit 00:00.
 *
 *  His exact test: an ASAP order whose timer reached zero (the auto-complete
 *  sweep has already flipped it to "completed" WITHOUT manuallyClearedAt) vs a
 *  future-scheduled order (still "accepted"). Tapping Mark Complete PATCHes
 *  status="completed"; Simple mode only drops an order out of "In Progress"
 *  once manuallyClearedAt is set. Asserts BOTH end up cleared. */
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
  return fresh ? [jar, fresh].filter(Boolean).join("; ") : jar;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — aborting.");
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo-pizza-palace not found");
  const jar = await login();

  const mk = (over: any) =>
    p.order.create({
      data: {
        restaurantId: r.id, orderNumber: "MC" + String(Date.now()).slice(-5) + Math.floor(Math.random() * 90),
        type: "pickup", customerName: "MarkComplete Test", customerEmail: "mc@example.com",
        customerPhone: "+12895550004", subtotal: 20, total: 24.5, paymentStatus: "paid",
        paymentMethod: "card", ...over,
      },
      select: { id: true, status: true, manuallyClearedAt: true },
    });

  const markComplete = async (id: string) =>
    fetch(`${BASE}/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: jar },
      body: JSON.stringify({ status: "completed" }),
    });

  let pass = 0, fail = 0;
  const chk = (n: string, c: boolean, got: any) => {
    if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} — got ${JSON.stringify(got)}`); }
  };

  // A) HIS BUG: ASAP order whose timer hit 00:00 -> the sweep already set
  //    status="completed" (via updateMany, so manuallyClearedAt is null).
  const asap = await mk({ status: "completed", completedAt: new Date(), estimatedReady: new Date(Date.now() - 60_000) });
  await markComplete(asap.id);
  const asapAfter = await p.order.findUnique({ where: { id: asap.id }, select: { status: true, manuallyClearedAt: true } });
  chk("ASAP order past 00:00 -> Mark Complete CLEARS it out of In Progress",
    asapAfter?.manuallyClearedAt != null, asapAfter);

  // B) CONTROL: future-scheduled order, still "accepted" -> already worked.
  const fri = await mk({ status: "accepted", scheduledFor: new Date(Date.now() + 3 * 24 * 3600_000) });
  await markComplete(fri.id);
  const friAfter = await p.order.findUnique({ where: { id: fri.id }, select: { status: true, manuallyClearedAt: true } });
  chk("future-scheduled order -> still completes (no regression)",
    friAfter?.manuallyClearedAt != null && friAfter?.status === "completed", friAfter);

  // C) The no-op guard must still suppress duplicate side-effects: a SECOND tap
  //    on an already-cleared order must not move the clear timestamp.
  const firstClear = asapAfter?.manuallyClearedAt;
  await new Promise((s) => setTimeout(s, 50));
  await markComplete(asap.id);
  const asapTwice = await p.order.findUnique({ where: { id: asap.id }, select: { manuallyClearedAt: true } });
  chk("double-tap is still a no-op (clear timestamp unchanged)",
    String(asapTwice?.manuallyClearedAt) === String(firstClear), { firstClear, now: asapTwice?.manuallyClearedAt });

  await p.order.deleteMany({ where: { id: { in: [asap.id, fri.id] } } }).catch(() => {});
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  await p.$disconnect();
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
