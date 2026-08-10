import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { shouldEnforceTwilioSignature, verifyTwilioSignatureAny, twilioUrlCandidates } from "@/lib/voice/twilio-signature";
import { hasFeature } from "@/lib/entitlements";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { signNabilCallToken } from "@/lib/voice/session-token";
import { liveOpenStatus } from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";

/**
 * Nabil AI — inbound-voice TwiML entry point.
 *
 * Twilio POSTs here when a caller dials a restaurant's provisioned Nabil number.
 * We look the restaurant up by the dialed `To` number, gate on the
 * phone_ordering_agent entitlement + the master enable switch + block-list, then
 * hand the call to Twilio ConversationRelay pointed at our always-on voice
 * service (NABIL_VOICE_WSS_URL), carrying a short-lived signed token.
 *
 * This route only returns XML — the persistent WebSocket lives in the separate
 * voice service (Vercel serverless can't hold a socket). Pattern mirrors
 * /api/twilio/support-call; the proxy excludes /api so this is publicly
 * reachable for Twilio.
 *
 * SETUP (Twilio console): Phone Numbers → the Nabil number → Voice → "A CALL
 *   COMES IN": Webhook  HTTP POST  https://feefreeordering.com/api/twilio/voice
 *
 * ENV:
 *   NABIL_VOICE_WSS_URL     wss URL of the voice service (e.g. wss://nabil-voice.fly.dev/call)
 *   NABIL_VOICE_JWT_SECRET  shared with the voice service to sign/verify call tokens
 *
 * HARDENING (2026-08-10): POSTs are verified against X-Twilio-Signature via
 * src/lib/voice/twilio-signature.ts whenever enforcement is on (auth token
 * configured); invalid → 403 with an empty <Response/>. With NO auth token we
 * fail CLOSED in production (403) and warn-and-serve only outside it. The
 * public URL is reconstructed from X-Forwarded-Proto/Host (Vercel). GET stays
 * open — it only ever yields the generic "can't take your call" message
 * (Next drops GET bodies, so no `To` can reach it and no token is minted).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Escape a value for safe use in TwiML attributes/text. */
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Map an app locale slug → a BCP-47 tag ConversationRelay accepts. Best-effort;
 *  verify the exact set against the ConversationRelay docs when wiring Twilio. */
const BCP47: Record<string, string> = {
  en: "en-US", fr: "fr-FR", es: "es-ES", it: "it-IT", pt: "pt-PT", "pt-BR": "pt-BR",
  de: "de-DE", nl: "nl-NL", pl: "pl-PL", ro: "ro-RO", sv: "sv-SE", da: "da-DK",
  nb: "nb-NO", fi: "fi-FI", el: "el-GR", tr: "tr-TR", ru: "ru-RU", uk: "uk-UA",
  zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", ar: "ar-SA", he: "he-IL", hi: "hi-IN",
};
function bcp47(locale: string): string {
  return BCP47[locale] || (locale.includes("-") ? locale : "en-US");
}

const GENERIC_MSG =
  "Thanks for calling. We're not able to take your call right now. Please try again later.";

/** Read the Twilio form body once (string params only). Empty on GET probes. */
async function readTwilioParams(req: NextRequest): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  } catch {
    /* GET probe or empty body */
  }
  return params;
}

let warnedNotEnforced = false;

/** The public URL Twilio signed — reconstructed from the forwarding headers
 *  (first hop) because req.url is Vercel-internal. */
function publicUrl(req: NextRequest): string {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host).split(",")[0].trim();
  return `${proto}://${host}${u.pathname}${u.search}`;
}

/** 403 empty-TwiML. Always logged with the URL we verified against and whether a
 *  signature header arrived — that pair is what diagnoses a genuine Twilio
 *  rejection (almost always a URL mismatch). Never logs the auth token. */
