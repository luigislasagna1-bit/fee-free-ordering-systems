/**
 * GET /api/reseller/marketing-kit/qr?format=png|svg&size=<px>
 *
 * The partner's referral QR on its own, so they can drop it into their own designs, a
 * business card, or van signage. Mirrors the existing binary-download route at
 * src/app/api/admin/marketing-studio/smart-links/[id]/qr/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { rateLimitShared } from "@/lib/rate-limit";
import { requireKitReseller } from "@/lib/reseller-kit/guard";
import { buildResellerReferralUrl } from "@/lib/reseller/referral-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireKitReseller();
  if (gate instanceof NextResponse) return gate;
  const { resellerProfileId, profile } = gate;

  if (!(await rateLimitShared(`mk:qr:${resellerProfileId}`, 120, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const requested = Number(url.searchParams.get("size") ?? "1000");
  const size = Number.isFinite(requested) ? Math.min(2000, Math.max(200, Math.round(requested))) : 1000;

  const referral = buildResellerReferralUrl(profile);
  const opts = { margin: 1, width: size, errorCorrectionLevel: "M" as const };
  const filename = `referral-qr-${profile.referralCode}.${format}`;

  if (format === "svg") {
    const svg = await QRCode.toString(referral.url, { type: "svg", ...opts });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buf = await QRCode.toBuffer(referral.url, { type: "png", ...opts });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
