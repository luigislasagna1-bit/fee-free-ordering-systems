import { NextRequest, NextResponse } from "next/server";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { buildVoiceMenuPayload } from "@/lib/voice/menu-payload";

// Prisma can't run on the edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/internal/voice/menu?slug=<slug>
 *
 * The `get_menu` tool. Thin wrapper — auth + parse + build + JSON. The whole
 * payload is built by `buildVoiceMenuPayload` (src/lib/voice/menu-payload.ts)
 * so the live route and the offline menu snapshot / simulator
 * (`scripts/nabil-snapshot-menu.ts`) can never disagree about what Nabil sees.
 * See that file for what the payload contains and why.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const slug = (req.nextUrl.searchParams.get("slug") || "").toLowerCase().trim();
  const result = await buildVoiceMenuPayload(slug);
  return NextResponse.json(result.body, { status: result.status });
}
