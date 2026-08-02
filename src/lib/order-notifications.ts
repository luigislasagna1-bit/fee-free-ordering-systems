/**
 * "Release" an order — fires the customer confirmation email + the kitchen
 * staff notification + flips `notifiedAt` so the kitchen display picks
 * the order up. Used by two call sites:
 *
 *   1. /api/orders POST (immediately, for cash orders)
 *   2. payment_intent.succeeded webhook (after payment clears, for card orders)
 *
 * Idempotent: re-running on an already-released order is a no-op. This
 * matters because Stripe can deliver the same webhook event more than once
 * (network retry, multiple workers), and we MUST NOT fire two confirmation
 * emails to the customer or two alerts to the kitchen.
 *
 * Idempotency mechanism: notifiedAt is set with an atomic
 * `update where: { id, notifiedAt: null }` — if a parallel call already set
 * it, our updateMany affects 0 rows and we skip the fan-out.
 */

import prisma from "@/lib/db";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { notifyStaff, notifyCustomer } from "@/lib/notifications";
import { recordAppliedCoupons } from "@/lib/coupon-ledger";
import { sendKitchenPush } from "@/lib/push";
import { formatCurrency } from "@/lib/utils";
import { projectOrderEarn } from "@/lib/reward-earn";
import { signActionToken } from "@/lib/order-status-token";
import { shouldOfferEmailCancel } from "@/lib/customer-cancel-policy";

// Promo usage give-back on a killed/abandoned order now lives in
// `releasePromotionUsageForOrder(orderId)` in @/lib/promo-usage — it deletes the
// order's PromotionUsage ledger rows and decrements usedCount idempotently
// (per-order, cap-independent), replacing the old raw-counter decrement here.

