/**
 * GET /api/kitchen/print-job/[orderId]?type=kitchen|customer&width=58|80
 *
 * Returns the receipt for one order in BOTH formats (`bytes` ESC/POS + `lines`
 * for the StarXpand bitmap renderer). Kitchen SESSION auth — the app-open web
 * auto-print and manual reprints use this. The native BACKGROUND print service
 * (app closed, no session cookie) uses the token-authed sibling
 * /api/kitchen/print-job-token. Both share buildOrderReceiptPayload so a ticket
 * is byte-identical regardless of which path printed it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { buildOrderReceiptPayload } from "@/lib/kitchen-receipt-payload";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const paperWidth = req.nextUrl.searchParams.get("width") === "58" ? "58mm" : "80mm";
  const receiptType: "kitchen" | "customer" =
    req.nextUrl.searchParams.get("type") === "customer" ? "customer" : "kitchen";

  const result = await buildOrderReceiptPayload({ orderId, restaurantId, type: receiptType, paperWidth });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    orderId,
    width: result.width,
    type: receiptType,
    bytes: result.bytes,
    lines: result.lines,
  });
}
