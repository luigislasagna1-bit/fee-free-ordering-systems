// Email transport via Resend.
// The Resend API key + From address are stored in the PlatformSettings table
// (managed by the super-admin at /superadmin/settings/email) and AES-encrypted
// at rest. Fallback to RESEND_API_KEY / EMAIL_FROM env vars for backward
// compatibility. When neither is configured, every helper logs to console.

import { Resend } from "resend";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { getDict, type Translator } from "@/lib/i18n-dict";

// Cached transport so we don't query PlatformSettings on every call.
// Invalidate by calling `resetEmailTransport()` after the super-admin saves.
let cached: { client: Resend | null; from: string; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getTransport(): Promise<{ client: Resend | null; from: string }> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return { client: cached.client, from: cached.from };
  }

  let apiKey: string | null = null;
  let from = process.env.EMAIL_FROM || "Fee Free Ordering <onboarding@resend.dev>";

  try {
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.resendApiKeyEnc && settings.resendApiKeyIv && settings.resendApiKeyTag && process.env.ENCRYPTION_KEY) {
      try {
        apiKey = decrypt(settings.resendApiKeyEnc, settings.resendApiKeyIv, settings.resendApiKeyTag);
      } catch (e: any) {
        console.error("[Email transport] Decryption of saved Resend key FAILED:", e?.message);
      }
    }
    if (settings?.emailFrom) from = settings.emailFrom;
  } catch (e: any) {
    console.error("[Email transport] PlatformSettings query failed:", e?.message);
  }

  if (!apiKey && process.env.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
  }

  const client = apiKey ? new Resend(apiKey) : null;
  cached = { client, from, loadedAt: Date.now() };
  return { client, from };
}

export function resetEmailTransport() {
  cached = null;
}

export async function isEmailEnabled(): Promise<boolean> {
  const { client } = await getTransport();
  return !!client;
}

export const EMAIL_ENABLED = true;

async function send({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: "no recipient" };
  const { client, from } = await getTransport();
  if (!client) {
    console.log("[Email placeholder]", to, "·", subject);
    return { success: true };
  }
  try {
    const { data, error } = await client.emails.send({ from, to, subject, html, text });
    if (error) {
      console.error("[Email send error]", { to, from, name: error.name, message: error.message });
      return { success: false, error: error.message };
    }
    console.log("[Email sent]", { to, from, id: data?.id });
    return { success: true };
  } catch (e: any) {
    console.error("[Email transport error]", { to, from, message: e?.message ?? String(e) });
    return { success: false, error: e?.message ?? "Transport error" };
  }
}

// ─── Layout helper ────────────────────────────────────────────────────────────
/**
 * Module-scoped imprint override. Set this per-send via `setEmailImprint()`
 * (called by `src/lib/notifications.ts` when the restaurant is under a
 * whitelabel reseller) so the wrap() footer shows the reseller's brand instead
 * of "Fee Free Ordering Systems". Always cleared in a finally block so one
 * send's override never leaks to the next.
 */
let activeImprint: string | null = null;
export function setEmailImprint(imprint: string | null) {
  activeImprint = imprint;
}

function wrap(title: string, body: string) {
  const footer = activeImprint ?? "Fee Free Ordering Systems";
  return `<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f6f6f6; padding:24px; color:#111;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <h1 style="margin:0 0 12px; font-size:20px; color:#111;">${title}</h1>
    ${body}
    <hr style="border:none; border-top:1px solid #eee; margin:24px 0">
    <p style="font-size:12px; color:#888; margin:0;">${footer}</p>
  </div>
</body></html>`;
}

function fmtItems(items?: { name: string; quantity: number; price: number }[]) {
  if (!items?.length) return "";
  return `<ul style="padding-left:18px; margin:8px 0;">${items.map(i =>
    `<li>${i.quantity}× ${i.name} — $${i.price.toFixed(2)}</li>`,
  ).join("")}</ul>`;
}

// Translates the canonical order-type slug ("delivery"/"pickup"/etc) for use
// inside email body text. Falls back to the raw slug if no mapping exists.
function localizeOrderType(type: string, t: Translator): string {
  const v = t(`receipt.orderTypesLower.${type}`);
  return v.startsWith("receipt.") ? type : v;
}

// ─── Order events ─────────────────────────────────────────────────────────────

interface OrderEmailParams {
  to: string;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  orderType: string;
  estimatedTime: number;
  trackingUrl: string;
  /** Restaurant defaultLanguage. Defaults to "en". */
  locale?: string;
}

