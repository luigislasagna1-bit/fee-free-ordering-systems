import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";
import { checkViesVat, isEuViesCountry } from "@/lib/vies";

/**
 * Restaurant fiscal / billing identity (report cmpxe5fd2). Lets the owner
 * store the company name, VAT/tax id and billing address used on their
 * platform-service invoices, so they can hand a proper proof-of-purchase to
 * their accountant. On save we mirror name/email/address (+ VAT tax id) to
 * the platform Stripe customer so the hosted invoice + PDF carry the details.
 */

const STR = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.restaurantBillingProfile.findUnique({
    where: { restaurantId: user.restaurantId },
  });
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = user.restaurantId;

  const b = await req.json().catch(() => ({}));
  const data = {
    legalName: STR(b.legalName),
    taxId: STR(b.taxId, 64),
    taxIdType: STR(b.taxIdType, 32),
    billingEmail: STR(b.billingEmail, 200),
    addressLine1: STR(b.addressLine1),
    addressLine2: STR(b.addressLine2),
    city: STR(b.city, 120),
    state: STR(b.state, 120),
    postalCode: STR(b.postalCode, 32),
    country: STR(b.country, 2).toUpperCase(),
    sdiCode: STR(b.sdiCode, 16),
    pec: STR(b.pec, 200),
  };

  // ── VIES validation for EU VAT numbers (Fabrizio cmr1ty0lc, 2026-07-03) ──
  // A changed EU VAT/country resets the verdict, then we re-check against the
  // EU's official VIES service. Fail-soft: if VIES is unreachable the verdict
  // stays null ("not yet checked") rather than falsely flipping to invalid —
  // the invoice + Option-A purchase gate both key off taxIdViesValid === true.
  const prev = await prisma.restaurantBillingProfile.findUnique({
    where: { restaurantId },
    select: { taxId: true, country: true, taxIdViesValid: true, taxIdViesCheckedAt: true },
  });
  let vies: { taxIdViesValid: boolean | null; taxIdViesCheckedAt: Date | null } = {
    taxIdViesValid: prev?.taxIdViesValid ?? null,
    taxIdViesCheckedAt: prev?.taxIdViesCheckedAt ?? null,
  };
  const identityChanged = !prev || prev.taxId !== data.taxId || prev.country !== data.country;
  if (!isEuViesCountry(data.country) || !data.taxId) {
    vies = { taxIdViesValid: null, taxIdViesCheckedAt: null };
  } else if (identityChanged) {
    vies = { taxIdViesValid: null, taxIdViesCheckedAt: null }; // reset before the fresh check
    const result = await checkViesVat(data.country, data.taxId);
    if (result.checked) vies = { taxIdViesValid: result.valid, taxIdViesCheckedAt: new Date() };
  }

  const profile = await prisma.restaurantBillingProfile.upsert({
    where: { restaurantId },
    update: { ...data, ...vies },
    create: { restaurantId, ...data, ...vies },
  });

  // Best-effort sync to the platform Stripe customer so it appears on the
  // hosted invoice / receipt. Never block saving the fiscal data on a Stripe
  // hiccup — the local record is the source of truth for our own receipts.
  try {
    const customerId = await ensureStripeCustomerForRestaurant(restaurantId);
    const stripe = await getStripe();
    const address =
      data.addressLine1 || data.city || data.postalCode || data.country
        ? {
            line1: data.addressLine1 || undefined,
            line2: data.addressLine2 || undefined,
            city: data.city || undefined,
            state: data.state || undefined,
            postal_code: data.postalCode || undefined,
            country: data.country || undefined,
          }
        : undefined;
    await stripe.customers.update(customerId, {
      name: data.legalName || undefined,
      email: data.billingEmail || undefined,
      address,
      metadata: { vatId: data.taxId, sdiCode: data.sdiCode, pec: data.pec },
    });

    // VAT / tax id appears on the invoice only as a Stripe tax_id resource.
    // Replace any existing ones so the invoice always reflects the latest.
    if (data.taxId && data.taxIdType) {
      try {
        const existing = await stripe.customers.listTaxIds(customerId, { limit: 100 });
        await Promise.all(
          existing.data.map((tid) =>
            stripe.customers.deleteTaxId(customerId, tid.id).catch(() => {}),
          ),
        );
        await stripe.customers.createTaxId(customerId, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: data.taxIdType as any,
          value: data.taxId,
        });
      } catch (e) {
        // Invalid tax-id type/value for the country — keep the local record,
        // just skip the Stripe tax_id resource.
        console.warn("[billing-profile] tax id sync skipped:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[billing-profile] stripe customer sync failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ success: true, profile });
}

/**
 * POST — re-run the VIES check on the SAVED profile without editing it.
 * Covers "VIES was down when I saved" and "my number just got registered"
 * (numbers also lapse — Fabrizio's JUBIN example — so owners can re-verify).
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bp = await prisma.restaurantBillingProfile.findUnique({
    where: { restaurantId: user.restaurantId },
    select: { taxId: true, country: true },
  });
  if (!bp?.taxId || !isEuViesCountry(bp.country)) {
    return NextResponse.json({ error: "not_applicable" }, { status: 400 });
  }
  const result = await checkViesVat(bp.country, bp.taxId);
  if (!result.checked) {
    return NextResponse.json({ checked: false, reason: result.reason }, { status: 503 });
  }
  const profile = await prisma.restaurantBillingProfile.update({
    where: { restaurantId: user.restaurantId },
    data: { taxIdViesValid: result.valid, taxIdViesCheckedAt: new Date() },
  });
  return NextResponse.json({ checked: true, valid: result.valid, profile });
}
