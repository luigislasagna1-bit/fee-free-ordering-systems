import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

async function requireSuperadmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") return null;
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, slug, price, interval, description, features, isActive } = body ?? {};

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (slug !== undefined) {
    if (!/^[a-z0-9-]+$/.test(String(slug))) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    data.slug = slug;
  }
  if (price !== undefined) data.price = price;
  if (interval !== undefined) data.interval = interval === "year" ? "year" : "month";
  if (description !== undefined) data.description = description;
  if (features !== undefined) {
    data.features = Array.isArray(features) ? JSON.stringify(features) : features;
  }
  if (isActive !== undefined) data.isActive = isActive;

  // Any change invalidates the sync state — UI will surface a "Sync to Stripe"
  // button so the superadmin can push the change explicitly.
  data.syncStatus = "not_synced";

  const plan = await prisma.subscriptionPlan.update({ where: { id }, data });
  return NextResponse.json({ plan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Don't allow deleting a plan with active restaurants subscribed to it.
  const activeCount = await prisma.restaurant.count({
    where: { subscriptionPlanId: id, subscriptionStatus: { in: ["active", "trialing", "past_due"] } },
  });
  if (activeCount > 0) {
    return NextResponse.json(
      { error: `Can't delete — ${activeCount} restaurant${activeCount === 1 ? " is" : "s are"} subscribed.` },
      { status: 409 }
    );
  }

  // Soft-deactivate in Stripe (don't actually delete the Product) by deactivating it.
  // We keep the local row too so historical references stay intact — just mark inactive.
  await prisma.subscriptionPlan.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
