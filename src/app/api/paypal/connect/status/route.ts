/**
 * GET /api/paypal/connect/status
 *
 * Returns the restaurant's PayPal connection state for the admin UI.
 * Never returns secrets — only metadata (environment, merchant email,
 * connectedAt). Also re-verifies the stored creds against PayPal so the
 * admin "Refresh status" button can detect a revoked app.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { verifyPaypalCredentials } from "@/lib/paypal";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      paypalAccountStatus: true,
      paypalEnvironment: true,
      paypalMerchantEmail: true,
      paypalConnectedAt: true,
      paypalClientIdEnc: true, // presence-only — we don't return the value
    },
  });
  if (!r) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const hasCredsStored = !!r.paypalClientIdEnc;
  // Only re-verify if creds are actually stored. Otherwise a "not_connected"
  // status would always re-OAuth-fail noisily.
  let revalidated = false;
  if (hasCredsStored && r.paypalAccountStatus === "connected") {
    const v = await verifyPaypalCredentials(restaurantId);
    if (!v.ok) {
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { paypalAccountStatus: "error" },
      });
      return NextResponse.json({
        status: "error",
        environment: r.paypalEnvironment,
        merchantEmail: r.paypalMerchantEmail,
        connectedAt: r.paypalConnectedAt,
        errorMessage: v.errorMessage?.slice(0, 300),
      });
    }
    revalidated = true;
  }

  return NextResponse.json({
    status: r.paypalAccountStatus ?? "not_connected",
    environment: r.paypalEnvironment,
    merchantEmail: r.paypalMerchantEmail,
    connectedAt: r.paypalConnectedAt,
    revalidated,
  });
}
