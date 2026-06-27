// Email transport via Resend.
//
// The Resend API key + From address are stored in the PlatformSettings table
// (managed by the super-admin at /superadmin/settings/email) and AES-encrypted
// at rest. Fallback to RESEND_API_KEY / EMAIL_FROM env vars for backward
// compatibility. When neither is configured, every helper logs to console.
//
// Templates: all email bodies render through React Email components in
// src/emails/templates/. The visual design (emerald status / navy
// transactional / navy digest headers, GloriaFood-inspired layouts) lives
// in src/emails/components/. The wrappers below are thin — they marshal
// params, render the template, and hand HTML to send().

import { Resend } from "resend";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { getDict, type Translator } from "@/lib/i18n-dict";
import { formatTime } from "@/lib/format-time";
import { renderEmail } from "@/emails/render";
import OrderConfirmation         from "@/emails/templates/OrderConfirmation";
import KitchenNotification       from "@/emails/templates/KitchenNotification";
import OrderStatusUpdate         from "@/emails/templates/OrderStatusUpdate";
import OrderDelayed              from "@/emails/templates/OrderDelayed";
import OrderRejected             from "@/emails/templates/OrderRejected";
import OrderCanceled             from "@/emails/templates/OrderCanceled";
import OrderRefund               from "@/emails/templates/OrderRefund";
import ReservationConfirmation   from "@/emails/templates/ReservationConfirmation";
import NewReservationNotification from "@/emails/templates/NewReservationNotification";
import PasswordReset             from "@/emails/templates/PasswordReset";
import EmailSettingsTest         from "@/emails/templates/EmailSettingsTest";
import SignupConfirmation        from "@/emails/templates/SignupConfirmation";
import VerifyEmail               from "@/emails/templates/VerifyEmail";
import LocationInvite            from "@/emails/templates/LocationInvite";
import LocationWelcome           from "@/emails/templates/LocationWelcome";
import BillingNotification       from "@/emails/templates/BillingNotification";
// TrialExpiring template was removed when the trial concept was killed —
// every restaurant lands on the FREE plan instead of a 14-day trial.
// Legacy import retained as a comment in case we ever need the layout
// to repurpose for a "you're approaching your 100-order cap" nudge.
import DigestEmail               from "@/emails/templates/DigestEmail";
import ScheduledOrderReminder    from "@/emails/templates/ScheduledOrderReminder";
import MarketplaceSettlement     from "@/emails/templates/MarketplaceSettlement";
import AutopilotEmail            from "@/emails/templates/AutopilotEmail";
import ResellerPayoutNotification from "@/emails/templates/ResellerPayoutNotification";
import ResellerApplicationStatus from "@/emails/templates/ResellerApplicationStatus";
import ReportNotification        from "@/emails/templates/ReportNotification";
import CouponAssigned            from "@/emails/templates/CouponAssigned";
import { formatCurrency } from "@/lib/utils";
import type { EmailOrderItem } from "@/emails/components/EmailParts";

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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Email transport] Decryption of saved Resend key FAILED:", msg);
      }
    }
    if (settings?.emailFrom) from = settings.emailFrom;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Email transport] PlatformSettings query failed:", msg);
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

/**
 * Override the display name on the From header while keeping the email
 * address on our verified sending domain.
 *
 * Example: platform default `from` is `Fee Free Ordering <support@feefreeordering.com>`.
 * Calling `applyFromName(from, "Luigi's Lasagna")` returns
 *   `Luigi's Lasagna <support@feefreeordering.com>`
 * so the customer's inbox shows the restaurant's name as the sender,
 * but Resend still ships from our DKIM-signed domain (no per-restaurant
 * domain verification needed).
 *
 * Why this matters: Luigi 2026-05-31 — order receipts were going out
 * as "Fee Free Ordering" instead of the actual restaurant name.
 * Customers couldn't tell at a glance which of their ordering apps
 * the email belonged to.
 *
 * Quirk: RFC 5322 allows special characters in display names only when
 * the entire name is quoted. Apostrophes and commas (common in
 * restaurant names) blow up some clients unless quoted. We always
 * quote the name to be safe + escape any inner double-quotes.
 */
