import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { shouldEnforceTwilioSignature, verifyTwilioSignatureAny, twilioUrlCandidates } from "@/lib/voice/twilio-signature";
import { safetyNetTwiml } from "@/lib/voice/twiml-safety-net";
import { reportError } from "@/lib/report-error";

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

async function handle(params: Record<string, string>) {
  const callSid = (params.CallSid || "").trim();
  const to = (params.To || "").trim();

  // Look up the handoff intent the voice service posted for this call.
  let reason = "";
  if (callSid) {
    const call = await prisma.voiceCall.findFirst({
      where: { callSid },
      select: { transferReason: true },
      orderBy: { startedAt: "desc" },
    });
    reason = call?.transferReason || "";
  }

  if (reason === "call_time_limit") {
    return twiml(
      `<Response><Say voice="Polly.Joanna-Neural">${xml(TIME_LIMIT_BYE)}</Say><Hangup/></Response>`,
    );
  }

  // For all other reasons (transfer, agent_struggling, pipeline_failed,
  // or unknown), dial the restaurant — the caller must never hear dead air.
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

  let rejected: Response | null;
  try {
    rejected = rejectIfForged(req, params);
  } catch (e) {
    reportError(e, { route: "twilio/voice/after-stream", stage: "verify" });
    return forbidden("verification threw", publicUrl(req), !!req.headers.get("x-twilio-signature"));
  }
  if (rejected) return rejected;

  try {
    return await handle(params);
  } catch (e) {
    reportError(e, { route: "twilio/voice/after-stream", stage: "handle" });
    return safetyNetTwiml(params.To || undefined);
  }
}
