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
import { deleteRecording } from "@/lib/voice/twilio-recording";
import { phoneDigitsKey } from "@/lib/phone";

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
 *
 * `exported` closes the other half of the same duty (2026-08-15). This map was
 * built for DELETION and did its job, but exportPersonData was never brought
 * along: we correctly recorded that we hold a caller's full Nabil transcript,
 * and a "download my data" request returned no trace of it. Access and erasure
 * are the same obligation, so the map now names the DSAR bundle key each table
 * lands in — or `false` with a stated reason. data-erasure.test.ts asserts every
 * named key is actually present in the bundle, so adding a table here without
 * exporting it fails the build.
 */
/** What a call report / its notes read after the caller asked to be forgotten. */
export const REDACTED_REPORT_TEXT = "[removed at the caller's request]";

export const PII_ERASURE_MAP = {
  Customer: { scope: "restaurant", action: "anonymize", exported: "customers", fields: ["name", "email", "phone", "address", "notes", "passwordHash", "emailVerifyToken", "passwordResetToken", "lastLoginAt", "chainCustomerId", "customerAccountId", "stripeCustomerId"] },
  RestaurantCustomerAddress: { scope: "restaurant", action: "delete", exported: "addresses", fields: ["street", "city", "state", "zip", "lat", "lng"] },
  Order: { scope: "restaurant", action: "anonymize", exported: "orders", fields: ["customerName", "customerEmail", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryZip", "deliveryLat", "deliveryLng", "deliveryAddressData", "notes"] },
  OrderItem: { scope: "restaurant", action: "anonymize", exported: "orderItemNotes", fields: ["notes"] },
  OrderRating: { scope: "restaurant", action: "anonymize", exported: "orderRatings", fields: ["comment"] },
  Reservation: { scope: "restaurant", action: "anonymize", exported: "reservations", fields: ["customerName", "customerEmail", "customerPhone", "notes", "staffNotes", "details"] },
  RewardLedger: { scope: "restaurant", action: "anonymize", exported: false, fields: ["note"] }, // not exported: the only PII column is a staff/system `note` on a ledger line; the balance and history the customer owns are live in their own account
  GiftWalletPass: { scope: "restaurant", action: "revoke", exported: false, fields: ["lastIpHash"] }, // not exported: a salted IP hash is not intelligible personal data and handing it back tells them nothing
  CustomerPushToken: { scope: "restaurant", action: "delete", exported: false, fields: ["token"] }, // not exported: a device push token is a credential, not personal data — mailing it out would be a security wart
  PendingRewardGrant: { scope: "restaurant", action: "anonymize", exported: false, fields: ["email", "name", "note"] }, // not exported: an unclaimed gift addressed TO the subject; its only PII is the address the request itself was made from
  EmailSuppression: { scope: "restaurant", action: "keep", exported: false, fields: [] }, // kept: proves do-not-email
  VoiceCall: { scope: "restaurant", action: "anonymize", exported: "voiceCalls", fields: ["fromNumber", "fromDigits", "transcript", "summary", "recordingUrl", "recordingSid", "recordingDurationSeconds", "customerId"] }, // Nabil AI; matched on fromDigits — fromNumber is E.164 and matched NOTHING (keep call duration/outcome/cost); audio DELETED at Twilio first, and a FAILED delete keeps recordingSid so a retry can still reach it
  VoiceCallEvent: { scope: "restaurant", action: "delete", exported: false, fields: ["payload"] }, // Nabil AI event log (what the caller said, tool inputs/outputs, cart, address — redacted at write but still speech). DELETED (not anonymized) via the parent VoiceCall's fromDigits, BEFORE that row's fromDigits is nulled. Timings/versions live on VoiceCall, so nothing analytic is lost. Not exported: it is the same speech as VoiceCall.transcript, which IS exported, plus internal tool payloads.
  VoiceCallReport: { scope: "restaurant", action: "anonymize", exported: false, fields: ["description", "resolution"] }, // Nabil AI "Report this call" (2026-08-16): STAFF-typed text about a caller's call, can name the caller. Scrubbed via the parent VoiceCall's fromDigits BEFORE that row is nulled; topic/status/timestamps stay for the platform's own defect history. Not exported: written by the restaurant about its own system, not by or to the caller.
  VoiceCallReportComment: { scope: "restaurant", action: "anonymize", exported: false, fields: ["body"] }, // the notes thread on a call report — same rule, same key; not exported for the same reason.
  // VoiceMenuSnapshot: NOT listed on purpose — it is the menu payload keyed by
  // content hash (items, prices, options). Restaurant data, no customer PII.
  BlockedCaller: { scope: "restaurant", action: "keep", exported: false, fields: [] }, // kept: do-not-serve record, same principle as EmailSuppression
  CustomerAccount: { scope: "platform", action: "anonymize", exported: "account", fields: ["email", "name", "phone", "passwordHash", "emailVerifyToken", "lastLoginAt"] },
  CustomerAddress: { scope: "platform", action: "delete", exported: "accountAddresses", fields: ["street", "city", "state", "zip", "country"] },
  CustomerPasswordResetToken: { scope: "platform", action: "delete", exported: false, fields: ["token"] }, // not exported: a credential
} as const;

/** A DSAR bundle section named by the map above. */
export type DsarSection = Extract<
  (typeof PII_ERASURE_MAP)[keyof typeof PII_ERASURE_MAP]["exported"],
  string
>;

/** The DSAR bundle keys the map promises. exportPersonData MUST fill every one
 *  (asserted in data-erasure.test.ts). */
export const DSAR_EXPORTED_SECTIONS: DsarSection[] = [
  ...new Set(
    Object.values(PII_ERASURE_MAP)
      .map((e) => e.exported)
      .filter((k): k is DsarSection => typeof k === "string"),
  ),
];

export type EraseActor = { via: "self-token" | "admin" | "superadmin" | "cron-retention"; userId?: string };
export type EraseResult = {
  subjectHash: string;
  scope: "restaurant" | "platform";
  counts: Record<string, number>;
  stripeStatus: "deleted" | "skipped" | "retry";
  /** Call recordings whose audio Twilio refused to delete. >0 means the erasure
   *  is genuinely PARTIAL: the audio is still sitting in the Twilio account, and
   *  those rows deliberately keep their recordingSid so a retry can still reach
   *  it. Reported as such in DataRequestLog.status. */
  recordingsPending: number;
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

  // 🛡️ The same person's number reaches us in several shapes — Twilio sends
  // E.164 ("+14168338405"), checkout stores whatever was typed ("(416)
  // 833-8405", "4168338405"). Matching VoiceCall on `fromNumber` therefore
  // matched NOTHING, and this function reported a successful erasure while
  // leaving the caller's number, their entire transcript, the AI summary and
  // the Twilio audio in place. Match on the normalized key instead.
  const phoneKeys = [...new Set(phones.map((p) => phoneDigitsKey(p)).filter((x): x is string => !!x))];

  const rewardAccounts = customerIds.length
    ? await prisma.rewardAccount.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
    : [];
  const rewardAccountIds = rewardAccounts.map((a) => a.id);

  // 2. Stripe deletes (outside the DB transaction).
  const stripeStatus = await deleteStripeCustomers(restaurantId, stripeIds);

  // 2b. Nabil AI call recordings (network, also outside the transaction):
  // delete the actual audio at Twilio BEFORE nulling our pointer to it,
  // otherwise the voice data would live on unreferenced in the Twilio account.
  // A Twilio failure never aborts the erasure — but it must not be reported as
  // a success either.
  //
  // ⚠️ This used to log the failure and then null recordingSid anyway, which is
  // the worst of both worlds: the caller's audio stayed alive at Twilio AND we
  // discarded the only handle that could ever delete it, while telling the
  // requester their data was gone. Failures are now remembered — their rows keep
  // recordingSid (and nothing else), and the request is logged "partial" so a
  // retry is possible and visible. (2026-08-15)
  const failedRecordingSids: string[] = [];
  if (phoneKeys.length) {
    const recordings = await prisma.voiceCall.findMany({
      where: { restaurantId, fromDigits: { in: phoneKeys }, recordingSid: { not: null } },
      select: { recordingSid: true },
    });
    for (const r of recordings) {
      if (!r.recordingSid) continue;
      const deleted = await deleteRecording(r.recordingSid);
      if (!deleted) {
        failedRecordingSids.push(r.recordingSid);
        console.error("[data-erasure] twilio recording delete failed", { restaurantId, recordingSid: r.recordingSid });
      }
    }
  }

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
    if (phoneKeys.length) {
      // The event log holds the caller's actual words + every tool payload —
      // delete it outright. MUST run before the VoiceCall scrub below nulls
      // fromDigits, or the join finds nothing and the events survive.
      counts.VoiceCallEvent = (await tx.voiceCallEvent.deleteMany({
        where: { call: { restaurantId, fromDigits: { in: phoneKeys } } },
      })).count;
      // A restaurant's "Report this call" + its notes thread are staff-typed
      // text ABOUT this caller's call and can name them — scrub the words, keep
      // the rows (topic/status/dates are the platform's own defect history).
      // Same key and same ordering rule as the event log: before the VoiceCall
      // scrub nulls fromDigits.
      counts.VoiceCallReport = (await tx.voiceCallReport.updateMany({
        where: { restaurantId, call: { fromDigits: { in: phoneKeys } } },
        data: { description: REDACTED_REPORT_TEXT, resolution: null },
      })).count;
      counts.VoiceCallReportComment = (await tx.voiceCallReportComment.updateMany({
        where: { report: { restaurantId, call: { fromDigits: { in: phoneKeys } } } },
        data: { body: REDACTED_REPORT_TEXT },
      })).count;

      // Rows whose audio Twilio would NOT delete: scrub every PII field EXCEPT
      // recordingSid. The playable URL still goes (nothing in the admin can
      // reach the audio), but the SID is the only handle that can still delete
      // it — dropping that strands the recording at Twilio permanently. Runs
      // FIRST, because the general scrub below matches on fromDigits, which
      // this nulls.
      let keptForRetry = 0;
      if (failedRecordingSids.length) {
        keptForRetry = (await tx.voiceCall.updateMany({
          where: { restaurantId, fromDigits: { in: phoneKeys }, recordingSid: { in: failedRecordingSids } },
          data: {
            fromNumber: "REDACTED", fromDigits: null, transcript: Prisma.DbNull, summary: null, customerId: null,
            recordingUrl: null, recordingDurationSeconds: null,
          },
        })).count;
      }

      counts.VoiceCall = keptForRetry + (await tx.voiceCall.updateMany({
        where: { restaurantId, fromDigits: { in: phoneKeys } },
        data: {
          fromNumber: "REDACTED", fromDigits: null, transcript: Prisma.DbNull, summary: null, customerId: null,
          recordingUrl: null, recordingSid: null, recordingDurationSeconds: null,
        },
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
      // Audio still at Twilio is an incomplete erasure, exactly like a Stripe
      // customer we couldn't delete. Saying "completed" would be a lie we'd
      // never find out about.
      status: stripeStatus === "retry" || failedRecordingSids.length > 0 ? "partial" : "completed",
      counts, stripeStatus,
    },
  }).catch((e) => console.error("[data-erasure] audit log failed", e));

  return {
    subjectHash: sub, scope: "restaurant", counts, stripeStatus,
    recordingsPending: failedRecordingSids.length,
  };
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
  let recordingsPending = 0;
  for (const rid of restaurantIds) {
    const r = await anonymizeCustomerByEmail(rid, emailLower, { nullPaymentIds: opts?.nullPaymentIds, actor: opts?.actor });
    for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v;
    if (r.stripeStatus === "retry") worstStripe = "retry";
    else if (r.stripeStatus === "deleted" && worstStripe !== "retry") worstStripe = "deleted";
    // A partial erasure at ONE restaurant makes the platform-wide one partial.
    recordingsPending += r.recordingsPending;
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
      status: worstStripe === "retry" || recordingsPending > 0 ? "partial" : "completed",
      counts: totals, stripeStatus: worstStripe,
    },
  }).catch((e) => console.error("[data-erasure] platform audit log failed", e));

  return { subjectHash: sub, scope: "platform", counts: totals, stripeStatus: worstStripe, recordingsPending };
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
  accountAddresses: unknown[];
  customers: unknown[];
  addresses: unknown[];
  orders: unknown[];
  orderItemNotes: unknown[];
  orderRatings: unknown[];
  reservations: unknown[];
  voiceCalls: unknown[];
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
      select: { id: true, restaurantId: true, name: true, email: true, phone: true, address: true, totalOrders: true, totalSpent: true, totalCreditSpent: true, lastOrderAt: true, createdAt: true },
      take: 500,
    }),
    prisma.order.findMany({
      where: { ...restWhere, customerEmail: insensitive },
      select: { id: true, orderNumber: true, restaurantId: true, status: true, type: true, total: true, subtotal: true, taxAmount: true, tip: true, customerPhone: true, createdAt: true },
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
  const keptOrders = truncated ? orders.slice(0, ORDER_CAP) : orders;
  const orderIds = keptOrders.map((o) => o.id);
  const customerIds = customers.map((c) => c.id);

  // 🛡️ Nabil AI calls are keyed by the CALLER'S PHONE, not their email, and the
  // same number reaches us in several shapes. Use the SAME normalized key the
  // erasure path uses — matching on anything else finds nothing, which is
  // precisely how erasure once reported success while leaving every transcript
  // in place.
  const phoneKeys = [
    ...new Set(
      [...customers.map((c) => c.phone), ...keptOrders.map((o) => o.customerPhone)]
        .map((p) => (p ? phoneDigitsKey(p) : null))
        .filter((x): x is string => !!x),
    ),
  ];

  // Second pass: the child rows, all keyed off ids we now hold. Every query is
  // capped and rides an existing index; this runs per DSAR request, not per
  // page view.
  const [accountAddresses, addresses, orderItemNotes, orderRatings, voiceCalls] = await Promise.all([
    account
      ? prisma.customerAddress.findMany({
          where: { customerAccountId: account.id },
          select: { id: true, label: true, street: true, city: true, state: true, zip: true, country: true, createdAt: true },
          take: 200,
        })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.restaurantCustomerAddress.findMany({
          where: { customerId: { in: customerIds } },
          select: { id: true, customerId: true, label: true, street: true, city: true, state: true, zip: true, country: true, lat: true, lng: true, createdAt: true },
          take: 200,
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.orderItem.findMany({
          // Only rows that actually carry a note — the item names are the
          // restaurant's menu, not the subject's data.
          where: { orderId: { in: orderIds }, notes: { not: null } },
          select: { id: true, orderId: true, notes: true },
          take: 2000,
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.orderRating.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true, orderId: true, score: true, comment: true, createdAt: true },
          take: 2000,
        })
      : Promise.resolve([]),
    phoneKeys.length
      ? prisma.voiceCall.findMany({
          where: { ...restWhere, fromDigits: { in: phoneKeys } },
          select: {
            id: true, restaurantId: true, startedAt: true, durationSeconds: true,
            direction: true, outcome: true, language: true, sentiment: true,
            orderNumber: true, reservationCode: true,
            transcript: true, summary: true,
            recordingSid: true, recordingDurationSeconds: true,
          },
          orderBy: { startedAt: "desc" },
          take: 1000,
        })
      : Promise.resolve([]),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    subject: emailLower,
    account,
    accountAddresses,
    customers,
    addresses,
    orders: keptOrders,
    orderItemNotes,
    orderRatings,
    reservations,
    // The Twilio Recording SID is an internal handle — useless without our
    // credentials and meaningless to the subject. Hand back the FACT that a
    // recording exists and how long it runs, never the pointer to it.
    voiceCalls: voiceCalls.map(({ recordingSid, ...call }) => ({ ...call, hasRecording: !!recordingSid })),
    truncated,
  };
}
