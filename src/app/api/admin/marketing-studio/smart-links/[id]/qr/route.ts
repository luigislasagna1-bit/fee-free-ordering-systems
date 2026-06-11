/**
 * GET /api/admin/marketing-studio/smart-links/[id]/qr?format=svg|png
 *
 * Returns a QR code encoding the smart link's primary-domain /m/<code> URL, as a
 * downloadable PNG (default) or SVG. Session-scoped — only the owner's own links.
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { buildSmartLinkUrl } from "@/lib/marketing-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.smartLink.findFirst({ where: { id, restaurantId }, select: { code: true } });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = buildSmartLinkUrl(link.code);
  const format = new URL(req.url).searchParams.get("format") === "svg" ? "svg" : "png";
  const filename = `qr-${link.code}.${format}`;
  const opts = { margin: 1, width: 800, errorCorrectionLevel: "M" as const };

  if (format === "svg") {
    const svg = await QRCode.toString(url, { type: "svg", ...opts });
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  }
  const buf = await QRCode.toBuffer(url, { type: "png", ...opts });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
