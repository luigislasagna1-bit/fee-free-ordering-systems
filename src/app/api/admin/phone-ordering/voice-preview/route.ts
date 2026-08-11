import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../guard";
import { clampVoiceSpeed, isKnownVoiceId } from "@/lib/voice/elevenlabs-voices";

export const runtime = "nodejs";

/**
 * GET /api/admin/phone-ordering/voice-preview?voiceId=...
 *
 * Plays a candidate voice speaking THIS STORE'S OWN greeting, so the owner
 * hears exactly what a caller will hear rather than a generic demo line.
 *
 * COST CONTROL. ElevenLabs bills per character, and a picker with a play button
 * invites clicking every card twice. Results are cached in-process by
 * (voiceId, speed, greeting-hash) so repeated clicks on the same card are free,
 * and the sampled text is hard-capped — a 200-char greeting is the ceiling the
 * Settings UI already enforces.
 *
 * Returns 503 `preview_unavailable` when the platform has no ElevenLabs key.
 * The picker still works in that state; only the sample is missing, and the UI
 * says so instead of failing silently.
 */

const MAX_SAMPLE_CHARS = 220;
const CACHE_MAX = 40;
const CACHE_TTL_MS = 60 * 60_000;

/** voiceId|speed|sha1(text) → mp3 bytes. Bounded; oldest entry evicted. */
const cache = new Map<string, { body: Buffer; expires: number }>();

function cacheGet(key: string): Buffer | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so a voice the owner keeps comparing stays warm.
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: Buffer): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { body, expires: Date.now() + CACHE_TTL_MS });
}

function audio(body: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.length),
      // Private: this is one restaurant's greeting in one voice.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) {
    return NextResponse.json(
      { error: "Voice samples are not enabled yet", code: "preview_unavailable" },
      { status: 503 },
    );
  }

  const voiceId = (req.nextUrl.searchParams.get("voiceId") || "").trim();
  if (!voiceId) {
    return NextResponse.json({ error: "Missing voiceId", code: "bad_request" }, { status: 400 });
  }

  const cfg = await prisma.voiceAgentConfig.findUnique({
    where: { restaurantId: gate.restaurantId },
    select: { openGreeting: true, voiceSpeed: true },
  });
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: gate.restaurantId },
    select: { name: true },
  });

  // Never trust the client id blindly: accept a built-in, or anything the
  // platform account itself reports. Falling back to a name check keeps a
  // live-listed voice usable without a second network call per preview.
  if (!isKnownVoiceId(voiceId) && !/^[A-Za-z0-9]{16,32}$/.test(voiceId)) {
    return NextResponse.json({ error: "Unknown voice", code: "unknown_voice" }, { status: 400 });
  }

  const text = (
    cfg?.openGreeting?.trim() ||
    `Thanks for calling ${restaurant?.name ?? "us"}. How can I help you today?`
  ).slice(0, MAX_SAMPLE_CHARS);
  // The owner may be auditioning a speed they haven't saved yet. Only a number
  // is accepted and it is clamped — never free text, so this can't become an
  // arbitrary text-to-speech endpoint on the platform's ElevenLabs bill.
  const requestedSpeed = req.nextUrl.searchParams.get("speed");
  const speed = clampVoiceSpeed(
    requestedSpeed !== null && Number.isFinite(Number(requestedSpeed))
      ? Number(requestedSpeed)
      : cfg?.voiceSpeed,
  );

  const cacheKey = `${voiceId}|${speed}|${createHash("sha1").update(text).digest("hex")}`;
  const hit = cacheGet(cacheKey);
  if (hit) return audio(hit);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // flash_v2_5 is ConversationRelay's default model, so the sample is
          // the same engine the live call uses.
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) {
      console.error("[voice-preview] ElevenLabs", res.status);
      return NextResponse.json(
        { error: "Couldn't generate a sample", code: "tts_failed" },
        { status: 502 },
      );
    }
    const body = Buffer.from(await res.arrayBuffer());
    cacheSet(cacheKey, body);
    return audio(body);
  } catch (e) {
    console.error("[voice-preview] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't generate a sample", code: "tts_failed" }, { status: 502 });
  }
}
