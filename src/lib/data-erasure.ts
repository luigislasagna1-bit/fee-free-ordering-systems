/**
 * Customer data erasure + export — the ONE place that knows the entire customer
 * PII surface (CASL/GDPR/PIPEDA "right to be forgotten" + data portability,
 * 2026-08-04). Every deletion path (the self-serve /api/public/data-request
 * endpoint, the owner/superadmin admin tools, and the retention cron) calls in
 * here so nothing is ever missed.
 *
 * Policy decision (Luigi 2026-08-04): ANONYMIZE, don't hard-delete. We strip
 * every name / email / phone / address / free-text PII field, but KEEP the
 * Order/Reservation rows (amounts, dates, line items) in anonymized form for
 * the legally-required tax-retention window (see /account-deletion: 7 years).
 *
 * ⚠️ When you add a table/column that stores customer PII, add it to
 * PII_ERASURE_MAP AND to the transforms below — or an erasure request will
 * silently leave that data behind (AGENTS.md standing rule).
 */
import crypto from "crypto";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { getRestaurantStripe } from "@/lib/stripe";
import { suppressEmail } from "@/lib/suppression";

const NAME_SENTINEL = "Deleted Customer";

/** Deterministic, non-deliverable replacement address (RFC 2606 .invalid).
 *  Deterministic so re-runs produce the SAME value → idempotent + still
 *  distinguishable from a real address. */
export function deletedEmail(seed: string): string {
  const h = crypto.createHash("sha256").update(seed.trim().toLowerCase()).digest("hex").slice(0, 16);
  return `deleted+${h}@deleted.invalid`;
}

