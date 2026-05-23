/**
 * Multi-tenant robots.txt. Points crawlers at the host-specific sitemap
 * and blocks admin/superadmin/api surfaces from being indexed.
 *
 * Like sitemap.xml, the proxy matcher excludes robots.txt so this
 * handler runs for whatever host is requesting.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0].trim();
  const base = `https://${host}`;
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    // Don't waste crawl budget on admin / superadmin / API / kitchen /
    // private routes. These would 401 anyway for unauthenticated bots
    // but disallowing keeps them out of Google's index entirely.
    "Disallow: /admin",
    "Disallow: /superadmin",
    "Disallow: /api",
    "Disallow: /kitchen",
    "Disallow: /reseller",
    "Disallow: /account",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /forgot-password",
    "Disallow: /reset-password",
    "Disallow: /verify-email",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
