import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";

/**
 * GET /api/reseller/branding
 * Returns the calling reseller's current white-label values.
 *
 * PATCH /api/reseller/branding
 * Updates one or more of: imprint, brandLogoUrl, brandLoginTitle.
 * Only fields present in the body are touched — partial updates are
 * the norm (each branding sub-page edits its own field).
 *
 * Auth: must be an approved reseller (or a superadmin impersonating one).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true, imprint: true, brandLogoUrl: true, brandLoginTitle: true },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Not approved" }, { status: 403 });
  }
  return NextResponse.json({
    imprint: profile.imprint ?? "",
    brandLogoUrl: profile.brandLogoUrl ?? "",
    brandLoginTitle: profile.brandLoginTitle ?? "",
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Your account isn't approved yet" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  // Only update the fields that are explicitly present. `undefined` means
  // "don't touch this field" — different from passing an empty string
  // which means "clear it".
  const data: { imprint?: string | null; brandLogoUrl?: string | null; brandLoginTitle?: string | null } = {};

  if ("imprint" in body) {
    const raw = body.imprint == null ? null : String(body.imprint).trim();
    if (raw && raw.length > 200) {
      return NextResponse.json({ error: "Imprint must be 200 characters or fewer" }, { status: 400 });
    }
    data.imprint = raw && raw.length > 0 ? raw : null;
  }
  if ("brandLogoUrl" in body) {
    const raw = body.brandLogoUrl == null ? null : String(body.brandLogoUrl).trim();
    if (raw && raw.length > 500) {
      return NextResponse.json({ error: "Logo URL too long" }, { status: 400 });
    }
    data.brandLogoUrl = raw && raw.length > 0 ? raw : null;
  }
  if ("brandLoginTitle" in body) {
    const raw = body.brandLoginTitle == null ? null : String(body.brandLoginTitle).trim();
    if (raw && raw.length > 100) {
      return NextResponse.json({ error: "Title too long" }, { status: 400 });
    }
    data.brandLoginTitle = raw && raw.length > 0 ? raw : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, message: "No changes" });
  }

  await prisma.resellerProfile.update({
    where: { id: user.resellerProfileId },
    data,
  });

  return NextResponse.json({ ok: true });
}
