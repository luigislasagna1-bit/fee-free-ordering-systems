import { NextRequest } from "next/server";

/**
 * Whisper played to the OPERATOR (not the caller) the moment they answer the
 * forwarded support call — so they know it is a Fee Free Ordering support call
 * before the caller is bridged in. Referenced as the `url` on the <Number> in
 * /api/twilio/support-call. Public (Twilio fetches it); the proxy excludes /api.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function handle(_req: NextRequest) {
  return twiml(
    `<Response><Say voice="Polly.Joanna-Neural">You have a Fee Free Ordering support call. Connecting you now.</Say></Response>`,
  );
}

export const POST = handle;
export const GET = handle;
