import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { listAddOnsForRestaurant } from "@/lib/addons";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);
  const addOns = await listAddOnsForRestaurant(user.restaurantId);
  return NextResponse.json({ addOns });
}
