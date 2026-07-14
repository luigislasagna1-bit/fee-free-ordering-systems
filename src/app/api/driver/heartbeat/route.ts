import { NextResponse } from "next/server";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";

export const dynamic = "force-dynamic";

/**
 * POST /api/driver/heartbeat — single-active-session poll (mirrors the kitchen
 * heartbeat). Returns 401 `session_superseded` once another device signs in as
 * this driver, so the older device redirects itself to /driver/login. No device
 * registry (drivers don't ring/print) — this is purely the session guard.
 */
export async function POST() {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
