import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import crypto from "node:crypto";

/**
 * Superadmin-only restaurant control endpoint.
 *
 * GET — full detail bundle (used by /superadmin/restaurants/[id] page,
 *       but also handy for ad-hoc inspection via curl).
 *
 * PATCH — toggle state. Body:
 *   { publishedAt?: "now" | null, isActive?: boolean }
 *
 *   publishedAt = "now"   →  Restaurant.publishedAt = new Date() (force publish).
 *                           Bypasses the setup-checklist gate that the
 *                           OWNER-facing /api/admin/publish enforces —
 *                           superadmin is intentionally a higher-trust
 *                           role and can override (rare debugging /
 *                           grandfathering case).
 *   publishedAt = null    →  Restaurant.publishedAt = null. Restaurant
 *                           goes back to unpublished state. Doesn't
 *                           touch any other data.
 *   isActive  = boolean   →  Soft delete / pause toggle. When false,
 *                           customer-facing /order/<slug> 404s and the
 *                           widget iframe refuses to render.
 *
 * Both flags can change in a single PATCH. Audit log lines are emitted
 * to console.warn with the actor user ID and timestamp so we can grep
 * the production logs for "who touched this restaurant".
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      subscriptionPlan: true,
      _count: { select: { orders: true, customers: true, menuItems: true, menuCategories: true } },
    },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(restaurant);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if ("publishedAt" in body) {
    if (body.publishedAt === "now") {
      updates.publishedAt = new Date();
      // Lazy-generate widgetPublicId on the FIRST publish ever — same
      // as the owner-facing /api/admin/publish endpoint. Idempotent for
      // restaurants that already have one.
      const existing = await prisma.restaurant.findUnique({
        where: { id },
        select: { widgetPublicId: true },
      });
      if (existing && !existing.widgetPublicId) {
        updates.widgetPublicId = crypto.randomBytes(12).toString("hex");
      }
    } else if (body.publishedAt === null) {
      updates.publishedAt = null;
    } else {
      return NextResponse.json(
        { error: "publishedAt must be \"now\" or null" },
        { status: 400 },
      );
    }
  }

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be boolean" }, { status: 400 });
    }
    updates.isActive = body.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields in body" }, { status: 400 });
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data: updates,
    select: {
      id: true,
      name: true,
      slug: true,
      publishedAt: true,
      isActive: true,
      widgetPublicId: true,
    },
  });

  // Audit trail. Console-only for now — when we add the AdminAuditLog
  // model in M-future this writes a real row instead.
  console.warn(
    `[SUPERADMIN AUDIT] user=${user.id} (${user.email}) restaurant=${id} (${updated.slug}) updates=${JSON.stringify(updates)}`,
  );

  return NextResponse.json({ ok: true, restaurant: updated });
}
