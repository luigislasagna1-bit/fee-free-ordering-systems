import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET — recent print jobs ──────────────────────────────────────────────────

export async function GET() {
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = await prisma.printLog.findMany({
    where:   { restaurantId: user.restaurantId },
    orderBy: { createdAt: "desc" },
    take:    50,
    select: {
      id:             true,
      orderId:        true,
      orderNumber:    true,
      receiptType:    true,
      printerName:    true,
      printNodeJobId: true,
      status:         true,
      errorMessage:   true,
      createdAt:      true,
    },
  });

  return NextResponse.json({ logs });
}
