import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import crypto from "node:crypto";

/**
 * POST /api/admin/publish
 *
 * Flips `Restaurant.publishedAt` from null → now() iff every required
 * setup step is complete. Idempotent — re-running on an already-published
 * restaurant just returns the current state. Also lazily generates the
 * `widgetPublicId` here so the Legacy Website widget snippet (Phase E)
 * has an opaque stable handle to embed.
 *
 * Why we re-check the gate server-side: the wizard UI hides the Publish
 * button when `publishReady=false`, but a tampered client can still POST
 * to this endpoint directly. We re-run the SAME checklist computation
 * here so the gate is real, not just cosmetic.
 *
 * UNPUBLISH is intentionally NOT exposed via this endpoint — pulling a
 * live restaurant offline accidentally would lose customers mid-order.
 * If owners want to pause, they toggle `Restaurant.isActive` from the
 * Profile page (clear UX path, separate intent).
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.restaurantId) {
    return NextResponse.json({ error: "No restaurant in session" }, { status: 400 });
  }
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  // Re-load setup progress server-side — never trust the client's view
  // of what's done.
  const progress = await loadSetupProgress(user.restaurantId);
  if (!progress) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!progress.publishReady) {
    return NextResponse.json(
      {
        error: "Required setup steps are not complete",
        code: "publish_blocked",
        // Echo back what's still open so the client can show a clean
        // error UI instead of a generic toast.
        requiredStepsRemaining: progress.requiredStepsRemaining.map((s) => ({
          id: s.id,
          label: s.label,
          href: s.href,
        })),
      },
      { status: 412 }, // 412 Precondition Failed — fits the "gate" semantics
    );
  }

  // Idempotent: if already published, return the existing state.
  const existing = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { publishedAt: true, widgetPublicId: true },
  });
  if (existing?.publishedAt) {
    return NextResponse.json({
      ok: true,
      publishedAt: existing.publishedAt.toISOString(),
      widgetPublicId: existing.widgetPublicId,
      alreadyPublished: true,
    });
  }

  // Generate widgetPublicId lazily on first publish. Opaque so the
  // public widget URL doesn't leak the slug. 24 hex chars = 96 bits
  // of entropy — collision-free at any scale we care about.
  const widgetPublicId = existing?.widgetPublicId ?? crypto.randomBytes(12).toString("hex");
  const now = new Date();

  const updated = await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: {
      publishedAt: now,
      widgetPublicId,
    },
    select: { publishedAt: true, widgetPublicId: true },
  });

  return NextResponse.json({
    ok: true,
    publishedAt: updated.publishedAt!.toISOString(),
    widgetPublicId: updated.widgetPublicId,
    alreadyPublished: false,
  });
}