function forbidden(reason: string, fullUrl: string, hadSignature: boolean): Response {
  console.error(
    `[twilio/voice] 403 ${reason} — url=${fullUrl} signatureHeader=${hadSignature ? "present" : "missing"}`,
  );
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
    status: 403,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 403 empty-TwiML when the POST can't be proven to be Twilio's. */
function rejectIfForged(req: NextRequest, params: Record<string, string>): Response | null {
  const fullUrl = publicUrl(req);
  const hadSignature = !!req.headers.get("x-twilio-signature");
  if (shouldEnforceTwilioSignature()) {
    // www/apex candidates: the number's saved webhook URL is what Twilio signs,
    // and it need not match the host we're reached on. Still HMAC-verified.
    if (!verifyTwilioSignatureAny(twilioUrlCandidates(fullUrl), params, req.headers.get("x-twilio-signature"))) {
      return forbidden("invalid signature", fullUrl, hadSignature);
    }
  } else if (process.env.NODE_ENV === "production") {
    // No auth token in prod = we cannot authenticate Twilio → fail CLOSED.
    // This response mints a signed Nabil call token, so serving it unverified
    // would let anyone drive a fake call session (orders into the live
    // kitchen, outbound SMS). Same rule as ../recording-status; dev keeps
    // warn-and-serve for convenience.
    if (!warnedNotEnforced) {
      warnedNotEnforced = true;
      console.warn(
        "[twilio/voice] X-Twilio-Signature enforcement is OFF in production — configure the Twilio auth token; inbound calls are rejected until then.",
      );
    }
    return forbidden("no Twilio auth token configured (cannot verify)", fullUrl, hadSignature);
  }
  return null;
}

async function handle(req: NextRequest, params: Record<string, string>) {
  const to = (params.To || "").trim();
  const from = (params.From || "").trim();
  const callSid = (params.CallSid || "").trim();

  const wss = (process.env.NABIL_VOICE_WSS_URL || "").trim();

  const line = to
    ? await prisma.voiceNumber.findUnique({
        where: { phoneNumber: to },
        select: {
          enabled: true,
          restaurant: {
            select: {
              id: true, slug: true, name: true, defaultLanguage: true,
              timezone: true, hoursFormat: true,
              openingHours: true, holidays: true,
              voiceAgentConfig: true,
            },
          },
        },
      })
    : null;

  const restaurant = line?.restaurant;
  const cfg = restaurant?.voiceAgentConfig;

  // No mapping / number disabled / service not wired → polite message.
  if (!line || !line.enabled || !restaurant || !wss) {
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }

  // Entitlement + master enable switch. If off, fall back to staff when a
  // transfer number is set, else a polite message.
  const entitled = await hasFeature(restaurant.id, "phone_ordering_agent");
  if (!entitled || !cfg?.enabled) {
    const transfer = (cfg?.transferToNumber || "").trim();
    if (transfer) {
      return twiml(
        `<Response><Dial answerOnBridge="true" timeout="25">${xml(transfer)}</Dial>` +
          `<Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`,
      );
    }
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }

  // Block-list.
  if (from) {
    const blocked = await prisma.blockedCaller.findUnique({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone: from } },
      select: { id: true },
    });
    if (blocked) {
      return twiml(`<Response><Reject reason="rejected"/></Response>`);
    }
  } else if (cfg.allowAnonymousCallers === false) {
    // No caller ID and the restaurant declines anonymous callers.
    return twiml(
      `<Response><Say voice="Polly.Joanna-Neural">${xml(
        "Sorry, we can't take calls from blocked or private numbers. Please call back with your caller ID enabled.",
      )}</Say><Hangup/></Response>`,
    );
  }

  // Open vs closed → which greeting to speak. Computed exactly like every other
  // surface (timezone + holiday + split-hours aware).
  const tz = restaurant.timezone || undefined;
  const fmt: "12h" | "24h" = restaurant.hoursFormat === "12h" ? "12h" : "24h";
  const eff = holidayEffectToday(restaurant.holidays as never, tz, null, new Date());
  const todayHol =
    eff?.kind === "closed" ? {} : eff?.kind === "custom_hours" ? { intervals: eff.intervals } : undefined;
  const live = liveOpenStatus(restaurant.openingHours as never, new Date(), fmt, todayHol, tz);
  const isOpen = live.kind === "open";

  const openGreeting = (cfg.openGreeting || `Thanks for calling ${restaurant.name}. How can I help you?`).trim();
  const closedGreeting =
    (cfg.closedGreeting || `Thanks for calling ${restaurant.name}. We're currently closed, but I can still help.`).trim();
  const baseGreeting = isOpen ? openGreeting : closedGreeting;
  // Consent: prepend a short "may be recorded" notice when recording is on
  // (the owner enabled it). Keeps two-party-consent jurisdictions covered.
  const notice = cfg.recordCalls ? "This call may be recorded for quality and training. " : "";
  const greeting = notice + baseGreeting;

  const lang = restaurant.defaultLanguage || cfg.primaryLanguage || "en";

  // Domain-biased ASR (accuracy lever #2, the biggest one): feed the LIVE menu
  // vocabulary to Deepgram via the ConversationRelay `hints` attribute so
  // menu-specific item names are recognized on noisy phone audio. Names only,
  // commas stripped (the attribute is comma-separated), capped. Because we own
  // the catalog this list is always current — an edge POS-mapping rivals lack.
  const menuOwnerId = await resolveMenuRestaurantId(restaurant.id);
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: menuOwnerId, isAvailable: true },
    select: { name: true },
    take: 150,
  });
  // 🚨 Deepgram REJECTS this attribute unless it is strictly clean — the first
  // live pilot call (2026-08-09) died before the greeting with "Deepgram
  // invalid argument: 400 Bad Request" and every call fell through to the
  // store phone. Two causes, both from real menu data: punctuation in item
  // names ("MINI CARROTS + RANCH DIP", "Kit!") and total length (we sent
  // 2,021 chars; the ConversationRelay hints limit is 500). So: strip to
  // letters/digits/spaces/hyphens, collapse whitespace, dedupe, and pack
  // items whole until the 500-char budget is spent — a truncated dish name
  // would bias recognition toward a phrase nobody says.
  const HINTS_MAX_CHARS = 500;
  const cleaned = [...new Set(
    items
      .map((i) => (i.name || "").replace(/[^A-Za-z0-9 -]/g, " ").replace(/\s+/g, " ").trim())
      .filter((n) => n.length > 1 && n.length <= 40),
  )];
  const hintTerms: string[] = [];
  let hintsLen = 0;
  for (const term of cleaned) {
    const added = hintsLen === 0 ? term.length : hintsLen + 1 + term.length;
    if (added > HINTS_MAX_CHARS) break;
    hintTerms.push(term);
    hintsLen = added;
  }
  const hintsAttr = hintTerms.length ? ` hints="${xml(hintTerms.join(","))}"` : "";

  // Providers from config (Deepgram + ElevenLabs are the ConversationRelay
  // defaults; our config mirrors those value names).
  const ttsProvider = cfg.ttsProvider || "ElevenLabs";
  const sttProvider = cfg.sttProvider || "Deepgram";
  const voiceAttr = cfg.voice ? ` voice="${xml(cfg.voice)}"` : "";

  // Mint the short-lived call token and build the ConversationRelay wss URL.
  const token = signNabilCallToken({ restaurantId: restaurant.id, slug: restaurant.slug, callSid, to, from });
  const url = `${wss}${wss.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
  // On session end (transfer/handoff) Twilio POSTs the <Connect action> — dial staff there.
  const handoffUrl = `${new URL(req.url).origin}/api/twilio/voice/handoff`;

  // NOTE (config not wired here): voiceSpeed + ambientNoise have no direct
  // ConversationRelay attribute — they'd ride ElevenLabs voice settings / audio
  // mixing, out of scope for v1. `interruptible="any"` gives barge-in;
  // elevenlabsTextNormalization="auto" reads prices/numbers correctly (accuracy).
  return twiml(
    `<Response><Connect action="${xml(handoffUrl)}">` +
      `<ConversationRelay url="${xml(url)}"` +
      ` welcomeGreeting="${xml(greeting)}"` +
      ` language="${xml(bcp47(lang))}"` +
      ` ttsProvider="${xml(ttsProvider)}"` +
      ` transcriptionProvider="${xml(sttProvider)}"` +
      voiceAttr +
      ` interruptible="any" welcomeGreetingInterruptible="speech"` +
      ` dtmfDetection="true" elevenlabsTextNormalization="auto"` +
      hintsAttr +
      `/>` +
      `</Connect></Response>`,
  );
}

export async function POST(req: NextRequest) {
  const params = await readTwilioParams(req);
  const rejected = rejectIfForged(req, params);
  if (rejected) return rejected;
  return handle(req, params);
}

export async function GET(req: NextRequest) {
  return handle(req, await readTwilioParams(req));
}
