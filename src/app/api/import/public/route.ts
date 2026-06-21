import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  parseSource,
  clampToGloriaFoodHost,
  fetchGloriaFoodMenu,
  fetchGloriaFoodPictures,
  mapMenu,
} from "@/lib/menu-import/gloriafood";
import { provisionSandbox, commitSandboxMenu, deleteSandbox } from "@/lib/menu-import/sandbox";

// Most menus import in seconds; an unusually huge one (Luigi's = 12k options)
// can take ~90s. Headroom for that, still under the admin importer's 300s.
export const maxDuration = 180;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/import/public — UNAUTHENTICATED "import your GloriaFood menu and try
 * it live" entry point. Reuses the exact admin import library to parse + map the
 * menu, then provisions a temporary sandbox restaurant the visitor can order
 * from immediately, and returns a claim token so signup can attach THAT
 * restaurant (zero re-import). Security: IP rate-limit + SSRF host-clamp +
 * email gate; sandboxes carry a TTL and are cleaned up if never claimed.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Tight cap — this is unauthenticated, fetches a remote menu and writes a
  // restaurant. 4 / IP / hour is generous for a real owner trying it out.
  if (!rateLimit(`import-public:${ip}`, 4, 60 * 60_000)) {
    return NextResponse.json(
      { error: "Too many imports from this network right now. Please try again in a little while." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { source?: string; email?: string; country?: string };
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!source) {
    return NextResponse.json({ error: "Paste your GloriaFood menu link or embed snippet." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email so we can save your live preview." }, { status: 400 });
  }

  // Parse + SSRF-clamp the host to a GloriaFood origin BEFORE any network call.
  let parsed;
  try {
    parsed = clampToGloriaFoodHost(parseSource(source));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that menu link." }, { status: 400 });
  }

  // Fetch + map — the exact same library the (trusted) admin importer uses.
  let preview;
  try {
    const [menu, pictures] = await Promise.all([fetchGloriaFoodMenu(parsed), fetchGloriaFoodPictures(parsed)]);
    preview = mapMenu(menu, pictures);
  } catch (e) {
    console.error("[import-public] fetch/map failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "We couldn't reach that GloriaFood menu. Double-check the link — or sign up and our team will build it for you." },
      { status: 502 },
    );
  }
  if (!preview.categories.length || preview.stats.items === 0) {
    return NextResponse.json(
      { error: "That menu came back empty. Make sure you pasted your GloriaFood ordering link or embed snippet." },
      { status: 422 },
    );
  }

  // Provision the live sandbox + commit the menu into it.
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const restaurantName = (preview.sourceMenuName || "").trim() || "Your Restaurant";
  let sandbox;
  try {
    sandbox = await provisionSandbox({ restaurantName, email, country: body.country, ipHash, sourceLabel: parsed.restaurantUid });
    await commitSandboxMenu(sandbox.restaurantId, preview);
  } catch (e) {
    console.error("[import-public] provision/commit failed:", e instanceof Error ? e.message : String(e));
    // Don't leave an orphan live restaurant behind if the menu commit failed.
    if (sandbox?.restaurantId) {
      try { await deleteSandbox(sandbox.restaurantId); } catch (ce) { console.error("[import-public] orphan cleanup failed:", ce instanceof Error ? ce.message : String(ce)); }
    }
    return NextResponse.json({ error: "Something went wrong building your preview. Please try again." }, { status: 500 });
  }

  console.log(`[import-public] sandbox ${sandbox.slug}: ${preview.stats.categories} cats, ${preview.stats.items} items, ${preview.stats.modifierGroups} groups`);
  return NextResponse.json({
    slug: sandbox.slug,
    claimToken: sandbox.claimToken,
    stats: preview.stats,
    // The visitor lands on their LIVE storefront; the claim token rides along so
    // signup can attach THIS restaurant + flip it live (zero re-import).
    redirect: `/order/${sandbox.slug}?claim=${sandbox.claimToken}`,
  });
}