/** sha256 of the lowercased email — the ONLY form of the address we log. */
export function subjectHash(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Documentation-as-code: every table + the customer-PII columns it holds and
 * what happens to them. Kept next to the logic so the two can't drift. `scope`
 * = "restaurant" rows are handled by anonymizeCustomerByEmail; "platform" rows
 * (the marketplace-wide identity) only by anonymizePersonEverywhere.
 */
export const PII_ERASURE_MAP = {
  Customer: { scope: "restaurant", action: "anonymize", fields: ["name", "email", "phone", "address", "notes", "passwordHash", "emailVerifyToken", "passwordResetToken", "lastLoginAt", "chainCustomerId", "customerAccountId", "stripeCustomerId"] },
  RestaurantCustomerAddress: { scope: "restaurant", action: "delete", fields: ["street", "city", "state", "zip", "lat", "lng"] },
  Order: { scope: "restaurant", action: "anonymize", fields: ["customerName", "customerEmail", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryZip", "deliveryLat", "deliveryLng", "deliveryAddressData", "notes"] },
  OrderItem: { scope: "restaurant", action: "anonymize", fields: ["notes"] },
  OrderRating: { scope: "restaurant", action: "anonymize", fields: ["comment"] },
  Reservation: { scope: "restaurant", action: "anonymize", fields: ["customerName", "customerEmail", "customerPhone", "notes", "staffNotes", "details"] },
  RewardLedger: { scope: "restaurant", action: "anonymize", fields: ["note"] },
  GiftWalletPass: { scope: "restaurant", action: "revoke", fields: ["lastIpHash"] },
  CustomerPushToken: { scope: "restaurant", action: "delete", fields: ["token"] },
  PendingRewardGrant: { scope: "restaurant", action: "anonymize", fields: ["email", "name", "note"] },
  EmailSuppression: { scope: "restaurant", action: "keep", fields: [] }, // kept: proves do-not-email
  VoiceCall: { scope: "restaurant", action: "anonymize", fields: ["fromNumber", "transcript", "summary", "recordingUrl", "customerId"] }, // Nabil AI; matched by phone (keep duration/outcome/cost)
  BlockedCaller: { scope: "restaurant", action: "keep", fields: [] }, // kept: do-not-serve record, same principle as EmailSuppression
  CustomerAccount: { scope: "platform", action: "anonymize", fields: ["email", "name", "phone", "passwordHash", "emailVerifyToken", "lastLoginAt"] },
  CustomerAddress: { scope: "platform", action: "delete", fields: ["street", "city", "state", "zip", "country"] },
  CustomerPasswordResetToken: { scope: "platform", action: "delete", fields: ["token"] },
} as const;

export type EraseActor = { via: "self-token" | "admin" | "superadmin" | "cron-retention"; userId?: string };
export type EraseResult = {
  subjectHash: string;
  scope: "restaurant" | "platform";
  counts: Record<string, number>;
  stripeStatus: "deleted" | "skipped" | "retry";
};

/** Delete a Stripe Customer on the restaurant's OWN connected account. Runs
 *  OUTSIDE any DB transaction (network), idempotent on already-deleted. */
async function deleteStripeCustomers(restaurantId: string, ids: string[]): Promise<"deleted" | "skipped" | "retry"> {
  const real = ids.filter(Boolean);
  if (real.length === 0) return "skipped";
  try {
    const rs = await getRestaurantStripe(restaurantId);
    if (!rs?.client) return "skipped";
    let any = false;
    for (const id of real) {
      try {
        await rs.client.customers.del(id);
        any = true;
      } catch (e: any) {
        if (e?.code === "resource_missing") { any = true; continue; } // already gone
        console.error("[data-erasure] stripe delete failed", { restaurantId, code: e?.code });
        return "retry";
      }
    }
    return any ? "deleted" : "skipped";
  } catch (e) {
    console.error("[data-erasure] stripe client error", e);
    return "retry";
  }
}

/**
 * Anonymize one person's data at ONE restaurant. Idempotent. Does NOT touch the
 * marketplace-wide CustomerAccount (that would corrupt their identity at OTHER
 * restaurants) — use anonymizePersonEverywhere for a true platform erasure.
 */
export async function anonymizeCustomerByEmail(
  restaurantId: string,
  email: string,
  opts?: { nullPaymentIds?: boolean; actor?: EraseActor },
): Promise<EraseResult> {
  const emailLower = email.trim().toLowerCase();
  const sub = subjectHash(emailLower);
  const insensitive = { equals: emailLower, mode: "insensitive" as const };

  // 1. Resolve ids (reads, before the transaction).
  const customers = await prisma.customer.findMany({
    where: { restaurantId, email: insensitive },
    select: { id: true, phone: true, stripeCustomerId: true },
  });
  const customerIds = customers.map((c) => c.id);
  const stripeIds = customers.map((c) => c.stripeCustomerId).filter((x): x is string => !!x);
  const phones = [...new Set(customers.map((c) => c.phone).filter((x): x is string => !!x))];

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      OR: [
        ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
        { customerEmail: insensitive },
      ],
    },
    select: { id: true, customerPhone: true },
  });
  const orderIds = orders.map((o) => o.id);
  orders.forEach((o) => o.customerPhone && phones.push(o.customerPhone));

  const rewardAccounts = customerIds.length
    ? await prisma.rewardAccount.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
    : [];
  const rewardAccountIds = rewardAccounts.map((a) => a.id);

  // 2. Stripe deletes (outside the DB transaction).
  const stripeStatus = await deleteStripeCustomers(restaurantId, stripeIds);

  const counts: Record<string, number> = {};
  const nullPay = opts?.nullPaymentIds
    ? { paymentIntentId: null, paypalOrderId: null, paypalAuthorizationId: null, paypalCaptureId: null }
    : {};

  // 3. All DB mutations in one transaction (anonymize-not-delete => no FK order hazards).
  await prisma.$transaction(async (tx) => {
    if (customerIds.length) {
      counts.Customer = (await tx.customer.updateMany({
        where: { id: { in: customerIds } },
        data: {
          name: NAME_SENTINEL,
          email: deletedEmail(emailLower),
          phone: null, address: null, notes: null,
          passwordHash: null, emailVerifyToken: null, passwordResetToken: null,
          passwordResetExpiresAt: null, lastLoginAt: null,
          chainCustomerId: null, customerAccountId: null, stripeCustomerId: null,
          marketingConsent: false, marketingConsentAt: new Date(),
        },
      })).count;
      counts.RestaurantCustomerAddress = (await tx.restaurantCustomerAddress.deleteMany({ where: { customerId: { in: customerIds } } })).count;
      counts.CustomerPushToken = (await tx.customerPushToken.deleteMany({ where: { customerId: { in: customerIds } } })).count;
      counts.GiftWalletPass = (await tx.giftWalletPass.updateMany({
        where: { customerId: { in: customerIds }, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "data-erasure", lastIpHash: null },
      })).count;
    }
    if (rewardAccountIds.length) {
      counts.RewardLedger = (await tx.rewardLedger.updateMany({ where: { accountId: { in: rewardAccountIds } }, data: { note: null } })).count;
    }
    if (orderIds.length) {
      counts.Order = (await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: {
          customerName: NAME_SENTINEL, customerEmail: null, customerPhone: null,
          deliveryAddress: null, deliveryCity: null, deliveryZip: null,
          deliveryLat: null, deliveryLng: null, deliveryAddressData: Prisma.DbNull,
          notes: null, ...nullPay,
        },
      })).count;
      counts.OrderItem = (await tx.orderItem.updateMany({ where: { orderId: { in: orderIds } }, data: { notes: null } })).count;
      counts.OrderRating = (await tx.orderRating.updateMany({ where: { orderId: { in: orderIds } }, data: { comment: null } })).count;
    }
    // Reservations are Restaurant-owned; match by email OR any known phone.
    counts.Reservation = (await tx.reservation.updateMany({
      where: {
        restaurantId,
        OR: [{ customerEmail: insensitive }, ...(phones.length ? [{ customerPhone: { in: phones } }] : [])],
      },
      data: {
        customerName: NAME_SENTINEL, customerEmail: null, customerPhone: null,
        notes: null, staffNotes: null, details: Prisma.DbNull,
        ...(opts?.nullPaymentIds ? { paymentIntentId: null } : {}),
      },
    })).count;
    // Nabil AI voice calls are keyed by caller phone. Anonymize the phone +
    // transcript/summary/recording but KEEP the row (duration, outcome, cost)
    // for analytics — same anonymize-not-delete principle as orders. (Retention
    // scrub of old transcripts past the window is a retention-cron follow-up.)
    if (phones.length) {
      counts.VoiceCall = (await tx.voiceCall.updateMany({
        where: { restaurantId, fromNumber: { in: phones } },
        data: { fromNumber: "REDACTED", transcript: Prisma.DbNull, summary: null, recordingUrl: null, customerId: null },
      })).count;
    }
    // Pending reward grants: revoke any still-pending (block claim by a recycled
    // address), then scrub the PII.
    await tx.pendingRewardGrant.updateMany({
      where: { restaurantId, email: insensitive, status: "pending" },
      data: { status: "revoked", revokedAt: new Date() },
    });
    counts.PendingRewardGrant = (await tx.pendingRewardGrant.updateMany({
      where: { restaurantId, email: insensitive },
      data: { email: deletedEmail(emailLower), name: NAME_SENTINEL, note: null },
    })).count;
  });

  // 4. Erasure implies do-not-email: suppress the ORIGINAL address so a future
  //    send (or re-import) can never reach this person again.
  await suppressEmail({ restaurantId, email: emailLower, reason: "erasure", source: "erasure" });

  // 5. Audit (no PII — only the hash).
  await prisma.dataRequestLog.create({
    data: {
      action: "delete", scope: "restaurant", restaurantId,
      subjectHash: sub, requestedVia: opts?.actor?.via ?? "self-token",
      actorId: opts?.actor?.userId ?? null,
      status: stripeStatus === "retry" ? "partial" : "completed",
      counts, stripeStatus,
    },
  }).catch((e) => console.error("[data-erasure] audit log failed", e));

  return { subjectHash: sub, scope: "restaurant", counts, stripeStatus };
}

