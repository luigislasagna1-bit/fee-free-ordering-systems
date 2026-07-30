/** DEV-ONLY edge-case exercise for the zero-downtime domain switch, driven
 *  directly against the DB + resolver (no UI): proves the three columns and
 *  the resolver behave for the nasty sequences.
 *
 *    A) switch A -> B, then switch BACK to A (A is in previousCustomDomain
 *       while becoming pendingCustomDomain — three @unique columns, same row)
 *    B) during a pending switch, the LIVE domain still resolves
 *    C) after cutover, the OLD domain redirects and the NEW one serves
 *
 *  Run with the dev server up on :3001. Leaves the demo store clean.
 */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = "http://localhost:3001";
const A = "edge-a.test";
const B = "edge-b.test";

async function resolveHost(value: string) {
  const r = await fetch(`${BASE}/api/internal/resolve-host?by=customDomain&value=${encodeURIComponent(value)}`);
  return r.json() as Promise<{ slug: string | null; redirectToHost?: string | null }>;
}

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else { fail++; console.log(`✗ ${label} ${detail}`); }
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, slug: true } });
  if (!r) throw new Error("demo store missing");
  const id = r.id;
  const reset = () => p.restaurant.update({
    where: { id },
    data: { customDomain: null, pendingCustomDomain: null, previousCustomDomain: null, customDomainStatus: "none" },
  });

  try {
    // ── Live on A, pending switch to B ─────────────────────────────────────
    await reset();
    await p.restaurant.update({
      where: { id },
      data: { customDomain: A, customDomainStatus: "verified", pendingCustomDomain: B },
    });
    check("B) live domain still resolves during a pending switch", (await resolveHost(A)).slug === r.slug);
    // SECURITY (2026-07-30 review): a pending domain must NOT be served — it
    // carries no ownership proof, so serving it let one tenant answer for
    // another tenant's domain. Zero-downtime comes from the live domain being
    // untouched, not from serving the pending one early.
    const pend = await resolveHost(B);
    check("B) pending domain is NOT served (no ownership proof yet)",
      pend.slug === null && !pend.redirectToHost, JSON.stringify(pend));

    // ── Cutover A -> B ─────────────────────────────────────────────────────
    await p.restaurant.update({
      where: { id },
      data: { previousCustomDomain: A, customDomain: B, pendingCustomDomain: null },
    });
    const afterOld = await resolveHost(A);
    const afterNew = await resolveHost(B);
    check("C) old domain redirects to the new one", afterOld.redirectToHost === B, JSON.stringify(afterOld));
    check("C) new domain serves the store", afterNew.slug === r.slug);
    check("C) www.<old> also redirects", (await resolveHost(`www.${A}`)).redirectToHost === B);

    // ── Switch BACK to A (A is previousCustomDomain AND becomes pending) ───
    let backOk = true, backErr = "";
    try {
      await p.restaurant.update({ where: { id }, data: { pendingCustomDomain: A } });
    } catch (e: any) { backOk = false; backErr = String(e?.message).slice(0, 120); }
    check("A) switching BACK to a previous domain is allowed by the schema", backOk, backErr);
    if (backOk) {
      const dual = await resolveHost(A);
      // A is now BOTH previousCustomDomain and pendingCustomDomain. Pending is
      // never served, so the previous-domain redirect answers — and it must
      // point at the CURRENT live domain (B), not at itself (no loop).
      check("A) switch-back window: redirects to live B, never to itself",
        dual.redirectToHost === B, JSON.stringify(dual));
      // Complete the switch-back.
      await p.restaurant.update({
        where: { id },
        data: { previousCustomDomain: B, customDomain: A, pendingCustomDomain: null },
      });
      const finalA = await resolveHost(A);
      const finalB = await resolveHost(B);
      check("A) after switch-back, A serves", finalA.slug === r.slug);
      check("A) after switch-back, B redirects to A", finalB.redirectToHost === A, JSON.stringify(finalB));
      check("A) no redirect loop (A does not redirect)", !finalA.redirectToHost);
    }
  } finally {
    await reset();
    await p.$disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
main();
