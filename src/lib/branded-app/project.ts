import "server-only";
import prisma from "@/lib/db";
import {
  canTransition,
  notificationsFor,
  type BrandedAppPlatformKind,
  type BrandedAppStatus,
} from "./status";
import { sendBrandedAppStatusEmail } from "./notify";
import { notifyBrandedAppSubmitted } from "@/lib/platform-notifications";

/**
 * Branded Mobile App — the ONE way a platform row changes status
 * (Luigi 2026-08-02). Every caller (owner approve route, superadmin module,
 * future crons) goes through transitionPlatformStatus so the rules hold
 * everywhere:
 *
 *  - legality via canTransition (status.ts) unless `force` (superadmin only,
 *    separately audited by the caller);
 *  - IDEMPOTENT under races: a conditional updateMany with the expected
 *    fromStatus in the WHERE — two concurrent identical transitions collapse
 *    to one event + one email (the subscription.ts count===1 pattern);
 *  - the timeline event and the notification fan-out fire ONLY when the row
 *    actually moved.
 */
export async function transitionPlatformStatus(args: {
  platformRowId: string;
  from: BrandedAppStatus;
  to: BrandedAppStatus;
  actorType: "owner" | "platform" | "system";
  actorId?: string | null;
  /** i18n key under brandedApp.events.* for the restaurant timeline. */
  messageKey?: string;
  params?: Record<string, string | number>;
  /** Verbatim external text (store rejection notes etc. or a staff-typed
   *  reason) — recorded as an INTERNAL event by default (never reaches the
   *  owner's timeline). Set `restaurantVisibleDetail` to also show it to
   *  the restaurant, labeled as an external quote. */
  detail?: string;
  /** Show `detail` to the restaurant too (default false — most `detail`
   *  calls are staff-facing audit context, not owner-facing copy; owner
   *  copy should go through the translated `messageKey`). */
  restaurantVisibleDetail?: boolean;
  /** Superadmin force override — skips canTransition, caller must audit. */
  force?: boolean;
}): Promise<{ ok: boolean; reason?: "illegal" | "not_found_or_stale" }> {
  const { platformRowId, from, to } = args;
  // A forced same-state "transition" isn't a transition — without this guard
  // every retry/double-submit of {force:true, from:"live", to:"live"} would
  // match the conditional WHERE below, re-stamp liveAt, and re-fire the
  // "your app is live" email on each call.
  if (from === to) {
    return { ok: false, reason: "illegal" };
  }
  if (!args.force && !canTransition(from, to)) {
    return { ok: false, reason: "illegal" };
  }

  const now = new Date();
  const moved = await prisma.brandedAppPlatform.updateMany({
    where: { id: platformRowId, status: from },
    data: {
      status: to,
      ...(to === "live" ? { liveAt: now } : {}),
    },
  });
  if (moved.count !== 1) return { ok: false, reason: "not_found_or_stale" };

  const row = await prisma.brandedAppPlatform.findUnique({
    where: { id: platformRowId },
    select: {
      platform: true,
      storeUrl: true,
      projectId: true,
      project: {
        select: {
          restaurantId: true,
          restaurant: { select: { name: true, email: true, defaultLanguage: true } },
        },
      },
    },
  });
  if (!row) return { ok: true }; // moved but vanished (deleted) — nothing to notify

  await prisma.brandedAppEvent.create({
    data: {
      projectId: row.projectId,
      platform: row.platform,
      type: "status-changed",
      fromStatus: from,
      toStatus: to,
      messageKey: args.messageKey ?? `moved_${to}`,
      params: args.params ?? undefined,
      detail: args.restaurantVisibleDetail ? args.detail : undefined,
      visibility: "restaurant",
      actorType: args.actorType,
      actorId: args.actorId ?? undefined,
    },
  });
  // Free-text detail the caller did NOT mark restaurant-visible still gets
  // preserved — as its own internal-only event — instead of silently
  // dropped, so a staff-typed reason for a transition stays in the audit
  // trail without ever reaching the owner's GET /project (visibility-filtered).
  if (args.detail && !args.restaurantVisibleDetail) {
    await prisma.brandedAppEvent.create({
      data: {
        projectId: row.projectId,
        platform: row.platform,
        type: "note",
        fromStatus: from,
        toStatus: to,
        detail: args.detail,
        visibility: "internal",
        actorType: args.actorType,
        actorId: args.actorId ?? undefined,
      },
    });
  }

  // Notification fan-out — best-effort, never blocks the transition.
  const who = notificationsFor(to);
  if (who.restaurant && row.project.restaurant.email) {
    await sendBrandedAppStatusEmail({
      to: row.project.restaurant.email,
      restaurantName: row.project.restaurant.name,
      locale: row.project.restaurant.defaultLanguage,
      platform: row.platform as BrandedAppPlatformKind,
      toStatus: to,
      storeUrl: row.storeUrl,
    });
  }
  if (who.superadmin) {
    await notifyBrandedAppSubmitted(row.project.restaurantId, row.platform).catch((e) =>
      console.error("[branded-app] superadmin notify failed", e),
    );
  }
  return { ok: true };
}

/** Append a timeline event without a status change (notes, build records…). */
export async function recordProjectEvent(args: {
  projectId: string;
  platform?: BrandedAppPlatformKind | null;
  type: string;
  messageKey?: string;
  params?: Record<string, string | number>;
  detail?: string;
  visibility?: "restaurant" | "internal";
  actorType: "owner" | "platform" | "system";
  actorId?: string | null;
}): Promise<void> {
  await prisma.brandedAppEvent.create({
    data: {
      projectId: args.projectId,
      platform: args.platform ?? undefined,
      type: args.type,
      messageKey: args.messageKey,
      params: args.params ?? undefined,
      detail: args.detail,
      visibility: args.visibility ?? "internal",
      actorType: args.actorType,
      actorId: args.actorId ?? undefined,
    },
  });
}
