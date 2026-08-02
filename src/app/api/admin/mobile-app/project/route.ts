import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import {
  validateDraft,
  type BrandedAppDraft,
} from "@/lib/branded-app/validate";
import { BRANDED_APP_PLATFORMS, isBrandedAppPlatform } from "@/lib/branded-app/status";

/**
 * Branded Mobile App — the owner's project resource (Luigi 2026-08-02).
 *
 * GET   → project + platform rows + restaurant-visible timeline + `entitled`
 *         flag (unentitled owners see the upsell panel; the flag keeps one
 *         page serving both states).
 * POST  → lazily create the project + platform rows (idempotent) when the
 *         owner presses "Start setup".
 * PATCH → save wizard fields (partial; server-validated) + per-platform
 *         developer-account checklist claims. Editing after approval bumps
 *         nothing here — approval versioning happens in /approve.
 *
 * Entitlement (`app_store_listing`) is re-checked on EVERY verb — the
 * website/settings route convention.
 */

const sanitize = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

/** Owner-level surface — the store listing that gets published under the
 *  restaurant's own Apple/Google accounts. kitchen_staff sessions are
 *  excluded here just like feefree-delivery/shipday-dispatch (they carry a
 *  restaurantId too, but must never write admin-only config). GET stays
 *  readable by kitchen_staff (harmless, matches the website/settings
 *  convention) — only mutation is gated. */
async function auth(opts: { requireAdmin?: boolean } = {}) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (opts.requireAdmin && user.role === "kitchen_staff") {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  return { user, restaurantId: user.restaurantId } as const;
}

export async function GET() {
  const a = await auth();
  if ("error" in a) return a.error;
  const entitled = await hasFeature(a.restaurantId, "app_store_listing");
  const project = await prisma.brandedAppProject.findUnique({
    where: { restaurantId: a.restaurantId },
    include: {
      platforms: true,
      events: {
        where: { visibility: "restaurant" },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: a.restaurantId },
    select: { name: true, email: true, customDomain: true, subdomain: true, logoUrl: true, slogan: true },
  });
  return NextResponse.json({ entitled, project, restaurant });
}

export async function POST() {
  const a = await auth({ requireAdmin: true });
  if ("error" in a) return a.error;
  if (!(await hasFeature(a.restaurantId, "app_store_listing"))) {
    return NextResponse.json(
      { error: "app_store_listing_required", message: "Activate the Branded Mobile App add-on at /admin/billing/add-ons." },
      { status: 402 },
    );
  }
  // Idempotent create: the project + both platform rows exist after one call.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: a.restaurantId },
    select: { email: true },
  });
  const project = await prisma.brandedAppProject.upsert({
    where: { restaurantId: a.restaurantId },
    update: {},
    create: {
      restaurantId: a.restaurantId,
      supportEmail: restaurant?.email ?? null,
    },
  });
  for (const platform of BRANDED_APP_PLATFORMS) {
    await prisma.brandedAppPlatform.upsert({
      where: { projectId_platform: { projectId: project.id, platform } },
      update: {},
      create: { projectId: project.id, platform },
    });
  }
  const full = await prisma.brandedAppProject.findUnique({
    where: { id: project.id },
    include: { platforms: true },
  });
  return NextResponse.json({ project: full });
}

export async function PATCH(req: NextRequest) {
  const a = await auth({ requireAdmin: true });
  if ("error" in a) return a.error;
  if (!(await hasFeature(a.restaurantId, "app_store_listing"))) {
    return NextResponse.json({ error: "app_store_listing_required" }, { status: 402 });
  }
  const project = await prisma.brandedAppProject.findUnique({
    where: { restaurantId: a.restaurantId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "no_project" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Wizard draft fields — sanitize, then server-side validate the SANITIZED
  // values (never trust client-side validation).
  const draft: BrandedAppDraft = {};
  if ("appName" in body) draft.appName = sanitize(body.appName, 60);
  if ("shortDescription" in body) draft.shortDescription = sanitize(body.shortDescription, 200);
  if ("fullDescription" in body) draft.fullDescription = sanitize(body.fullDescription, 5000);
  if ("supportEmail" in body) draft.supportEmail = sanitize(body.supportEmail, 200);
  if ("privacyPolicyUrl" in body) draft.privacyPolicyUrl = sanitize(body.privacyPolicyUrl, 500);
  if ("primaryColorHex" in body) draft.primaryColorHex = sanitize(body.primaryColorHex, 7);
  if ("platformsRequested" in body) draft.platformsRequested = sanitize(body.platformsRequested, 10);
  if ("appIconUrl" in body) draft.appIconUrl = sanitize(body.appIconUrl, 500);
  if ("splashIconUrl" in body) draft.splashIconUrl = sanitize(body.splashIconUrl, 500);

  const errors = validateDraft(draft);
  if (errors.length > 0) return NextResponse.json({ errors }, { status: 400 });

  const data: Record<string, unknown> = { ...draft };
  if ("splashIconUrl" in body) data.splashIconUrl = draft.splashIconUrl || null;
  if ("useWebsiteBranding" in body) data.useWebsiteBranding = body.useWebsiteBranding !== false;

  await prisma.brandedAppProject.update({ where: { id: project.id }, data });

  // Per-platform developer-account checklist claims (owner checkboxes).
  // Stored as an opaque map; OUR verification is accessVerifiedAt, set only
  // by platform staff — a checkbox is a claim, not a confirmation.
  if (body.checklist && typeof body.checklist === "object") {
    for (const [platform, map] of Object.entries(body.checklist)) {
      if (!isBrandedAppPlatform(platform) || !map || typeof map !== "object") continue;
      const clean: Record<string, { done: boolean; at: string }> = {};
      for (const [step, v] of Object.entries(map as Record<string, unknown>).slice(0, 30)) {
        clean[sanitize(step, 50)] = {
          done: (v as { done?: unknown })?.done === true,
          at: new Date().toISOString(),
        };
      }
      await prisma.brandedAppPlatform.updateMany({
        where: { projectId: project.id, platform },
        data: { checklist: clean },
      });
    }
  }

  const full = await prisma.brandedAppProject.findUnique({
    where: { id: project.id },
    include: { platforms: true },
  });
  return NextResponse.json({ project: full });
}
