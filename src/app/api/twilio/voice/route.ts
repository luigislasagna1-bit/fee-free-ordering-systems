import { NextRequest, after } from "next/server";
import prisma from "@/lib/db";
import { shouldEnforceTwilioSignature, verifyTwilioSignatureAny, twilioUrlCandidates } from "@/lib/voice/twilio-signature";
import { hasFeature } from "@/lib/entitlements";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { signNabilCallToken } from "@/lib/voice/session-token";
import { packHints, storeVocabHints } from "@/lib/voice/speech-hints";
import { buildVoiceAttrValue, ttsTuningFromEnv } from "@/lib/voice/elevenlabs-voices";
import { liveOpenStatus } from "@/lib/restaurant-hours";
import { holidayEffectToday } from "@/lib/holiday-rules";
import { rememberFallbackNumber, safetyNetTwiml } from "@/lib/voice/twiml-safety-net";
import { primeFallbackNumbers } from "@/lib/voice/fallback-memo-prime";
import { reportError } from "@/lib/report-error";

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
  cs: "cs-CZ", sk: "sk-SK", hu: "hu-HU", bg: "bg-BG", hr: "hr-HR", sr: "sr-RS",
  sl: "sl-SI", et: "et-EE", lv: "lv-LV", lt: "lt-LT", ca: "ca-ES", id: "id-ID",
  vi: "vi-VN", th: "th-TH",
};
function bcp47(locale: string): string {
  return BCP47[locale] || (locale.includes("-") ? locale : "en-US");
}

const GENERIC_MSG =
  "Thanks for calling. We're not able to take your call right now. Please try again later.";

/* ─────────────────────────── speech-recognition hints ────────────────────── */

/** Hints are identical for every caller of a store and cost two menu queries on
 *  the critical path BEFORE the greeting — so cache them per menu owner. Short
 *  TTL: an owner who renames a dish shouldn't wait long to hear it recognised. */
const HINTS_TTL_MS = 5 * 60_000;
const hintsCache = new Map<string, { value: string; expires: number }>();