export async function fireOrderNotifications(orderId: string): Promise<{ fired: boolean }> {
  // Atomic claim: only ONE caller wins the right to fire notifications.
  // Returns count = 1 if we won, 0 if someone else already did.
  const claim = await prisma.order.updateMany({
    where: { id: orderId, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
  if (claim.count === 0) {
    return { fired: false }; // already released by an earlier call
  }

  // Now load the full row to build the email payloads. We do this AFTER
  // the claim so a slow load doesn't widen the race window.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          customDomainStatus: true,
          estimatedPickup: true,
          estimatedDelivery: true,
          defaultLanguage: true,
          currency: true,
          // Reward Dollars — the emails show "Paid with {label}" / "To collect"
          // ONLY when the program is on (feature-gated display, Luigi 2026-07-02).
          rewardsEnabled: true,
          rewardLabelSingular: true,
          rewardLabelPlural: true,
        },
      },
      items: {
        select: {
          name: true,
          quantity: true,
          price: true,
          // LINE total (unit price x qty, modifiers included). Without it the
          // email printed the UNIT price beside "3x", so the item lines never
          // added up to the Subtotal and contradicted the printed ticket.
          subtotal: true,
          variantName: true,
          notes: true,
          bundleItems: true,
          // Per-item refundable deposit — so the email can itemize it + reconcile
          // the breakdown to order.total (which already includes it). Luigi 2026-07-09.
          isRefundableDeposit: true,
          depositAmount: true,
          modifiers: { select: { name: true, priceAdjustment: true } },
        },
      },
    },
  });
  if (!order) {
    console.error(`[fireOrderNotifications] claimed orderId ${orderId} but row vanished`);
    return { fired: false };
  }

  // Reserve-then-order: pull the linked table booking (if any) so the SINGLE
  // order confirmation email also confirms the reservation — "we've received
  // your table reservation AND pre-order". Null for every normal order.
  // Luigi 2026-06-08.
  const linkedReservation = await prisma.reservation.findFirst({
    where: { orderId: order.id },
    select: { partySize: true, date: true, time: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Parse Order.appliedPromos snapshot so the email + receipt can show
  // the named promo + savings box. Null/malformed → empty array (template
  // hides the box). Free-delivery entries already carry the saved
  // delivery fee as their discount, frozen at order-create time.
  let appliedPromosForEmail: Array<{ name: string; type: string; discount: number; couponCode?: string }> | undefined;
  let appliedPromoIds: string[] = [];
  if ((order as any).appliedPromos) {
    try {
      const parsed = JSON.parse((order as any).appliedPromos);
      if (Array.isArray(parsed) && parsed.length > 0) {
        appliedPromosForEmail = parsed;
        appliedPromoIds = parsed.map((p: any) => p?.promoId).filter((x: unknown): x is string => typeof x === "string" && !!x);
      }
    } catch { /* malformed JSON — leave undefined */ }
  }

  // ── Coupon ledger: record the campaign / once-per-lifetime promos this order
  // applied, NOW that it's actually LIVE (released to the kitchen). Doing it at
  // release — not at order-create — means an abandoned unpaid card order never
  // reserves the coupon, so the customer can freely retry; only a real, released
  // order ties up the offer (and it's released again if later missed/cancelled).
  // Awaited (fast, internally safe) so the row exists before any completion/
  // release hook can act on it. Luigi 2026-06-09.
  if (appliedPromoIds.length > 0) {
    await recordAppliedCoupons({
      restaurantId: (order as any).restaurantId,
      orderId: order.id,
      email: order.customerEmail,
      phone: order.customerPhone,
      customerId: (order as any).customerId ?? null,
      appliedPromoIds,
    });
    // NOTE: promo `usedCount` is NOT bumped here anymore. As of B5 (2026-06-30)
    // every applied promo — capped AND uncapped — is claimed at ORDER-CREATE (the
    // order route bumps usedCount + writes a PromotionUsage ledger row), so bumping
    // again at release would double-count. The give-back on a kill deletes the
    // ledger rows (see releasePromotionUsageForOrder). Release is no longer a
    // usage-accounting event — recordAppliedCoupons above is the only thing that
    // still keys off it (campaign / once-per-lifetime tracking).
  }

  // Map order items for the email — include each item's own modifiers AND, for
  // combo/bundle lines, the child picks + their options, so the email lists
  // everything (items, sizes, toppings, sauces). The OrderItem.name already
  // carries the variant for regular items; combos carry their parts in
  // bundleItems. (i.name already includes variant text where applicable.)
  const emailItems = order.items.map((i: any) => {
    const bundle = Array.isArray(i.bundleItems) ? (i.bundleItems as any[]) : null;
    return {
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      // What this line actually costs. Falls back to unit x qty for any legacy
      // row with no stored subtotal, which still beats showing the unit price.
      lineTotal: typeof i.subtotal === "number" ? i.subtotal : (i.price ?? 0) * (i.quantity ?? 1),
      // Per-item refundable deposit (untaxed, added to the total on top).
      isRefundableDeposit: !!i.isRefundableDeposit && (i.depositAmount ?? 0) > 0,
      depositAmount: (i.depositAmount ?? 0) > 0 ? i.depositAmount : undefined,
      modifiers: Array.isArray(i.modifiers) && i.modifiers.length > 0
        ? i.modifiers.map((m: any) => ({ label: "", value: m.name, priceAdjustment: m.priceAdjustment || 0 }))
        : undefined,
      notes: i.notes ?? undefined,
      bundleItems: bundle
        ? bundle.map((c: any) => ({
            name: String(c?.name ?? ""),
            variantName: c?.variantName ?? null,
            modifiers: Array.isArray(c?.modifiers)
              ? c.modifiers.map((m: any) => ({ name: String(m?.name ?? "") }))
              : undefined,
          }))
        : undefined,
    };
  });

  // Reward Dollars part-payment — shown on BOTH emails ("Paid with {label}" /
  // "Balance to pay" vs "To collect") so nobody reads the Total and collects
  // the wrong amount (Luigi 2026-07-02). Feature-gated: when the rewards
  // program is OFF nothing reward-related is passed at all (standing rule —
  // a disabled feature must not show or count anywhere).
  // Sum of the per-item refundable deposits (untaxed, already inside order.total).
  // Passed so the email can show a "Refundable deposit (not taxed)" row and the
  // breakdown reconciles to the Total. Luigi 2026-07-09.
  const depositTotal = Math.round(
    order.items.reduce((s: number, i: any) => s + (i.isRefundableDeposit && (i.depositAmount ?? 0) > 0 ? Number(i.depositAmount) * i.quantity : 0), 0) * 100,
  ) / 100;

  const rewardsOn = (order.restaurant as any).rewardsEnabled === true;
  const creditApplied = rewardsOn ? Math.max(0, (order as any).creditApplied ?? 0) : 0;
  const rewardLabel = rewardsOn
    ? ((order.restaurant as any).rewardLabelPlural?.trim() || (order.restaurant as any).rewardLabelSingular?.trim() || null)
    : null;

  // Per-order service fees (JSON [{name, amount}]) — parsed once, named rows
  // on BOTH order emails so the totals reconcile to Total (audit 2026-07-11).
  const serviceFeesForEmail: Array<{ name?: string; amount?: number }> = (() => {
    const raw: unknown = (order as any).appliedServiceFees;
    if (Array.isArray(raw)) return raw as any[];
    if (typeof raw === "string" && raw.trim()) {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  // Projected Reward Dollars EARN — what the wallet will be credited when the
  // order completes (base %-back + matching earn rules). Same read-only helper
  // the printed receipt uses; returns 0 for guests / earning off, never throws.
  // Awaited here because fireOrderNotifications is already off the request hot
  // path (fire-and-forget from the orders route / Stripe webhook).
  const projectedEarnRaw = rewardsOn ? await projectOrderEarn(orderId) : 0;

  // ── Only promise the earn to the person who will actually receive it ──────
  // projectOrderEarn resolves off Order.customerId — the ATTRIBUTED account —
  // while this email is addressed to Order.customerEmail. Those are the same
  // person on every ordinary order, but a signed-in customer ordering for
  // somebody else splits them (the account earns, the typed address gets the
  // confirmation). Sending "You earned $4.20" to the typed address would be a
  // written promise of credit that lands in a different wallet and can never be
  // honoured to the reader — and it contradicts the checkout notice, which
  // correctly says the credit belongs to the account. Compared
  // case-insensitively; a missing row (guest order) leaves the old behaviour
  // untouched. Luigi 2026-07-31.
  const earningRow = (order as any).customerId
    ? await prisma.customer.findUnique({ where: { id: (order as any).customerId }, select: { email: true } }).catch(() => null)
    : null;
  const earnGoesToThisReader =
    !earningRow?.email ||
    !order.customerEmail ||
    earningRow.email.toLowerCase() === order.customerEmail.toLowerCase();
  const projectedEarn = earnGoesToThisReader ? projectedEarnRaw : 0;

  // Customer confirmation email — fire-and-forget so a Resend hiccup
  // doesn't fail the webhook (Stripe would retry the whole event).
  notifyCustomer({
    restaurantId: order.restaurant.id,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    // Branded-app confirmation push rides the same call (2026-08-02).
    customerId: (order as any).customerId ?? null,
    orderType: order.type,
    // The CUSTOMER's storefront language, persisted at create (cms0gyexp #2).
    // Legacy rows (null) keep the restaurant-default behavior.
    customerLocale: (order as any).customerLocale || order.restaurant.defaultLanguage || "en",
    payload: {
      event: "orderConfirmed",
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      items: emailItems,
      total: order.total,
      // Full money breakdown — without these the email's "Subtotal" silently
      // fell back to the TOTAL and tax/tip/discount never rendered (Luigi
      // 2026-07-02, ORD-462443388).
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      deliveryFee: order.deliveryFee,
      tip: order.tip ?? undefined,
      depositTotal: depositTotal > 0 ? depositTotal : undefined,
      discount: (order.couponDiscount ?? 0) + (order.promoDiscount ?? 0),
      serviceFees: serviceFeesForEmail,
      creditApplied: creditApplied > 0 ? creditApplied : undefined,
      rewardLabel,
      rewardEarned: projectedEarn > 0 ? projectedEarn : undefined,
      paymentMethod: order.paymentMethod,
      paidStatus: order.paymentStatus,
      // Same rule as the staff email below: card/PayPal are captured online,
      // reward_credit means the wallet fully covered it — nothing to collect.
      // Never passed before 2026-07-11 → every receipt email said "Pay at store".
      paidOnline: ["card", "paypal", "reward_credit"].includes(order.paymentMethod),
      orderType: order.type,
      estimatedTime: order.type === "pickup"
        ? order.restaurant.estimatedPickup
        : order.restaurant.estimatedDelivery,
      // Scheduled ("order for later") slot — drives the prominent scheduled
      // line on the confirmation email. Null = ASAP. Luigi 2026-06-05.
      scheduledFor: (order as any).scheduledFor ?? null,
      // Range-mode window width — email shows "start – end". Fabrizio cmqqxerxs.
      scheduledSlotMinutes: (order as any).scheduledSlotMinutes ?? null,
      // Reserve-then-order: the table booking attached to this order, so the
      // confirmation email states the reservation too. Luigi 2026-06-08.
      reservation: linkedReservation
        ? { partySize: linkedReservation.partySize, date: linkedReservation.date, time: linkedReservation.time }
        : undefined,
      trackingUrl: restaurantOrderUrl(order.restaurant, `/status/${order.id}`),
      // Guest self-cancel (Fabrizio cms0idtz7): PAGE link (branded-host safe)
      // to the status page with the purpose-scoped cancel token — the page
      // auto-opens the confirm modal. Policy-gated (closed_only default →
      // only placedWhileClosed orders carry it) and only while the order is
      // still pending at send time (it always is here — this fires at
      // placement — the guard is for future call sites).
      ...(shouldOfferEmailCancel({ placedWhileClosed: !!(order as any).placedWhileClosed }) &&
      order.status === "pending"
        ? {
            cancelUrl: restaurantOrderUrl(
              order.restaurant,
              `/status/${order.id}?cancel=${signActionToken("order-cancel", order.id)}`,
            ),
          }
        : {}),
      placedWhileClosed: !!(order as any).placedWhileClosed,
      // The deferred kitchen alert = the restaurant's next opening — lets the
      // closed note say WHEN ("Check your email on Saturday, 25 Jul, 20:15").
      // GloriaFood parity, Fabrizio cms0gyexp #8.
      opensAt: (order as any).alertAt ?? null,
      appliedPromos: appliedPromosForEmail,
    },
  }).catch((e) => console.error("[fireOrderNotifications] notifyCustomer:", e));

  notifyStaff({
    restaurantId: order.restaurant.id,
    payload: {
      event: "orderPlaced",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      dashboardUrl: `${baseUrl}/admin/orders`,
      // Reserve-then-order: the STORE copy also flags the table booking, so the
      // kitchen email reads "table reservation + pre-order". Luigi 2026-06-08.
      reservation: linkedReservation
        ? { partySize: linkedReservation.partySize, date: linkedReservation.date, time: linkedReservation.time }
        : undefined,
      // Full order detail so the kitchen "new order" email is ITEMIZED (same data as
      // the customer email), not the minimal "see breakdown in admin". Luigi 2026-06-25.
      items: emailItems,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      deliveryFee: order.deliveryFee,
      // A waived delivery fee is stored as deliveryFee = 0, and a $0 row is
      // hidden — so a free-delivery promo left NO trace on the staff email at
      // all. It read as though delivery had simply been forgotten (Luigi, order
      // ORD-742085738). Pass the saved amount so the row renders as
      // "Delivery fee: $7.99 (struck through) FREE", the same treatment the
      // customer email, receipts and kitchen screen already give it.
      savedDeliveryFee: appliedPromosForEmail?.find((p) => p.type === "free_delivery")?.discount ?? undefined,
      tip: order.tip,
      depositTotal: depositTotal > 0 ? depositTotal : undefined,
      discount: (order.couponDiscount ?? 0) + (order.promoDiscount ?? 0),
      serviceFees: serviceFeesForEmail,
      // "Paid with {label}" + "To collect" rows — staff must never read the
      // Total and over-collect a credit-part-paid order (Luigi 2026-07-02).
      creditApplied: creditApplied > 0 ? creditApplied : undefined,
      rewardLabel,
      orderType: order.type,
      // "Paid online" = the platform already captured the money (Stripe card,
      // PayPal, or fully covered by store credit). cash AND card_in_person
      // (card at the door / at pickup) are still TO COLLECT — `!== "cash"`
      // here mislabeled Luigi's card-on-delivery order #238064650 as paid
      // and staff could've skipped charging the card (2026-07-04).
      paidOnline: ["card", "paypal", "reward_credit"].includes(order.paymentMethod),
      paymentMethod: order.paymentMethod,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      deliveryAddress: order.deliveryAddress,
      customerNotes: order.notes,
    },
  }).catch((e) => console.error("[fireOrderNotifications] notifyStaff:", e));

  // Native push to the kitchen's registered devices (phone/tablet) so a NEW
  // ORDER rings even with the screen off / app backgrounded. Fire-and-forget —
  // a push hiccup must NEVER fail order release. Gated: a silent no-op until
  // FIREBASE_SERVICE_ACCOUNT is set AND a device has registered. Body is
  // language-neutral (order data only). Luigi 2026-06-15.
  //
  // Closed-when-placed orders defer their alert to opening (alertAt in the
  // future) — do NOT fire the loud alarm overnight. The order shows parked in
  // the kitchen and the in-app ring picks it up when staff next open the app.
  const pushDeferred = (order as any).alertAt && new Date((order as any).alertAt).getTime() > Date.now();
  if (!pushDeferred) {
    sendKitchenPush(order.restaurant.id, {
      title: order.restaurant.name || "New order",
      // Show what staff actually COLLECT (total − store credit), not the gross
      // total — a credit-part-paid cash order was over-collected otherwise
      // (Luigi 2026-07-02 money normalization).
      body: `#${order.orderNumber} · ${order.customerName} · ${formatCurrency(Math.max(0, order.total - creditApplied), order.restaurant.currency)}`,
      // autoAccept flag → the native app plays a short ~3s FYI ring for an auto-accepted
      // order (its status is already "accepted" at release) instead of the full urgent
      // alarm (K3). A manual order is still "pending" here, so it gets the full alarm.
      // Luigi 2026-06-23.
      data: { type: "new_order", orderId: order.id, autoAccept: order.status === "accepted" ? "true" : "false" },
    }).catch((e) => console.error("[fireOrderNotifications] sendKitchenPush:", e));
  }

  return { fired: true };
}
