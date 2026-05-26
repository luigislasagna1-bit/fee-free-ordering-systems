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
 *
 * Side effect: when this heartbeat represents a transition from
 * offline → online (the previous lastSeenAt was older than
 * FRESHNESS_MS, or there was no prior row), we append a sparse
 * `ConnectivityEvent` row of type "online". The Connectivity Health
 * report replays these events to compute uptime over a window.
 *
 * We deliberately only log the ONLINE side of transitions —
 * offline periods are derived as the gap between two online events,
 * so we don't need a separate "device went offline" job (which would
 * be impossible to fire from the device itself once it's offline).
 * The Reports query reconstructs offline periods from gaps > FRESHNESS_MS.
 *
 * Volume: at typical 4s poll cadence with stable uptime, a device
 * fires AT MOST one ConnectivityEvent per offline-online cycle. For a
 * busy restaurant that's 5-10 rows/day worst case — tiny.
 */
export async function recordHeartbeat(input: {
  restaurantId: string;
  deviceHash: string;
  userAgent?: string | null;
  label?: string | null;
}) {
  const { restaurantId, deviceHash, userAgent, label } = input;
  const now = new Date();

  // Read prior state in the SAME transaction-ish window so we can detect
  // online↔offline transitions accurately. The findUnique uses the same
  // composite unique index the upsert hits — no extra index lookup.
  const prior = await prisma.kitchenDevice.findUnique({
    where: { restaurantId_deviceHash: { restaurantId, deviceHash } },
    select: { lastSeenAt: true },
  });
  const wasOffline =
    !prior ||
    !prior.lastSeenAt ||
    now.getTime() - prior.lastSeenAt.getTime() > FRESHNESS_MS;

  const device = await prisma.kitchenDevice.upsert({
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

  // Append the transition event AFTER the upsert succeeds. Fire-and-
  // forget so a transient analytics write failure never breaks the
  // heartbeat response — the kitchen poll is on the hot path and MUST
  // stay fast.
  if (wasOffline) {
    prisma.connectivityEvent
      .create({
        data: {
          restaurantId,
          deviceHash,
          eventType: "online",
          occurredAt: now,
        },
      })
      .catch((err) => {
        console.error("[recordHeartbeat] connectivityEvent insert failed", {
          restaurantId,
          deviceHash,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return device;
}
