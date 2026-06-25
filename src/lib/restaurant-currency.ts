import "server-only";
import prisma from "@/lib/db";

/**
 * Resolve a restaurant's ISO-4217 currency code for server components that
 * only have a restaurantId (admin report pages, customer detail, etc.).
 *
 * Small in-memory cache (60s TTL) so a report page that renders several
 * money sections — or a brand parent fanning out — doesn't issue one query
 * per render. Currency changes rarely; a 60s lag is fine and the seam is
 * here if we ever want a longer TTL or a shared cache layer.
 */
const CACHE = new Map<string, { at: number; currency: string; timezone: string | null }>();
const TTL_MS = 60_000;

async function loadCtx(restaurantId: string): Promise<{ currency: string; timezone: string | null }> {
  const hit = CACHE.get(restaurantId);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return { currency: hit.currency, timezone: hit.timezone };

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { currency: true, timezone: true },
  });
  const currency = (r?.currency || "usd").toLowerCase();
  const timezone = r?.timezone ?? null;
  CACHE.set(restaurantId, { at: now, currency, timezone });
  return { currency, timezone };
}

export async function getRestaurantCurrency(restaurantId: string): Promise<string> {
  return (await loadCtx(restaurantId)).currency;
}

/**
 * Restaurant IANA timezone (e.g. "America/Toronto") for tz-aware report ranges,
 * or null if unset (callers fall back to server-local). Shares the 60s cache
 * with currency so a report page resolving both issues a single query.
 */
export async function getRestaurantTimezone(restaurantId: string): Promise<string | null> {
  return (await loadCtx(restaurantId)).timezone;
}