export async function sendOrderConfirmationEmail(params: OrderEmailParams) {
  const t = await getDict(params.locale);
  const subject = t("email.orderConfirmed.subject", { orderNumber: params.orderNumber });
  return send({
    to: params.to,
    subject,
    html: wrap(t("email.orderConfirmed.greeting", { customer: params.customerName }), `
      <p>${t("email.orderConfirmed.body", { restaurant: params.restaurantName })}</p>
      <p>${t("receipt.customer.orderNumber")} <strong>${params.orderNumber}</strong></p>
      <p>${t("email.orderConfirmed.typeLabel")}: ${localizeOrderType(params.orderType, t)} · ${t("email.orderConfirmed.estimatedLabel")}: ~${params.estimatedTime} ${t("email.orderConfirmed.minutesLabel")}</p>
      ${fmtItems(params.items)}
      <p style="font-size:16px; margin-top:12px;"><strong>${t("email.orderConfirmed.totalLabel")}: $${params.total.toFixed(2)}</strong></p>
      <p><a href="${params.trackingUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.common.trackOrder")}</a></p>
    `),
  });
}

export async function sendNewOrderNotificationEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  total: number;
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const subject = t("email.newOrder.subject", { orderNumber: params.orderNumber, restaurant: params.restaurantName });
  return send({
    to: params.to,
    subject,
    html: wrap(t("email.newOrder.title"), `
      <p>${t("email.newOrder.body", { customer: params.customerName, orderNumber: params.orderNumber, total: `$${params.total.toFixed(2)}` })}</p>
      <p><a href="${params.dashboardUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.newOrder.openAdmin")}</a></p>
    `),
  });
}

export async function sendOrderStatusUpdateEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  estimatedReady?: Date;
  rejectionReason?: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const localizedStatus = t(`kitchen.${params.status}`);
  const statusText = localizedStatus.startsWith("kitchen.") ? params.status : localizedStatus;
  const subject = t("email.orderStatus.subject", { orderNumber: params.orderNumber });
  return send({
    to: params.to,
    subject,
    html: wrap(t("email.orderStatus.title"), `
      <p>${t("email.orderStatus.body", { orderNumber: params.orderNumber, status: statusText })}</p>
      ${params.estimatedReady ? `<p>${t("email.orderStatus.estimatedReady")}: ${params.estimatedReady.toLocaleString()}</p>` : ""}
      ${params.rejectionReason ? `<p>${t("email.orderStatus.reason")}: ${params.rejectionReason}</p>` : ""}
    `),
  });
}

export async function sendOrderRejectedEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  reason?: string;
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.orderRejected.subject", { orderNumber: params.orderNumber }),
    html: wrap(t("email.orderRejected.title"), `
      <p>${t("email.orderRejected.body", { orderNumber: params.orderNumber })}</p>
      ${params.reason ? `<p>${t("email.orderRejected.reason")}: ${params.reason}</p>` : ""}
      <p><a href="${params.dashboardUrl}">${t("email.common.viewInAdmin")}</a></p>
    `),
  });
}

export async function sendOrderCanceledEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.orderCanceled.subject", { orderNumber: params.orderNumber }),
    html: wrap(t("email.orderCanceled.title"), `
      <p>${t("email.orderCanceled.body", { orderNumber: params.orderNumber })}</p>
      <p><a href="${params.dashboardUrl}">${t("email.common.viewInAdmin")}</a></p>
    `),
  });
}

// ─── Reservations ─────────────────────────────────────────────────────────────

