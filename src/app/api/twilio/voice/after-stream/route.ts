import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { shouldEnforceTwilioSignature, verifyTwilioSignatureAny, twilioUrlCandidates } from "@/lib/voice/twilio-signature";
import { safetyNetTwiml } from "@/lib/voice/twiml-safety-net";
import { reportError } from "@/lib/report-error";
import { decideAfterStream } from "@/lib/voice/after-stream-decision";
import { flagOn } from "@/lib/voice/feature-flags";

/**
 * After-stream route — the <Connect action> for Media Streams calls.
 *
 * When the MediaSession WebSocket closes (transfer, time limit, pipeline
 * failure, or normal hangup), Twilio POSTs here. The voice service posts
 * a handoff intent to /api/internal/voice/call-log before closing, so we
 * look up what happened:
 *
 *   transfer / agent_struggling → dial the restaurant's phone
 *   call_time_limit             → goodbye + hangup
 *   pipeline_failed             → fall back to ConversationRelay TwiML
 *   (none / unknown)            → dial the restaurant as a safety net
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
const TIME_LIMIT_BYE =
  "Thanks for calling. We've reached the time limit for this call, so I'll let you go — please call back to finish your order.";
// An automated/IVR caller (reason "spam", set by the service once the IVR
// detector ships — A11). Never dial the store for a robot.
const SPAM_BYE = "This line is for customers of the restaurant. Goodbye.";

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

function publicUrl(req: NextRequest): string {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host).split(",")[0].trim();
  return `${proto}://${host}${u.pathname}${u.search}`;
}

function forbidden(reason: string, fullUrl: string, hadSignature: boolean): Response {
  console.error(
    `[twilio/voice/after-stream] 403 ${reason} — url=${fullUrl} signatureHeader=${hadSignature ? "present" : "missing"}`,
  );
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
    status: 403,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function rejectIfForged(req: NextRequest, params: Record<string, string>): Response | null {
  const fullUrl = publicUrl(req);
  const hadSignature = !!req.headers.get("x-twilio-signature");
  if (shouldEnforceTwilioSignature()) {
    if (!verifyTwilioSignatureAny(twilioUrlCandidates(fullUrl), params, req.headers.get("x-twilio-signature"))) {
      return forbidden("invalid signature", fullUrl, hadSignature);
    }
  } else if (process.env.NODE_ENV === "production") {
    if (!warnedNotEnforced) {
      warnedNotEnforced = true;
      console.warn(
        "[twilio/voice/after-stream] X-Twilio-Signature enforcement is OFF in production — configure the Twilio auth token.",
      );
    }
    return forbidden("no Twilio auth token configured (cannot verify)", fullUrl, hadSignature);
  }
  return null;
}

async function handle(req: NextRequest, params: Record<string, string>) {
  const callSid = (params.CallSid || "").trim();
  const to = (params.To || "").trim();

  // The number's lane decides which behaviour table applies (staging always
  // runs the newest; the live lane only what NABIL_FLAGS_CURRENT promoted).
  const line = to
    ? await prisma.voiceNumber.findUnique({
        where: { phoneNumber: to },
        select: {
          voiceChannel: true,
          restaurant: {
            select: { phone: true, alertPhone: true, voiceAgentConfig: { select: { transferToNumber: true } } },
          },
        },
      })
    : null;
  const decisionTableOn = flagOn("after_stream_decision_table", line?.voiceChannel, process.env.NABIL_FLAGS_CURRENT);

  // Look up the hand-off reason. With A1 the service writes it BEFORE ending
  // the session, so one read normally suffices; the two short retries are kept
  // as belt-and-braces for an older service build still in the field.
  let reason = "";
  let rowExists = false;
  if (callSid) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 300));
      const call = await prisma.voiceCall.findFirst({
        where: { callSid },
        select: { transferReason: true },
        orderBy: { startedAt: "desc" },
      });
      rowExists = rowExists || !!call;
      reason = call?.transferReason || "";
      if (reason) break;
      // A row with no reason and the table ON = the stream died; no point
      // waiting for a reason that will never come.
      if (call && decisionTableOn) break;
    }
  }

  const decision = decideAfterStream({ reason, rowExists, decisionTableOn });
  if (decision.action === "hangup_time_limit") {
    return twiml(
      `<Response><Say voice="Polly.Joanna-Neural">${xml(TIME_LIMIT_BYE)}</Say><Hangup/></Response>`,
    );
  }
  if (decision.action === "hangup_spam") {
    return twiml(`<Response><Say voice="Polly.Joanna-Neural">${xml(SPAM_BYE)}</Say><Hangup/></Response>`);
  }
  if (decision.action === "hangup_no_input") {
    // A4: Nabil already said its localized goodbye before ending — just hang up.
    return twiml(`<Response><Hangup/></Response>`);
  }
  if (decision.action === "relay_fallback") {
    // No call record = the Media Streams WebSocket never established a
    // session (or the legacy table is in force). Redirect back to the main
    // voice route with ?mediaFallback=1 so it falls back to ConversationRelay.
    const voiceOrigin = new URL(publicUrl(req)).origin;
    const retryUrl = `${voiceOrigin}/api/twilio/voice?mediaFallback=1`;
    console.warn(`[twilio/voice/after-stream] ${decision.why} for ${callSid} — falling back to ConversationRelay`);
    return twiml(`<Response><Redirect method="POST">${xml(retryUrl)}</Redirect></Response>`);
  }
  if (decision.why === "stream_died") {
    console.warn(`[twilio/voice/after-stream] stream died for ${callSid} (row, no reason) — dialing the store`);
  }

  // Transfer / struggle / pipeline death: dial the restaurant — the caller
  // must never hear dead air.
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

  let rejected: Response | null;
  try {
    rejected = rejectIfForged(req, params);
  } catch (e) {
    reportError(e, { route: "twilio/voice/after-stream", stage: "verify" });
    return forbidden("verification threw", publicUrl(req), !!req.headers.get("x-twilio-signature"));
  }
  if (rejected) return rejected;

  try {
    return await handle(req, params);
  } catch (e) {
    reportError(e, { route: "twilio/voice/after-stream", stage: "handle" });
    return safetyNetTwiml(params.To || undefined);
  }
}
