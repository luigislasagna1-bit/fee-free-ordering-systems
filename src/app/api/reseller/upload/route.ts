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

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  // SVG for logos — common request, but treat with care since SVG can
  // contain scripts. Vercel Blob serves with image/svg+xml so it can't
  // execute in an <img> tag, but blocking <object>/iframe usage is the
  // caller's responsibility. We keep it allowlisted here because logo
  // upload is a controlled flow.
  "image/svg+xml": "svg",
};
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

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only JPG, PNG, WebP, and SVG images are allowed" }, { status: 400 });
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