function applyFromName(from: string, displayName: string | null | undefined): string {
  if (!displayName) return from;
  const trimmed = displayName.trim();
  if (!trimmed) return from;
  // Parse the email address out of the platform default. Resend
  // accepts either `email` or `Name <email>` for `from`.
  const angle = from.match(/<([^>]+)>/);
  const addr = angle ? angle[1] : from;
  const safeName = trimmed.replace(/"/g, '\\"').slice(0, 90);
  return `"${safeName}" <${addr}>`;
}

async function send({
  to, cc, subject, html, text, replyTo, listUnsubscribeUrl, fromName,
}: {
  to: string;
  /** Optional CC recipient(s). Used by partner-intro emails that loop several
   *  parties (partner + merchant + ops) into one thread. */
  cc?: string | string[] | null;
  subject: string;
  html: string;
  text?: string;
  /** Reply-To header. Customer-order emails set this to the restaurant's
   *  contact email so when a customer hits Reply, the response goes to
   *  the restaurant, not to our generic support inbox. Huge deliverability
   *  win too — Reply-To being a real-domain address matching the email's
   *  content makes inbox providers trust the sender more. */
  replyTo?: string | null;
  /** When set, we add RFC-8058 List-Unsubscribe + List-Unsubscribe-Post
   *  headers. Required by Gmail / Yahoo bulk sender rules (Feb 2024) for
   *  any email that's transactional-bulk (digest, marketing). Order
   *  receipts are exempt — they're 1:1 transactional. */
  listUnsubscribeUrl?: string | null;
  /** Override the display-name portion of the From header. The email
   *  address stays on our verified sending domain. Used for per-
   *  restaurant order emails so the customer's inbox shows the
   *  restaurant's name rather than the platform default. */
  fromName?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: "no recipient" };
  const { client, from: defaultFrom } = await getTransport();
  const from = applyFromName(defaultFrom, fromName);
  if (!client) {
    console.log("[Email placeholder]", to, "·", subject);
    return { success: true };
  }
  try {
    const headers: Record<string, string> = {};
    if (listUnsubscribeUrl) {
      // RFC 2369 + RFC 8058: List-Unsubscribe + List-Unsubscribe-Post.
      // Both required for Gmail/Yahoo's one-click unsubscribe button.
      headers["List-Unsubscribe"] = `<${listUnsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    const ccList = Array.isArray(cc) ? cc.filter(Boolean) : cc ? [cc] : [];
    const { data, error } = await client.emails.send({
      from,
      to,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    if (error) {
      console.error("[Email send error]", { to, from, name: error.name, message: error.message });
      return { success: false, error: error.message };
    }
    console.log("[Email sent]", { to, from, id: data?.id });
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Email transport error]", { to, from, message: msg });
    return { success: false, error: msg };
  }
}

/**
 * Module-scoped imprint + logo override. Set per-send via the
 * `setEmailImprint()` / `setEmailLogoUrl()` setters (called by
 * `src/lib/notifications.ts` when the restaurant is under a whitelabel
 * reseller) so the footer shows the reseller's brand instead of
 * "Fee Free Ordering Systems". Always cleared in a finally block so one
 * send's override never leaks to the next.
 */
let activeImprint: string | null = null;
let activeLogoUrl: string | null = null;
export function setEmailImprint(imprint: string | null) {
  activeImprint = imprint;
}
export function setEmailLogoUrl(url: string | null) {
  activeLogoUrl = url;
}
function currentImprint(): string | undefined {
  return activeImprint ?? undefined;
}
/** Public getter — imported by `EmailFooter` so the rendered HTML can
 *  pick up the per-send logo override without every individual email
 *  template needing a new prop threaded through. */
export function getCurrentImprintLogoUrl(): string | undefined {
  return activeLogoUrl ?? undefined;
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
  /** Receipt-header logo (Restaurant.receiptLogoUrl) — rendered above the
   *  greeting in the email receipt. Optional; omitted = no logo. */
  logoUrl?: string;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  orderType: string;
  estimatedTime: number;
  /** Scheduled ("order for later") slot. When set, the confirmation email shows
   *  a prominent "Order for later: <date/time>" line instead of the ASAP ETA. */
  scheduledFor?: Date | string | null;
  /** Reserve-then-order: the table booking attached to this order. When set,
   *  the confirmation email also states "Table reserved for N on <date> at
   *  <time>" so one email covers both. Luigi 2026-06-08. */
  reservation?: { partySize: number; date: string; time: string } | null;
  /** Restaurant IANA timezone — formats scheduledFor in the customer's local time. */
  timezone?: string;
  /** Restaurant 12h/24h preference — drives clock-time formatting. Luigi 2026-06-08. */
  hoursFormat?: "12h" | "24h";
  trackingUrl: string;
  /** Restaurant defaultLanguage. Defaults to "en". */
  locale?: string;
  /** ISO 4217 currency code (e.g. "usd", "eur"). Drives money formatting
   *  in the email body. Defaults to USD when omitted. */
  currency?: string;
  /** Optional rich-data passthrough. When the caller already has these
   *  fields handy, we render the GloriaFood-style detailed confirmation
   *  with delivery address + payment status + tax breakdown. Otherwise
   *  the template falls back to the minimal version. */
  subtotal?: number;
  taxAmount?: number;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  paidOnline?: boolean;
  deliveryAddress?: string | null;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  /** Promotions that fired for this order. Rendered as a highlighted
   *  box in the email above the totals. Each entry:
   *  { name, type, discount, couponCode? }. Empty/undefined → no box. */
  appliedPromos?: Array<{
    name: string;
    type: string;
    discount: number;
    couponCode?: string;
  }>;
}

/**
 * Shipday partner intro — sent ONCE when a restaurant connects Shipday. Loops
 * Justin (Shipday) + the merchant + our ops inbox into one thread and asks
 * Justin to create the account, apply the partner discount, add credits, and
 * schedule onboarding — exactly the handoff Justin requested (so nothing falls
 * through the cracks). Partner address defaults to Justin's, overridable via
 * SHIPDAY_PARTNER_EMAIL. English (it's a partner/ops email). Luigi 2026-06-17.
 */
export async function sendShipdayPartnerIntro(params: {
  restaurantName: string;
  restaurantAddress?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
}) {
  const partnerEmail = (process.env.SHIPDAY_PARTNER_EMAIL || "justin.brandon@shipday.com").trim();
  const opsEmail = (process.env.PLATFORM_OPS_EMAIL || process.env.REPORTS_OPS_EMAIL || "support@feefreeordering.com")
    .trim()
    .toLowerCase();
  const calendly = "https://calendly.com/justin-brandon/";
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

  // Loop the merchant + our ops inbox into the same thread, deduped.
  const cc = Array.from(
    new Set(
      [params.ownerEmail, opsEmail]
        .filter((e): e is string => !!e && e.trim().length > 0)
        .map((e) => e.trim().toLowerCase()),
    ),
  );

  const rows: Array<[string, string | null | undefined]> = [
    ["Restaurant", params.restaurantName],
    ["Address", params.restaurantAddress],
    ["Owner", params.ownerName],
    ["Email", params.ownerEmail],
    ["Phone", params.ownerPhone],
  ];
  const table = rows
    .filter(([, v]) => v && String(v).trim())
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">${k}</td><td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600">${esc(String(v))}</td></tr>`,
    )
    .join("");
  const firstName = params.ownerName?.trim().split(/\s+/)[0] || "there";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <p style="font-size:15px">Hi Justin,</p>
    <p style="font-size:15px;line-height:1.6"><strong>${esc(params.restaurantName)}</strong> on Fee Free Ordering has selected the Shipday delivery add-on. Please create their account, apply the partner discount, add credits, and schedule onboarding.</p>
    <table style="border-collapse:collapse;margin:14px 0">${table}</table>
    <p style="font-size:14px;line-height:1.6">${esc(firstName)} (CC&rsquo;d) — meet <strong>Justin Brandon</strong>, your Shipday delivery contact. He&rsquo;ll set up your account with the partner discount + credits and walk you through onboarding.</p>
    <p style="font-size:14px;line-height:1.6">Book a setup call: <a href="${calendly}" style="color:#059669">${calendly}</a></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:20px">Sent automatically by Fee Free Ordering when a restaurant connects Shipday.</p>
  </div>`;

  return send({
    to: partnerEmail,
    cc,
    subject: `New Fee Free Ordering restaurant for Shipday — ${params.restaurantName}`,
    html,
    // A reply from Justin should reach the restaurant directly (he's connecting
    // with the merchant); ops is CC'd on the original either way.
    replyTo: params.ownerEmail || opsEmail,
  });
}

export async function sendOrderConfirmationEmail(params: OrderEmailParams) {
  const t = await getDict(params.locale);
  const subject = t("email.orderConfirmed.subject", { orderNumber: params.orderNumber });
  // Pre-format the scheduled slot in the restaurant's timezone + customer
  // locale (only for future-dated "order for later" orders). Luigi 2026-06-05.
  const schedDate = params.scheduledFor ? new Date(params.scheduledFor) : null;
  const scheduledLabel = schedDate && schedDate.getTime() > Date.now()
    ? schedDate.toLocaleString(params.locale || undefined, {
        timeZone: params.timezone || "UTC",
        weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        // Follow the restaurant's 12h/24h setting, not the locale default.
        hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
      })
    : null;
  // Reserve-then-order: a friendly "Tuesday, Jun 8 at 19:00" label for the
  // attached table booking. The stored date/time are the restaurant's local
  // wall-clock, so we format the date WITHOUT a timeZone (no shifting) and
  // append the HH:MM as-is. Luigi 2026-06-08.
  const resv = params.reservation ?? null;
  const reservationLabel = resv
    ? (() => {
        const d = new Date(`${resv.date}T${resv.time}:00`);
        const datePart = Number.isFinite(d.getTime())
          ? d.toLocaleDateString(params.locale || undefined, { weekday: "long", month: "short", day: "numeric" })
          : resv.date;
        return `${datePart} ${formatTime(resv.time, params.hoursFormat ?? "24h")}`;
      })()
    : null;
  const html = await renderEmail(
    OrderConfirmation({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      orderType: localizeOrderType(params.orderType, t),
      paidOnline: params.paidOnline ?? false,
      estimatedMinutes: params.estimatedTime,
      scheduledLabel,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      items: params.items as EmailOrderItem[],
      subtotal: params.subtotal ?? params.total,
      taxAmount: params.taxAmount,
      deliveryFee: params.deliveryFee,
      tip: params.tip,
      discount: params.discount,
      total: params.total,
      deliveryAddress: params.deliveryAddress,
      trackingUrl: params.trackingUrl,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      logoUrl: params.logoUrl,
      imprint: currentImprint(),
      appliedPromos: params.appliedPromos,
      currency: params.currency,
    })
  );
  // Reply-To: the restaurant's own email. Customer hits Reply → response
  // goes to the restaurant directly, not to our platform inbox. Deliverability
  // bonus too — Reply-To matching the visible "from this restaurant" content
  // is a positive signal for Gmail/Outlook trust scoring.
  // From display name = the restaurant's name (verified sending domain stays
  // ours). Customer's inbox shows "Luigi's Lasagna" instead of "Fee Free
  // Ordering" — addresses Luigi 2026-05-31 feedback.
  return send({
    to: params.to, subject, html,
    replyTo: params.restaurantEmail,
    fromName: params.restaurantName,
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
  /** ISO 4217 currency code — drives money formatting. Defaults to USD. */
  currency?: string;
  // Optional rich extras — when the caller has them, we render the
  // GloriaFood-style itemized kitchen notification instead of the minimal
  // version.
  customerPhone?: string | null;
  customerEmail?: string | null;
  orderType?: string;
  paidOnline?: boolean;
  items?: EmailOrderItem[];
  subtotal?: number;
  taxAmount?: number;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  deliveryAddress?: string | null;
  customerNotes?: string | null;
  /** Reserve-then-order: the table booking attached to this order, so the
   *  STORE copy also flags "table reservation + pre-order". Luigi 2026-06-08. */
  reservation?: { partySize: number; date: string; time: string } | null;
  /** Restaurant 12h/24h preference — clock-time formatting. */
  hoursFormat?: "12h" | "24h";
}) {
  const t = await getDict(params.locale);
  const subject = t("email.newOrder.subject", { orderNumber: params.orderNumber, restaurant: params.restaurantName });
  const resv = params.reservation ?? null;
  const reservationLabel = resv
    ? (() => {
        const d = new Date(`${resv.date}T${resv.time}:00`);
        const datePart = Number.isFinite(d.getTime())
          ? d.toLocaleDateString(params.locale || undefined, { weekday: "long", month: "short", day: "numeric" })
          : resv.date;
        return `${datePart} ${formatTime(resv.time, params.hoursFormat ?? "24h")}`;
      })()
    : null;
  const html = await renderEmail(
    KitchenNotification({
      restaurantName: params.restaurantName,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      orderType: params.orderType,
      paidOnline: params.paidOnline,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      items: params.items,
      subtotal: params.subtotal,
      taxAmount: params.taxAmount,
      deliveryFee: params.deliveryFee,
      tip: params.tip,
      discount: params.discount,
      total: params.total,
      deliveryAddress: params.deliveryAddress,
      customerNotes: params.customerNotes,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
      currency: params.currency,
    })
  );
  return send({ to: params.to, subject, html });
}

/**
 * Staff email when an order is ACCEPTED/CONFIRMED by the restaurant — distinct
 * from the new-order placement ping (sendNewOrderNotificationEmail). Each order
 * type gets its own subject ("Pickup order #X confirmed") plus a localized
 * "Order confirmed" headline, so staff can tell a confirmation apart from a
 * brand-new order at a glance (the bug: all 5 order toggles used to send the
 * identical "New order received" email). Minimal body (no itemization) — it's a
 * confirmation receipt, not the kitchen ticket.
 */
export async function sendOrderAcceptedNotificationEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  total: number;
  dashboardUrl: string;
  acceptedType: "delivery" | "pickup" | "dineIn" | "scheduled";
  reservation?: { partySize: number; date: string; time: string } | null;
  hoursFormat?: "12h" | "24h";
  locale?: string;
  currency?: string;
}) {
  const t = await getDict(params.locale);
  const subjectKey = (
    {
      delivery: "email.orderAccepted.subjectDelivery",
      pickup: "email.orderAccepted.subjectPickup",
      dineIn: "email.orderAccepted.subjectDineIn",
      scheduled: "email.orderAccepted.subjectScheduled",
    } as const
  )[params.acceptedType];
  const subject = t(subjectKey, { orderNumber: params.orderNumber, restaurant: params.restaurantName });
  // Map the accepted-event type to the template's order-type badge. Scheduled
  // orders can be any underlying type, so they show no type badge (the subject
  // already says "Scheduled").
  const badgeType =
    params.acceptedType === "dineIn" ? "dine_in"
    : params.acceptedType === "scheduled" ? undefined
    : params.acceptedType;
  const resv = params.reservation ?? null;
  const reservationLabel = resv
    ? (() => {
        const d = new Date(`${resv.date}T${resv.time}:00`);
        const datePart = Number.isFinite(d.getTime())
          ? d.toLocaleDateString(params.locale || undefined, { weekday: "long", month: "short", day: "numeric" })
          : resv.date;
        return `${datePart} ${formatTime(resv.time, params.hoursFormat ?? "24h")}`;
      })()
    : null;
  const html = await renderEmail(
    KitchenNotification({
      restaurantName: params.restaurantName,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      orderType: badgeType,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      total: params.total,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
      currency: params.currency,
      headline: t("email.orderAccepted.badge"),
    })
  );
  return send({ to: params.to, subject, html });
}

export async function sendOrderStatusUpdateEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  estimatedReady?: Date;
  rejectionReason?: string;
  trackingUrl?: string;
  /** Order's payment method — drives which refund copy renders on
   *  rejected/cancelled emails ("card → 5-10 business days", "PayPal
   *  → instant void", "cash → nothing to refund"). When undefined,
   *  the rejected/cancelled template renders the generic refund
   *  paragraph for backwards compat with callers that haven't been
   *  updated yet. */
  paidOnline?: boolean;
  paymentMethod?: string;
  /** Restaurant contact info — surfaced in the email footer. Missing
   *  these used to mean the customer got an accepted/rejected email
   *  with no way to call the restaurant. Luigi 2026-05-31. */
  restaurantPhone?: string | null;
  restaurantEmail?: string | null;
  restaurantUrl?: string | null;
  locale?: string;
  /** Restaurant IANA timezone — formats "Estimated ready" in the customer's
   *  local time instead of the server's UTC. Falls back to UTC when unset. */
  timezone?: string;
  /** Restaurant 12h/24h preference — clock-time formatting. Luigi 2026-06-08. */
  hoursFormat?: "12h" | "24h";
}) {
  const t = await getDict(params.locale);
  const subject = t("email.orderStatus.subject", { orderNumber: params.orderNumber });
  // Format the estimated-ready instant in the RESTAURANT's timezone + the
  // customer's locale (was bare toLocaleString() → server UTC, so a Thursday
  // 8:45 PM slot showed the wrong time). Luigi 2026-06-05.
  const readyStr = params.estimatedReady
    ? params.estimatedReady.toLocaleString(params.locale || undefined, {
        timeZone: params.timezone || "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
      })
    : null;
  const html = await renderEmail(
    OrderStatusUpdate({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      status: params.status,
      statusMessage: readyStr
        ? `${t("email.orderStatus.body", { orderNumber: params.orderNumber, status: params.status })} ${t("email.orderStatus.estimatedReady", { time: readyStr })}`
        : undefined,
      // Forward the rejection reason (if any) so the template can surface
      // it. Previously dropped on the floor — customer never saw WHY their
      // order was declined.
      rejectionReason: params.rejectionReason,
      // Real status-page link. Previously was always "#" because the
      // dispatcher never threaded a trackingUrl through — the customer's
      // "View order status" button was a no-op. Luigi bug 2026-05-31.
      trackingUrl: params.trackingUrl ?? "#",
      paidOnline: params.paidOnline,
      paymentMethod: params.paymentMethod,
      restaurantPhone: params.restaurantPhone ?? undefined,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantUrl: params.restaurantUrl ?? undefined,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to, subject, html,
    replyTo: params.restaurantEmail,
    fromName: params.restaurantName,
  });
}

export async function sendOrderDelayedEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  newEstimatedReady: Date;
  delayMinutes: number;
  reason?: string | null;
  trackingUrl?: string;
  restaurantPhone?: string | null;
  restaurantEmail?: string | null;
  restaurantUrl?: string | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const subject = t("email.orderDelayed.subject", { orderNumber: params.orderNumber, delayMinutes: params.delayMinutes });
  const html = await renderEmail(
    OrderDelayed({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      newEstimatedReady: params.newEstimatedReady,
      delayMinutes: params.delayMinutes,
      reason: params.reason,
      trackingUrl: params.trackingUrl ?? "#",
      restaurantPhone: params.restaurantPhone ?? undefined,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantUrl: params.restaurantUrl ?? undefined,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to, subject, html,
    replyTo: params.restaurantEmail,
    fromName: params.restaurantName,
  });
}

export async function sendOrderRejectedEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  reason?: string;
  dashboardUrl: string;
  paidOnline?: boolean;
  /** True when the online payment was already captured at rejection time.
   *  When false, the customer sees "your card was not charged" instead
   *  of "we'll refund you" — matches GloriaFood's clearer wording
   *  (Fabrizio 2026-06-01). */
  paymentCaptured?: boolean;
  restaurantEmail?: string;
  restaurantPhone?: string;
  restaurantUrl?: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    OrderRejected({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      reason: params.reason ?? null,
      paidOnline: params.paidOnline ?? false,
      paymentCaptured: params.paymentCaptured ?? false,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      restaurantUrl: params.restaurantUrl,
      imprint: currentImprint(),
    })
  );
  // A timed-out order is auto-rejected ("missed") — use the missed subject so
  // the restaurant's email matches the kitchen + customer wording. Luigi
  // 2026-06-09.
  const isMissed = (params.reason ?? "").startsWith("Auto-rejected");
  return send({
    to: params.to,
    subject: t(isMissed ? "email.orderRejected.subjectMissed" : "email.orderRejected.subject", { orderNumber: params.orderNumber }),
    html,
    replyTo: params.restaurantEmail,
    fromName: params.restaurantName,
  });
}

export async function sendOrderCanceledEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  dashboardUrl: string;
  paidOnline?: boolean;
  reason?: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    OrderCanceled({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      reason: params.reason ?? null,
      paidOnline: params.paidOnline ?? false,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.orderCanceled.subject", { orderNumber: params.orderNumber }),
    html,
    fromName: params.restaurantName,
  });
}

export async function sendOrderRefundEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  /** Pre-formatted in the restaurant's currency, e.g. "$30.00". */
  refundAmountLabel: string;
  isFull: boolean;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    OrderRefund({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      refundAmountLabel: params.refundAmountLabel,
      isFull: params.isFull,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.orderRefund.subject", { orderNumber: params.orderNumber }),
    html,
    fromName: params.restaurantName,
  });
}

// ─── Reservations ─────────────────────────────────────────────────────────────

/** "You've received a personal coupon" — fired when the restaurant assigns
 *  a customer-locked coupon (reseller report cmqa6lls1). The CALLER gates on
 *  marketingConsent; this helper just renders + sends. Term lines include
 *  only the conditions that actually apply, each pre-localized here so the
 *  template stays dumb. */
export async function sendCouponAssignedEmail(params: {
  to: string;
  customerName: string;
  restaurantName: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  currency: string;
  minimumOrder?: number;
  maxUses?: number;
  expiresAt?: Date | null;
  description?: string | null;
  orderUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  /** Restaurant defaultLanguage. Defaults to "en". */
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const discountLabel =
    params.discountType === "percentage"
      ? t("email.couponAssigned.discountPercent", { value: params.discountValue })
      : t("email.couponAssigned.discountFixed", {
          amount: formatCurrency(params.discountValue, params.currency, params.locale),
        });
  const termLines: string[] = [];
  if (params.minimumOrder && params.minimumOrder > 0) {
    termLines.push(
      t("email.couponAssigned.minOrder", {
        amount: formatCurrency(params.minimumOrder, params.currency, params.locale),
      }),
    );
  }
  if (params.expiresAt) {
    termLines.push(
      t("email.couponAssigned.validUntil", {
        date: params.expiresAt.toLocaleDateString(params.locale || undefined, {
          year: "numeric", month: "long", day: "numeric",
        }),
      }),
    );
  }
  if (params.maxUses && params.maxUses > 0) {
    termLines.push(
      params.maxUses === 1
        ? t("email.couponAssigned.usesOnce")
        : t("email.couponAssigned.usesMany", { count: params.maxUses }),
    );
  }
  const html = await renderEmail(
    CouponAssigned({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      code: params.code,
      discountLabel,
      termLines,
      description: params.description,
      orderUrl: params.orderUrl,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantPhone: params.restaurantPhone ?? undefined,
      imprint: currentImprint(),
    }),
  );
  return send({
    to: params.to,
    subject: t("email.couponAssigned.subject", { restaurantName: params.restaurantName, discountLabel }),
    html,
    replyTo: params.restaurantEmail ?? undefined,
    fromName: params.restaurantName,
  });
}

/**
 * VIP member-special announcement (Program 3 Phase 1). Tells a group member they
 * have a members-only deal that AUTO-APPLIES — no code. Usage copy is tailored:
 * account holders just sign in; guests enter this email at checkout (+ a nudge to
 * create an account). discountLabel is localized for %/$ deals, else the promo
 * name. Sent only by the owner's explicit "Email members" action.
 */
export async function sendVipSpecialEmail(params: {
  to: string;
  customerName: string;
  restaurantName: string;
  discountType: "percentage" | "fixed" | "other";
  discountValue?: number;
  dealName: string;
  currency: string;
  minimumOrder?: number;
  expiresAt?: Date | null;
  description?: string | null;
  hasAccount: boolean;
  orderUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  /** What the restaurant calls these recipients ("VIP member", "Teacher", …).
   *  Null/empty → the localized default "VIP member". */
  memberLabel?: string | null;
  /** Restaurant defaultLanguage. Defaults to "en". */
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const memberLabel = params.memberLabel?.trim() || t("email.vipSpecial.defaultMemberLabel");
  const discountLabel =
    params.discountType === "percentage" && params.discountValue != null
      ? t("email.couponAssigned.discountPercent", { value: params.discountValue })
      : params.discountType === "fixed" && params.discountValue != null
        ? t("email.couponAssigned.discountFixed", { amount: formatCurrency(params.discountValue, params.currency, params.locale) })
        : params.dealName;
  const termLines: string[] = [];
  if (params.minimumOrder && params.minimumOrder > 0) {
    termLines.push(t("email.couponAssigned.minOrder", { amount: formatCurrency(params.minimumOrder, params.currency, params.locale) }));
  }
  if (params.expiresAt) {
    termLines.push(t("email.couponAssigned.validUntil", {
      date: params.expiresAt.toLocaleDateString(params.locale || undefined, { year: "numeric", month: "long", day: "numeric" }),
    }));
  }
  const usageNote = params.hasAccount
    ? t("email.vipSpecial.usageAccount", { discountLabel })
    : t("email.vipSpecial.usageGuest", { discountLabel, email: params.to });
  const accountTip = params.hasAccount ? undefined : t("email.vipSpecial.accountTip");
  const html = await renderEmail(
    CouponAssigned({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      code: "",
      discountLabel,
      termLines,
      description: params.description,
      orderUrl: params.orderUrl,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantPhone: params.restaurantPhone ?? undefined,
      imprint: currentImprint(),
      memberSpecial: true,
      introOverride: t("email.vipSpecial.intro", { memberLabel, restaurantName: params.restaurantName, discountLabel }),
      usageNote,
      accountTip,
    }),
  );
  return send({
    to: params.to,
    subject: t("email.vipSpecial.subject", { restaurantName: params.restaurantName, discountLabel }),
    html,
    replyTo: params.restaurantEmail ?? undefined,
    fromName: params.restaurantName,
  });
}

export async function sendReservationConfirmation(params: {
  to: string;
  customerName: string;
  restaurantName: string;
  partySize: number;
  date: string;
  time: string;
  confirmationCode: string;
  // "missed" = auto-declined for not being accepted in time. Reuses the
  // (already-neutral) "declined" copy — header "Reservation update", "was not
  // able to accommodate…" — but renders a "Missed" badge instead of "Declined".
  status: "requested" | "confirmed" | "declined" | "missed";
  depositPaid?: boolean;
  depositAmount?: number;
  preOrderTotal?: number;
  /** Restaurant 12h/24h preference — formats the reservation time so the email
   *  matches the restaurant's setting (was always 24h). Luigi 2026-06-08. */
  hoursFormat?: "12h" | "24h";
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const timeLabel = formatTime(params.time, params.hoursFormat ?? "24h");
  const html = await renderEmail(
    ReservationConfirmation({
      t,
      status: params.status,
      customerName: params.customerName,
      reservationNumber: params.confirmationCode,
      restaurantName: params.restaurantName,
      dateTime: `${params.date} at ${timeLabel}`,
      partySize: params.partySize,
      imprint: currentImprint(),
    })
  );
  const subjectSuffix = (params.status === "declined" || params.status === "missed") ? "Declined" : params.status === "requested" ? "Requested" : "";
  return send({
    to: params.to,
    subject: t(`email.reservationConfirmed.subject${subjectSuffix}`),
    html,
    // Show the restaurant's name as the sender (display name), like order
    // emails — the address stays the platform's verified sender. Fabrizio
    // report cmpxeljn6.
    fromName: params.restaurantName,
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
  customerPhone?: string | null;
  customerEmail?: string | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    NewReservationNotification({
      restaurantName: params.restaurantName,
      reservationNumber: params.confirmationCode,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      dateTime: `${params.date} at ${params.time}`,
      partySize: params.partySize,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.newReservation.subject", { restaurant: params.restaurantName }),
    html,
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
  const html = await renderEmail(
    PasswordReset({
      name: params.name ?? undefined,
      resetUrl: params.resetUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.passwordReset.subject"),
    html,
  });
}

// ─── Email-settings test ─────────────────────────────────────────────────────

export async function sendEmailSettingsTest(params: { to: string; locale?: string }) {
  const t = await getDict(params.locale);
  const html = await renderEmail(EmailSettingsTest({ imprint: currentImprint() }));
  return send({
    to: params.to,
    subject: t("email.settingsTest.subject"),
    html,
  });
}

// ─── Signup confirmation ──────────────────────────────────────────────────────

export async function sendSignupConfirmationEmail(params: {
  to: string;
  name: string | null;
  restaurantName: string;
  loginUrl: string;
  /** When provided, the welcome email leads with a "Verify your email"
   *  button instead of (or in addition to) the Log in CTA. */
  verifyUrl?: string;
  locale?: string;
  /** When the signup was attributed to a reseller, surface who referred them +
   *  how to reach their local partner for help. */
  referredBy?: { name: string; contact: string | null; website: string | null } | null;
}) {
  const t = await getDict(params.locale);
  // If no verifyUrl supplied, fall back to login as the primary CTA in both
  // slots — the template wants both URLs.
  const verifyUrl = params.verifyUrl ?? params.loginUrl;
  const html = await renderEmail(
    SignupConfirmation({
      name: params.name ?? params.restaurantName,
      restaurantName: params.restaurantName,
      loginUrl: params.loginUrl,
      verifyUrl,
      referredBy: params.referredBy ?? null,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.signup.subject"),
    html,
  });
}

/** Standalone "verify your email" email — used by the resend-verification
 *  button in the admin layout banner. */
export async function sendVerifyEmail(params: {
  to: string;
  name: string | null;
  verifyUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    VerifyEmail({
      name: params.name ?? undefined,
      verifyUrl: params.verifyUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.verify.subject"),
    html,
  });
}

/** Invite-a-new-location email — multi-location brand expansion. */
export async function sendLocationInviteEmail(params: {
  to: string;
  brandName: string;
  suggestedName: string | null;
  inviteUrl: string;
}) {
  const friendlyName = params.suggestedName ? `the new ${params.suggestedName} location` : "a new location";
  const html = await renderEmail(
    LocationInvite({
      parentRestaurantName: params.brandName,
      inviteUrl: params.inviteUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: `You've been invited to set up ${friendlyName} on Fee Free Ordering`,
    html,
  });
}

