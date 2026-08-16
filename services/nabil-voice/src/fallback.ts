import crypto from "node:crypto";
import { CONFIG } from "./config";

/**
 * Nabil AI — the Twilio VoiceFallbackUrl handler.
 *
 * Twilio calls this ONLY when the primary webhook on Vercel failed: a non-2xx,
 * invalid TwiML, or a timeout. Which means the one thing this handler may not
 * assume is that the app is reachable. It therefore answers entirely from
 * memory, and its whole job is one sentence: ring the restaurant's own phone.
 *
 * WHY IT LIVES HERE AND NOT IN THE NEXT.JS APP (2026-08-15). A fallback hosted
 * on Vercel shares its blast radius with the thing it is supposed to cover — if
 * the primary handler is down because Vercel is down, so is the fallback. Fly is
 * a second provider we already pay for and already run always-on, so the braces
 * go here. (The belt — a try/catch that returns ring-the-store TwiML — is on the
 * Vercel side in src/lib/voice/twiml-safety-net.ts, and covers the far more
 * common case of an app-level throw with the platform otherwise healthy.)
 *
 * ⚠️ LAST-KNOWN-GOOD IS THE WHOLE POINT. The number map is refreshed from the
 * app every 15 minutes, but a failed refresh MUST leave the previous copy
 * standing. Emptying the cache because the app is unreachable would disable the
 * fallback at exactly the moment it is needed. Both layers below are additive
 * and neither is ever cleared.
 */

const REFRESH_MS = 15 * 60 * 1000;

/** Floor: the NABIL_FALLBACK_MAP secret. Survives a cold boot during an app
 *  outage, when the bulk endpoint has never once succeeded. */
const envMap = new Map<string, string>();
/** Live: last successful bulk load. Replaced wholesale on success, never on failure. */
let liveMap = new Map<string, string>();
let lastRefreshOk = 0;
let refreshTimer: NodeJS.Timeout | null = null;

/** Bare digits minus a leading NANP "1" — mirrors canonicalPhone() in tools.ts
 *  and normalizeDigits() in the app's twiml-safety-net.ts. Duplicated on
 *  purpose: this module must not import anything that could fail to load. */
function normalizeDigits(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Load the env floor. Idempotent; safe to call at boot before anything else. */
export function seedFallbackMapFromEnv(): void {
  const raw = (CONFIG.fallbackMapJson || "").trim();
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn("[nabil-voice/fallback] NABIL_FALLBACK_MAP is not a JSON object — ignoring");
      return;
    }
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const key = normalizeDigits(k);
      if (key && v.trim()) envMap.set(key, v.trim());
    }
    console.log(`[nabil-voice/fallback] seeded ${envMap.size} number(s) from NABIL_FALLBACK_MAP`);
  } catch {
    console.warn("[nabil-voice/fallback] NABIL_FALLBACK_MAP is not valid JSON — ignoring");
  }
}

