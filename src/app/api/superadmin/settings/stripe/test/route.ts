import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getStripe, getStripeConfig } from "@/lib/stripe";

/**
 * Verify the saved Stripe credentials by calling a cheap read-only endpoint
 * (`balance.retrieve`). Confirms the secret key is valid + the account is
 * accessible. Doesn't touch any data.
 */
export async function POST() {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stripe = await getStripe();
    const cfg = await getStripeConfig();
    const balance = await stripe.balance.retrieve();
    return NextResponse.json({
      ok: true,
      mode: cfg.mode ?? "unknown",
      source: cfg.source,
      message: `Connected (${cfg.mode ?? "unknown"} mode, ${balance.available.length} balance bucket${balance.available.length === 1 ? "" : "s"})`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Stripe connection failed" },
      { status: 400 }
    );
  }
}
