import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { copyBrandMenuToLocation, deleteLocationMenuAndInherit } from "@/lib/brand";
import {
  buildInheritedSettingsJson,
  parseInheritedSettings,
  JSON_INHERITABLE_SETTINGS,
  INHERITABLE_SETTINGS,
  buildLockedSettingsJson,
  parseLockedSettings,
  inheritanceState,
} from "@/lib/inherited-settings";

/**
 * BRAND-PARENT control of a CHILD location's LIVE inheritance (Luigi's
 * multi-location spec, 2026-06-13). The mirror of /api/restaurants/inheritance
 * (which is a child controlling ITSELF): here the brand parent sets, per child,
 * which settings that child inherits — so an owner manages the whole chain from
 * one screen instead of logging into each location.
 *
 * AUTH — the caller's CANONICAL restaurant (User.restaurantId, NOT the
 * cookie-swapped active location) must be a brand parent (parentRestaurantId
 * null), and the target child must actually belong to it
 * (child.parentRestaurantId === that parent). The childId comes from the URL
 * but is NEVER trusted without that ownership re-check — a 404 is returned for
 * a missing OR not-ours child so existence isn't leaked.
 *
 *   menu                     → copyBrandMenuToLocation / deleteLocationMenuAndInherit
 *                              (the SAME shared logic the child's own /api/menu/*
 *                              endpoints use). Turning menu inheritance ON is
 *                              destructive (wipes the child's custom menu) — the
 *                              UI confirms first, naming the location.
 *   hours/zones/availability → the child's sparse inheritedSettings JSON flag.
 */

type ResolvedChild = {
  id: string;
  parentRestaurantId: string | null;
  useBrandMenu: boolean | null;
  inheritedSettings: unknown;
  lockedSettings: unknown;
};

async function resolveParentAndChild(
  childId: string,
): Promise<NextResponse | { parentId: string; child: ResolvedChild }> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  // Canonical owning restaurant — a parent who has switched into a child is
  // still the brand owner, so resolve the brand from User.restaurantId, never
  // the active-location cookie.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { restaurantId: true },
  });
  const parentId = userRow?.restaurantId;
  if (!parentId) return NextResponse.json({ error: "No restaurant in session" }, { status: 400 });

  const [parent, child] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: parentId },
      select: { id: true, parentRestaurantId: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: childId },
      select: { id: true, parentRestaurantId: true, useBrandMenu: true, inheritedSettings: true, lockedSettings: true },
    }),
  ]);

  if (!parent || parent.parentRestaurantId != null) {
    return NextResponse.json(
      { error: "Only the brand parent can manage location inheritance." },
      { status: 403 },
    );
  }
  if (!child || child.parentRestaurantId !== parent.id) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }
  return { parentId: parent.id, child };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const resolved = await resolveParentAndChild(childId);
  if (resolved instanceof NextResponse) return resolved;
  return NextResponse.json(inheritanceState(resolved.child));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const resolved = await resolveParentAndChild(childId);
  if (resolved instanceof NextResponse) return resolved;
  const { parentId, child } = resolved;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // ── Menu (heavy / destructive) — act only when it actually changes, so a
  //    no-op PATCH never deletes or re-copies rows. Mirrors the idempotency of
  //    the child's own /api/menu/* endpoints. ──
  if (typeof body.menu === "boolean") {
    const wantInherit = body.menu;
    const currentlyInherit = child.useBrandMenu === true;
    if (wantInherit !== currentlyInherit) {
      if (wantInherit) {
        // Use the brand menu — wipes the child's custom rows (UI confirmed).
        await deleteLocationMenuAndInherit(child.id);
      } else {
        // Give the child its own editable copy of the brand menu.
        await copyBrandMenuToLocation(parentId, child.id);
        await prisma.restaurant.update({
          where: { id: child.id },
          data: { useBrandMenu: false },
        });
      }
    }
  }

  // ── hours / zones / availability — sparse JSON flags (the child keeps its own
  //    rows; they're simply ignored while inheriting). ──
  const next = parseInheritedSettings(child.inheritedSettings);
  let touchedJson = false;
  for (const key of JSON_INHERITABLE_SETTINGS) {
    if (typeof body[key] === "boolean") {
      next[key] = body[key] as boolean;
      touchedJson = true;
    }
  }
  if (touchedJson) {
    await prisma.restaurant.update({
      where: { id: child.id },
      data: { inheritedSettings: buildInheritedSettingsJson(next) },
    });
  }

  // ── Locks (brand parent only): which settings the child may NOT change
  //    itself. Merge onto the current map; covers every setting incl. menu.
  //    The child's own endpoints enforce these server-side. Luigi 2026-06-14. ──
  if (body.locks && typeof body.locks === "object" && !Array.isArray(body.locks)) {
    const reqLocks = body.locks as Record<string, unknown>;
    const nextLocks = parseLockedSettings(child.lockedSettings);
    let touchedLocks = false;
    for (const key of INHERITABLE_SETTINGS) {
      if (typeof reqLocks[key] === "boolean") {
        nextLocks[key] = reqLocks[key] as boolean;
        touchedLocks = true;
      }
    }
    if (touchedLocks) {
      await prisma.restaurant.update({
        where: { id: child.id },
        data: { lockedSettings: buildLockedSettingsJson(nextLocks) },
      });
    }
  }

  // Re-read so the client renders the authoritative post-write state.
  const fresh = await prisma.restaurant.findUnique({
    where: { id: child.id },
    select: { parentRestaurantId: true, useBrandMenu: true, inheritedSettings: true, lockedSettings: true },
  });
  return NextResponse.json(inheritanceState(fresh ?? child));
}