export async function sendReservationConfirmation(params: {
  to: string;
  customerName: string;
  restaurantName: string;
  partySize: number;
  date: string;
  time: string;
  confirmationCode: string;
  status: "pending" | "confirmed";
  depositPaid?: boolean;
  depositAmount?: number;
  preOrderTotal?: number;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const title = params.status === "confirmed"
    ? t("email.reservationConfirmed.titleConfirmed")
    : t("email.reservationConfirmed.titlePending");
  const body = params.status === "confirmed"
    ? t("email.reservationConfirmed.bodyConfirmed", { restaurant: params.restaurantName })
    : t("email.reservationConfirmed.bodyPending", { restaurant: params.restaurantName });
  return send({
    to: params.to,
    subject: t("email.reservationConfirmed.subject"),
    html: wrap(title, `
      <p>${t("email.common.thanks")} ${params.customerName},</p>
      <p>${body}</p>
      <ul style="padding-left:18px;">
        <li>${t("email.reservationConfirmed.partySize")}: ${params.partySize}</li>
        <li>${t("email.reservationConfirmed.date")}: ${params.date} · ${t("email.reservationConfirmed.time")}: ${params.time}</li>
        <li>${t("email.reservationConfirmed.confirmationCode")}: <strong style="font-family:monospace;letter-spacing:2px">${params.confirmationCode}</strong></li>
        ${params.depositAmount ? `<li>${t("email.reservationConfirmed.deposit")}: $${params.depositAmount.toFixed(2)} ${params.depositPaid ? "✓" : "—"}</li>` : ""}
      </ul>
    `),
  });
}

export async function sendNewReservationNotification(params: {
  to: string;
  restaurantName: string;
  customerName: string;
  partySize: number;
  date: string;
  time: string;
  confirmationCode: string;
  status: "pending" | "confirmed";
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const localizedStatus = params.status === "confirmed"
    ? t("kitchen.confirmed")
    : t("kitchen.pending");
  return send({
    to: params.to,
    subject: t("email.newReservation.subject", { restaurant: params.restaurantName }),
    html: wrap(t("email.newReservation.title", { status: localizedStatus }), `
      <p>${t("email.newReservation.body", { customer: params.customerName, party: params.partySize, date: params.date, time: params.time })}</p>
      <p>${t("email.newReservation.confirmationCode")}: <strong style="font-family:monospace">${params.confirmationCode}</strong></p>
      <p><a href="${params.dashboardUrl}">${t("email.common.viewInAdmin")}</a></p>
    `),
  });
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string | null;
  resetUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.passwordReset.subject"),
    html: wrap(t("email.passwordReset.title"), `
      <p>${t("email.common.thanks")} ${params.name || ""},</p>
      <p>${t("email.passwordReset.body")}</p>
      <p><a href="${params.resetUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.passwordReset.button")}</a></p>
      <p style="font-size:12px;color:#888;">${t("email.common.ifYouDidntRequest")}</p>
    `),
  });
}

// ─── Email-settings test ─────────────────────────────────────────────────────

export async function sendEmailSettingsTest(params: { to: string; locale?: string }) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.settingsTest.subject"),
    html: wrap(t("email.settingsTest.title"), `
      <p>${t("email.settingsTest.body")}</p>
    `),
  });
}

// ─── Signup confirmation ──────────────────────────────────────────────────────

export async function sendSignupConfirmationEmail(params: {
  to: string;
  name: string | null;
  restaurantName: string;
  loginUrl: string;
  /** When provided, the welcome email leads with a "Verify your email"
   *  button instead of (or in addition to) the Log in CTA. Phase 1 of the
   *  free-core redesign requires email verification before publishing. */
  verifyUrl?: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const verifyBlock = params.verifyUrl
    ? `<p>${t("email.signup.verifyBody")}</p>
       <p><a href="${params.verifyUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.signup.verifyButton")}</a></p>
       <p style="margin-top:24px;font-size:14px;color:#6b7280">${t("email.signup.orLogin")}</p>`
    : "";
  return send({
    to: params.to,
    subject: t("email.signup.subject"),
    html: wrap(t("email.signup.title"), `
      <p>${t("email.common.thanks")} ${params.name || params.restaurantName},</p>
      <p>${t("email.signup.body", { restaurant: params.restaurantName })}</p>
      ${verifyBlock}
      <p><a href="${params.loginUrl}" style="display:inline-block;background:${params.verifyUrl ? "#6b7280" : "#10b981"};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.signup.button")}</a></p>
    `),
  });
}

/** Standalone "verify your email" email — used by the resend-verification
 *  button in the admin layout banner. Same template as the signup version
 *  but without the welcome copy. */
export async function sendVerifyEmail(params: {
  to: string;
  name: string | null;
  verifyUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.verify.subject"),
    html: wrap(t("email.verify.title"), `
      <p>${t("email.common.thanks")} ${params.name || ""},</p>
      <p>${t("email.verify.body")}</p>
      <p><a href="${params.verifyUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${t("email.verify.button")}</a></p>
      <p style="margin-top:24px;font-size:13px;color:#6b7280">${t("email.verify.ifYouDidntRequest")}</p>
    `),
  });
}

