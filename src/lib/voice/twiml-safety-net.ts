/**
 * Nabil AI — LAST-RESORT TwiML, for when the normal voice webhook path threw.
 *
 * WHY THIS EXISTS (2026-08-15). Both /api/twilio/voice and
 * /api/twilio/voice/handoff hit Prisma before they can decide anything, and
 * neither wrapped that in a try/catch. A DB blip, a cold-start timeout or any
 * unhandled throw therefore became a 500 — and Twilio's answer to a 500 on a
 * number with no VoiceFallbackUrl configured is to play its own error tone and
 * hang up. The caller got dead air.
 *
 * Every other "Nabil can't take this call" branch in this feature deliberately
 * rings the store instead (see ../../../app/api/twilio/voice/route.ts). This was
 * the one path that didn't, precisely because it is the path where we cannot ask
 * the database who the store is. So the number comes from the environment:
 *
 *   NABIL_FALLBACK_MAP             {"+12897687778":"+14168338405", ...}
 *   NABIL_FALLBACK_DEFAULT_NUMBER  a catch-all (e.g. the owner's mobile) so a
 *                                  number provisioned since the map was last
 *                                  written still reaches a human
 *
 * ⚠️ THIS MODULE MUST NOT IMPORT ANYTHING — not Prisma, not the entitlement
 * cache, not a phone helper, nothing that could itself do I/O or pull in a
 * transitive database import. Prisma being unreachable is the most likely reason
 * we are running at all. It is import-free on purpose and twiml-safety-net.test.ts
 * asserts the file stays that way. The digit normaliser below is a deliberate
 * ~4-line duplicate of the canonical one in the voice service (canonicalPhone in
 * services/nabil-voice/src/tools.ts) for exactly this reason.
 *
 * NOTE we answer 200 with valid TwiML rather than re-throwing, which means
 * Twilio's own VoiceFallbackUrl will NOT fire when this runs. That is intended:
 * this is the belt. The braces — the Fly-hosted fallback URL, which survives
 * Vercel being down entirely — only has to cover the case where this route
 * cannot respond at all.
 *
 * Scale note: an env-var map is the right shape up to a few hundred numbers
 * (Vercel caps total env size around 64 KB). Past that, swap the lookup for a
 * Vercel Edge Config read — the signature here does not change.
 */

const CONNECTING = "One moment — connecting you to the restaurant.";
const APOLOGY = "Sorry, we're having trouble taking your call right now. Please try again in a few minutes.";

/** Escape a value for safe use in TwiML attributes/text. */
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Bare digits, minus a leading NANP "1", so a hand-maintained map matches
 *  whatever shape the number was typed in ("+1 289-768-7778" === "2897687778").
 *  Mirrors canonicalPhone() in the voice service; duplicated on purpose (see
 *  the no-imports rule above). */
function normalizeDigits(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[twiml-safety-net] ${message}`);
}

/** Parsed NABIL_FALLBACK_MAP, memoised against the raw env string so a changed
 *  value (or a test setting one) re-parses without a restart. */
let mapCache: { raw: string; map: Map<string, string> } | null = null;

function fallbackMap(): Map<string, string> {
  const raw = process.env.NABIL_FALLBACK_MAP || "";
  if (mapCache && mapCache.raw === raw) return mapCache.map;

  const map = new Map<string, string>();
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== "string") continue;
          const key = normalizeDigits(k);
          const val = v.trim();
          if (key && val) map.set(key, val);
        }
      } else {
        warnOnce("NABIL_FALLBACK_MAP is not a JSON object — using the default number only");
      }
    } catch {
      // A malformed map must never take the safety net down with it: fall
      // through to the default number rather than throwing inside a catch.
      warnOnce("NABIL_FALLBACK_MAP is not valid JSON — using the default number only");
    }
  }

  mapCache = { raw, map };
  return map;
}

/** The human phone to ring for a dialed Nabil number, or null if we have none.
 *  Exported for the test and for the Fly-side fallback to share the same rules. */
export function resolveFallbackNumber(to?: string | null): string | null {
  const key = normalizeDigits(to || "");
  const mapped = key ? fallbackMap().get(key) : undefined;
  return (mapped || process.env.NABIL_FALLBACK_DEFAULT_NUMBER || "").trim() || null;
}

/** The TwiML document body (no XML prolog). Split out so tests assert on a
 *  string rather than unwrapping a Response. */
export function safetyNetTwimlBody(to?: string | null): string {
  const num = resolveFallbackNumber(to);
  if (num) {
    return (
      `<Response><Say voice="Polly.Joanna-Neural">${xml(CONNECTING)}</Say>` +
      `<Dial answerOnBridge="true" timeout="30">${xml(num)}</Dial>` +
      `<Say voice="Polly.Joanna-Neural">${xml(APOLOGY)}</Say></Response>`
    );
  }
  // No number anywhere: a spoken apology still beats Twilio's error tone.
  return `<Response><Say voice="Polly.Joanna-Neural">${xml(APOLOGY)}</Say><Hangup/></Response>`;
}

/** 200 + valid TwiML, always. Never throws — it is the thing that runs when
 *  something else already did. */
export function safetyNetTwiml(to?: string | null): Response {
  let body: string;
  try {
    body = safetyNetTwimlBody(to);
  } catch {
    body = `<Response><Say voice="Polly.Joanna-Neural">${xml(APOLOGY)}</Say><Hangup/></Response>`;
  }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
