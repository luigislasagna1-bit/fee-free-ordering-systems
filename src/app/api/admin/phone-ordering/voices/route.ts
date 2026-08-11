import { NextResponse } from "next/server";
import { requirePhoneOrderingAdmin } from "../guard";
import { NABIL_VOICES, type NabilVoice } from "@/lib/voice/elevenlabs-voices";

export const runtime = "nodejs";

/**
 * GET /api/admin/phone-ordering/voices
 *
 * The voice picker's catalogue. Returns the platform ElevenLabs account's REAL
 * voice list when a key is configured — so the cards can never drift from what
 * the provider will actually accept — and falls back to the curated built-in
 * list otherwise.
 *
 * `previewAvailable` tells the UI whether the play button can produce audio; the
 * picker itself works either way, because choosing a voice is the part an owner
 * can't do with a raw id text box.
 */

type ElevenVoice = {
  voice_id?: string;
  name?: string;
  labels?: Record<string, string>;
};

/** Cached process-wide: the list changes when the platform adds a voice, not
 *  per request, and every owner sees the same catalogue. */
let cache: { voices: NabilVoice[]; expires: number } | null = null;
const TTL_MS = 30 * 60_000;

async function liveVoices(key: string): Promise<NabilVoice[] | null> {
  if (cache && cache.expires > Date.now()) return cache.voices;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { voices?: ElevenVoice[] };
    const voices: NabilVoice[] = (json.voices ?? [])
      .filter((v) => typeof v.voice_id === "string" && typeof v.name === "string")
      .slice(0, 40)
      .map((v) => {
        const labels = v.labels ?? {};
        const gender = labels.gender === "male" ? "male" : "female";
        const accent = [labels.accent, labels.description].filter(Boolean).join(" · ") || "ElevenLabs";
        return { id: v.voice_id as string, name: v.name as string, gender, accent };
      });
    if (!voices.length) return null;
    cache = { voices, expires: Date.now() + TTL_MS };
    return voices;
  } catch {
    return null; // network/timeouts fall back to the curated list, never 500
  }
}

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  const voices = (key ? await liveVoices(key) : null) ?? NABIL_VOICES;

  return NextResponse.json({
    voices,
    previewAvailable: !!key,
    source: key ? "elevenlabs" : "builtin",
  });
}
