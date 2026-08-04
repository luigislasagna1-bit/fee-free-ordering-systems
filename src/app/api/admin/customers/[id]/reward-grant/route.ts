/**
 * POST /api/admin/customers/[id]/reward-grant  — body { amount, note? }
 *
 * Manual Reward Dollars grant / adjustment for one customer. Positive amount =
 * grant; negative = deduct (the ledger clamps the balance ≥0). Restaurant-scoped:
 * the customer must belong to the session's restaurant (tampered URL → 404).
 * Returns the new balance + recent ledger so the UI updates without a reload.
 * Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { grant, getBalance } from "@/lib/reward-ledger";
import { sendRewardGiftEmail, sendRewardGiftInviteEmail } from "@/lib/email";
import { isAccountCustomer } from "@/lib/reward-gifts";
import { formatCurrency } from "@/lib/utils";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    // signedUpAt / passwordHash / customerAccountId decide WHICH email this
    // person can act on: a guest CRM row (created by simply ordering) has no
    // way to sign in, so telling them to "sign in to your account" is a dead
    // end for money that is really theirs. Mirrors isAccountCustomer().
    select: { id: true, restaurantId: true, name: true, email: true, marketingConsent: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
  });
  if (!customer || customer.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Feature must be on for the restaurant.
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      rewardsEnabled: true,
      // For the gift email (Luigi 2026-07-11): name/labels/currency/locale +
      // the branded order URL fields restaurantOrderUrl() needs.
      name: true, email: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true,
      defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
    },
  });
  if (!r?.rewardsEnabled) return NextResponse.json({ error: "Reward Dollars is off" }, { status: 400 });

  let body: { amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });
  }
  if (Math.abs(amount) > 1_000_000) {
    return NextResponse.json({ error: "Amount too large" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

  const res = await grant({
    restaurantId,
    customerId: customer.id,
    amount,
    reason: amount > 0 ? "grant" : "adjust",
    note,
  });
  if (!res.ok) return NextResponse.json({ error: "Could not apply the adjustment" }, { status: 500 });

  const balance = await getBalance({ restaurantId, customerId: customer.id });

  // Gift email (Luigi 2026-07-11): POSITIVE manual grants only — deductions
  // and corrections stay silent. Fire-and-forget so mail latency/failures
  // never block the admin response. Gated on the customer's marketingConsent
  // (standing rule: every new marketing email path respects consent) and on
  // having an email at all. Fully localized in the restaurant's language.
  if (amount > 0 && customer.email && customer.marketingConsent) {
    const rewardLabel = r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || "Reward Dollars";
    const locale = r.defaultLanguage || "en";
    // WHICH email depends on whether this person can actually sign in. A guest
    // CRM row is created by simply placing an order, so "Sign in to your
    // account" would be a dead end: no password, no dashboard, and the balance
    // is invisible at checkout until they have a session. Send the invite
    // instead, which tells them to create the account that unlocks it. The
    // sibling gift-by-email route has always branched this way; this one never
    // did, so every walk-in customer granted credit from their customer page
    // got instructions they could not follow. Luigi 2026-07-31.
    if (isAccountCustomer(customer)) {
      sendRewardGiftEmail({
        to: customer.email,
        restaurantId,
        customerName: customer.name || "",
        restaurantName: r.name,
        amountLabel: formatCurrency(amount, r.currency),
        rewardLabel,
        balanceLabel: formatCurrency(balance, r.currency),
        note,
        orderUrl: restaurantOrderUrl(r as any, ""),
        restaurantEmail: r.email,
        locale,
      }).catch((e) => console.error("[reward-grant gift email]", e instanceof Error ? e.message : e));
    } else {
      // The credit is already banked against their row — the invite's job is
      // simply to get them an account so they can see and spend it. Same
      // signup-subpath rule as the gift route: a branded host's ROOT serves the
      // marketing site, so link to /account/signup explicitly.
      sendRewardGiftInviteEmail({
        to: customer.email,
        restaurantId,
        customerName: customer.name || "",
        restaurantName: r.name,
        amountLabel: formatCurrency(amount, r.currency),
        rewardLabel,
        note,
        orderUrl: restaurantOrderUrl(r as any, "/account/signup"),
        restaurantEmail: r.email,
        locale,
      }).catch((e) => console.error("[reward-grant invite email]", e instanceof Error ? e.message : e));
    }
  }

  const acct = await prisma.rewardAccount.findUnique({
    where: { restaurantId_customerId: { restaurantId, customerId: customer.id } },
    select: { ledger: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, reason: true, note: true, createdAt: true } } },
  });
  return NextResponse.json({
    ok: true,
    balance,
    ledger: (acct?.ledger ?? []).map((l) => ({ id: l.id, amount: l.amount, reason: l.reason, note: l.note, createdAt: l.createdAt.toISOString() })),
  });
}
