import { NextRequest, NextResponse } from "next/server";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { buildVoiceContextPayload } from "@/lib/voice/context-payload";

export const runtime = "nodejs";

/**
 * GET /api/internal/voice/context?slug=<slug>
 *
 * The `check_hours_and_services` tool. Thin wrapper — auth + parse + build +
 * JSON. The whole payload is built by `buildVoiceContextPayload`
 * (src/lib/voice/context-payload.ts) so the live route and the offline menu
 * snapshot / simulator (`scripts/nabil-snapshot-menu.ts`) can never disagree
 * about what Nabil is told. See that file for what the payload contains.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const slug = (req.nextUrl.searchParams.get("slug") || "").toLowerCase().trim();
  const result = await buildVoiceContextPayload(slug);
  return NextResponse.json(result.body, { status: result.status });
}
