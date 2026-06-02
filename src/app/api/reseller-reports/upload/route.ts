/**
 * POST /api/reseller-reports/upload — image upload for report screenshots.
 *
 * Auth: getReportAccess() (canComment gate — anyone who can post a
 * comment can attach screenshots). Multipart form upload, single file
 * per request. Returns { url }.
 *
 * Why we don't reuse /api/upload: that endpoint requires
 * user.restaurantId, which superadmins don't have. The reports surface
 * has its own access model (canView via invite or SA), and we want
 * uploads scoped accordingly.
 *
 * Storage:
 *   - Production: Vercel Blob under `reseller-reports/<filename>`
 *   - Local dev: public/uploads/reseller-reports/<filename>
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getReportAccess } from "@/lib/reseller-reports-access";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  // GIF can be useful for "watch this happen" repro recordings.
  "image/gif": "gif",
};
// 10 MB — bug screenshots tend to be high-res and include multiple
// modal layers, so the 5 MB cap on /api/upload is too tight.
const MAX_SIZE = 10 * 1024 * 1024;
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(req: NextRequest) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    return NextResponse.json({ error: "Only JPG, PNG, WebP, and GIF images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Filename: timestamp + random suffix + ext. Derived purely from MIME
  // type — never trust the original filename (XSS / traversal vectors).
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (HAS_BLOB) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`reseller-reports/${filename}`, file, {
        access: "public",
        addRandomSuffix: false,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      console.error("[reseller-reports/upload/blob]", err);
      return NextResponse.json({ error: "Failed to save file (blob)" }, { status: 500 });
    }
  }

  // Local-dev fallback.
  const dir = path.join(process.cwd(), "public", "uploads", "reseller-reports");
  try {
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return NextResponse.json({ url: `/uploads/reseller-reports/${filename}` });
  } catch (err) {
    console.error("[reseller-reports/upload/local]", err);
    return NextResponse.json({ error: "Failed to save file" }, { status: 500 });
  }
}
