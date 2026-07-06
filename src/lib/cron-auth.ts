import { NextResponse } from "next/server";

/**
 * Fail-CLOSED cron auth. Returns a 401 response for the caller to return, or
 * null if the request is allowed.
 *
 *  - CRON_SECRET set → require the exact `Bearer <secret>` (enforced in EVERY
 *    env).
 *  - CRON_SECRET unset → allowed only in dev; **401 in production**, so a
 *    missing/typo'd prod secret can't silently leave the endpoint open to any
 *    anonymous caller (the seven digest/utility crons used to fail OPEN in that
 *    case — stabilization H10).
 *
 * Vercel's own cron invocations send the Bearer when CRON_SECRET is configured,
 * so production behavior is unchanged when the secret is set.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
