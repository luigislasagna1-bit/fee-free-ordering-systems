/**
 * Kitchen device presence helpers. A "device" is considered live if its
 * lastSeenAt is within FRESHNESS_MS of now. The kitchen PWA pings the
 * heartbeat endpoint on first load and again on every order poll, so any
 * device that's been off for longer than the window drops out of the
 * "connected" count.
 */

import prisma from "@/lib/db";

/** Devices not seen in the last 2 minutes are considered offline. */
export const FRESHNESS_MS = 2 * 60_000;

export async function hasLiveKitchenDevice(restaurantId: string): Promise<boolean> {
  const since = new Date(Date.now() - FRESHNESS_MS);
  const count = await prisma.kitchenDevice.count({
    where: { restaurantId, lastSeenAt: { gte: since } },
  });
  return count > 0;
}

export async function listKitchenDevices(restaurantId: string) {
  const since = new Date(Date.now() - FRESHNESS_MS);
  const rows = await prisma.kitchenDevice.findMany({
    where: { restaurantId },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceHash: true,
      label: true,
      userAgent: true,
      lastSeenAt: true,
      firstSeenAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    isLive: r.lastSeenAt.getTime() >= since.getTime(),
  }));
}

/**
 * Upsert by (restaurantId, deviceHash) so repeat polls don't pile up rows.
 * Returns the device row.
 */
export async function recordHeartbeat(input: {
  restaurantId: string;
  deviceHash: string;
  userAgent?: string | null;
  label?: string | null;
}) {
  const { restaurantId, deviceHash, userAgent, label } = input;
  const now = new Date();
  return prisma.kitchenDevice.upsert({
    where: { restaurantId_deviceHash: { restaurantId, deviceHash } },
    update: {
      lastSeenAt: now,
      ...(userAgent ? { userAgent } : {}),
      ...(label != null ? { label } : {}),
    },
    create: {
      restaurantId,
      deviceHash,
      userAgent: userAgent ?? null,
      label: label ?? null,
    },
  });
}
