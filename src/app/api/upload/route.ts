import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Vercel's serverless filesystem is read-only at runtime. If we're running on
// Vercel (i.e. a BLOB_READ_WRITE_TOKEN is configured), upload to Vercel Blob;
// otherwise fall back to writing to public/uploads/ for local dev.
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Derive extension purely from MIME type — never trust the filename
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Ensure restaurantId can only contain safe characters (cuid format)
  if (!/^[a-z0-9]+$/.test(restaurantId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  // ── Production path: Vercel Blob ────────────────────────────────────────
  if (HAS_BLOB) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${restaurantId}/${filename}`, file, {
        access: "public",
        // Restaurant IDs are unique cuids; collisions are not a concern.
        // addRandomSuffix keeps the URL stable even if someone re-uploads with
        // the exact same filename (which our timestamp prefix already prevents).
        addRandomSuffix: false,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      console.error("[upload/blob]", err);
      return NextResponse.json({ error: "Failed to save file (blob)" }, { status: 500 });
    }
  }

  // ── Local-dev path: write to public/uploads/ ────────────────────────────
  const dir = path.join(process.cwd(), "public", "uploads", restaurantId);
  try {
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return NextResponse.json({ url: `/uploads/${restaurantId}/${filename}` });
  } catch (err) {
    console.error("[upload/local]", err);
    return NextResponse.json({ error: "Failed to save file" }, { status: 500 });
  }
}