/** Invite-a-new-location email. Sent when a brand owner generates an invite
 *  link from the brand dashboard and supplies a recipient email address.
 *  The recipient gets a one-click button that lands at /signup?invite=token,
 *  which our invite-aware signup flow turns into a fresh Restaurant + User
 *  linked to the brand via parentRestaurantId. */
export async function sendLocationInviteEmail(params: {
  to: string;
  brandName: string;
  suggestedName: string | null;
  inviteUrl: string;
}) {
  const friendlyName = params.suggestedName ? `the new ${params.suggestedName} location` : "a new location";
  return send({
    to: params.to,
    subject: `You've been invited to set up ${friendlyName} on Fee Free Ordering`,
    html: wrap(`Set up ${friendlyName}`, `
      <p>Hi there,</p>
      <p>The owner of <strong>${params.brandName}</strong> has invited you to set up ${friendlyName} on Fee Free Ordering.</p>
      <p>This new location will operate independently — its own menu, orders, and payments — but will be linked to <strong>${params.brandName}</strong> as part of the chain.</p>
      <p style="margin-top:20px"><a href="${params.inviteUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Set up the new location</a></p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px">If the button doesn't work, paste this URL into your browser:<br/>${params.inviteUrl}</p>
      <p style="font-size:12px;color:#6b7280">This link expires in 30 days and can only be used once.</p>
    `),
  });
}

// ─── Trial expiring ──────────────────────────────────────────────────────────

/**
 * Generic billing notification — used by Stripe webhook handlers when a
 * subscription event needs to be surfaced to the restaurant owner
 * (payment failed, 3DS auth needed, dispute, etc.). Plain wording so we
 * don't need a new translation key per scenario.
 */
export async function sendBillingNotificationEmail(params: {
  to: string;
  restaurantName: string;
  subject: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const cta = params.ctaUrl && params.ctaLabel
    ? `<p style="margin-top:16px"><a href="${params.ctaUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${params.ctaLabel}</a></p>`
    : "";
  return send({
    to: params.to,
    subject: params.subject,
    html: wrap(params.headline, `
      <p>Hi ${params.restaurantName},</p>
      <p>${params.body}</p>
      ${cta}
    `),
  });
}

export async function sendTrialExpiringEmail(params: {
  to: string;
  restaurantName: string;
  daysLeft: number;
  upgradeUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.trialExpiring.subject", { days: params.daysLeft }),
    html: wrap(t("email.trialExpiring.title"), `
      <p>${t("email.trialExpiring.body", { restaurant: params.restaurantName, days: params.daysLeft })}</p>
      <p><a href="${params.upgradeUrl}">${t("email.common.viewInAdmin")}</a></p>
    `),
  });
}

// ─── Digest / report emails (Phase E4) ─────────────────────────────────────

/** Stats payload shared by both daily and monthly digests. All money values
 *  are in dollars (not cents) — this template formats them. */
export interface DigestStats {
  restaurantName: string;
  periodLabel: string;            // e.g. "Friday, May 15, 2026" or "May 2026"
  comparisonLabel: string;        // e.g. "vs previous Friday" or "vs previous month"

  sales: number;
  salesDelta: number;             // percent change vs previous period (signed)
  orders: number;
  ordersDelta: number;
  avgOrderValue: number;
  avgOrderValueDelta: number;
  tableReservations: number;
  reservationsDelta: number;

  pickupOrders: number;
  pickupSales: number;
  deliveryOrders: number;
  deliverySales: number;
  dineInOrders: number;
  dineInSales: number;

  offlinePayments: number;        // count
  offlinePaymentsAmount: number;
  onlinePayments: number;
  onlinePaymentsAmount: number;

  subTotals: number;
  taxAmount: number;
  deliveryFees: number;
  tips: number;
  otherFees: number;
  total: number;
}

/** Number formatter for delta percentages: -23 → "−23%", 5 → "+5%", 0 → "—". */
function fmtDelta(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return "—";
  const sign = n > 0 ? "+" : "";
  const color = n > 0 ? "#16a34a" : "#dc2626";
  return `<span style="color:${color}">${sign}${Math.round(n)}%</span>`;
}

