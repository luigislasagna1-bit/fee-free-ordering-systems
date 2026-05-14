import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";

export async function POST(_req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = await prisma.paymentProvider.findUnique({ where: { restaurantId } });
  if (!provider || !provider.secretKeyEnc) {
    return NextResponse.json({ error: "No secret key saved" }, { status: 400 });
  }

  let secretKey: string;
  try {
    secretKey = decrypt(provider.secretKeyEnc, provider.secretKeyIv, provider.secretKeyTag);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt secret key" }, { status: 500 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
    // A lightweight read-only call to verify the key works
    const balance = await stripe.balance.retrieve();
    const status = balance.livemode ? "live" : "test";
    await prisma.paymentProvider.update({
      where: { restaurantId },
      data: { lastTestedAt: new Date(), lastTestStatus: "ok" },
    });
    return NextResponse.json({ success: true, mode: status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.paymentProvider.update({
      where: { restaurantId },
      data: { lastTestedAt: new Date(), lastTestStatus: "failed" },
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
