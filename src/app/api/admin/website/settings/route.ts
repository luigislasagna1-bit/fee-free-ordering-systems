import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { sanitizeExternalHref } from "@/lib/html-safe";
import {
  defaultHostedSiteSettings,
  parseHostedSiteSettings,
  MAX_CUSTOM_SECTIONS,
  MAX_CUSTOM_SECTION_TITLE_LEN,
  MAX_CUSTOM_SECTION_BODY_LEN,
  MAX_CTA_LABEL_LEN,
  type HostedSiteSettings,
  type CustomSection,
} from "@/lib/hosted-site-settings";

/**
 * Hosted-site settings persistence.
 *
 *   GET   → return the restaurant's current settings (defaults filled in)
 *   PATCH → merge incoming partial settings with current, persist JSON.
 *
 * Both gated on:
 *   1. Session present + restaurantId set
 *   2. role === "restaurant_admin" OR "superadmin"
 *   3. Restaurant has the `hosted_marketing_page` entitlement (Sales
 *      Optimized Website add-on). Without the add-on, the editor isn't
 *      meaningful — the hosted site itself returns "upgrade required".
 *
 * Why merge instead of replace: the admin UI may submit one section at
 * a time (e.g. just header changes). Merging lets the editor save
 * partial updates without round-tripping the full payload.
 *
 * v1 limits enforced server-side: max 2 custom sections, max title/body
 * lengths, max CTA label length. Excess content is rejected (400).
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entitled = await hasFeature(user.restaurantId, "hosted_marketing_page");
  if (!entitled) {
    return NextResponse.json(
      {
        error: "Sales Optimized Website add-on required to use the website editor.",
        code: "addon_required",
      },
      { status: 412 },
    );
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { hostedSiteSettings: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: parseHostedSiteSettings(restaurant.hostedSiteSettings),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entitled = await hasFeature(user.restaurantId, "hosted_marketing_page");
  if (!entitled) {
    return NextResponse.json(
      {
        error: "Sales Optimized Website add-on required.",
        code: "addon_required",
      },
      { status: 412 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { hostedSiteSettings: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const current = parseHostedSiteSettings(restaurant.hostedSiteSettings);
  const merged: HostedSiteSettings = {
    header: { ...current.header, ...(body.header || {}) },
    sections: { ...current.sections, ...(body.sections || {}) },
    cta: {
      primary: { ...current.cta.primary, ...(body.cta?.primary || {}) },
      secondary: { ...current.cta.secondary, ...(body.cta?.secondary || {}) },
    },
    customSections: Array.isArray(body.customSections)
      ? body.customSections
      : current.customSections,
  };

  // Never persist a script-executing CTA href (javascript:/data:/…). The render
  // path also sanitizes, but scrub on write so the DB stays clean + no other
  // consumer is exposed. Bad/empty → "" (render falls back to the order page).
  merged.cta.primary.href = sanitizeExternalHref(merged.cta.primary.href, "");
  merged.cta.secondary.href = sanitizeExternalHref(merged.cta.secondary.href, "");

  // Validate caps + lengths.
  if (merged.customSections.length > MAX_CUSTOM_SECTIONS) {
    return NextResponse.json(
      {
        error: `Maximum ${MAX_CUSTOM_SECTIONS} custom sections. Remove one before adding another.`,
        code: "too_many_sections",
      },
      { status: 400 },
    );
  }
  for (const sec of merged.customSections as CustomSection[]) {
    if (typeof sec.id !== "string" || !sec.id) {
      return NextResponse.json({ error: "Each section needs a string id" }, { status: 400 });
    }
    if (typeof sec.title !== "string" || sec.title.length > MAX_CUSTOM_SECTION_TITLE_LEN) {
      return NextResponse.json(
        { error: `Section title must be a string under ${MAX_CUSTOM_SECTION_TITLE_LEN} chars.` },
        { status: 400 },
      );
    }
    if (typeof sec.body !== "string" || sec.body.length > MAX_CUSTOM_SECTION_BODY_LEN) {
      return NextResponse.json(
        { error: `Section body must be a string under ${MAX_CUSTOM_SECTION_BODY_LEN} chars.` },
        { status: 400 },
      );
    }
    const allowedPositions = ["banner", "about", "featuredMenu", "visit", "map", "social"];
    if (!allowedPositions.includes(sec.position)) {
      return NextResponse.json(
        { error: `Section position must be one of ${allowedPositions.join(", ")}.` },
        { status: 400 },
      );
    }
  }
  if (
    typeof merged.cta.primary.label === "string" &&
    merged.cta.primary.label.length > MAX_CTA_LABEL_LEN
  ) {
    return NextResponse.json(
      { error: `CTA labels must be under ${MAX_CTA_LABEL_LEN} chars.` },
      { status: 400 },
    );
  }
  if (
    typeof merged.cta.secondary.label === "string" &&
    merged.cta.secondary.label.length > MAX_CTA_LABEL_LEN
  ) {
    return NextResponse.json(
      { error: `CTA labels must be under ${MAX_CTA_LABEL_LEN} chars.` },
      { status: 400 },
    );
  }

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: { hostedSiteSettings: JSON.stringify(merged) },
  });

  return NextResponse.json({ settings: merged });
}

/** Reset everything to defaults — wipes the column to null. Handy "undo
 *  all my changes" button in the editor. */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const entitled = await hasFeature(user.restaurantId, "hosted_marketing_page");
  if (!entitled) {
    return NextResponse.json({ error: "Addon required" }, { status: 412 });
  }
  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: { hostedSiteSettings: null },
  });
  return NextResponse.json({ settings: defaultHostedSiteSettings() });
}
