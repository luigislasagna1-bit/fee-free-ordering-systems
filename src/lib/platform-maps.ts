import "server-only";
import prisma from "@/lib/db";

/**
 * Platform-wide Google Maps key: set ONCE in superadmin
 * (PlatformSettings.googleMapsApiKey) and every restaurant uses it for maps,
 * Places autocomplete, and Distance Matrix — no per-restaurant Google Cloud
 * setup. The platform key is used ALWAYS (Luigi 2026-07-04) — a restaurant's
 * own googleMapsApiKey is never consulted anymore (legacy values ignored).
 *
 * Server-only. The browser half reaches the client by being resolved into the
 * existing `googleMapsApiKey` prop on each map-rendering page (so the client's
 * resolveMapsBrowserKey just receives the right value — no new client global).
 *
 * Cached in-process for 60s because this is read on the customer order page,
 * which is a hot path (one restaurant lookup per request is plenty without
 * re-hitting PlatformSettings every time).
 */
let cache: { key: string; at: number } | null = null;
const TTL_MS = 60_000;

export async function getPlatformGoogleKey(now: number = Date.now()): Promise<string> {
  if (cache && now - cache.at < TTL_MS) return cache.key;
  let key = "";
  try {
    const s = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { googleMapsApiKey: true },
    });
    key = s?.googleMapsApiKey?.trim() || "";
  } catch {
    key = "";
  }
  cache = { key, at: now };
  return key;
}

/** The Google Maps key every restaurant uses — always the platform key.
 *  Returns "" when none is configured (→ free Leaflet/OSM map). */
export async function resolveEffectiveMapsKey(): Promise<string> {
  return getPlatformGoogleKey();
}
