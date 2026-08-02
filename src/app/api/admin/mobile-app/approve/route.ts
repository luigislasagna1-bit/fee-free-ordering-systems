import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { approvalBlockers } from "@/lib/branded-app/validate";
import { transitionPlatformStatus } from "@/lib/branded-app/project";
import { recordProjectEvent } from "@/lib/branded-app/project";
import type { BrandedAppStatus } from "@/lib/branded-app/status";

/**
 * Owner approval (Luigi 2026-08-02): freezes the config the build pipeline
 * will consume. Server-side completeness check (approvalBlockers — never
 * trust the wizard's client validation), then:
 *   1. snapshot approvedConfig + bump approvedConfigVersion,
 *   2. move each REQUESTED platform draft|needs_owner → submitted through
 *      transitionPlatformStatus (idempotent; fires the superadmin ping),
 *   3. restaurant-visible "owner-approved" timeline event.
 * Re-approval after edits is the same call — version increments again.
 */
export async function POST() {
  const user = await getSessionUser();
  // Approval is an owner-level action — freezes the config and kicks off
  // real store submission under the restaurant's own developer accounts.
  // kitchen_staff sessions carry a restaurantId too but must never trigger
  // this (matches the admin-route convention elsewhere: shipday-dispatch,
  // feefree-delivery).
  if (!user?.restaurantId || user.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasFeature(user.restaurantId, "app_store_listing"))) {
    return NextResponse.json({ error: "app_store_listing_required" }, { status: 402 });
  }

  const project = await prisma.brandedAppProject.findUnique({
    where: { restaurantId: user.restaurantId },
    include: { platforms: true },
  });
  if (!project) return NextResponse.json({ error: "no_project" }, { status: 404 });

  const blockers = approvalBlockers({
    appName: project.appName,
    shortDescription: project.shortDescription,
    fullDescription: project.fullDescription,
    supportEmail: project.supportEmail,
    privacyPolicyUrl: project.privacyPolicyUrl,
    appIconUrl: project.appIconUrl,
    primaryColorHex: project.primaryColorHex,
    platformsRequested: project.platformsRequested,
  });
  if (blockers.length > 0) return NextResponse.json({ blockers }, { status: 400 });

  const snapshot = {
    appName: project.appName,
    shortDescription: project.shortDescription,
    fullDescription: project.fullDescription,
    appIconUrl: project.appIconUrl,
    splashIconUrl: project.splashIconUrl,
    featureGraphicUrl: project.featureGraphicUrl,
    useWebsiteBranding: project.useWebsiteBranding,
    primaryColorHex: project.primaryColorHex,
    supportEmail: project.supportEmail,
    privacyPolicyUrl: project.privacyPolicyUrl,
    platformsRequested: project.platformsRequested,
  };

  const updated = await prisma.brandedAppProject.update({
    where: { id: project.id },
    data: {
      approvedAt: new Date(),
      approvedByUserId: user.id,
      approvedConfig: snapshot,
      approvedConfigVersion: { increment: 1 },
    },
    select: { approvedConfigVersion: true },
  });

  await recordProjectEvent({
    projectId: project.id,
    type: "owner-approved",
    messageKey: "ownerApproved",
    params: { version: updated.approvedConfigVersion },
    visibility: "restaurant",
    actorType: "owner",
    actorId: user.id,
  });

  // Move each requested platform into the queue. needs_owner → submitted is
  // the "owner completed the ask" path; draft → submitted the first pass.
  const wantIos = project.platformsRequested !== "android";
  const wantAndroid = project.platformsRequested !== "ios";
  const moved: Record<string, boolean> = {};
  for (const row of project.platforms) {
    const wanted = row.platform === "ios" ? wantIos : wantAndroid;
    if (!wanted) continue;
    if (row.status !== "draft" && row.status !== "needs_owner") continue;
    const res = await transitionPlatformStatus({
      platformRowId: row.id,
      from: row.status as BrandedAppStatus,
      to: "submitted",
      actorType: "owner",
      actorId: user.id,
    });
    moved[row.platform] = res.ok;
  }

  return NextResponse.json({ ok: true, version: updated.approvedConfigVersion, moved });
}
