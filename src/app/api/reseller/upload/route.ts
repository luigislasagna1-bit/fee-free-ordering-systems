import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isResellerView } from "@/lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Reseller-scoped image upload. Mirrors /api/upload's shape (Vercel Blob
 * in production via BLOB_READ_WRITE_TOKEN, local public/uploads/ fallback
 * for dev) but uses `resellerProfileId` instead of `restaurantId` for
 * path scoping + auth.
 *
 * Used by /reseller/branding/logo (and future image-upload features
 * the reseller dashboard adds). Returns { url } the client then
 * PATCHes into ResellerProfile.brandLogoUrl via /api/reseller/branding.
 */

/**
 * Allowed types are PURPOSE-SCOPED (Luigi 2026-08-14).
 *
 * A `logo` feeds the Marketing Kit's server-side renderer, and satori's supported image list
 * is png/apng/jpeg/gif/svg — a WebP source THROWS `Unsupported image type: image/webp`
 * mid-render. Worse, `ImageResponse` builds its 200 + `content-type: image/png` response
 * BEFORE rendering, so that failure ships a truncated, broken file rather than an error.
 * WebP was accepted for logos until a partner's logo would have silently broken every flyer
 * they generated. If WebP logos are ever wanted back, transcode on upload — don't just
 * re-add the MIME type.
 *
 * A `background` (the branded login page's hero image) is only ever rendered by a BROWSER,
 * which handles WebP fine — so it keeps WebP. Scoping this per purpose rather than blanket-
 * blocking avoids regressing the login-background upload, which shares this route.
 */
const BASE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

// SVG for logos — common request, but treat with care since SVG can contain scripts.
// Vercel Blob serves with image/svg+xml so it can't execute in an <img> tag, but blocking
// <object>/iframe usage is the caller's responsibility. Allowlisted because logo upload is
// a controlled flow.
const LOGO_TYPES: Record<string, string> = { ...BASE_TYPES, "image/svg+xml": "svg" };
const BACKGROUND_TYPES: Record<string, string> = { ...BASE_TYPES, "image/webp": "webp" };

function allowedTypesFor(purpose: string | null): { map: Record<string, string>; label: string } {
  return purpose === "background"
    ? { map: BACKGROUND_TYPES, label: "JPG, PNG, or WebP" }
    : { map: LOGO_TYPES, label: "JPG, PNG, or SVG" };
}
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resellerProfileId = user.resellerProfileId;

  // Cuid validation — strictly safe characters only since this becomes
  // a URL path segment.
  if (!/^[a-z0-9]+$/.test(resellerProfileId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Defaults to the strict LOGO set when absent — the safer default, since the logo is the
  // one that reaches the flyer renderer.
  const purposeRaw = form.get("purpose");
  const { map: allowedTypes, label: allowedLabel } = allowedTypesFor(
    typeof purposeRaw === "string" ? purposeRaw : null,
  );

  const ext = allowedTypes[file.type];
  if (!ext) {
    return NextResponse.json({ error: `Only ${allowedLabel} images are allowed` }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (HAS_BLOB) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`reseller/${resellerProfileId}/${filename}`, file, {
        access: "public",
        addRandomSuffix: false,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      console.error("[reseller-upload/blob]", err);
      return NextResponse.json({ error: "Failed to save file (blob)" }, { status: 500 });
    }
  }

  // Local-dev fallback
  const dir = path.join(process.cwd(), "public", "uploads", "reseller", resellerProfileId);
  try {
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return NextResponse.json({ url: `/uploads/reseller/${resellerProfileId}/${filename}` });
  } catch (err) {
    console.error("[reseller-upload/local]", err);
    return NextResponse.json({ error: "Failed to save file" }, { status: 500 });
  }
}
