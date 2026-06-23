/**
 * GET /m/<code> — Marketing Studio smart-link redirect (Luigi 2026-06-10).
 *
 * Looks up the SmartLink by its global code, 302s to the restaurant's ordering
 * page (with ?ref=<code> + utm so the existing visit tracker attributes it), and
 * records the scan AFTER the redirect flushes (`after()`) so it never blocks the
 * hop. State-dependent redirect → no-store headers so browsers/CDNs don't cache
 * a stale destination and every scan is counted.
 */
import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { platformBaseUrl } from "@/lib/marketing-studio";
import { restaurantOrigin } from "@/lib/restaurant-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function withHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
  return res;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const base = platformBaseUrl();
  const { code } = await params;
  const clean = (code || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);

  const link = clean
    ? await prisma.smartLink.findUnique({
        where: { code: clean },
        select: {
          id: true,
          targetPath: true,
          isActive: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          channelHint: true,
          restaurant: {
            select: { slug: true, subdomain: true, customDomain: true, customDomainStatus: true },
          },
        },
      })
    : null;

  // Unknown / disabled code → send them to the platform home rather than a 404.
  if (!link || !link.isActive) {
    return withHeaders(NextResponse.redirect(`${base}/`, { status: 302 }));
  }

  const path = link.targetPath.startsWith("/") ? link.targetPath : `/${link.targetPath}`;

  // Re-home order-flow targets onto the restaurant's MOST-BRANDED domain so a QR
  // scan for a verified-custom-domain (or subdomain) store lands on its own host,
  // not the platform apex. The default targetPath is "/order/<slug>" (smart-links
  // create route), so detect that prefix and, when the restaurant has a branded
  // (rooted) origin, drop the /order/<slug> prefix the proxy re-adds and serve the
  // remaining sub-path ROOT-relative on the branded origin. Arbitrary owner-supplied
  // non-order paths stay on the apex — the proxy can't serve those on a branded host.
  let destination = `${base}${path}`;
  const slug = link.restaurant?.slug;
  if (slug) {
    const orderPrefix = `/order/${slug}`;
    if (path === orderPrefix || path.startsWith(`${orderPrefix}/`)) {
      const { origin, rooted } = restaurantOrigin(link.restaurant!);
      if (rooted) {
        const remaining = path.slice(orderPrefix.length); // "" or "/sub/path"
        destination = `${origin}${remaining}`;
      }
    }
  }

  const target = new URL(destination);
  target.searchParams.set("ref", clean);
  target.searchParams.set("utm_source", link.utmSource || link.channelHint || "smartlink");
  if (link.utmMedium) target.searchParams.set("utm_medium", link.utmMedium);
  target.searchParams.set("utm_campaign", link.utmCampaign || clean);

  const res = withHeaders(NextResponse.redirect(target.toString(), { status: 302 }));

  // Count the scan without blocking the redirect.
  after(async () => {
    try {
      await prisma.$transaction([
        prisma.smartLinkScan.create({ data: { smartLinkId: link.id } }),
        prisma.smartLink.update({ where: { id: link.id }, data: { scanCount: { increment: 1 } } }),
      ]);
    } catch (e) {
      console.error("[/m] scan record failed", e);
    }
  });

  return res;
}
