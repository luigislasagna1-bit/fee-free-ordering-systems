/**
 * Verify the domain routing behaviour end-to-end against live prod.
 *
 * For each test case: makes a HEAD/GET request to the URL, captures status
 * code + Location header + final URL after redirects, and asserts against
 * what proxy.ts is supposed to do.
 *
 * Run: `npx tsx scripts/verify-domain-routing.ts`
 */

type Case = {
  name: string;
  url: string;
  /** Allowed status codes — first one is preferred but any in the array passes. */
  expectStatus: number[];
  /** If we expect a redirect, what host should the Location header lead to? */
  expectLocationHost?: string;
  /** If we expect a redirect, what path should the Location header lead to? */
  expectLocationPath?: string;
};

const cases: Case[] = [
  // ── feefreeordering.com (primary platform) ───────────────────────────
  {
    name: "PLATFORM apex root → marketing landing (200)",
    url: "https://feefreeordering.com/",
    expectStatus: [200],
  },
  {
    name: "PLATFORM www → 308 to apex",
    url: "https://www.feefreeordering.com/",
    expectStatus: [308, 301, 307],
    expectLocationHost: "feefreeordering.com",
  },
  {
    name: "PLATFORM /marketplace → 301 to MARKETPLACE_DOMAIN",
    url: "https://feefreeordering.com/marketplace",
    expectStatus: [301, 302, 307, 308],
    expectLocationHost: "feefreefood.com",
  },

  // ── feefreefood.com (marketplace) ────────────────────────────────────
  {
    name: "MARKETPLACE apex root → marketplace grid (200)",
    url: "https://feefreefood.com/",
    expectStatus: [200],
  },
  {
    name: "MARKETPLACE www → 308 to apex",
    url: "https://www.feefreefood.com/",
    expectStatus: [308, 301, 307],
    expectLocationHost: "feefreefood.com",
  },
  {
    name: "MARKETPLACE /admin → 302 to PLATFORM",
    url: "https://feefreefood.com/admin",
    expectStatus: [302, 301, 307, 308],
    expectLocationHost: "feefreeordering.com",
    expectLocationPath: "/admin",
  },
  {
    name: "MARKETPLACE /login → 302 to PLATFORM",
    url: "https://feefreefood.com/login",
    expectStatus: [302, 301, 307, 308],
    expectLocationHost: "feefreeordering.com",
    expectLocationPath: "/login",
  },
  {
    name: "MARKETPLACE /kitchen → 302 to PLATFORM",
    url: "https://feefreefood.com/kitchen",
    expectStatus: [302, 301, 307, 308],
    expectLocationHost: "feefreeordering.com",
    expectLocationPath: "/kitchen",
  },
];

async function checkOne(c: Case): Promise<{ pass: boolean; details: string }> {
  try {
    const res = await fetch(c.url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "feefree-verify-script/1.0" },
    });
    const loc = res.headers.get("location");
    const statusOk = c.expectStatus.includes(res.status);
    let locOk = true;
    let locReason = "";

    if (c.expectLocationHost || c.expectLocationPath) {
      if (!loc) {
        locOk = false;
        locReason = " (no Location header)";
      } else {
        let parsed: URL;
        try {
          parsed = new URL(loc, c.url);
        } catch {
          return { pass: false, details: `bad Location header: ${loc}` };
        }
        if (c.expectLocationHost && parsed.host !== c.expectLocationHost) {
          locOk = false;
          locReason = ` (host ${parsed.host} != ${c.expectLocationHost})`;
        }
        if (
          c.expectLocationPath &&
          !parsed.pathname.startsWith(c.expectLocationPath)
        ) {
          locOk = false;
          locReason = ` (path ${parsed.pathname} != ${c.expectLocationPath})`;
        }
      }
    }

    const pass = statusOk && locOk;
    const details = `status=${res.status}${loc ? ` location=${loc}` : ""}${locReason}`;
    return { pass, details };
  } catch (err: any) {
    return { pass: false, details: `request failed: ${err?.message || err}` };
  }
}

async function main() {
  console.log("Verifying domain routing against live prod\n");
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const result = await checkOne(c);
    const marker = result.pass ? "OK  " : "FAIL";
    console.log(`  ${marker}  ${c.name}`);
    console.log(`         ${result.details}`);
    if (result.pass) pass++;
    else fail++;
  }
  console.log(`\n${pass}/${cases.length} passed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
