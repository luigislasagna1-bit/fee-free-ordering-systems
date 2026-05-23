import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * Widget install heartbeat.
 *
 * Called once by the embed widget.js script when it loads on any
 * third-party site. Lets us auto-detect that a restaurant has actually
 * pasted the embed snippet onto their existing website — driving the
 * "Install the Legacy Website widget" setup-checklist step so it
 * auto-completes without the owner having to manually click anything.
 *
 * Idempotent: the first ping ever stamps `Restaurant.widgetInstalledAt`.
 * Subsequent pings are no-ops (we only flip null → now()). This means
 * a single ping is all we need; no per-pageview overhead beyond the
 * widget's normal HTTP requests.
 *
 * Privacy / scale:
 *   - GET only — no body, no PII
 *   - Cross-origin friendly (browsers from every restaurant's site call
 *     this). Wide-open CORS is fine; the only info exposed is "does
 *     this widget ID exist".
 *   - Response is intentionally tiny — 1×1 pixel-like JSON — so it
 *     doesn't impact the host page's load time.
 *   - Rate-limited implicitly: each page-load of the host site fires
 *     one heartbeat from one device. Even a viral restaurant won't
 *     exceed Vercel's hot-path limits because we early-exit when
 *     widgetInstalledAt is already set.
 */
export const dynamic = "force-dynamic";

/** Shared CORS headers — the widget.js loader lives on third-party
 *  domains and needs us to be open. The only thing exposed is "does
 *  this widget ID exist" which is fine (the IDs are opaque/secret-by-
 *  obscurity but not actually security-bearing). */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

/** Core handler shared by GET + POST. The client uses navigator.sendBeacon
 *  which sends an HTTP POST with an empty body; older browsers fall back
 *  to fetch() with GET. We accept both to maximise install-detection
 *  coverage. (Earlier bug: this route was GET-only, so every sendBeacon
 *  call landed as a 405 Method Not Allowed and widgetInstalledAt stayed
 *  null forever — even when the widget was clearly live.) */
async function handle(publicId: string | null) {
  if (!publicId || publicId.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    // Find the restaurant by widgetPublicId and stamp widgetInstalledAt
    // only if it's currently null. Postgres-side conditional update
    // means we don't double-write on every page load.
    const updated = await prisma.restaurant.updateMany({
      where: { widgetPublicId: publicId, widgetInstalledAt: null },
      data: { widgetInstalledAt: new Date() },
    });
    // Note: updated.count === 0 either means (a) no restaurant has
    // that widgetPublicId or (b) widgetInstalledAt was already set.
    // Both are valid "ok" outcomes from the client's perspective —
    // it just wanted to fire and forget. Don't 404 on unknown IDs
    // because that would leak "this widget ID doesn't exist" to
    // anyone scanning. Always return ok:true.
    return NextResponse.json(
      { ok: true, recorded: updated.count > 0 },
      { headers: CORS_HEADERS },
    );
  } catch (e) {
    console.error("[widget/heartbeat]", e instanceof Error ? e.message : e);
    // Even on error, return ok:true — the heartbeat is best-effort
    // and we don't want to surface server troubles to a customer's
    // browser on a host page.
    return NextResponse.json(
      { ok: true, recorded: false },
      { headers: CORS_HEADERS },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("id"));
}

export async function POST(req: NextRequest) {
  // sendBeacon sends POST. The publicId still comes via query string
  // (?id=…) — sendBeacon's body would be an opaque Blob/FormData and we
  // don't need it, the query param is the source of truth either way.
  return handle(req.nextUrl.searchParams.get("id"));
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}
