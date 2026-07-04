import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { fetchCallStatus } from "@/lib/voice-call";

/**
 * GET /api/admin/test-alert-call/status?sid=CA…
 *
 * Second half of the owner-triggered test call: a few seconds after placing
 * the call, the settings page asks Twilio what actually HAPPENED to it.
 * Twilio accepts a call (returns a SID) and can still fail it moments later —
 * geo-permissions, carrier rejection, unverified caller ID — which previously
 * looked like "Test call placed" + silence (Luigi 2026-07-03). Read-only:
 * only reports status of calls on OUR Twilio account, admin session required.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const sid = new URL(req.url).searchParams.get("sid") ?? "";
  const res = await fetchCallStatus(sid);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
