import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import {
  ensureVoiceWebhookConfig,
  readVoiceNumberConfig,
  voiceConfigDrift,
  voiceFallbackUrl,
  voiceWebhookUrl,
  type NumberConfig,
} from "@/lib/voice/twilio-number-config";
import { describeLayers, voiceLinesEnv, type VoiceLineRow, type VoiceLinesResponse } from "@/lib/voice/voice-lines";
import { isVoiceChannel, VOICE_CHANNELS } from "@/lib/voice/voice-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Superadmin › Nabil Phone Lines — the caller for `ensureVoiceWebhookConfig`.
 *
 * WHY THIS LIVES HERE (2026-08-16). The Twilio number's voice webhook had only
 * ever been set by hand in the Twilio console, and the VoiceFallbackUrl
 * ("PRIMARY HANDLER FAILS") was never set at all — so the entire no-dead-air
 * chain (Vercel safety net → Fly /twiml/fallback → the store's own phone) was
 * inert. The repair lib was finished but nothing called it. The credentials it
 * needs (FFOS_TWILIO_*, NABIL_VOICE_WSS_URL, NEXT_PUBLIC_APP_URL) exist only in
 * the Vercel environment, so the caller runs here, behind the superadmin
 * session, as a page with a read-only preview and an explicit Repair button.
 *
 *   GET  → every non-released VoiceNumber with what Twilio currently has, what
 *          this deployment intends, the drift between them, and who each
 *          fallback layer would ring. Read-only: one Twilio GET per number.
 *   POST { id } → repair ONE number (idempotent), backfill twilioNumberSid,
 *          write an audit row, return what changed.
 *   PATCH { id, voiceChannel } → move ONE number between the live lane
 *          ("current") and the staging lane ("staging", nabil-voice-staging).
 *          This is the switch behind Luigi's 2026-08-22 rule that nothing
 *          reaches the live line untested: only the staging test line(s) ever
 *          point at an unpromoted build. Refuses "staging" when this
 *          deployment has no NABIL_VOICE_STAGING_WSS_URL (the call would
 *          silently fall back to live). Audited.
 *
 * Never returns credentials or env VALUES — only presence booleans.
 */

const NUMBER_SELECT = {
  id: true,
  phoneNumber: true,
  status: true,
  enabled: true,
  isDemo: true,
  voiceChannel: true,
  twilioNumberSid: true,
  restaurant: {
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      alertPhone: true,
      voiceAgentConfig: { select: { transferToNumber: true } },
    },
  },
} as const;

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const env = voiceLinesEnv();
  const intended = { voiceUrl: voiceWebhookUrl(), voiceFallbackUrl: voiceFallbackUrl() };

  // Bounded: one row per provisioned Nabil number platform-wide, and this is a
  // superadmin diagnostic page, not a hot path. Sequential Twilio GETs so a
  // burst of numbers can't trip Twilio's concurrency limits.
  const rows = await prisma.voiceNumber.findMany({
    where: { status: { not: "released" } },
    select: NUMBER_SELECT,
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const numbers: VoiceLineRow[] = [];
  for (const row of rows) {
    let twilioState: VoiceLineRow["twilioState"] = "not_configured";
    let current: NumberConfig | null = null;
    if (env.twilioCredentials) {
      current = await readVoiceNumberConfig(row.phoneNumber);
      twilioState = current ? "ok" : "not_found";
    }
    numbers.push({
      id: row.id,
      phoneNumber: row.phoneNumber,
      status: row.status,
      enabled: row.enabled,
      isDemo: row.isDemo,
      voiceChannel: row.voiceChannel,
      twilioNumberSid: row.twilioNumberSid,
      restaurant: { id: row.restaurant.id, name: row.restaurant.name, slug: row.restaurant.slug },
      twilioState,
      current,
      intended,
      drift: current ? voiceConfigDrift(current, intended) : [],
      layers: describeLayers(row),
    });
  }

  const body: VoiceLinesResponse = { numbers, env, generatedAt: new Date().toISOString() };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const row = await prisma.voiceNumber.findUnique({
    where: { id },
    select: { id: true, phoneNumber: true, status: true, twilioNumberSid: true, restaurantId: true },
  });
  if (!row) return NextResponse.json({ error: "Number not found" }, { status: 404 });
  if (row.status === "released") {
    return NextResponse.json({ error: "This number has been released — nothing to repair" }, { status: 409 });
  }

  const result = await ensureVoiceWebhookConfig(row.phoneNumber);

  // The lib finds the PN sid by E.164 lookup; nothing else in the app writes
  // twilioNumberSid today, so this is where the column gets its value.
  let sidBackfilled = false;
  if (result.ok && result.sid && !row.twilioNumberSid) {
    try {
      await prisma.voiceNumber.update({ where: { id: row.id }, data: { twilioNumberSid: result.sid } });
      sidBackfilled = true;
    } catch (e) {
      // A unique clash (the sid already on another row) is a data problem to
      // surface, not a reason to fail the repair that just succeeded.
      console.error("[superadmin/voice-numbers] twilioNumberSid backfill failed", { id: row.id, e });
    }
  }

  await writeAuditLog({
    actor: user,
    action: "voice_number.repair_webhooks",
    entity: `voiceNumber:${row.id}`,
    detail: {
      phoneNumber: row.phoneNumber,
      restaurantId: row.restaurantId,
      ok: result.ok,
      changed: result.changed,
      error: result.error ?? null,
      sidBackfilled,
    },
  });

  return NextResponse.json({ ...result, sidBackfilled }, { status: result.ok ? 200 : 502 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; voiceChannel?: unknown };
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!isVoiceChannel(b.voiceChannel)) {
    return NextResponse.json({ error: `voiceChannel must be one of: ${VOICE_CHANNELS.join(", ")}` }, { status: 400 });
  }
  const voiceChannel = b.voiceChannel;
  if (voiceChannel === "staging" && !(process.env.NABIL_VOICE_STAGING_WSS_URL || "").trim()) {
    return NextResponse.json(
      { error: "NABIL_VOICE_STAGING_WSS_URL is not set on this deployment — a staging number would fall back to the live lane. Set it first." },
      { status: 409 },
    );
  }

  const row = await prisma.voiceNumber.findUnique({
    where: { id },
    select: { id: true, phoneNumber: true, status: true, voiceChannel: true, restaurantId: true },
  });
  if (!row) return NextResponse.json({ error: "Number not found" }, { status: 404 });
  if (row.status === "released") {
    return NextResponse.json({ error: "This number has been released" }, { status: 409 });
  }
  if (row.voiceChannel === voiceChannel) {
    return NextResponse.json({ ok: true, changed: false, voiceChannel });
  }

  await prisma.voiceNumber.update({ where: { id: row.id }, data: { voiceChannel } });
  await writeAuditLog({
    actor: user,
    action: "voice_number.set_channel",
    entity: `voiceNumber:${row.id}`,
    detail: { phoneNumber: row.phoneNumber, restaurantId: row.restaurantId, from: row.voiceChannel, to: voiceChannel },
  });
  return NextResponse.json({ ok: true, changed: true, voiceChannel });
}
