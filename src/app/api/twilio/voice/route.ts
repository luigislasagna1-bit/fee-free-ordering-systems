import { NextRequest } from "next/server";
import prisma from "@/lib/db";
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
 * TODO (hardening): validate the X-Twilio-Signature header (HMAC-SHA1 of URL +
 *   sorted params with FFOS_TWILIO_AUTH_TOKEN) so only Twilio can mint tokens.
 *   Low urgency: a forged POST only yields a short-lived, restaurant-scoped
 *   token that is useless without a live ConversationRelay call, and every
 *   downstream write re-validates. Add once the public URL reconstruction
 *   (X-Forwarded-Proto/Host behind Vercel) is confirmed so real calls aren't
 *   rejected.
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

async function handle(req: NextRequest) {
  let to = "";
  let from = "";
  let callSid = "";
  try {
    const form = await req.formData();
    to = String(form.get("To") || "").trim();
    from = String(form.get("From") || "").trim();
    callSid = String(form.get("CallSid") || "").trim();
  } catch {
    /* GET probe or empty body */
  }

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
  const hintTerms = [...new Set(items.map((i) => i.name).filter(Boolean))]
    .map((n) => n.replace(/,/g, " ").trim())
    .filter((n) => n.length > 1 && n.length <= 40)
    .slice(0, 100);
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

export const POST = handle;
export const GET = handle;
