import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

/**
 * Custom kitchen-alert sound upload.
 *
 * Lets restaurant owners upload their own MP3/WAV ring sound for the
 * Kitchen Display "new order" alarm. Once saved, the URL is exposed to
 * the KDS via /api/restaurants/profile and surfaces as a third option
 * ("Custom Sound") in the in-app Sound Settings picker.
 *
 *   POST   → upload + persist (multipart form, field "file")
 *   DELETE → clear the URL (the blob is best-effort deleted from
 *            Vercel Blob; the DB column going to null is what matters)
 *
 * Restrictions are deliberately tight:
 *   - audio/mpeg, audio/mp3, audio/wav, audio/x-wav, audio/ogg only
 *   - 2 MB cap. Ring sounds are 1-5s short clips; anything bigger is
 *     either a song (will get cropped at runtime and sound terrible)
 *     or a 30-second loop (will overlap with itself). We push back.
 *   - Non-zero size, real file uploaded.
 *
 * Like other writes, restaurantId is derived from the session — never
 * the request body. A staff member of restaurant A cannot upload
 * a ring sound onto restaurant B.
 */
const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};
const MAX_AUDIO_SIZE = 2 * 1024 * 1024; // 2 MB

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[a-z0-9]+$/.test(restaurantId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = ALLOWED_AUDIO_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Only MP3, WAV, or OGG audio files are allowed" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: "Audio file must be under 2 MB. Ring sounds are typically 1–5s clips." },
      { status: 400 },
    );
  }

  // Derive name from MIME type — never trust the filename. Prefix
  // "kitchen-sound-" so it's obvious in the blob listing.
  const filename = `kitchen-sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  let savedUrl: string;

  if (HAS_BLOB) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${restaurantId}/${filename}`, file, {
        access: "public",
        addRandomSuffix: false,
        // Tell the CDN not to recompress an MP3 (which is already
        // compressed). Cache-control is set on the URL itself so the
        // KDS can browser-cache the buffer across reloads.
        cacheControlMaxAge: 60 * 60 * 24 * 30, // 30 days
      });
      savedUrl = blob.url;
    } catch (err) {
      console.error("[kitchen-sound/blob]", err);
      return NextResponse.json(
        { error: "Failed to save audio (blob)" },
        { status: 500 },
      );
    }
  } else {
    // Local-dev fallback: drop into public/uploads/. Vercel's serverless
    // FS is read-only at runtime so this only ever fires in dev.
    const dir = path.join(process.cwd(), "public", "uploads", restaurantId);
    try {
      await mkdir(dir, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(dir, filename), buffer);
      savedUrl = `/uploads/${restaurantId}/${filename}`;
    } catch (err) {
      console.error("[kitchen-sound/local]", err);
      return NextResponse.json({ error: "Failed to save file" }, { status: 500 });
    }
  }

  // Capture the old URL so we can clean it up after the write succeeds.
  // Best-effort — failing to delete the old blob is non-fatal.
  const prev = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { kitchenAlertSoundUrl: true },
  });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { kitchenAlertSoundUrl: savedUrl },
  });

  // Clean up the old blob if there was one (and the new one isn't
  // pointing at the same path, which "shouldn't happen" but defend
  // against it anyway).
  if (prev?.kitchenAlertSoundUrl && prev.kitchenAlertSoundUrl !== savedUrl) {
    void deleteStoredAudio(prev.kitchenAlertSoundUrl).catch((err) => {
      console.warn("[kitchen-sound] failed to delete previous file:", err);
    });
  }

  return NextResponse.json({ url: savedUrl });
}

export async function DELETE() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { kitchenAlertSoundUrl: true },
  });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { kitchenAlertSoundUrl: null },
  });

  if (restaurant?.kitchenAlertSoundUrl) {
    void deleteStoredAudio(restaurant.kitchenAlertSoundUrl).catch((err) => {
      console.warn("[kitchen-sound] failed to delete blob on clear:", err);
    });
  }

  return NextResponse.json({ success: true });
}

/** Best-effort delete of a previously stored file. Vercel-Blob URLs get
 *  the SDK delete path; local /uploads/ paths get fs.unlink. */
async function deleteStoredAudio(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "public", url);
    await unlink(localPath);
    return;
  }
  if (HAS_BLOB) {
    const { del } = await import("@vercel/blob");
    await del(url);
  }
}
