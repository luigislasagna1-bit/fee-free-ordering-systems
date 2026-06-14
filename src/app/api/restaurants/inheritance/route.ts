import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import {
  buildInheritedSettingsJson,
  parseInheritedSettings,
  JSON_INHERITABLE_SETTINGS,
  isLocked,
  inheritanceState,
} from "@/lib/inherited-settings";

/**
 * Per-option location inheritance toggles (Luigi's multi-location spec).
 *
 * A CHILD location chooses, from its OWN account, which settings it inherits
 * LIVE from its parent brand. This route handles ONLY the JSON-stored settings
 * (hours / zones / availability). MENU inheritance keeps its dedicated
 * copy-on-customize endpoints (/api/menu/customize-location +
 * /api/menu/revert-to-brand-menu) so the menu-row copy logic isn't duplicated;
 * the UI calls those for the menu toggle and this route for the rest. The
 * "everything from parent" master toggle in the UI fans out to both.
 *
 * Only a child (parentRestaurantId != null) may set these — a top-level
 * restaurant has no parent to inherit from. restaurantId always comes from the
 * session, never the client.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "No restaurant in session" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { parentRestaurantId: true, useBrandMenu: true, inheritedSettings: true, lockedSettings: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  return NextResponse.json(inheritanceState(restaurant));
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "No restaurant in session" }, { status: 400 });

  // Ownership is enforced by deriving the restaurant from the session, never the
  // body. Re-fetch to merge onto the current config + verify it's a child.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, parentRestaurantId: true, inheritedSettings: true, lockedSettings: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (!restaurant.parentRestaurantId) {
    return NextResponse.json(
      { error: "Only a child location can inherit settings from a parent brand.", code: "not_a_child" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Reject any change to a setting the BRAND PARENT has LOCKED — the child may
  // see it but not change it. Defense-in-depth: the child UI also disables the
  // locked toggles, but never trust the client. Luigi 2026-06-14.
  for (const key of JSON_INHERITABLE_SETTINGS) {
    if (typeof body[key] === "boolean" && isLocked(restaurant, key)) {
      return NextResponse.json(
        { error: "This setting is managed by your brand and can't be changed here.", code: "locked", setting: key },
        { status: 403 },
      );
    }
  }
  // Merge the requested boolean changes onto the current config; ignore
  // unknown keys and non-booleans. Menu is intentionally NOT handled here.
  const next = parseInheritedSettings(restaurant.inheritedSettings);
  for (const key of JSON_INHERITABLE_SETTINGS) {
    if (typeof body[key] === "boolean") next[key] = body[key] as boolean;
  }
  const json = buildInheritedSettingsJson(next);

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { inheritedSettings: json },
  });

  return NextResponse.json({ ok: true, inheritedSettings: json });
}
