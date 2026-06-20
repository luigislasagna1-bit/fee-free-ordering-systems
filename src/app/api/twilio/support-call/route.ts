import { NextRequest } from "next/server";

/**
 * Public Twilio INBOUND-voice webhook for the 24/7 support line.
 *
 * When a customer calls the support number, Twilio POSTs here and we return
 * TwiML that forwards the call to the operator's cell (SUPPORT_FORWARD_TO_NUMBER)
 * with a short "whisper" first (see /api/twilio/support-whisper) so the operator
 * knows it is a Fee Free Ordering support call before being bridged. If the
 * operator does not answer — or the line is not configured — the caller hears a
 * polite "email us" message instead of a dead line.
 *
 * SETUP (one-time, in the Twilio console):
 *   Phone Numbers → the support number → Voice → "A CALL COMES IN":
 *     Webhook  HTTP POST  https://feefreeordering.com/api/twilio/support-call
 *
 * ENV:
 *   SUPPORT_FORWARD_TO_NUMBER   E.164 cell to ring (e.g. +1416...)   [required]
 *   SUPPORT_LINE_NUMBER         E.164 Twilio support number, used as callerId so
 *                               the cell shows a consistent number   [optional]
 *
 * No Twilio API credentials are needed here — this is pure inbound TwiML. The
 * proxy excludes /api, so this route is publicly reachable for Twilio.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const MISS_MSG =
  "Thanks for calling Fee Free Ordering support. We are not able to take your call right now. " +
  "Please email support at fee free ordering dot com and we will get right back to you.";

async function handle(req: NextRequest) {
  const forwardTo = (process.env.SUPPORT_FORWARD_TO_NUMBER || "").trim();

  let calledNumber = "";
  try {
    const form = await req.formData();
    calledNumber = String(form.get("To") || "").trim();
  } catch {
    /* GET or empty body — fine */
  }

  if (!forwardTo) {
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${MISS_MSG}</Say></Response>`);
  }

  const origin = new URL(req.url).origin;
  const whisperUrl = `${origin}/api/twilio/support-whisper`;
  const callerId = (process.env.SUPPORT_LINE_NUMBER || calledNumber || "").trim();
  const callerIdAttr = callerId ? ` callerId="${callerId}"` : "";

  return twiml(
    `<Response>` +
      `<Dial answerOnBridge="true" timeout="22"${callerIdAttr}>` +
        `<Number url="${whisperUrl}">${forwardTo}</Number>` +
      `</Dial>` +
      `<Say voice="Polly.Joanna-Neural">${MISS_MSG}</Say>` +
    `</Response>`,
  );
}

export const POST = handle;
export const GET = handle;
