import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isResellerPartner } from "@/lib/roles";
import { encrypt, decrypt } from "@/lib/encrypt";

/**
 * GET /api/reseller/profile
 * Returns the reseller's own profile. payoutDetails is decrypted only if the
 * server has ENCRYPTION_KEY; otherwise it's returned as a masked "configured"
 * flag.
 *
 * PUT /api/reseller/profile
 * Update payout method/details + company info. Secret-grade payoutDetails
 * (PayPal email, bank account number, etc.) is encrypted at rest with the
 * same AES-GCM envelope as Stripe keys.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isResellerPartner(user.role) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payoutDetailsDecrypted: string | null = null;
  let payoutDetailsConfigured = !!profile.payoutDetails;
  if (profile.payoutDetails && profile.payoutDetailsIv && profile.payoutDetailsTag && process.env.ENCRYPTION_KEY) {
    try {
      payoutDetailsDecrypted = decrypt(profile.payoutDetails, profile.payoutDetailsIv, profile.payoutDetailsTag);
    } catch {
      // wrong key — show as not configured so they re-enter
      payoutDetailsConfigured = false;
    }
  }

  return NextResponse.json({
    id: profile.id,
    status: profile.status,
    companyName: profile.companyName,
    website: profile.website,
    country: profile.country,
    payoutMethod: profile.payoutMethod,
    payoutDetailsConfigured,
    payoutDetails: payoutDetailsDecrypted, // null if not set or undecryptable
    referralCode: profile.referralCode,
    totalEarnedCents: profile.totalEarnedCents,
    totalPaidCents: profile.totalPaidCents,
    user: profile.user,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerPartner(user.role) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (typeof body.companyName === "string") update.companyName = body.companyName.trim().slice(0, 200) || null;
  if (typeof body.website === "string") update.website = body.website.trim().slice(0, 500) || null;
  if (typeof body.country === "string") update.country = body.country.trim().slice(0, 100) || null;
  if (typeof body.payoutMethod === "string") {
    const m = body.payoutMethod.trim();
    update.payoutMethod = ["paypal", "bank", "other"].includes(m) ? m : null;
  }
  if (typeof body.payoutDetails === "string" && body.payoutDetails.trim()) {
    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json(
        { error: "Server encryption key is not configured. Contact support." },
        { status: 503 }
      );
    }
    const env = encrypt(body.payoutDetails.trim());
    update.payoutDetails = env.enc;
    update.payoutDetailsIv = env.iv;
    update.payoutDetailsTag = env.tag;
  }

  await prisma.resellerProfile.update({
    where: { id: user.resellerProfileId },
    data: update,
  });

  return NextResponse.json({ ok: true });
}
