import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";

/**
 * GET /api/reseller/branding
 * Returns the calling reseller's current white-label values.
 *
 * PATCH /api/reseller/branding
 * Updates one or more of: imprint, brandLogoUrl, brandLoginTitle,
 * brandPrimaryColor, brandAccentColor, brandLoginBgUrl.
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
    select: {
      status: true,
      imprint: true,
      companyVatId: true,
      brandLogoUrl: true,
      brandLoginTitle: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      brandLoginBgUrl: true,
      showCustomerPageCredit: true,
    },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Not approved" }, { status: 403 });
  }
  return NextResponse.json({
    imprint: profile.imprint ?? "",
    companyVatId: profile.companyVatId ?? "",
    brandLogoUrl: profile.brandLogoUrl ?? "",
    brandLoginTitle: profile.brandLoginTitle ?? "",
    brandPrimaryColor: profile.brandPrimaryColor ?? "",
    brandAccentColor: profile.brandAccentColor ?? "",
    brandLoginBgUrl: profile.brandLoginBgUrl ?? "",
    showCustomerPageCredit: profile.showCustomerPageCredit,
  });
}

// Accepts a 6-digit hex like "#10b981". Validated before persisting so the
// branded auth pages can drop the value straight into inline styles without
// re-sanitizing. Empty / null clears the field (falls back to platform emerald).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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
  const data: {
    imprint?: string | null;
    companyVatId?: string | null;
    brandLogoUrl?: string | null;
    brandLoginTitle?: string | null;
    brandPrimaryColor?: string | null;
    brandAccentColor?: string | null;
    brandLoginBgUrl?: string | null;
    showCustomerPageCredit?: boolean;
  } = {};

  if ("imprint" in body) {
    const raw = body.imprint == null ? null : String(body.imprint).trim();
    if (raw && raw.length > 200) {
      return NextResponse.json({ error: "Imprint must be 200 characters or fewer" }, { status: 400 });
    }
    data.imprint = raw && raw.length > 0 ? raw : null;
  }
  // Reseller's VAT / tax number for the invoice ISSUER block (Fabrizio cmr1ty0lc).
  if ("companyVatId" in body) {
    const raw = body.companyVatId == null ? null : String(body.companyVatId).trim();
    if (raw && raw.length > 60) {
      return NextResponse.json({ error: "VAT / tax number too long" }, { status: 400 });
    }
    data.companyVatId = raw && raw.length > 0 ? raw : null;
  }
  if ("brandLogoUrl" in body) {
    const raw = body.brandLogoUrl == null ? null : String(body.brandLogoUrl).trim();
    if (raw && raw.length > 500) {
      return NextResponse.json({ error: "Logo URL too long" }, { status: 400 });
    }
    data.brandLogoUrl = raw && raw.length > 0 ? raw : null;
  }
  // Login/signup background image URL — replaces the default FeeFree hero
  // background on the reseller's branded auth pages. Validated like
  // brandLogoUrl: a URL string up to 500 chars, or empty → null (default bg).
  if ("brandLoginBgUrl" in body) {
    const raw = body.brandLoginBgUrl == null ? null : String(body.brandLoginBgUrl).trim();
    if (raw && raw.length > 500) {
      return NextResponse.json({ error: "Background image URL too long" }, { status: 400 });
    }
    data.brandLoginBgUrl = raw && raw.length > 0 ? raw : null;
  }
  if ("brandLoginTitle" in body) {
    const raw = body.brandLoginTitle == null ? null : String(body.brandLoginTitle).trim();
    if (raw && raw.length > 100) {
      return NextResponse.json({ error: "Title too long" }, { status: 400 });
    }
    data.brandLoginTitle = raw && raw.length > 0 ? raw : null;
  }
  // Brand colors: a valid 6-digit hex, or empty → null (platform default).
  // Anything else is rejected so an invalid value never reaches the branded
  // auth pages' inline styles.
  if ("brandPrimaryColor" in body) {
    const raw = body.brandPrimaryColor == null ? "" : String(body.brandPrimaryColor).trim();
    if (raw && !HEX_COLOR_RE.test(raw)) {
      return NextResponse.json({ error: "Primary color must be a hex value like #10b981" }, { status: 400 });
    }
    data.brandPrimaryColor = raw ? raw : null;
  }
  if ("brandAccentColor" in body) {
    const raw = body.brandAccentColor == null ? "" : String(body.brandAccentColor).trim();
    if (raw && !HEX_COLOR_RE.test(raw)) {
      return NextResponse.json({ error: "Accent color must be a hex value like #34d399" }, { status: 400 });
    }
    data.brandAccentColor = raw ? raw : null;
  }
  // Customer-page "Powered by {companyName}" credit toggle (boolean). Coerced to a
  // strict boolean so a missing/odd value can't write null into a non-null column.
  if ("showCustomerPageCredit" in body) {
    data.showCustomerPageCredit = body.showCustomerPageCredit === true;
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
