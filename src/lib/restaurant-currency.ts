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
const CACHE = new Map<string, { at: number; currency: string }>();
const TTL_MS = 60_000;

export async function getRestaurantCurrency(restaurantId: string): Promise<string> {
  const hit = CACHE.get(restaurantId);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.currency;

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { currency: true },
  });
  const currency = (r?.currency || "usd").toLowerCase();
  CACHE.set(restaurantId, { at: now, currency });
  return currency;
}
