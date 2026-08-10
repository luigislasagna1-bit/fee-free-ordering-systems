import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { shouldEnforceTwilioSignature, verifyTwilioSignatureAny, twilioUrlCandidates } from "@/lib/voice/twilio-signature";

/**
 * Nabil AI — transfer-to-human handoff. When the voice service ends the
 * ConversationRelay session with `{type:"end", handoffData}` (e.g. the caller
 * asked for a person, or a pizza/combo needs building), Twilio POSTs the
 * <Connect action> here. We dial the restaurant's configured transfer number
 * (falling back to alertPhone → public phone).
 *
 * HARDENING (2026-08-10): POSTs are verified against X-Twilio-Signature via
 * src/lib/voice/twilio-signature.ts when enforcement is on; invalid → 403
 * with an empty <Response/>, and a missing auth token fails CLOSED in
 * production (same wiring as ../route.ts).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const BYE = "Thanks for calling. We couldn't connect you to a team member right now — please try again shortly.";

/** Read the Twilio form body once (string params only). Empty on GET probes. */
async function readTwilioParams(req: NextRequest): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  } catch {
    /* ignore */
  }
  return params;
}

let warnedNotEnforced = false;

/** The public URL Twilio signed — req.url is Vercel-internal. */
function publicUrl(req: NextRequest): string {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host).split(",")[0].trim();
  return `${proto}://${host}${u.pathname}${u.search}`;
}

/** 403 empty-TwiML, always logged with the URL we verified against + whether a
 *  signature header arrived (diagnoses a genuine Twilio rejection). No secrets. */
function forbidden(reason: string, fullUrl: string, hadSignature: boolean): Response {
  console.error(
    `[twilio/voice/handoff] 403 ${reason} — url=${fullUrl} signatureHeader=${hadSignature ? "present" : "missing"}`,
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
    // www/apex candidates — see twilioUrlCandidates(); still HMAC-verified.
    if (!verifyTwilioSignatureAny(twilioUrlCandidates(fullUrl), params, req.headers.get("x-twilio-signature"))) {
      return forbidden("invalid signature", fullUrl, hadSignature);
    }
  } else if (process.env.NODE_ENV === "production") {
    // No auth token in prod = we cannot authenticate Twilio → fail CLOSED,
    // exactly like ../route.ts and ../recording-status. Unverified, this route
    // dials the restaurant's staff number on demand. Dev keeps warn-and-serve.
    if (!warnedNotEnforced) {
      warnedNotEnforced = true;
      console.warn(
        "[twilio/voice/handoff] X-Twilio-Signature enforcement is OFF in production — configure the Twilio auth token; handoffs are rejected until then.",
      );
    }
    return forbidden("no Twilio auth token configured (cannot verify)", fullUrl, hadSignature);
  }
  return null;
}

async function handle(params: Record<string, string>) {
  const to = (params.To || "").trim();

  const line = to
    ? await prisma.voiceNumber.findUnique({
        where: { phoneNumber: to },
        select: {
          restaurant: {
            select: { phone: true, alertPhone: true, voiceAgentConfig: { select: { transferToNumber: true } } },
          },
        },
      })
    : null;

  const num = (
    line?.restaurant?.voiceAgentConfig?.transferToNumber ||
    line?.restaurant?.alertPhone ||
    line?.restaurant?.phone ||
    ""
  ).trim();

  if (num) {
    return twiml(
      `<Response><Dial answerOnBridge="true" timeout="30">${xml(num)}</Dial>` +
        `<Say voice="Polly.Joanna-Neural">${xml(BYE)}</Say></Response>`,
    );
  }
  return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(BYE)}</Say><Hangup/></Response>`);
}

export async function POST(req: NextRequest) {
  const params = await readTwilioParams(req);
  const rejected = rejectIfForged(req, params);
  if (rejected) return rejected;
  return handle(params);
}

export async function GET(req: NextRequest) {
  return handle(await readTwilioParams(req));
}
