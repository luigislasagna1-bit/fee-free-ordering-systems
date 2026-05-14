export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      { headers: { "User-Agent": "FeeFreeOrderingSystems/1.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ZoneLike = {
  id: string;
  name: string;
  color: string;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  sortOrder: number;
  isActive: boolean;
};

// Resolves which delivery zone a (lat,lng) point falls into.
// Rules: smallest containing zone wins (closer = cheaper). If the point is
// outside every active zone, fall back to the largest zone but mark inside=false
// so the UI can warn the customer.
export function findZoneForPoint<T extends ZoneLike>(
  zones: T[],
  restaurantLat: number,
  restaurantLng: number,
  customerLat: number,
  customerLng: number,
): { zone: T; inside: boolean; distanceKm: number } | null {
  const active = zones.filter(z => z.isActive).slice().sort((a, b) => a.radiusKm - b.radiusKm);
  if (active.length === 0) return null;
  const distanceKm = haversineKm(restaurantLat, restaurantLng, customerLat, customerLng);
  const containing = active.find(z => distanceKm <= z.radiusKm);
  if (containing) return { zone: containing, inside: true, distanceKm };
  return { zone: active[active.length - 1], inside: false, distanceKm };
}
