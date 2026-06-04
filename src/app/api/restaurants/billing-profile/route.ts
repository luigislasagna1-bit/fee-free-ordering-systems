import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";

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

  const profile = await prisma.restaurantBillingProfile.upsert({
    where: { restaurantId },
    update: data,
    create: { restaurantId, ...data },
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