/** Pull the current map from the app. Never throws; never empties the cache. */
export async function refreshFallbackMap(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG.appBaseUrl}/api/internal/voice/fallback-map`, {
      headers: { "x-internal-key": CONFIG.internalSecret },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[nabil-voice/fallback] refresh failed (HTTP ${res.status}) — keeping ${liveMap.size} cached`);
      return false;
    }
    const body = (await res.json()) as { numbers?: Array<{ to?: string; dial?: string }> };
    const rows = Array.isArray(body?.numbers) ? body.numbers : [];

    // An EMPTY answer is not a reason to forget every number we know. It is far
    // more likely to be a broken query than a platform with no phone numbers.
    if (rows.length === 0 && liveMap.size > 0) {
      console.warn("[nabil-voice/fallback] refresh returned 0 numbers — keeping the previous map");
      return false;
    }

    const next = new Map<string, string>();
    for (const r of rows) {
      const key = normalizeDigits(r?.to || "");
      const dial = (r?.dial || "").trim();
      if (key && dial) next.set(key, dial);
    }
    liveMap = next;
    lastRefreshOk = Date.now();
    console.log(`[nabil-voice/fallback] refreshed ${liveMap.size} number(s)`);
    return true;
  } catch (e) {
    console.warn(
      `[nabil-voice/fallback] refresh error — keeping ${liveMap.size} cached:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/** Boot hook: seed from env, refresh once, then every 15 minutes. */
export function startFallbackRefresh(): void {
  seedFallbackMapFromEnv();
  void refreshFallbackMap();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void refreshFallbackMap(), REFRESH_MS);
  refreshTimer.unref?.();
}

/** The human phone to ring for a dialed Nabil number. Live map wins; the env
 *  floor covers anything it doesn't know. */
export function resolveFallbackDial(to: string): string | null {
  const key = normalizeDigits(to);
  if (!key) return null;
  return liveMap.get(key) || envMap.get(key) || null;
}

/** Diagnostics for /health — how stale is the map, and how big. */
export function fallbackMapStatus(): { live: number; env: number; ageSeconds: number | null } {
  return {
    live: liveMap.size,
    env: envMap.size,
    ageSeconds: lastRefreshOk ? Math.round((Date.now() - lastRefreshOk) / 1000) : null,
  };
}

/**
 * Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted k+v)).
 * Implemented here rather than imported because this file must stay
 * dependency-free; node:crypto is built in.
 *
 * Verified against the EXACT configured URL, not one reconstructed from proxy
 * headers — the same deterministic-URL rule the app side uses for the recording
 * callback. Returns true when no auth token is configured, so a dev deploy is
 * not bricked, and warns once so that is never silently the case in production.
 */
let warnedNoToken = false;
export function verifyTwilioSignature(
  params: Record<string, string>,
  header: string | null,
): boolean {
  const token = CONFIG.twilioAuthToken;
  const url = CONFIG.fallbackUrl;
  if (!token || !url) {
    if (!warnedNoToken) {
      warnedNoToken = true;
      console.warn(
        "[nabil-voice/fallback] signature check DISABLED — set FFOS_TWILIO_AUTH_TOKEN and NABIL_TWILIO_FALLBACK_URL. " +
          "This endpoint dials a real phone; do not leave it unverified in production.",
      );
    }
    return true;
  }
  if (!header) return false;
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The TwiML. Pure — exported for the unit test. */
export function fallbackTwiml(dial: string | null): string {
  const head = `<?xml version="1.0" encoding="UTF-8"?>`;
  if (dial) {
    return (
      `${head}<Response>` +
      `<Say voice="Polly.Joanna-Neural">One moment — connecting you to the restaurant.</Say>` +
      `<Dial answerOnBridge="true" timeout="30">${xml(dial)}</Dial>` +
      `<Say voice="Polly.Joanna-Neural">Sorry, we couldn't reach anyone. Please try again shortly.</Say>` +
      `</Response>`
    );
  }
  return (
    `${head}<Response>` +
    `<Say voice="Polly.Joanna-Neural">Sorry, we're having trouble taking your call right now. Please try again in a few minutes.</Say>` +
    `<Hangup/></Response>`
  );
}

/** Handle one POST from Twilio. Never throws. */
export function handleFallback(rawBody: string, signature: string | null): { status: number; xml: string } {
  const params: Record<string, string> = {};
  try {
    for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v;
  } catch {
    /* malformed body → no params, handled below */
  }

  if (!verifyTwilioSignature(params, signature)) {
    console.error("[nabil-voice/fallback] rejected: bad or missing X-Twilio-Signature");
    return { status: 403, xml: `<?xml version="1.0" encoding="UTF-8"?><Response/>` };
  }

  const to = params.To || "";
  const dial = resolveFallbackDial(to);
  console.log(
    `[nabil-voice/fallback] FIRED for ${to || "(no To)"} → ${dial ? "dialing the store" : "NO NUMBER KNOWN"}`,
  );
  return { status: 200, xml: fallbackTwiml(dial) };
}