/**
 * Platform-wide "right to be forgotten": anonymize the person at EVERY
 * restaurant, then the shared CustomerAccount (+ cascade children) + Prospect
 * rows. This is what a CASL/RTBF complaint needs.
 */
export async function anonymizePersonEverywhere(
  email: string,
  opts?: { nullPaymentIds?: boolean; actor?: EraseActor },
): Promise<EraseResult> {
  const emailLower = email.trim().toLowerCase();
  const sub = subjectHash(emailLower);
  const insensitive = { equals: emailLower, mode: "insensitive" as const };

  // Every restaurant this person is a Customer of (by email OR via the account).
  const account = await prisma.customerAccount.findFirst({ where: { email: insensitive }, select: { id: true } });
  const customers = await prisma.customer.findMany({
    where: { OR: [{ email: insensitive }, ...(account ? [{ customerAccountId: account.id }] : [])] },
    select: { restaurantId: true },
  });
  const restaurantIds = [...new Set(customers.map((c) => c.restaurantId))];

  const totals: Record<string, number> = {};
  let worstStripe: "deleted" | "skipped" | "retry" = "skipped";
  for (const rid of restaurantIds) {
    const r = await anonymizeCustomerByEmail(rid, emailLower, { nullPaymentIds: opts?.nullPaymentIds, actor: opts?.actor });
    for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v;
    if (r.stripeStatus === "retry") worstStripe = "retry";
    else if (r.stripeStatus === "deleted" && worstStripe !== "retry") worstStripe = "deleted";
  }

  // Every restaurant this email is a PROSPECT of — captured BEFORE the scrub
  // rewrites their email — so we can suppress even a prospect-only person (who
  // has no Customer rows and thus never went through anonymizeCustomerByEmail).
  // Without this, re-importing the same old list would resurrect them.
  const prospectRows = await prisma.prospect.findMany({
    where: { email: insensitive },
    select: { import: { select: { restaurantId: true } } },
  });
  const prospectRestaurantIds = [
    ...new Set(prospectRows.map((p) => p.import?.restaurantId).filter((x): x is string => !!x)),
  ];

  // Shared marketplace identity + its cascade children + prospect rows.
  await prisma.$transaction(async (tx) => {
    if (account) {
      totals.CustomerAddress = (await tx.customerAddress.deleteMany({ where: { customerAccountId: account.id } })).count;
      totals.CustomerPasswordResetToken = (await tx.customerPasswordResetToken.deleteMany({ where: { customerAccountId: account.id } })).count;
      totals.CustomerAccount = (await tx.customerAccount.update({
        where: { id: account.id },
        data: {
          email: deletedEmail(account.id), // unique column → seed with the id
          name: null, phone: null, passwordHash: null, emailVerifyToken: null, lastLoginAt: null,
        },
      })) ? 1 : 0;
    }
    // Prospect rows (cold-outreach) are email-keyed across all imports.
    totals.Prospect = (await tx.prospect.updateMany({
      where: { email: insensitive },
      data: { name: null, phone: null, email: deletedEmail(emailLower), unsubscribedAt: new Date() },
    })).count;
  });

  // Do-not-email suppression for prospect-only restaurants (customer
  // restaurants were already suppressed inside anonymizeCustomerByEmail).
  for (const rid of prospectRestaurantIds) {
    await suppressEmail({ restaurantId: rid, email: emailLower, reason: "erasure", source: "erasure" });
  }

  await prisma.dataRequestLog.create({
    data: {
      action: "delete", scope: "platform", restaurantId: null,
      subjectHash: sub, requestedVia: opts?.actor?.via ?? "superadmin",
      actorId: opts?.actor?.userId ?? null,
      status: worstStripe === "retry" ? "partial" : "completed",
      counts: totals, stripeStatus: worstStripe,
    },
  }).catch((e) => console.error("[data-erasure] platform audit log failed", e));

  return { subjectHash: sub, scope: "platform", counts: totals, stripeStatus: worstStripe };
}