/**
 * New-location welcome / set-password (Luigi 2026-06-10). Sent when a brand owner
 * creates a child location directly: the location gets its own account and this
 * invites that owner to set a password. Proper "your store is ready" wording —
 * NOT "reset your password" (they never had one).
 */
export async function sendLocationWelcomeEmail(params: {
  to: string;
  locationName: string;
  brandName: string;
  setupUrl: string;
}) {
  const html = await renderEmail(
    LocationWelcome({
      locationName: params.locationName,
      brandName: params.brandName,
      setupUrl: params.setupUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: `Set up ${params.locationName} on Fee Free Ordering`,
    html,
  });
}

// ─── Billing + trial ──────────────────────────────────────────────────────────

/**
 * Generic billing notification — used by Stripe webhook handlers when a
 * subscription event needs to be surfaced to the restaurant owner
 * (payment failed, 3DS auth needed, dispute, etc.).
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
  const html = await renderEmail(
    BillingNotification({
      recipientName: params.restaurantName,
      title: params.headline,
      body: params.body,
      buttonLabel: params.ctaLabel,
      buttonUrl: params.ctaUrl,
      imprint: currentImprint(),
    })
  );
  return send({ to: params.to, subject: params.subject, html });
}

// sendTrialExpiringEmail() was removed along with the trial concept —
// see the import comment above.

// ─── Digest / report emails ─────────────────────────────────────

/** Stats payload shared by both daily and monthly digests. All money values
 *  are in dollars (not cents) — the template formats them. */
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

function deltaPair(n: number): { delta?: string; deltaDirection?: "up" | "down" | "flat" } {
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return { delta: undefined, deltaDirection: "flat" };
  const sign = n > 0 ? "+" : "−";
  return {
    delta: `${sign}${Math.abs(Math.round(n))}%`,
    deltaDirection: n > 0 ? "up" : "down",
  };
}

async function sendDigestEmail(
  to: string,
  stats: DigestStats,
  kind: "daily" | "monthly",
  dashboardUrl: string,
  t: Translator,
  currency: string,
  unsubscribeUrl?: string,
) {
  // All money renders in the RESTAURANT's currency (Fabrizio report: was hardcoded $).
  const money = (n: number) => formatCurrency(n ?? 0, currency);
  const html = await renderEmail(
    DigestEmail({
      period: kind,
      periodLabel: stats.periodLabel,
      comparisonLabel: stats.comparisonLabel,
      restaurantName: stats.restaurantName,
      t,
      currency,
      sales:         { value: money(stats.sales),         ...deltaPair(stats.salesDelta) },
      orders:        { value: String(stats.orders),          ...deltaPair(stats.ordersDelta) },
      avgOrderValue: { value: money(stats.avgOrderValue), ...deltaPair(stats.avgOrderValueDelta) },
      reservations:  { value: String(stats.tableReservations), ...deltaPair(stats.reservationsDelta) },
      // Sales breakdown — raw amounts (rendered in the email's currency). Adds
      // the delivery-fees line the in-app EOD report shows (Fabrizio report).
      breakdown: {
        subTotals: stats.subTotals, deliveryFees: stats.deliveryFees, tips: stats.tips,
        otherFees: stats.otherFees, tax: stats.taxAmount, total: stats.total,
      },
      pickup:    { count: stats.pickupOrders,   value: money(stats.pickupSales) },
      delivery:  { count: stats.deliveryOrders, value: money(stats.deliverySales) },
      onPremise: { count: stats.dineInOrders,   value: money(stats.dineInSales) },
      offlinePayments: { count: stats.offlinePayments, value: money(stats.offlinePaymentsAmount) },
      onlinePayments:  { count: stats.onlinePayments,  value: money(stats.onlinePaymentsAmount) },
      noMissedOrders: true,   // tracked elsewhere; until we wire the real signal we say "you're good"
      noCanceledOrders: true,
      dashboardUrl,
      unsubscribeUrl,
      imprint: currentImprint(),
    })
  );
  // Digest emails are technically transactional-bulk — they're sent on a
  // schedule to all opted-in recipients. Gmail/Yahoo's Feb 2024 bulk-
  // sender rules require List-Unsubscribe headers for anything that
  // ships to >5K recipients/day. We add it on every digest send so we're
  // compliant by default and not tripping spam filters at scale.
  return send({
    to,
    subject: kind === "daily"
      ? t("email.digest.subjectDaily",   { restaurant: stats.restaurantName, period: stats.periodLabel })
      : t("email.digest.subjectMonthly", { restaurant: stats.restaurantName, period: stats.periodLabel }),
    html,
    listUnsubscribeUrl: unsubscribeUrl,
  });
}

export async function sendDailyDigestEmail(params: { to: string; stats: DigestStats; dashboardUrl?: string; unsubscribeUrl?: string; locale?: string; currency?: string }) {
  const t = await getDict(params.locale);
  return sendDigestEmail(params.to, params.stats, "daily", params.dashboardUrl ?? "#", t, params.currency ?? "usd", params.unsubscribeUrl);
}

export async function sendMonthlyDigestEmail(params: { to: string; stats: DigestStats; dashboardUrl?: string; unsubscribeUrl?: string; locale?: string; currency?: string }) {
  const t = await getDict(params.locale);
  return sendDigestEmail(params.to, params.stats, "monthly", params.dashboardUrl ?? "#", t, params.currency ?? "usd", params.unsubscribeUrl);
}

// ─── Scheduled-order friendly reminder (NEW) ─────────────────────────────────
// 15-min-before-pickup/delivery nudge for scheduled-for-later orders.
// GloriaFood has this; we didn't. Template is ready; the cron that triggers
// it (looking for orders.scheduledFor within the next 15±2 minutes) is a
// follow-up.

// ─── Marketplace settlement summary ──────────────────────────────────
// Sent at end of every monthly marketplace billing cycle by
// src/lib/marketplace-settlement.ts. Stat-card layout via the dedicated
// MarketplaceSettlement template (NOT the generic BillingNotification —
// that one renders body as plain text, which would mangle this rich
// breakdown).

export async function sendMarketplaceSettlementSummaryEmail(params: {
  to: string;
  restaurantName: string;
  /** Pre-formatted month, e.g. "May 2026" */
  period: string;
  status: "invoiced" | "failed";
  ordersInMonth: number;
  revenueDollars: number;
  accruedDollars: number;
  invoicedDollars: number;
  capDollars: number;
  capHit: boolean;
  ueEquivalentDollars: number;
  savingsThisMonthDollars: number;
  lifetimeSavingsDollars: number;
  failureReason?: string;
  dashboardUrl: string;
  billingUrl?: string;
}) {
  const html = await renderEmail(
    MarketplaceSettlement({
      restaurantName: params.restaurantName,
      period: params.period,
      status: params.status,
      ordersInMonth: params.ordersInMonth,
      revenueDollars: params.revenueDollars,
      accruedDollars: params.accruedDollars,
      invoicedDollars: params.invoicedDollars,
      capDollars: params.capDollars,
      capHit: params.capHit,
      ueEquivalentDollars: params.ueEquivalentDollars,
      savingsThisMonthDollars: params.savingsThisMonthDollars,
      lifetimeSavingsDollars: params.lifetimeSavingsDollars,
      failureReason: params.failureReason,
      dashboardUrl: params.dashboardUrl,
      billingUrl: params.billingUrl,
      imprint: currentImprint(),
    })
  );
  const subject = params.status === "invoiced"
    ? `Your Fee Free Marketplace bill — ${params.period}`
    : `Action needed: ${params.period} Marketplace bill`;
  return send({ to: params.to, subject, html });
}

// ─── Autopilot marketing emails ──────────────────────────────────────
// Sent by /api/cron/autopilot for second-order / reengagement campaigns.
// Bulk-class email → ships with List-Unsubscribe (RFC 8058) so Gmail/
// Yahoo deliverability rules are satisfied. Reply-To set to the
// restaurant's own contact email so customer replies go to the
// restaurant, not us.

export async function sendAutopilotEmail(params: {
  to: string;
  customerName: string;
  restaurantName: string;
  subject: string;
  body: string;
  couponCode?: string | null;
  couponLabel?: string | null;
  ctaUrl: string;
  ctaLabel?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  /** When set, drives the List-Unsubscribe + footer unsubscribe link.
   *  Typically points at the restaurant's customer-database UI where
   *  staff can flag the recipient as do-not-contact. */
  unsubscribeUrl?: string;
}) {
  // Substitute the owner-editable tokens in BOTH the subject header and the body
  // (Luigi 2026-06-10 — they were sent raw, so customers saw "{restaurant_name}"
  // etc.). Centralised here so every campaign (re-engage / second-order /
  // cart-abandon) is fixed at once.
  const vars = {
    customerName: params.customerName || "there",
    restaurantName: params.restaurantName || "",
    restaurantLink: params.restaurantUrl || params.ctaUrl || "",
  };
  const subject = applyEmailTokens(params.subject, vars);
  const body = applyEmailTokens(params.body, vars);

  const html = await renderEmail(
    AutopilotEmail({
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      subject,
      body,
      couponCode: params.couponCode,
      couponLabel: params.couponLabel,
      ctaUrl: params.ctaUrl,
      ctaLabel: params.ctaLabel,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject,
    html,
    replyTo: params.restaurantEmail,
    listUnsubscribeUrl: params.unsubscribeUrl,
  });
}

/** Replace the owner-editable tokens in an Autopilot subject/body.
 *  {coupon_section} is dropped — the coupon renders as its own card in the
 *  template, so leaving the token would duplicate it. Collapses the blank lines
 *  a removed token leaves behind. Luigi 2026-06-10. */
function applyEmailTokens(
  text: string,
  vars: { customerName: string; restaurantName: string; restaurantLink: string },
): string {
  return (text || "")
    .replace(/\{customer_name\}/g, vars.customerName)
    .replace(/\{restaurant_name\}/g, vars.restaurantName)
    .replace(/\{restaurant_link\}/g, vars.restaurantLink)
    .replace(/\{coupon_section\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Reseller payout notifications ───────────────────────────────────
// Sent at every PayoutRequest status transition (approved / paid /
// rejected). Closes the communication loop — without this, the reseller
// has to refresh the dashboard to find out their payout state.

export async function sendResellerApplicationStatusEmail(params: {
  to: string;
  variant: "received" | "approved" | "rejected";
  recipientName: string;
  companyName?: string | null;
  referralCode?: string | null;
  referralUrl?: string | null;
  rejectionReason?: string | null;
  dashboardUrl: string;
}) {
  const html = await renderEmail(
    ResellerApplicationStatus({
      variant: params.variant,
      recipientName: params.recipientName,
      companyName: params.companyName,
      referralCode: params.referralCode,
      referralUrl: params.referralUrl,
      rejectionReason: params.rejectionReason,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
    })
  );
  const subject =
    params.variant === "received" ? "We got your partner application"
    : params.variant === "approved" ? "You're in — your Fee Free Ordering partner account is active"
    :                                  "Your reseller application — update";
  return send({ to: params.to, subject, html });
}

export async function sendResellerPayoutNotificationEmail(params: {
  to: string;
  variant: "approved" | "paid" | "rejected";
  recipientName: string;
  /** Pre-formatted amount string with currency, e.g. "$427.50". */
  amount: string;
  payoutMethod?: string | null;
  payoutReference?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  dashboardUrl: string;
}) {
  const html = await renderEmail(
    ResellerPayoutNotification({
      variant: params.variant,
      recipientName: params.recipientName,
      amount: params.amount,
      payoutMethod: params.payoutMethod,
      payoutReference: params.payoutReference,
      rejectionReason: params.rejectionReason,
      notes: params.notes,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
    })
  );
  const subject =
    params.variant === "approved" ? `Your payout was approved — ${params.amount}`
    : params.variant === "paid"   ? `Your payout has been sent — ${params.amount}`
    :                                "Your payout request couldn't be processed";
  return send({ to: params.to, subject, html });
}

// ─── Reseller-report lifecycle notifications ─────────────────────────
// Sent by src/lib/reseller-reports-workflow.ts when a report's fix ships
// (→ please verify), when it's auto-closed after reseller verification,
// or when a fix is disputed. Thin generic wrapper around the
// ReportNotification template.

export async function sendReportNotificationEmail(params: {
  to: string;
  recipientName?: string | null;
  subject: string;
  title: string;
  subtitle?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const html = await renderEmail(
    ReportNotification({
      recipientName: params.recipientName ?? undefined,
      title: params.title,
      subtitle: params.subtitle,
      body: params.body,
      buttonLabel: params.ctaLabel,
      buttonUrl: params.ctaUrl,
      imprint: currentImprint(),
    })
  );
  return send({ to: params.to, subject: params.subject, html });
}

export async function sendScheduledOrderReminderEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  /** Pre-formatted, e.g. "Wednesday, Dec 24, 04:00 – 04:15 PM" */
  scheduledWindow: string;
  orderType: string;
  deliveryAddress?: string | null;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    ScheduledOrderReminder({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      scheduledWindow: params.scheduledWindow,
      orderType: params.orderType,
      deliveryAddress: params.deliveryAddress,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.scheduledReminder.subject", { orderNumber: params.orderNumber }),
    html,
  });
}
