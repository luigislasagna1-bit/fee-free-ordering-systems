import { NextResponse } from "next/server";

// Never cached — always reflects the CURRENTLY DEPLOYED serverless function's
// build. The kitchen compares this to its baked-in NEXT_PUBLIC_WEB_BUILD to
// detect a stale WebView-cached bundle and reload when idle.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev";
  return NextResponse.json(
    { build },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" } },
  );
}
