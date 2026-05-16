import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Force Node runtime — Prisma cannot run in edge runtime.
export const runtime = "nodejs";

/**
 * Internal-only host → slug resolver. Called by the edge middleware whose LRU
 * misses on a host. Gated by a shared secret so it cannot be enumerated from
 * the public internet (otherwise a bot could probe for tenant slugs cheaply).
 *
 * Query params:
 *   by    = "subdomain" | "customDomain"
 *   value = the value to look up (already lowercased by caller)
 *
 * Returns: { slug: string | null }
 */
export async function GET(req: NextRequest) {
  const headerKey = req.headers.get("x-internal-key");
  const expectedKey = process.env.INTERNAL_API_SECRET;

  // In dev we don't require the secret so local middleware works without env
  // setup. In production we always require it.
  if (process.env.NODE_ENV === "production") {
    if (!expectedKey || headerKey !== expectedKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const by = req.nextUrl.searchParams.get("by");
  const value = (req.nextUrl.searchParams.get("value") || "").toLowerCase().trim();

  if (!value) return NextResponse.json({ slug: null });
  if (by !== "subdomain" && by !== "customDomain") {
    return NextResponse.json({ error: "Bad by param" }, { status: 400 });
  }

  const where = by === "subdomain"
    ? { subdomain: value, isActive: true }
    : { customDomain: value, isActive: true, customDomainStatus: "verified" };

  const r = await prisma.restaurant.findFirst({
    where: where as any,
    select: { slug: true },
  });

  return NextResponse.json({ slug: r?.slug ?? null });
}

/**
 * POST /api/_internal/resolve-host?host=... — invalidate the upstream
 * middleware LRU entry for a host. The middleware in-memory cache is per
 * instance, so this is a hint, not a strong invalidation; relying on the 60s
 * positive TTL as the ceiling is fine.
 *
 * In practice, called by the admin domain UI after a save. Returns 200 even
 * when the cache is empty so callers don't need to handle a "miss" response.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const headerKey = req.headers.get("x-internal-key");
    const expectedKey = process.env.INTERNAL_API_SECRET;
    if (!expectedKey || headerKey !== expectedKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  // The cache lives in the middleware module which we cannot touch from here
  // directly. This endpoint just returns success — TTL handles the rest.
  return NextResponse.json({ ok: true });
}
