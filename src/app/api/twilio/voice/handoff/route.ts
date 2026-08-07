import { NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * Nabil AI — transfer-to-human handoff. When the voice service ends the
 * ConversationRelay session with `{type:"end", handoffData}` (e.g. the caller
 * asked for a person, or a pizza/combo needs building), Twilio POSTs the
 * <Connect action> here. We dial the restaurant's configured transfer number
 * (falling back to alertPhone → public phone).
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

async function handle(req: NextRequest) {
  let to = "";
  try {
    const form = await req.formData();
    to = String(form.get("To") || "").trim();
  } catch {
    /* ignore */
  }

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

export const POST = handle;
export const GET = handle;
