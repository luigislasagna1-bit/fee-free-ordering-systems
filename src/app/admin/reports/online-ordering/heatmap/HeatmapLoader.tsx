"use client";

import dynamic from "next/dynamic";
import type { HeatPoint, DeliveryZoneOverlay } from "./HeatmapClient";

/**
 * Client-side dynamic loader for the Leaflet heatmap.
 *
 * Why this file exists: Next.js 16 forbids `dynamic(..., { ssr: false })`
 * in Server Components. The page.tsx that fetches data + computes
 * points is a Server Component (needs Prisma + getSessionUser). So
 * the dynamic-with-ssr:false has to live in a "use client" boundary —
 * this file is that boundary, and nothing more.
 *
 * The actual map rendering still happens in HeatmapClient.tsx. This
 * is purely the lazy-import shim.
 */
const HeatmapClient = dynamic(
  () => import("./HeatmapClient").then((m) => m.HeatmapClient),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] rounded-xl bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        Loading map…
      </div>
    ),
  },
);

export function HeatmapLoader(props: {
  restaurantLat: number;
  restaurantLng: number;
  restaurantName: string;
  points: HeatPoint[];
  zones: DeliveryZoneOverlay[];
}) {
  return <HeatmapClient {...props} />;
}