async function menuHints(menuOwnerId: string): Promise<string> {
  const hit = hintsCache.get(menuOwnerId);
  if (hit && hit.expires > Date.now()) return hit.value;

  // A group is reachable from the restaurant three ways (library, item-scoped,
  // category-scoped) — all three are real in this schema, so all three match.
  const groupScope = {
    isHidden: false,
    OR: [
      { restaurantId: menuOwnerId },
      { menuItem: { restaurantId: menuOwnerId } },
      { category: { restaurantId: menuOwnerId } },
    ],
  };
  // Toppings are fetched as their OWN query rather than filtered out of a
  // general one. Two reasons, both learned the hard way against live data:
  // a single `take` ordered by name cuts off mid-alphabet before the toppings
  // are covered, and `distinct: ["name"]` collapses each name to whichever
  // group Postgres hands back first — which for "Pepperoni" was a "Choose
  // Which Slice" group with no pizzaRole at all, so the topping vanished from
  // the boosted list entirely.
  const [items, toppingRows, otherRows, faqRows] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: menuOwnerId, isAvailable: true },
      select: { name: true },
      // Ordered so the 500-char budget always keeps the SAME terms. Without it
      // Postgres returns heap order, which shifts after a write or a VACUUM —
      // so which words Deepgram was biased toward changed on its own, and no
      // recognition problem could be reproduced or tested.
      orderBy: { name: "asc" },
      take: 150,
    }),
    prisma.modifierOption.findMany({
      where: {
        isAvailable: true,
        modifierGroup: { ...groupScope, pizzaRole: { in: ["topping", "toppings"] } },
      },
      select: { name: true },
      // Safe HERE, unlike on a combined query: this one is already scoped to
      // topping groups, so collapsing by name cannot pick a row whose role is
      // something else. Without it, 400 rows are the same dozen toppings
      // repeated once per pizza and the list never reaches past "Garlic".
      distinct: ["name"],
      orderBy: { name: "asc" },
      take: 400,
    }),
    prisma.modifierOption.findMany({
      where: {
        isAvailable: true,
        modifierGroup: { ...groupScope, pizzaRole: { notIn: ["topping", "toppings"] } },
      },
      select: { name: true },
      distinct: ["name"],
      orderBy: { name: "asc" },
      take: 400,
    }),
    // The store's own FAQ text decides which STORE_VOCAB words ("halal",
    // "gluten free", "intercom") the listener is biased toward.
    prisma.voiceFaq.findMany({ where: { restaurantId: menuOwnerId, active: true }, select: { question: true, answer: true }, take: 100 }),
  ]);

  // 🚨 ACTUAL TOPPINGS FIRST, then everything else.
  //
  // "Pizza-role-tagged" was too coarse: crusts, sauces, cheeses and bases all
  // carry a pizzaRole, and alphabetically they crowded the toppings out. On
  // Luigi's live menu the boosted list ran out at "Chicken", so Pepperoni,
  // Jalapeno and Red Onion — three of the six toppings on the pizza that went
  // out wrong on 2026-08-14 — were never boosted, while "BBQ Swirl" and
  // "Balsamic" were.
  //
  // Toppings are the open-ended part of a pizza order and the part a caller
  // rattles off fastest. Crust and sauce are a short closed set the agent
  // offers by name anyway. packHints dedupes, so repeats across groups are free.
  const toppingTerms = [...toppingRows.map((o) => o.name), ...otherRows.map((o) => o.name)];
  const value = packHints(
    items.map((i) => i.name),
    toppingTerms,
    storeVocabHints(faqRows.flatMap((f) => [f.question, f.answer])),
  );
  hintsCache.set(menuOwnerId, { value, expires: Date.now() + HINTS_TTL_MS });
  return value;
}

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
          isDemo: true,
          restaurant: {
            select: {
              id: true, slug: true, name: true, defaultLanguage: true,
              // The store's own line — the fallback we ring when Nabil can't
              // take the call. Never dead-air.
              phone: true,
              alertPhone: true,
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

  // No mapping at all → polite message; there is nobody to hand the call to.
  if (!line || !restaurant) {
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }

  // Teach the no-DB safety net who this number's human is (same precedence as
  // the handoff route and the Fly fallback feed), so if anything below throws
  // the catch in POST/GET can still <Dial> THIS store rather than apologise.
  rememberFallbackNumber(to, cfg?.transferToNumber || restaurant.alertPhone || restaurant.phone);

  // Number disabled, or the voice service isn't wired — RING THE STORE rather
  // than telling a paying customer to go away. Never dead-air, never a dead
  // end: the fallback for "Nabil can't take this" is always a human phone.
  if (!line.enabled || !wss) {
    const fallback = (cfg?.transferToNumber || restaurant.phone || "").trim();
    if (fallback) {
      return twiml(
        `<Response><Dial answerOnBridge="true" timeout="25">${xml(fallback)}</Dial>` +
          `<Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`,
      );
    }
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }

  // Entitlement + master enable switch. If off, RING THE STORE — the same rule
  // as the branch above, and for the same reason.
  //
  // ⚠️ This used to fall back to transferToNumber ALONE, and that was a real
  // hole: transferToNumber is optional, so a store that never set one and whose
  // add-on lapsed (a failed card, once the 10-day dunning grace expires) heard
  // "we can't take your call" instead of its own phone ringing. Merely rude
  // today; business-ending the moment a store forwards its real line here,
  // because the number on their printed menu is the one pointing at this route.
  // The line above already knew to fall back to restaurant.phone; this one
  // didn't. (2026-08-15)
  //
  // OWNER TEST MODE (2026-08-20): when the agent is disabled (cfg.enabled=false)
  // but the add-on is active, the OWNER can still call to test — the call goes
  // through normally but place_order fakes the placement (no kitchen ticket, no
  // printer, no notification). The caller is identified as "owner" if their
  // number matches the restaurant's phone, alert phone, or transfer number.
  const entitled = await hasFeature(restaurant.id, "phone_ordering_agent");
  if (!entitled) {
    const fallback = (cfg?.transferToNumber || restaurant.phone || "").trim();
    if (fallback) {
      return twiml(
        `<Response><Dial answerOnBridge="true" timeout="25">${xml(fallback)}</Dial>` +
          `<Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`,
      );
    }
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }
  if (!cfg) {
    const fallback = (restaurant.phone || "").trim();
    if (fallback) {
      return twiml(
        `<Response><Dial answerOnBridge="true" timeout="25">${xml(fallback)}</Dial>` +
          `<Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`,
      );
    }
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
  }
  let isTestOrder = false;
  if (!cfg.enabled) {
    const callerDigits = (from || "").replace(/\D/g, "");
    const ownerPhones = [restaurant.phone, restaurant.alertPhone, cfg.transferToNumber]
      .filter(Boolean)
      .map((p) => (p as string).replace(/\D/g, ""));
    const isOwnerCall = callerDigits.length >= 10 && ownerPhones.some((p) =>
      p.length >= 10 && (p === callerDigits || p.slice(-10) === callerDigits.slice(-10)),
    );
    if (!isOwnerCall) {
      const fallback = (cfg.transferToNumber || restaurant.phone || "").trim();
      if (fallback) {
        return twiml(
          `<Response><Dial answerOnBridge="true" timeout="25">${xml(fallback)}</Dial>` +
            `<Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`,
        );
      }
      return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(GENERIC_MSG)}</Say></Response>`);
    }
    isTestOrder = true;
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

  // Domain-biased ASR (the biggest accuracy lever we own): feed the LIVE menu
  // vocabulary — item names AND topping/crust/sauce names — to Deepgram via the
  // ConversationRelay `hints` attribute so menu-specific words survive noisy
  // phone audio and heavy accents. Because we own the catalog this list is
  // always current: per-restaurant lexical grounding an edge POS mapping can't
  // match. See packHints() for the 500-char budget rules that keep Deepgram
  // from 400ing the whole call.
  const menuOwnerId = await resolveMenuRestaurantId(restaurant.id);
  const hints = await menuHints(menuOwnerId);
  const hintsAttr = hints ? ` hints="${xml(hints)}"` : "";

  // Providers from config (Deepgram + ElevenLabs are the ConversationRelay
  // defaults; our config mirrors those value names).
  const ttsProvider = cfg.ttsProvider || "ElevenLabs";
  const sttProvider = cfg.sttProvider || "Deepgram";
  // Voice + speed in ONE attribute. ElevenLabs' extended form
  // "<id>-<model>-<speed>_<stability>_<similarity>" is the only place
  // VoiceAgentConfig.voiceSpeed can actually take effect — it was a no-op
  // before. No voice picked ⇒ no attribute at all, exactly as before.
  const voiceValue = buildVoiceAttrValue(cfg.voice, cfg.voiceSpeed, ttsTuningFromEnv());
  const voiceAttr = voiceValue ? ` voice="${xml(voiceValue)}"` : "";
  // Pin the transcription model instead of inheriting Twilio's default, so an
  // upstream default change can never silently move recognition quality under
  // a live restaurant. Deepgram-only: sending a Deepgram model name to Google
  // STT is an invalid argument, and an invalid argument here kills the call
  // before the greeting (2026-08-09).
  //
  // ConversationRelay EXPERIMENTS (2026-08-15 research): Deepgram "flux" adds
  // native turn detection (fewer false interruptions, faster end-of-turn) but
  // has NO smart formatting; smart-format off makes "half" stop arriving as
  // "0.5". Both are env-flagged and OFF by default because an invalid TwiML
  // attribute kills the call before the greeting and each needs ONE live call
  // to verify. Flip with NABIL_STT_MODEL / NABIL_DEEPGRAM_SMART_FORMAT on Vercel.
  const sttModel = process.env.NABIL_STT_MODEL || "nova-3-general";
  const speechModelAttr = sttProvider === "Deepgram" ? ` speechModel="${xml(sttModel)}"` : "";
  const smartFormat = process.env.NABIL_DEEPGRAM_SMART_FORMAT; // "true" | "false" | unset
  const smartFormatAttr =
    sttProvider === "Deepgram" && (smartFormat === "true" || smartFormat === "false") ? ` deepgramSmartFormat="${smartFormat}"` : "";
  const reportInputAttr =
    process.env.NABIL_REPORT_INPUT_DURING_SPEECH === "speech" ? ` reportInputDuringAgentSpeech="speech"` : "";
  // Fewer false barge-ins. On noisy phone audio — a busy kitchen behind the
  // caller, an accent the recognizer scores as low-confidence — "high" (the
  // default) makes Nabil stop talking mid-sentence at background noise, which
  // reads to the caller as being cut off. "low" requires more confident speech
  // before interrupting; real interruptions still work.
  // Plus: a backchannel is the "mm-hmm", "yeah", "okay" a listener says to show
  // they're still there. Twilio counts those as an interruption and stops the
  // agent mid-word, which is the single most-reported "Nabil cut itself off"
  // symptom (Luigi, 2026-08-13). ignoreBackchannel makes Twilio hold the floor
  // through them; it is supported on nova-3, which is what we pin below.
  // We already carry a 4s barge-in RECOVERY timer in the voice service for
  // exactly this case (session.ts) — that stays as the backstop for a noise
  // interrupt that produces no transcript, but this stops most of them
  // happening at all, which is far better than recovering afterwards.
  const interruptSensitivity = process.env.NABIL_INTERRUPT_SENSITIVITY || "low";
  const ignoreBackchannel = process.env.NABIL_IGNORE_BACKCHANNEL || "true";
  const interruptAttr = ` interruptSensitivity="${xml(interruptSensitivity)}" ignoreBackchannel="${xml(ignoreBackchannel)}"`;

  // Multilingual auto-detect. Twilio requires Deepgram STT + ElevenLabs TTS for
  // code="multi" — exactly our default pair — so it is only emitted when both
  // hold AND the owner listed languages beyond the primary. Off ⇒ byte-identical
  // TwiML to before.
  const extraLanguages = Array.isArray(cfg.languages)
    ? (cfg.languages as unknown[]).filter((x): x is string => typeof x === "string" && x !== lang)
    : [];
  const multilingual =
    extraLanguages.length > 0 && sttProvider === "Deepgram" && ttsProvider === "ElevenLabs";
  const languageChild = multilingual ? `<Language code="multi"/>` : "";

  // Mint the short-lived call token and build the ConversationRelay wss URL.
  const token = signNabilCallToken({
    restaurantId: restaurant.id,
    slug: restaurant.slug,
    callSid,
    to,
    from,
    // Recorded on the call's versions (directive §27) — which listener and
    // which voice this call actually ran with.
    sttModel: sttProvider === "Deepgram" ? sttModel : sttProvider,
    ...(voiceValue ? { ttsVoice: voiceValue } : {}),
    // The speech language ConversationRelay runs with — the service's English
    // number-to-words pass (spoken-numbers.ts) is gated on it. 2026-08-16.
    lang: bcp47(lang),
    ...(line.isDemo ? { isDemo: true } : {}),
    ...(isTestOrder ? { isTestOrder: true } : {}),
  });
  const url = `${wss}${wss.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
  // On session end — a transfer, OR the voice service being unreachable — Twilio
  // POSTs the <Connect action> with SessionStatus/ErrorCode, and the handoff
  // route dials the store's real phone. That is the outage fallback: a Fly
  // outage degrades to a normal ringing phone, never to dead air. Built from the
  // FORWARDED host (not req.url, which is Vercel-internal) so the URL Twilio
  // signs is the URL the handoff route reconstructs and verifies.
  const origin = new URL(publicUrl(req)).origin;
  const handoffUrl = `${origin}/api/twilio/voice/handoff`;

  // NOTE (config): voiceSpeed DOES take effect — it rides the extended `voice`
  // value built above, which also pins the TTS model to turbo_v2_5 so audio
  // quality never depends on whether the owner touched the speed slider.
  // ── Pipeline switch ──────────────────────────────────────────────────
  // "mediastreams" = own STT/TTS + ambient bed mixer via Twilio Media Streams.
  // REQUIRES explicit opt-in: NABIL_MEDIASTREAMS_ENABLED=true on the
  // deployment. The default-allow gate (!== "false") silently broke EVERY
  // call for Luigi for ~2 hours on 2026-08-18 because the media pipeline
  // was toggled on before the env var existed on Vercel. A half-built
  // audio pipeline must never be reachable from a live phone number.
  const mediaFallback = new URL(req.url).searchParams.get("mediaFallback") === "1";
  const useMediaStreams =
    !mediaFallback &&
    (cfg.ambientNoise === true || cfg.audioPipeline === "mediastreams") &&
    process.env.NABIL_MEDIASTREAMS_ENABLED === "true";

  if (useMediaStreams) {
    const afterStreamUrl = `${origin}/api/twilio/voice/after-stream`;
    const mediaWssUrl = wss.replace("/call", "/media");
    console.log(`[twilio/voice] Media Streams for ${callSid}: wss=${mediaWssUrl}`);
    return twiml(
      `<Response><Connect action="${xml(afterStreamUrl)}">` +
        `<Stream url="${xml(mediaWssUrl)}" mode="bidirectional">` +
        `<Parameter name="token" value="${xml(token)}"/>` +
        `<Parameter name="greeting" value="${xml(greeting)}"/>` +
        `</Stream>` +
        `</Connect>` +
        `<Redirect>${xml(afterStreamUrl)}</Redirect>` +
        `</Response>`,
    );
  }

  // `interruptible="any"` gives barge-in; elevenlabsTextNormalization="auto"
  // reads prices/numbers correctly (accuracy).
  return twiml(
    `<Response><Connect action="${xml(handoffUrl)}">` +
      `<ConversationRelay url="${xml(url)}"` +
      ` welcomeGreeting="${xml(greeting)}"` +
      ` language="${xml(bcp47(lang))}"` +
      ` ttsProvider="${xml(ttsProvider)}"` +
      ` transcriptionProvider="${xml(sttProvider)}"` +
      speechModelAttr +
      smartFormatAttr +
      voiceAttr +
      ` interruptible="any" welcomeGreetingInterruptible="speech"` +
      interruptAttr +
      reportInputAttr +
      ` dtmfDetection="true" elevenlabsTextNormalization="auto"` +
      hintsAttr +
      `>` +
      languageChild +
      `</ConversationRelay>` +
      `</Connect></Response>`,
  );
}

export async function POST(req: NextRequest) {
  const params = await readTwilioParams(req);

  // Verification sits OUTSIDE the safety net and fails CLOSED if it throws.
  // This response mints a signed Nabil call token; a throw in the signature
  // path must never degrade into a free <Dial>.
  let rejected: Response | null;
  try {
    rejected = rejectIfForged(req, params);
  } catch (e) {
    reportError(e, { route: "twilio/voice", stage: "verify" });
    return forbidden("verification threw", publicUrl(req), !!req.headers.get("x-twilio-signature"));
  }
  if (rejected) return rejected;

  // Teach the no-DB safety net EVERY store's own number in the background of a
  // normal call (throttled to every 15 min per instance) — per store, from each
  // restaurant's settings, no env edit when a store is added. After the
  // response so it never adds a millisecond to a live call.
  after(() => {
    void primeFallbackNumbers().catch(() => undefined);
  });

  try {
    // ⚠️ The `await` is load-bearing: `return handle(...)` inside a try returns
    // the promise and catches nothing.
    return await handle(req, params);
  } catch (e) {
    // handle() touches Prisma and the entitlement cache before it can decide
    // anything. Without this, a DB blip became a 500, and Twilio answers a 500
    // on a number with no VoiceFallbackUrl by playing its own error tone and
    // hanging up — dead air, on the one path that can't look the store up.
    reportError(e, {
      route: "twilio/voice",
      to: params.To ?? null,
      callSid: params.CallSid ?? null,
    });
    return safetyNetTwiml(params.To);
  }
}

export async function GET(req: NextRequest) {
  const params = await readTwilioParams(req);
  try {
    return await handle(req, params);
  } catch (e) {
    reportError(e, { route: "twilio/voice", method: "GET" });
    return safetyNetTwiml(params.To);
  }
}
