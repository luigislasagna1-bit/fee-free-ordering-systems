import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import {
  getPublishState,
  publishRestaurant,
  unpublishRestaurant,
} from "@/lib/publishing";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId).catch(() => {
    throw new Error("forbidden");
  });
  const state = await getPublishState(user.restaurantId);
  return NextResponse.json({
    publishedAt: state.publishedAt,
    widgetPublicId: state.widgetPublicId,
    progress: state.progress,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  const body = await req.json().catch(() => ({} as any));
  const action = body?.action;

  try {
    if (action === "unpublish") {
      await unpublishRestaurant(user.restaurantId);
      return NextResponse.json({ ok: true, publishedAt: null });
    }
    // default: publish
    const result = await publishRestaurant(user.restaurantId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const status = err?.status || 500;
    return NextResponse.json(
      {
        error: err?.message || "publish_failed",
        requiredStepsRemaining: err?.requiredStepsRemaining ?? undefined,
      },
      { status }
    );
  }
}
