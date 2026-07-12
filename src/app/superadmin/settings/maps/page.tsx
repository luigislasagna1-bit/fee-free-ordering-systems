import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { MapsSettingsClient } from "./MapsSettingsClient";

export default async function MapsSettingsPage() {
  // Platform secrets — FULL superadmin only. The layout already bounced
  // unauthenticated visitors to /login; a support user lands on the dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  // Tolerate the column not yet existing on this DB (prod migration may lag the
  // deploy) — render empty rather than 500 until the schema lands.
  let settings: { googleMapsApiKey: string | null; updatedAt: Date | null } | null = null;
  try {
    settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { googleMapsApiKey: true, updatedAt: true },
    });
  } catch {
    settings = null;
  }

  // Pre-fill suggestion: the oldest restaurant that already has a Google key
  // (e.g. Luigi's own) — one click to adopt it as the platform-wide key.
  const withKey = await prisma.restaurant.findFirst({
    where: { googleMapsApiKey: { not: null } },
    select: { name: true, googleMapsApiKey: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <MapsSettingsClient
      initial={{
        googleMapsApiKey: settings?.googleMapsApiKey ?? "",
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
        suggestion:
          withKey?.googleMapsApiKey && withKey.googleMapsApiKey !== settings?.googleMapsApiKey
            ? { name: withKey.name, key: withKey.googleMapsApiKey }
            : null,
      }}
    />
  );
}
