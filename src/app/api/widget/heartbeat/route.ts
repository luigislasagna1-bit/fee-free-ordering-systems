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

export async function GET(req: NextRequest) {
  const publicId = req.nextUrl.searchParams.get("id");

  // CORS headers for the response. The widget.js script is on a
  // third-party domain — we need to allow it to read the response.
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": "no-store",
  };

  if (!publicId || publicId.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders });
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
    return NextResponse.json({ ok: true, recorded: updated.count > 0 }, { headers: corsHeaders });
  } catch (e) {
    console.error("[widget/heartbeat]", e instanceof Error ? e.message : e);
    // Even on error, return ok:true — the heartbeat is best-effort
    // and we don't want to surface server troubles to a customer's
    // browser on a host page.
    return NextResponse.json({ ok: true, recorded: false }, { headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}
