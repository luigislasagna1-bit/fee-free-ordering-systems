/**
 * Session + entitlement gate for every Nabil admin route:
 * no session → 401, no restaurant on the session (superadmin) → 403,
 * missing `phone_ordering_agent` entitlement → 403 with code
 * `feature_locked` so the dashboard can render its upgrade prompt.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireFeature } from "@/lib/entitlements";

/** requireFeature throws with status 403 — translate to a clean JSON response. */
export async function requirePhoneOrderingFeature(restaurantId: string): Promise<NextResponse | null> {
  try {
    await requireFeature(restaurantId, "phone_ordering_agent");
    return null;
  } catch {
    return NextResponse.json({ error: "Feature not unlocked", code: "feature_locked" }, { status: 403 });
  }
}

type Gate =
  | { restaurantId: string; fail?: undefined }
  | { restaurantId?: undefined; fail: NextResponse };

export async function requirePhoneOrderingAdmin(): Promise<Gate> {
  const user = await getSessionUser();
  if (!user) return { fail: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.restaurantId) return { fail: NextResponse.json({ error: "No restaurant" }, { status: 403 }) };
  const forbidden = await requirePhoneOrderingFeature(user.restaurantId);
  if (forbidden) return { fail: forbidden };
  return { restaurantId: user.restaurantId };
}