function fmtMoney(n: number): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function digestHtml(s: DigestStats, kind: "daily" | "monthly", t: Translator): string {
  const headline =
    kind === "daily" ? t("email.digest.headlineDaily") : t("email.digest.headlineMonthly");
  return `
    <h2 style="font-size:14px; color:#666; margin:0 0 8px;">${headline}</h2>
    <p style="margin:0 0 16px; color:#999;">${s.periodLabel}</p>
    <p>${t("email.digest.hi")}</p>
    <p>${t("email.digest.intro", { restaurant: s.restaurantName })}</p>

    <h3 style="font-size:14px; color:#10b981; margin:20px 0 8px;">${t("email.digest.salesPerformance")}
      <span style="color:#888; font-weight:normal; font-size:12px;">(${s.comparisonLabel})</span>
    </h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0; width:50%;"><strong>${t("email.digest.sales")}</strong><br>
          <span style="font-size:18px;">${fmtMoney(s.sales)}</span> ${fmtDelta(s.salesDelta)}
        </td>
        <td style="padding:8px 0;"><strong>${t("email.digest.orders")}</strong><br>
          <span style="font-size:18px;">${s.orders}</span> ${fmtDelta(s.ordersDelta)}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;"><strong>${t("email.digest.avgOrderValue")}</strong><br>
          <span style="font-size:18px;">${fmtMoney(s.avgOrderValue)}</span> ${fmtDelta(s.avgOrderValueDelta)}
        </td>
        <td style="padding:8px 0;"><strong>${t("email.digest.tableReservations")}</strong><br>
          <span style="font-size:18px;">${s.tableReservations}</span> ${fmtDelta(s.reservationsDelta)}
        </td>
      </tr>
    </table>

    <h3 style="font-size:14px; color:#10b981; margin:24px 0 8px;">${t("email.digest.channels")}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <tr>
        <td style="padding:6px 0;">${t("email.digest.pickup")}</td>
        <td style="text-align:right;">${s.pickupOrders} · ${fmtMoney(s.pickupSales)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;">${t("email.digest.delivery")}</td>
        <td style="text-align:right;">${s.deliveryOrders} · ${fmtMoney(s.deliverySales)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;">${t("email.digest.dineIn")}</td>
        <td style="text-align:right;">${s.dineInOrders} · ${fmtMoney(s.dineInSales)}</td>
      </tr>
    </table>

    <h3 style="font-size:14px; color:#10b981; margin:24px 0 8px;">${t("email.digest.payments")}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <tr>
        <td style="padding:6px 0;">${t("email.digest.offlinePayments")}</td>
        <td style="text-align:right;">${s.offlinePayments} · ${fmtMoney(s.offlinePaymentsAmount)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;">${t("email.digest.onlinePayments")}</td>
        <td style="text-align:right;">${s.onlinePayments} · ${fmtMoney(s.onlinePaymentsAmount)}</td>
      </tr>
    </table>

    <h3 style="font-size:14px; color:#10b981; margin:24px 0 8px;">${t("email.digest.salesBreakdown")}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <tr><td style="padding:6px 0;">${t("email.digest.subTotals")}</td><td style="text-align:right;">${fmtMoney(s.subTotals)}</td></tr>
      <tr><td style="padding:6px 0;">${t("email.digest.tax")}</td><td style="text-align:right;">${fmtMoney(s.taxAmount)}</td></tr>
      <tr><td style="padding:6px 0;">${t("email.digest.deliveryFees")}</td><td style="text-align:right;">${fmtMoney(s.deliveryFees)}</td></tr>
      <tr><td style="padding:6px 0;">${t("email.digest.tips")}</td><td style="text-align:right;">${fmtMoney(s.tips)}</td></tr>
      <tr><td style="padding:6px 0;">${t("email.digest.otherFees")}</td><td style="text-align:right;">${fmtMoney(s.otherFees)}</td></tr>
      <tr style="border-top:1px solid #eee;"><td style="padding:8px 0;"><strong>${t("email.digest.total")}</strong></td><td style="text-align:right;"><strong>${fmtMoney(s.total)}</strong></td></tr>
    </table>
  `;
}

export async function sendDailyDigestEmail(params: { to: string; stats: DigestStats; locale?: string }) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.digest.subjectDaily", {
      restaurant: params.stats.restaurantName,
      period: params.stats.periodLabel,
    }),
    html: wrap("", digestHtml(params.stats, "daily", t)),
  });
}

export async function sendMonthlyDigestEmail(params: { to: string; stats: DigestStats; locale?: string }) {
  const t = await getDict(params.locale);
  return send({
    to: params.to,
    subject: t("email.digest.subjectMonthly", {
      restaurant: params.stats.restaurantName,
      period: params.stats.periodLabel,
    }),
    html: wrap("", digestHtml(params.stats, "monthly", t)),
  });
}
