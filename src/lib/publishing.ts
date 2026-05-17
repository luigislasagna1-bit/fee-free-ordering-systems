/**
 * Publishing helpers — owns the rules for "is this restaurant publish-ready"
 * and the lazy generation of the opaque `widgetPublicId`. Kept separate from
 * setup-checklist.ts because the checklist is a pure helper; this one talks
 * to Prisma.
 */

import prisma from "@/lib/db";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import type { SetupProgress } from "@/lib/setup-checklist";
import crypto from "crypto";

export interface PublishState {
  publishedAt: Date | null;
  widgetPublicId: string | null;
  progress: SetupProgress | null;
}

export async function getPublishState(restaurantId: string): Promise<PublishState> {
  const [restaurant, progress] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { publishedAt: true, widgetPublicId: true },
    }),
    loadSetupProgress(restaurantId),
  ]);
  return {
    publishedAt: restaurant?.publishedAt ?? null,
    widgetPublicId: restaurant?.widgetPublicId ?? null,
    progress,
  };
}

/** Generate a fresh opaque widget ID. Format: `wgt_<22 url-safe chars>`. */
function newWidgetPublicId(): string {
  const raw = crypto.randomBytes(16).toString("base64url");
  return `wgt_${raw}`;
}

/**
 * Ensures the restaurant has a widgetPublicId. Returns the existing one if
 * already set; otherwise generates+persists a new one and returns it.
 * Safe to call repeatedly.
 */
export async function ensureWidgetPublicId(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { widgetPublicId: true },
  });
  if (r?.widgetPublicId) return r.widgetPublicId;

  // Retry on the off chance of collision (extremely unlikely with 128 bits of entropy).
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newWidgetPublicId();
    try {
      const updated = await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { widgetPublicId: id },
        select: { widgetPublicId: true },
      });
      return updated.widgetPublicId!;
    } catch (err: any) {
      if (err?.code === "P2002") continue; // unique-constraint clash; try again
      throw err;
    }
  }
  throw new Error("Failed to allocate widgetPublicId after 3 attempts");
}

/**
 * Attempt to mark the restaurant as published. Throws an Error with status:400
 * and a `requiredStepsRemaining` field if the checklist gate is open.
 */
export async function publishRestaurant(restaurantId: string): Promise<{
  publishedAt: Date;
  widgetPublicId: string;
}> {
  const progress = await loadSetupProgress(restaurantId);
  if (!progress) {
    const err: any = new Error("Restaurant not found");
    err.status = 404;
    throw err;
  }
  if (!progress.publishReady) {
    const err: any = new Error("Setup incomplete — finish required steps first");
    err.status = 400;
    err.requiredStepsRemaining = progress.requiredStepsRemaining;
    throw err;
  }

  const widgetPublicId = await ensureWidgetPublicId(restaurantId);
  const now = new Date();
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { publishedAt: now },
  });
  return { publishedAt: now, widgetPublicId };
}

/**
 * Take the restaurant offline (un-publish). Customer ordering still gates
 * on `isActive` for backward compat — this just clears the publish flag so
 * the widget snippet refuses to render orders.
 */
export async function unpublishRestaurant(restaurantId: string): Promise<void> {
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { publishedAt: null },
  });
}
