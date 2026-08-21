import { NextResponse } from "next/server";

// Warmup endpoint — hit by the Vercel cron every 5 minutes to keep the
// internal voice API function container alive. Cold starts on tool-call
// routes cause 5-12 s gaps mid-call; a warm instance is ~200 ms.
export async function GET() {
  return NextResponse.json({ ok: true });
}