/**
 * Retention scrub — anonymize the PII on a batch of OLD orders (called by the
 * retention cron once they pass the tax-retention window). Order/Reservation
 * level, NOT whole-customer (a still-active customer's oldest order aging out
 * must not wipe their account).
 */
export async function scrubOrderPii(orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const n = await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({ where: { orderId: { in: orderIds } }, data: { notes: null } });
    await tx.orderRating.updateMany({ where: { orderId: { in: orderIds } }, data: { comment: null } });
    return (await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: {
        customerName: NAME_SENTINEL, customerEmail: null, customerPhone: null,
        deliveryAddress: null, deliveryCity: null, deliveryZip: null,
        deliveryLat: null, deliveryLng: null, deliveryAddressData: Prisma.DbNull, notes: null,
      },
    })).count;
  });
  return n;
}

export type DsarBundle = {
  generatedAt: string;
  subject: string;
  account: unknown | null;
  customers: unknown[];
  orders: unknown[];
  reservations: unknown[];
  truncated: boolean;
};

/**
 * Data export (DSAR / "download my data"). Assembles the person's data across
 * the PII map, bounded for scale. Delivered by EMAIL to the on-file address —
 * never returned to a token bearer.
 */
export async function exportPersonData(scope: { restaurantId?: string; email: string }): Promise<DsarBundle> {
  const emailLower = scope.email.trim().toLowerCase();
  const insensitive = { equals: emailLower, mode: "insensitive" as const };
  const restWhere = scope.restaurantId ? { restaurantId: scope.restaurantId } : {};
  const ORDER_CAP = 5000;

  const [account, customers, orders, reservations] = await Promise.all([
    prisma.customerAccount.findFirst({
      where: { email: insensitive },
      select: { id: true, email: true, name: true, phone: true, emailVerifiedAt: true, createdAt: true },
    }),
    prisma.customer.findMany({
      where: { ...restWhere, email: insensitive },
      select: { id: true, restaurantId: true, name: true, email: true, phone: true, address: true, totalOrders: true, totalSpent: true, lastOrderAt: true, createdAt: true },
      take: 500,
    }),
    prisma.order.findMany({
      where: { ...restWhere, customerEmail: insensitive },
      select: { id: true, orderNumber: true, restaurantId: true, status: true, type: true, total: true, subtotal: true, taxAmount: true, tip: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: ORDER_CAP + 1,
    }),
    prisma.reservation.findMany({
      where: { ...restWhere, customerEmail: insensitive },
      select: { id: true, restaurantId: true, status: true, partySize: true, date: true, createdAt: true },
      take: 1000,
    }),
  ]);

  const truncated = orders.length > ORDER_CAP;
  return {
    generatedAt: new Date().toISOString(),
    subject: emailLower,
    account,
    customers,
    orders: truncated ? orders.slice(0, ORDER_CAP) : orders,
    reservations,
    truncated,
  };
}
