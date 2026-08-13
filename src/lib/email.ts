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
import { reportError } from "@/lib/report-error";
import { escapeHtml } from "@/lib/html-safe";

/** True on a production deployment (Vercel or NODE_ENV). Email failures are
 *  silent-in-dev but must be loud + alertable in prod (stabilization H8). */
const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { getDict, type Translator } from "@/lib/i18n-dict";
import { APP_LINKS } from "@/lib/app-links";
import { formatTime, formatDateCapitalized } from "@/lib/format-time";
import { renderEmail, emailHtmlToText } from "@/emails/render";
import OrderConfirmation         from "@/emails/templates/OrderConfirmation";
import KitchenNotification       from "@/emails/templates/KitchenNotification";
import OrderStatusUpdate         from "@/emails/templates/OrderStatusUpdate";
import OrderDelayed              from "@/emails/templates/OrderDelayed";
import OrderRejected             from "@/emails/templates/OrderRejected";
import OrderCanceled             from "@/emails/templates/OrderCanceled";
import OrderRefund               from "@/emails/templates/OrderRefund";
import CustomerSignupNotification from "@/emails/templates/CustomerSignupNotification";
import DispatchRejected          from "@/emails/templates/DispatchRejected";
import RewardGift                from "@/emails/templates/RewardGift";
import RewardGiftInvite          from "@/emails/templates/RewardGiftInvite";
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
import { paymentMethodLabelKey } from "@/lib/payment-label";
import type { EmailOrderItem } from "@/emails/components/EmailParts";
import type { MarketingFooterStrings } from "@/emails/components/EmailLayout";
import { isSuppressed } from "@/lib/suppression";
import { checkConsentBasis, type MarketingConsentBasis } from "@/lib/marketing-consent";
import { isSupportedLocale } from "@/lib/locales";
import { customerUnsubscribeUrl } from "@/lib/unsubscribe";
import { dataDeletionUrl } from "@/lib/data-request";

// Cached transport so we don't query PlatformSettings on every call.
// Invalidate by calling `resetEmailTransport()` after the super-admin saves.
let cached: { client: Resend | null; from: string; postalAddress: string | null; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getTransport(): Promise<{ client: Resend | null; from: string }> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return { client: cached.client, from: cached.from };
  }

  let apiKey: string | null = null;
  let from = process.env.EMAIL_FROM || "Fee Free Ordering <onboarding@resend.dev>";
  let postalAddress: string | null = null;

  try {
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.resendApiKeyEnc && settings.resendApiKeyIv && settings.resendApiKeyTag && process.env.ENCRYPTION_KEY) {
      try {
        apiKey = decrypt(settings.resendApiKeyEnc, settings.resendApiKeyIv, settings.resendApiKeyTag);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Email transport] Decryption of saved Resend key FAILED:", msg);
        // A wrong/rotated ENCRYPTION_KEY silently disables ALL email in prod —
        // alert on it (stabilization H8).
        if (IS_PROD) reportError(e, { stage: "email-key-decrypt" });
      }
    }
    // 🚨 The DB-stored From address is trusted ONLY in production. The dev
    // branch's PlatformSettings still carried the legacy
    // support@luigislasagna.com sender, so a one-off script run locally with
    // ALLOW_DEV_EMAIL=1 emailed a real restaurant owner under Luigi's
    // RESTAURANT domain instead of the platform's (2026-08-09, Sofia region
    // fix). Outside production the env EMAIL_FROM (checked into .env, platform
    // domain) is the identity; the dev DB row is a playground value.
    if (settings?.emailFrom && IS_PROD) from = settings.emailFrom;
    // Legal postal address (superadmin → Settings → Company) — surfaced in
    // MARKETING email footers only (CAN-SPAM). Rides the same cached query.
    postalAddress = settings?.companyAddress?.trim() || null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Email transport] PlatformSettings query failed:", msg);
  }

  if (!apiKey && process.env.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
  }

  const client = apiKey ? new Resend(apiKey) : null;
  cached = { client, from, postalAddress, loadedAt: Date.now() };
  return { client, from };
}

/** Platform legal postal address for COMMERCIAL email footers (CAN-SPAM).
 *  Same 60s cache as the transport; null when unset. */
export async function getPlatformPostalAddress(): Promise<string | null> {
  await getTransport();
  return cached?.postalAddress ?? null;
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
/** Resend tag names/values allow only [A-Za-z0-9_-] (≤256 chars). Sanitize so
 *  a campaign like "autopilot:second_order" doesn't get the whole send
 *  rejected. */
function toResendTags(tags: Record<string, string>): Array<{ name: string; value: string }> {
  const clean = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) || "_";
  return Object.entries(tags).map(([name, value]) => ({ name: clean(name), value: clean(value) }));
}

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
  classification = "transactional", consentContext, tags, attachments,
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
  /** "marketing" activates the CASL compliance gate: a `consentContext` is
   *  REQUIRED, the suppression list is re-checked here as a last line of
   *  defence (so even a future caller that skips sendMarketingEmail cannot mail
   *  a suppressed address), and Resend `tags` are attached for webhook
   *  attribution. Defaults to "transactional" — the ~35 existing callers are
   *  unaffected and skip every gate below. */
  classification?: "marketing" | "transactional";
  consentContext?: { restaurantId: string; emailLower: string };
  /** Resend tags (echoed back on delivery-event webhooks so bounces/complaints
   *  can be attributed to a restaurant). Values are sanitized to Resend's
   *  allowed charset. */
  tags?: Record<string, string>;
  /** File attachments (e.g. the DSAR data-export JSON). content is UTF-8 text. */
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: "no recipient" };
  // COMPLIANCE GATE (last line of defence). Marketing mail must never reach a
  // suppressed address, and must always carry a consent context.
  if (classification === "marketing") {
    if (!consentContext) {
      console.error("[Email] marketing send refused — missing consentContext. subject:", subject);
      return { success: false, error: "marketing send requires consentContext" };
    }
    if (await isSuppressed(consentContext.restaurantId, consentContext.emailLower)) {
      console.log("[Email] marketing send skipped — address suppressed. subject:", subject);
      return { success: false, error: "suppressed" };
    }
  }
  const { client, from: defaultFrom } = await getTransport();
  const from = applyFromName(defaultFrom, fromName);
  if (!client) {
    if (IS_PROD) {
      // No working Resend transport in production = every email (customer
      // confirmations, staff new-order, password resets, reservations) silently
      // dropped. Make it LOUD + alertable and return FAILURE so callers don't
      // record a false "sent" (stabilization H8). Cause is a missing Resend key
      // or an ENCRYPTION_KEY that can't decrypt the saved one. Don't log the
      // recipient (PII) — the subject is enough to locate it.
      console.error("[Email] transport UNCONFIGURED in production — email NOT sent. subject:", subject);
      reportError(new Error("Email transport unconfigured (no Resend client) in production"), { stage: "email-send", subject });
      return { success: false, error: "email transport unconfigured" };
    }
    console.log("[Email placeholder]", to, "·", subject);
    return { success: true };
  }
  // DEV GUARD (2026-07-12): the dev Neon branch is a COPY of prod, so the
  // PlatformSettings row carries the REAL Resend key and decrypts fine with
  // the local ENCRYPTION_KEY — which means dev tests were sending REAL email
  // to real people (a ShipDay partner intro fired to Justin during a local
  // E2E). Outside production, log-and-skip unless ALLOW_DEV_EMAIL=1 is set
  // deliberately (e.g. checking rendering in a real inbox).
  if (!IS_PROD && process.env.ALLOW_DEV_EMAIL !== "1") {
    console.log("[Email suppressed — dev] set ALLOW_DEV_EMAIL=1 to really send.", to, "·", subject);
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
    // Plain-text alternative on EVERY email (deliverability — HTML-only mail
    // is a standing spam-score deduction; Fabrizio cms0gyexp #3). Derived from
    // the rendered HTML unless the caller supplied its own `text`. A converter
    // hiccup must never block a send — fall back to HTML-only.
    let plainText = text;
    if (!plainText) {
      try { plainText = emailHtmlToText(html); } catch { plainText = undefined; }
    }
    const { data, error } = await client.emails.send({
      from,
      to,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      subject,
      html,
      ...(plainText ? { text: plainText } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(tags && Object.keys(tags).length > 0 ? { tags: toResendTags(tags) } : {}),
      ...(attachments && attachments.length > 0
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "utf8") })) }
        : {}),
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
  /** When the customer placed the order — the "Order placed" row of the timing
   *  block. Was never stated on any email before. Luigi 2026-08-07. */
  placedAt?: Date | string | null;
  /** Expected ready instant, for the emphasised ready/pickup/delivery row. */
  estimatedReady?: Date | string | null;
  /** Range-mode window width in minutes (Fabrizio cmqqxerxs) — when set the
   *  scheduled line shows "start – end" instead of a single time. */
  scheduledSlotMinutes?: number | null;
  /** Reserve-then-order: the table booking attached to this order. When set,
   *  the confirmation email also states "Table reserved for N on <date> at
   *  <time>" so one email covers both. Luigi 2026-06-08. */
  reservation?: { partySize: number; date: string; time: string } | null;
  /** Restaurant IANA timezone — formats scheduledFor in the customer's local time. */
  timezone?: string;
  /** Restaurant 12h/24h preference — drives clock-time formatting. Luigi 2026-06-08. */
  hoursFormat?: "12h" | "24h";
  trackingUrl: string;
  /** Guest self-cancel page link (status page + purpose-scoped token) —
   *  rendered as the GloriaFood-parity italic "you can still cancel here"
   *  line. Only set when the cancel policy offers it. Fabrizio cms0idtz7. */
  cancelUrl?: string;
  /** Order landed while the restaurant was CLOSED — adds the "you'll get an
   *  update as soon as they open" note. */
  placedWhileClosed?: boolean;
  /** The order was already ACCEPTED when this email went out (auto-accept /
   *  auto-confirmed pre-order). No kitchen-accept email will follow, so this
   *  one carries the confirmation instead of promising a second one.
   *  Luigi 2026-08-11. */
  alreadyAccepted?: boolean;
  /** The deferred kitchen-alert instant (Order.alertAt = next opening). With
   *  placedWhileClosed, the closed note names the concrete time — GloriaFood
   *  parity ("Check your email on Saturday, 25 Jul, 20:15"). cms0gyexp #8. */
  opensAt?: Date | string | null;
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
  /** Fee waived by a free-delivery promo. A waived fee is stored as 0 and a $0
   *  row is hidden, so without this the promo left no trace on the staff email —
   *  it read as though delivery had been forgotten. Luigi 2026-07-31. */
  savedDeliveryFee?: number;
  tip?: number;
  /** Sum of per-item refundable deposits (untaxed; already inside total). */
  depositTotal?: number;
  discount?: number;
  /** Per-order service/other fees (parsed [{name, amount}]) — named rows. */
  serviceFees?: Array<{ name?: string; amount?: number }>;
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
  /** Reward Dollars (store credit) applied as PAYMENT — adds the
   *  "Paid with {label}" + "Balance to pay" rows so the email matches the
   *  confirmation page to the cent (Luigi 2026-07-02). Callers only pass it
   *  when the restaurant's rewards program is ON (feature-gated display). */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** Projected Reward Dollars earned on this order (credited at completion) —
   *  the green "You earned {label}" row. Caller feature-gates on rewardsEnabled. */
  rewardEarned?: number;
  /** Order.paymentMethod — renders a localized "Payment method" line. */
  paymentMethod?: string | null;
  /** Order.paymentStatus — "paid" flips the balance label to "Paid". */
  paidStatus?: string | null;
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
    <p style="font-size:14px;line-height:1.6">Book a setup call: <a href="${calendly}" style="color:#059669">${calendly}</a><br/>Or text/call Justin directly: <strong>(321) 340-7571</strong></p>
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

/**
 * Platform TEAM invite (Team feature, Luigi 2026-07-12) — sent when the
 * superadmin invites a new platform user from /superadmin/team. Carries a
 * 30-day set-your-password link (PasswordResetToken), so no password ever
 * travels through chat/UI/email. English by design (internal staff mail).
 */
export async function sendPlatformTeamInviteEmail(params: {
  to: string;
  name?: string | null;
  roleLabel: string;
  invitedBy: string;
  inviteUrl: string;
}) {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const first = params.name?.trim().split(/\s+/)[0] || "there";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <p style="font-size:15px">Hi ${esc(first)},</p>
    <p style="font-size:15px;line-height:1.6"><strong>${esc(params.invitedBy)}</strong> invited you to the <strong>Fee Free Ordering</strong> platform team as <strong>${esc(params.roleLabel)}</strong>.</p>
    <p style="font-size:14px;line-height:1.6">Set your password to activate your account (link valid for 30 days):</p>
    <p style="margin:18px 0"><a href="${params.inviteUrl}" style="background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;display:inline-block">Set your password</a></p>
    <p style="font-size:12px;color:#6b7280;line-height:1.6">If the button doesn't work, paste this link into your browser:<br/>${params.inviteUrl}</p>
    <p style="font-size:12px;color:#9ca3af;margin-top:20px">If you weren't expecting this invitation, you can ignore this email.</p>
  </div>`;
  return send({
    to: params.to,
    subject: "You're invited to the Fee Free Ordering platform team",
    html,
  });
}

/**
 * Fee Free Delivery driver welcome — sent automatically when a superadmin
 * creates a driver. Carries the app link + the driver's login email and the
 * temporary password the superadmin set, so the driver can sign in without any
 * manual relay. English-only body (drivers pick their language inside the app);
 * subject stays generic. The password is a one-time temp credential — never
 * logged, only emailed to the driver themselves.
 */
export async function sendDriverInviteEmail(params: {
  to: string;
  name?: string | null;
  loginEmail: string;
  tempPassword: string;
  appUrl: string;
}) {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const first = params.name?.trim().split(/\s+/)[0] || "there";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <p style="font-size:15px">Hi ${esc(first)},</p>
    <p style="font-size:15px;line-height:1.6">You've been added as a driver on <strong>Fee Free Delivery</strong>. Sign in on your phone to see and accept delivery jobs.</p>
    <p style="margin:18px 0"><a href="${esc(params.appUrl)}" style="background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;display:inline-block">Open Fee Free Delivery</a></p>
    <table style="font-size:14px;line-height:1.7;border-collapse:collapse;margin:8px 0">
      <tr><td style="color:#6b7280;padding-right:12px">App link</td><td><a href="${esc(params.appUrl)}" style="color:#059669">${esc(params.appUrl)}</a></td></tr>${
        // Availability-driven (app-links.ts): store rows appear only for LIVE
        // listings. Both went live 2026-07-23 (Play Production + App Store).
        APP_LINKS.driver.play
          ? `\n      <tr><td style="color:#6b7280;padding-right:12px">Android app</td><td><a href="${esc(APP_LINKS.driver.play)}" style="color:#059669">Get it on Google Play</a></td></tr>`
          : ""
      }${
        APP_LINKS.driver.ios
          ? `\n      <tr><td style="color:#6b7280;padding-right:12px">iPhone app</td><td><a href="${esc(APP_LINKS.driver.ios)}" style="color:#059669">Download on the App Store</a></td></tr>`
          : ""
      }
      <tr><td style="color:#6b7280;padding-right:12px">Login (email)</td><td><strong>${esc(params.loginEmail)}</strong></td></tr>
      <tr><td style="color:#6b7280;padding-right:12px">Temporary password</td><td><strong>${esc(params.tempPassword)}</strong></td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280;line-height:1.6">${
      APP_LINKS.driver.play || APP_LINKS.driver.ios
        ? `Tip: install the app from Google Play (Android) or the App Store (iPhone) for the most reliable experience — or open the link above and use "Add to Home Screen". Keep this password private — ask your manager if you ever need it reset.`
        : `Tip: after opening the link, use "Add to Home Screen" so it installs like a normal app. Keep this password private — ask your manager if you ever need it reset.`
    }</p>
    <p style="font-size:12px;color:#9ca3af;margin-top:20px">If you weren't expecting this, you can ignore this email.</p>
  </div>`;
  return send({
    to: params.to,
    subject: "Your Fee Free Delivery driver login",
    html,
  });
}

/**
 * "Text/email me the Kitchen app link" — the restaurant owner requests the
 * download link on their preferred device from /admin/publishing (send-app-link
 * API). Availability-driven via APP_LINKS.kitchen: the Android (Play) row shows
 * while it's live, the iPhone/iPad (App Store) row appears the day iOS goes live.
 * English body (same convention as the driver-invite email).
 */
export async function sendKitchenAppLinkEmail(params: { to: string; restaurantName: string }) {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const name = esc(params.restaurantName || "your restaurant");
  const rows = [
    APP_LINKS.kitchen.play
      ? `<tr><td style="color:#6b7280;padding:6px 12px 6px 0">Android</td><td style="padding:6px 0"><a href="${esc(APP_LINKS.kitchen.play)}" style="color:#059669;font-weight:600">Get it on Google Play</a></td></tr>`
      : "",
    APP_LINKS.kitchen.ios
      ? `<tr><td style="color:#6b7280;padding:6px 12px 6px 0">iPhone / iPad</td><td style="padding:6px 0"><a href="${esc(APP_LINKS.kitchen.ios)}" style="color:#059669;font-weight:600">Download on the App Store</a></td></tr>`
      : "",
  ].join("");
  const iosSoon = !APP_LINKS.kitchen.ios
    ? `<p style="font-size:13px;color:#6b7280;line-height:1.6">The iPhone/iPad version is coming to the App Store soon — in the meantime an iPad can run the kitchen in any web browser.</p>`
    : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <p style="font-size:15px">Here's the download link for the <strong>Kitchen Order App</strong> for ${name}.</p>
    <p style="font-size:15px;line-height:1.6">Install it on the tablet or phone you'll use in the kitchen — new orders ring instantly, even with the screen off, and receipts print over WiFi.</p>
    <table style="font-size:14px;line-height:1.7;border-collapse:collapse;margin:12px 0">${rows}</table>
    ${iosSoon}
    <p style="font-size:12px;color:#9ca3af;margin-top:20px">You asked us to send you this link from your Fee Free Ordering dashboard. If that wasn't you, you can ignore this email.</p>
  </div>`;
  return send({
    to: params.to,
    subject: "Your Kitchen Order App download link",
    html,
  });
}

/**
 * The order-timing block's four PRE-FORMATTED strings, built once so the
 * customer's email and the STAFF copy of the same order can never disagree
 * about when it was placed or when it is due (Luigi 2026-08-07).
 *
 * Everything renders in the RESTAURANT's timezone and 12h/24h preference, in
 * the recipient's locale — the convention every clock string in this file
 * follows. A scheduled order's promise IS its slot, so the ready row reuses the
 * slot label rather than printing a second, slightly different time beside it.
 */
function buildTimingLabels(
  p: {
    placedAt?: Date | string | null;
    estimatedReady?: Date | string | null;
    estimatedMinutes?: number | null;
    orderType?: string | null;
    timezone?: string;
    hoursFormat?: "12h" | "24h";
    locale?: string | null;
  },
  t: Awaited<ReturnType<typeof getDict>>,
  scheduledLabel: string | null,
): { placedAtLabel: string | null; prepTimeLabel: string | null; readyAtLabel: string | null; readyRowLabel: string } {
  const stamp = (d: Date) =>
    formatDateCapitalized(d, p.locale || "en", {
      timeZone: p.timezone || "UTC",
      weekday: "long", day: "numeric", month: "long",
      hour: "numeric", minute: "2-digit",
      hourCycle: p.hoursFormat === "24h" ? "h23" : "h12",
    });
  const asDate = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  const placed = asDate(p.placedAt);
  const ready = asDate(p.estimatedReady);
  const mins = p.estimatedMinutes ?? 0;
  const ty = (p.orderType ?? "").toLowerCase();
  return {
    placedAtLabel: placed ? stamp(placed) : null,
    prepTimeLabel: mins > 0 ? `${mins} ${t("email.orderConfirmed.minutesLabel")}` : null,
    readyAtLabel: scheduledLabel ?? (ready ? stamp(ready) : null),
    readyRowLabel:
      ty === "delivery" ? t("email.timing.deliveryTime")
      : (ty === "pickup" || ty === "takeout" || ty === "curbside") ? t("email.timing.pickupTime")
      : t("email.timing.readyTime"),
  };
}

export async function sendOrderConfirmationEmail(params: OrderEmailParams) {
  const t = await getDict(params.locale);
  // Auto-accepted orders get the CONFIRMED subject — the inbox line is the only
  // thing many customers read, and "awaiting confirmation" on an order the
  // kitchen already took is simply false (Luigi 2026-08-11).
  const subject = t(
    params.alreadyAccepted ? "email.orderConfirmed.subjectAccepted" : "email.orderConfirmed.subject",
    { orderNumber: params.orderNumber },
  );
  // Pre-format the scheduled slot in the restaurant's timezone + customer
  // locale (only for future-dated "order for later" orders). Luigi 2026-06-05.
  const schedDate = params.scheduledFor ? new Date(params.scheduledFor) : null;
  const scheduledLabel = schedDate && schedDate.getTime() > Date.now()
    ? (() => {
        const start = schedDate.toLocaleString(params.locale || undefined, {
          timeZone: params.timezone || "UTC",
          weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          // Follow the restaurant's 12h/24h setting, not the locale default.
          hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
        });
        // Range-mode slot (Fabrizio cmqqxerxs): the promise is a WINDOW —
        // append its end so the email reads "… 6:00 PM – 6:15 PM".
        const w = params.scheduledSlotMinutes;
        if (typeof w === "number" && w > 0) {
          const end = new Date(schedDate.getTime() + w * 60_000).toLocaleTimeString(params.locale || undefined, {
            timeZone: params.timezone || "UTC",
            hour: "numeric", minute: "2-digit",
            hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
          });
          return `${start} – ${end}`;
        }
        return start;
      })()
    : null;
  const { placedAtLabel, prepTimeLabel, readyAtLabel, readyRowLabel } = buildTimingLabels(
    { ...params, estimatedMinutes: params.estimatedTime },
    t,
    scheduledLabel,
  );

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
  // Closed-hours opening time (cms0gyexp #8, GloriaFood parity): alertAt is a
  // real UTC instant, so unlike the wall-clock reservation label this DOES
  // format in the restaurant's timezone. Capitalized weekday/month for
  // Romance locales. Null/past → the generic closedNote fallback renders.
  const opensDate = params.opensAt ? new Date(params.opensAt) : null;
  const opensAtLabel = opensDate && Number.isFinite(opensDate.getTime()) && opensDate.getTime() > Date.now()
    ? formatDateCapitalized(opensDate, params.locale || "en", {
        timeZone: params.timezone || "UTC",
        weekday: "long", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit",
        hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
      })
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
      placedAtLabel,
      prepTimeLabel,
      readyAtLabel,
      readyRowLabel,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      items: params.items as EmailOrderItem[],
      subtotal: params.subtotal ?? params.total,
      taxAmount: params.taxAmount,
      deliveryFee: params.deliveryFee,
      // NOT passed: OrderConfirmation derives the waived fee itself from
      // appliedPromos — a second source could let the two disagree.
      tip: params.tip,
      depositTotal: params.depositTotal,
      discount: params.discount,
      serviceFees: params.serviceFees,
      total: params.total,
      deliveryAddress: params.deliveryAddress,
      trackingUrl: params.trackingUrl,
      cancelUrl: params.cancelUrl,
      placedWhileClosed: params.placedWhileClosed,
      alreadyAccepted: params.alreadyAccepted,
      opensAtLabel,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      logoUrl: params.logoUrl,
      imprint: currentImprint(),
      appliedPromos: params.appliedPromos,
      currency: params.currency,
      // Store-credit part-payment + payment method (Luigi 2026-07-02) — the
      // payment label resolves HERE where the RAW order type is available
      // (the template's orderType is already localized).
      creditApplied: params.creditApplied,
      rewardLabel: params.rewardLabel,
      rewardEarned: params.rewardEarned,
      paidStatus: params.paidStatus,
      paymentValue: (() => {
        if (!params.paymentMethod) return undefined;
        const key = paymentMethodLabelKey(params.paymentMethod, params.orderType);
        return key ? t(key) : params.paymentMethod.charAt(0).toUpperCase() + params.paymentMethod.slice(1);
      })(),
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
  /** Raw payment method — when not paid online, the chip says WHAT to
   *  collect: cash vs card at handoff (Luigi 2026-07-04). */
  paymentMethod?: string;
  items?: EmailOrderItem[];
  subtotal?: number;
  taxAmount?: number;
  deliveryFee?: number;
  /** Fee waived by a free-delivery promo. A waived fee is stored as 0 and a $0
   *  row is hidden, so without this the promo left no trace on the staff email —
   *  it read as though delivery had been forgotten. Luigi 2026-07-31. */
  savedDeliveryFee?: number;
  tip?: number;
  /** Sum of per-item refundable deposits (untaxed; already inside total). */
  depositTotal?: number;
  discount?: number;
  /** The individual promos behind `discount` — each rendered as its own named
   *  row so a reader can see WHICH specials applied, not just the total.
   *  Excludes free_delivery (shown on the delivery row). Luigi 2026-08-11. */
  discountBreakdown?: Array<{ name?: string; amount?: number; couponCode?: string }>;
  /** Per-order service/other fees (parsed [{name, amount}]) — named rows. */
  serviceFees?: Array<{ name?: string; amount?: number }>;
  deliveryAddress?: string | null;
  customerNotes?: string | null;
  /** Reserve-then-order: the table booking attached to this order, so the
   *  STORE copy also flags "table reservation + pre-order". Luigi 2026-06-08. */
  reservation?: { partySize: number; date: string; time: string } | null;
  /** Restaurant 12h/24h preference — clock-time formatting. */
  hoursFormat?: "12h" | "24h";
  /** Store credit paid on this order + the reward name — drives the
   *  "Paid with X" / "To collect" rows (Luigi 2026-07-02). */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** Projected credit the customer will EARN on this order. The customer's
   *  confirmation already showed it; this STAFF copy of the same order did
   *  not, so the two receipts disagreed. Luigi 2026-08-07. */
  rewardEarned?: number;
  /** Order-timing block inputs — raw instants, formatted below in the
   *  restaurant's clock so staff and customer read the SAME times. */
  /** Confirmed prep minutes. The staff email never received this, so its
   *  header subtitle silently rendered without a prep time. Luigi 2026-08-07. */
  estimatedMinutes?: number | null;
  placedAt?: Date | string | null;
  estimatedReady?: Date | string | null;
  scheduledFor?: Date | string | null;
  scheduledSlotMinutes?: number | null;
  timezone?: string;
  /** Auto-accept (or reservation auto-confirm) made this order `accepted` at
   *  CREATE. It never transitions pending → accepted, so the acceptance email
   *  below never fires — THIS email is the store's only copy and must carry the
   *  confirmation itself. Subject, badge and footer all switch. Same rule as the
   *  customer twin `sendOrderConfirmationEmail({ alreadyAccepted })`; any NEW
   *  way for an order to be born accepted must set it. Luigi 2026-08-12. */
  alreadyAccepted?: boolean;
  /** The REAL auto-reject window in minutes (auto-reject-window.ts). Undefined
   *  → the old generic "within your configured timeout" sentence, which named a
   *  setting that has never existed. Luigi 2026-08-12. */
  autoRejectMinutes?: number;
  /** Order landed while the shop was closed: its window starts at OPENING, not
   *  at placement, so it gets its own sentence. */
  placedWhileClosed?: boolean;
}) {
  const t = await getDict(params.locale);
  const subject = t(
    params.alreadyAccepted ? "email.newOrder.subjectAutoAccepted" : "email.newOrder.subject",
    { orderNumber: params.orderNumber, restaurant: params.restaurantName },
  );
  // Same timing block the CUSTOMER's confirmation shows — one builder, so the
  // two copies of an order can never quote different times. Luigi 2026-08-07.
  const staffSchedDate = params.scheduledFor ? new Date(params.scheduledFor) : null;
  const staffScheduledLabel = staffSchedDate && Number.isFinite(staffSchedDate.getTime()) && staffSchedDate.getTime() > Date.now()
    ? (() => {
        const start = staffSchedDate.toLocaleString(params.locale || undefined, {
          timeZone: params.timezone || "UTC",
          weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
        });
        const w = params.scheduledSlotMinutes;
        if (typeof w === "number" && w > 0) {
          const end = new Date(staffSchedDate.getTime() + w * 60_000).toLocaleTimeString(params.locale || undefined, {
            timeZone: params.timezone || "UTC",
            hour: "numeric", minute: "2-digit",
            hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
          });
          return `${start} – ${end}`;
        }
        return start;
      })()
    : null;
  const staffTiming = buildTimingLabels(
    { ...params, estimatedMinutes: params.estimatedMinutes ?? 0, orderType: params.orderType },
    t,
    staffScheduledLabel,
  );
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
      t,
      restaurantName: params.restaurantName,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      orderType: params.orderType,
      paidOnline: params.paidOnline,
      paymentMethod: params.paymentMethod,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      items: params.items,
      subtotal: params.subtotal,
      taxAmount: params.taxAmount,
      deliveryFee: params.deliveryFee,
      savedDeliveryFee: params.savedDeliveryFee,
      tip: params.tip,
      depositTotal: params.depositTotal,
      discount: params.discount,
      discountBreakdown: params.discountBreakdown,
      serviceFees: params.serviceFees,
      total: params.total,
      deliveryAddress: params.deliveryAddress,
      customerNotes: params.customerNotes,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
      currency: params.currency,
      creditApplied: params.creditApplied,
      rewardLabel: params.rewardLabel,
      rewardEarned: params.rewardEarned,
      estimatedMinutes: params.estimatedMinutes ?? undefined,
      placedAtLabel: staffTiming.placedAtLabel,
      prepTimeLabel: staffTiming.prepTimeLabel,
      readyAtLabel: staffTiming.readyAtLabel,
      readyRowLabel: staffTiming.readyRowLabel,
      scheduledLabel: staffScheduledLabel,
      autoAccepted: params.alreadyAccepted === true,
      autoRejectMinutes: params.autoRejectMinutes,
      placedWhileClosed: params.placedWhileClosed === true,
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
  /** Store credit paid on this order + the reward name — the minimal accepted
   *  email shows "To collect $Y" instead of the misleading full total when the
   *  customer part-paid with credit (Luigi 2026-07-02). */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** True when the balance was captured online — flips "To collect" → "Collected". */
  paidOnline?: boolean;
  /** Raw payment method — when not paid online, the chip says WHAT to
   *  collect: cash vs card at handoff (Luigi 2026-07-04). */
  paymentMethod?: string;
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
      t,
      restaurantName: params.restaurantName,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      // Already accepted — the "Accept this order / auto-reject" hint would
      // be nonsense here (Luigi's live test, cms0gyexp).
      showAcceptHint: false,
      orderType: badgeType,
      reservationPartySize: resv?.partySize ?? null,
      reservationLabel,
      total: params.total,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
      currency: params.currency,
      headline: t("email.orderAccepted.badge"),
      creditApplied: params.creditApplied,
      rewardLabel: params.rewardLabel,
      paidOnline: params.paidOnline,
      paymentMethod: params.paymentMethod,
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
  /** The reason CODE the kitchen picked (kitchen.rejectReasons.*), when it was
   *  one of the presets rather than free text. `rejectionReason` is stored in
   *  the STAFF's language — correct for the restaurant's own records and UI,
   *  but it used to be mailed to the customer verbatim, so a restaurant with
   *  its app set to Chinese sent Chinese rejections to Italian diners
   *  (Fabrizio cms0gyexp #10). With the code we re-render the reason in the
   *  CUSTOMER's locale here instead. Absent (free-typed "other", or a legacy
   *  caller) → fall back to the stored text, exactly as before. */
  rejectionReasonKey?: string | null;
  trackingUrl?: string;
  /** Order's payment method — drives which refund copy renders on
   *  rejected/cancelled emails ("card → 5-10 business days", "PayPal
   *  → instant void", "cash → nothing to refund"). When undefined,
   *  the rejected/cancelled template renders the generic refund
   *  paragraph for backwards compat with callers that haven't been
   *  updated yet. */
  paidOnline?: boolean;
  paymentMethod?: string;
  /** PRE-FORMATTED store-credit amount returned to the wallet on a
   *  rejected/cancelled order (caller formats + gates on rewardsEnabled). */
  creditReturned?: string;
  rewardLabel?: string | null;
  /** POSITIVE-status money summary — PRE-FORMATTED. The "accepted" email is
   *  the real confirmation but carried no totals, so a customer who paid with
   *  store credit was never told. Pass only when credit was actually applied
   *  (the template renders nothing otherwise). Luigi 2026-08-07. */
  creditUsed?: string;
  orderTotalLabel?: string;
  amountDueLabel?: string;
  balanceSettled?: boolean;
  /** WHO cancelled (status "cancelled" only): "customer" switches the copy
   *  to the you-cancelled variant. Fabrizio cms0idtz7. */
  cancelledBy?: string;
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
  /** Order type (pickup/takeout/curbside vs delivery) — drives the SERVICE-
   *  specific estimated-time line on the accepted email ("Estimated pickup
   *  time" vs "Estimated delivery time"), Fabrizio cms0gyexp #15. Absent /
   *  dine-in falls back to the generic "Estimated time" line. */
  orderType?: string;
}) {
  const t = await getDict(params.locale);
  const subject = t("email.orderStatus.subject", { orderNumber: params.orderNumber });
  // Format the estimated-ready instant in the RESTAURANT's timezone + the
  // customer's locale (was bare toLocaleString() → server UTC, so a Thursday
  // 8:45 PM slot showed the wrong time). Luigi 2026-06-05.
  // FULL/long date (weekday + day + month + clock) so the accepted email reads
  // "Saturday 1 August, 1:48 PM" rather than the abbreviated "Sat 1 Aug" —
  // Fabrizio cms0gyexp #15 asked for the complete date spelled out.
  const readyStrRaw = params.estimatedReady
    ? params.estimatedReady.toLocaleString(params.locale || undefined, {
        timeZone: params.timezone || "UTC",
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
      })
    : null;
  // Capitalize the leading letter. Locales like Italian render the weekday
  // lowercase ("sabato 1 agosto alle ore 13:48"), but this string always sits
  // right after "…previsto:" so a leading capital reads correctly and matches
  // Fabrizio's requested "Sabato 1 Agosto…" (cms0gyexp #15). Cross-locale-safe:
  // a leading capital after a colon is fine in every language (already-capital
  // locales like English/German are unchanged).
  const readyStr = readyStrRaw ? readyStrRaw.charAt(0).toUpperCase() + readyStrRaw.slice(1) : null;
  // SERVICE-specific estimated-time sentence: pickup/takeout/curbside →
  // "Estimated pickup time", delivery → "Estimated delivery time", dine-in /
  // unknown → the generic "Estimated time". Fabrizio cms0gyexp #15.
  const estimatedKey = (() => {
    const type = (params.orderType ?? "").toLowerCase();
    if (type === "delivery") return "email.orderStatus.estimatedDelivery";
    if (type === "pickup" || type === "takeout" || type === "curbside")
      return "email.orderStatus.estimatedPickup";
    return "email.orderStatus.estimatedReady";
  })();
  const html = await renderEmail(
    OrderStatusUpdate({
      t,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      status: params.status,
      // ONLY the estimated-ready suffix — the template owns the localized
      // per-status body and appends this on POSITIVE updates only. The old
      // composition here injected the RAW status word into the sentence
      // ("è ora rejected") and glued "Estimated ready: 10:00" onto missed/
      // rejected emails. Fabrizio cmr6meaaq, 2026-07-04.
      statusMessage: readyStr
        ? t(estimatedKey, { time: readyStr })
        : undefined,
      // Forward the rejection reason (if any) so the template can surface
      // it. Previously dropped on the floor — customer never saw WHY their
      // order was declined.
      //
      // Preset reasons are re-rendered from their CODE in the customer's
      // locale (t is already bound to it); free text is passed through as
      // typed. `t()` returns the key path itself when a key is missing, so
      // an unknown/legacy code falls back to the stored text rather than
      // mailing a raw "kitchen.rejectReasons.x" token. Fabrizio cms0gyexp #10.
      rejectionReason: (() => {
        const key = params.rejectionReasonKey?.trim();
        if (!key || key === "other") return params.rejectionReason;
        const path = `kitchen.rejectReasons.${key}`;
        const localized = t(path);
        return localized && localized !== path ? localized : params.rejectionReason;
      })(),
      // Real status-page link. Previously was always "#" because the
      // dispatcher never threaded a trackingUrl through — the customer's
      // "View order status" button was a no-op. Luigi bug 2026-05-31.
      trackingUrl: params.trackingUrl ?? "#",
      paidOnline: params.paidOnline,
      paymentMethod: params.paymentMethod,
      creditReturned: params.creditReturned,
      rewardLabel: params.rewardLabel,
      creditUsed: params.creditUsed,
      orderTotalLabel: params.orderTotalLabel,
      amountDueLabel: params.amountDueLabel,
      balanceSettled: params.balanceSettled,
      cancelledBy: params.cancelledBy,
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
  /** Order type — drives the SERVICE-specific new-ETA sentence ("new estimated
   *  pickup time" vs "delivery time"). Absent/dine-in falls back to pickup
   *  wording. Fabrizio cms0gyexp #15. */
  orderType?: string;
  /** Restaurant IANA timezone — REQUIRED for a correct clock. Without it the
   *  new ETA rendered in the server's UTC and told the customer a time hours
   *  off. Fabrizio cms0gyexp #16. */
  timezone?: string;
  hoursFormat?: "12h" | "24h";
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
      orderType: params.orderType,
      timezone: params.timezone,
      hoursFormat: params.hoursFormat,
      locale: params.locale,
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
  /** Order money for the STAFF copy — PRE-FORMATTED, caller supplies the
   *  currency. These emails carried no amounts at all, so the owner learned an
   *  order died without learning what it was worth or that store credit went
   *  back to the customer's wallet. Luigi 2026-08-07. */
  orderTotalLabel?: string;
  creditReturnedLabel?: string;
  collectedLabel?: string;
  rewardLabel?: string | null;
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
      orderTotalLabel: params.orderTotalLabel,
      creditReturnedLabel: params.creditReturnedLabel,
      collectedLabel: params.collectedLabel,
      rewardLabel: params.rewardLabel,
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
  /** Order money for the STAFF copy — PRE-FORMATTED, caller supplies the
   *  currency. These emails carried no amounts at all, so the owner learned an
   *  order died without learning what it was worth or that store credit went
   *  back to the customer's wallet. Luigi 2026-08-07. */
  orderTotalLabel?: string;
  creditReturnedLabel?: string;
  collectedLabel?: string;
  rewardLabel?: string | null;
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
      orderTotalLabel: params.orderTotalLabel,
      creditReturnedLabel: params.creditReturnedLabel,
      collectedLabel: params.collectedLabel,
      rewardLabel: params.rewardLabel,
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

/** STAFF ping: a new customer created an account at the restaurant (Luigi
 *  2026-07-11). Body English-only (staff convention); subject localized to
 *  the recipient's emailLanguage. Gated upstream by the NotificationRecipient
 *  `customerSignup` toggle (default OFF). */
export async function sendCustomerSignupNotificationEmail(params: {
  to: string;
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    CustomerSignupNotification({
      t,
      restaurantName: params.restaurantName,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.customerSignup.subject", { restaurant: params.restaurantName, customer: params.customerName }),
    html,
  });
}

/** STAFF email: an order's automatic ShipDay dispatch was REJECTED (Luigi
 *  2026-08-03) — no driver has been assigned and the customer is waiting.
 *  Fired from the accept-hook fire-and-forget path in
 *  POST /api/orders/[id] (via notifyStaff), gated on the
 *  NotificationRecipient `dispatchRejected` toggle (default ON). Fully
 *  localized per recipient emailLanguage, same as sendOrderRejectedEmail. */
export async function sendDispatchRejectedEmail(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  reason?: string;
  dashboardUrl: string;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    DispatchRejected({
      t,
      restaurantName: params.restaurantName,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      reason: params.reason ?? null,
      dashboardUrl: params.dashboardUrl,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.dispatchRejected.subject", { orderNumber: params.orderNumber }),
    html,
  });
}

/** CUSTOMER email: the restaurant gifted them reward dollars (Luigi
 *  2026-07-11). Fully localized; caller gates on rewardsEnabled +
 *  marketingConsent and pre-formats the amounts. */
export async function sendRewardGiftEmail(params: {
  to: string;
  /** Restaurant id — scopes the signed unsubscribe / delete-data footer links. */
  restaurantId: string;
  customerName: string;
  restaurantName: string;
  amountLabel: string;
  rewardLabel: string;
  balanceLabel: string;
  note?: string | null;
  orderUrl: string;
  /** Restaurant contact email — Reply-To so a customer's reply reaches the
   *  restaurant, not the platform inbox (deliverability, cms0gyexp #3). */
  restaurantEmail?: string | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const opt = await buildOptOutFooter({ restaurantId: params.restaurantId, email: params.to, restaurantUrl: params.orderUrl, locale: params.locale });
  const html = await renderEmail(
    RewardGift({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      amountLabel: params.amountLabel,
      rewardLabel: params.rewardLabel,
      balanceLabel: params.balanceLabel,
      note: params.note,
      // Step 1 names the address to sign in with — a different address is a
      // different wallet, and that mix-up is exactly how a gift looks "broken".
      giftEmail: params.to,
      orderUrl: params.orderUrl,
      imprint: currentImprint(),
      unsubscribeUrl: opt.unsubscribeUrl,
      dataDeletionUrl: opt.dataDeletionUrl,
      marketingStrings: opt.marketingStrings,
    })
  );
  return send({
    to: params.to,
    subject: t("email.rewardGift.subject", { restaurant: params.restaurantName, amount: params.amountLabel, label: params.rewardLabel }),
    html,
    fromName: params.restaurantName,
    replyTo: params.restaurantEmail,
    listUnsubscribeUrl: opt.unsubscribeUrl,
  });
}

/** CUSTOMER email: gifted reward dollars to an email with NO account yet
 *  (Luigi 2026-07-28) — "create your account with this email to claim". The
 *  PendingRewardGrant waits server-side; the signup hook credits it
 *  automatically. 1:1, owner-initiated (Gift form carries the CASL reminder). */
export async function sendRewardGiftInviteEmail(params: {
  to: string;
  /** Restaurant id — scopes the signed unsubscribe / delete-data footer links. */
  restaurantId: string;
  customerName: string;
  restaurantName: string;
  amountLabel: string;
  rewardLabel: string;
  note?: string | null;
  orderUrl: string;
  /** Restaurant contact email — Reply-To (deliverability, cms0gyexp #3). */
  restaurantEmail?: string | null;
  locale?: string;
  /** Gift Wallet Pass — spend without an account (2026-08-03). When present,
   *  the email leads with "spend now", the code printed as text, and demotes
   *  signup to a secondary link. `spendUrl` carries the code in the URL
   *  FRAGMENT only. */
  spendUrl?: string | null;
  code?: string | null;
  codeExpiryLabel?: string | null;
}) {
  const t = await getDict(params.locale);
  const opt = await buildOptOutFooter({ restaurantId: params.restaurantId, email: params.to, restaurantUrl: params.orderUrl, locale: params.locale });
  const html = await renderEmail(
    RewardGiftInvite({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      amountLabel: params.amountLabel,
      rewardLabel: params.rewardLabel,
      note: params.note,
      orderUrl: params.orderUrl,
      giftEmail: params.to,
      imprint: currentImprint(),
      spendUrl: params.spendUrl,
      code: params.code,
      codeExpiryLabel: params.codeExpiryLabel,
      unsubscribeUrl: opt.unsubscribeUrl,
      dataDeletionUrl: opt.dataDeletionUrl,
      marketingStrings: opt.marketingStrings,
    })
  );
  return send({
    to: params.to,
    subject: t("email.rewardGiftInvite.subject", { restaurant: params.restaurantName, amount: params.amountLabel, label: params.rewardLabel }),
    html,
    fromName: params.restaurantName,
    replyTo: params.restaurantEmail,
    listUnsubscribeUrl: opt.unsubscribeUrl,
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
  /** Pre-formatted store credit returned to the wallet on a FULL refund of a
   *  credit-part-paid order ("$10.00") — without it the email claims "Full
   *  refund — $20.00" and never mentions the bucks (audit 2026-07-11).
   *  Caller gates on rewardsEnabled. */
  creditReturnedLabel?: string;
  rewardLabel?: string | null;
  /** Restaurant contact email — Reply-To (deliverability, cms0gyexp #3). */
  restaurantEmail?: string | null;
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
      creditReturnedLabel: params.creditReturnedLabel,
      rewardLabel: params.rewardLabel,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.orderRefund.subject", { orderNumber: params.orderNumber }),
    html,
    fromName: params.restaurantName,
    replyTo: params.restaurantEmail,
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
  /** Restaurant id — scopes the signed unsubscribe / delete-data footer links. */
  restaurantId: string;
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
  const opt = await buildOptOutFooter({ restaurantId: params.restaurantId, email: params.to, restaurantUrl: params.restaurantUrl, locale: params.locale });
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
      unsubscribeUrl: opt.unsubscribeUrl,
      dataDeletionUrl: opt.dataDeletionUrl,
      marketingStrings: opt.marketingStrings,
    }),
  );
  return send({
    to: params.to,
    subject: t("email.couponAssigned.subject", { restaurantName: params.restaurantName, discountLabel }),
    html,
    replyTo: params.restaurantEmail ?? undefined,
    fromName: params.restaurantName,
    listUnsubscribeUrl: opt.unsubscribeUrl,
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
  /** Restaurant id — scopes the signed unsubscribe / delete-data footer links. */
  restaurantId: string;
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
  /** True when the promo is saved with Client type = "Members only", which the
   *  engine refuses for anyone not SIGNED IN. Switches the instructions from
   *  "type this email at checkout" to "sign in first", so this email can never
   *  advertise a route that checkout will silently reject. Luigi 2026-07-31. */
  requiresSignIn?: boolean;
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
  const vipOpt = await buildOptOutFooter({ restaurantId: params.restaurantId, email: params.to, restaurantUrl: params.restaurantUrl, locale: params.locale });
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
  // ── Never promise a route the engine will refuse ─────────────────────────
  // A promo saved with Client type = "Members only" is rejected for anyone who
  // is not SIGNED IN (promo-engine: customerType === "member" && !ctx.isMember),
  // and for a guest `isMember` is satisfied only by a marketplace account — so
  // "just type this email at checkout" would be a promise checkout silently
  // breaks, with the customer seeing full price and no explanation. When the
  // promo carries that restriction we send the sign-in wording instead, to
  // everyone, whether or not they already have an account. Luigi 2026-07-31:
  // an advertised deal must work when the customer tries it.
  const usageNote = params.requiresSignIn
    ? t("email.vipSpecial.usageSignIn", { discountLabel, email: params.to })
    : params.hasAccount
      ? t("email.vipSpecial.usageAccount", { discountLabel })
      : t("email.vipSpecial.usageGuest", { discountLabel, email: params.to });
  // The "create an account" nudge is optional convenience normally, but when
  // the deal REQUIRES a session it is the instruction — so keep it for
  // account-holders too, worded as sign-in rather than sign-up.
  const accountTip = params.requiresSignIn
    ? t("email.vipSpecial.accountTipSignIn")
    : params.hasAccount ? undefined : t("email.vipSpecial.accountTip");
  const html = await renderEmail(
    CouponAssigned({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      code: "",
      discountLabel,
      // The offer's own title, so the customer can tell WHICH deal this is.
      dealName: params.dealName,
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
      unsubscribeUrl: vipOpt.unsubscribeUrl,
      dataDeletionUrl: vipOpt.dataDeletionUrl,
      marketingStrings: vipOpt.marketingStrings,
    }),
  );
  return send({
    to: params.to,
    subject: t("email.vipSpecial.subject", { memberLabel, restaurantName: params.restaurantName, discountLabel }),
    html,
    replyTo: params.restaurantEmail ?? undefined,
    fromName: params.restaurantName,
    listUnsubscribeUrl: vipOpt.unsubscribeUrl,
  });
}

/**
 * "You've been added to <group>" — the welcome a new VIP member gets, naming
 * the perks that come with it (Luigi 2026-07-31: members were being added
 * completely silently, so they never learned they had a discount waiting).
 *
 * Reuses the CouponAssigned shell exactly like sendVipSpecialEmail does —
 * `termLines` carries the perk list (earn rate, each attached member special),
 * built by the caller so this function stays presentation-only.
 *
 * Guests (no account) get the same email plus the account nudge: their perks
 * already apply when they type this address at checkout, but Reward Dollars
 * need an account to live in.
 */
export async function sendVipGroupWelcomeEmail(params: {
  to: string;
  /** Restaurant id — scopes the signed unsubscribe / delete-data footer links. */
  restaurantId: string;
  customerName: string;
  restaurantName: string;
  /** What this GROUP calls its members — falls back to the restaurant default.
   *  Used as the headline chip only. The SENTENCES use groupName, because a
   *  label is freely typed and is often plural ("VIP Members"), which made
   *  "you are now a VIP Members" — the group name reads correctly either way. */
  memberLabel?: string | null;
  /** The group's own name, e.g. "Luigi's VIP Pizza Club". */
  groupName: string;
  /** Pre-formatted perk lines, e.g. "10% back in Luigi Bucks on every order". */
  perkLines: string[];
  /** The restaurant's own name for its credit ("Luigi Buck's"). Used to explain
   *  that DISCOUNTS follow the typed email but CREDIT needs an account, which is
   *  the one distinction this email previously blurred. Falls back to the
   *  localized default. Luigi 2026-07-31. */
  rewardLabel?: string | null;
  hasAccount: boolean;
  orderUrl: string;
  signupUrl?: string;
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const grpOpt = await buildOptOutFooter({ restaurantId: params.restaurantId, email: params.to, restaurantUrl: params.restaurantUrl, locale: params.locale });
  const memberLabel = params.memberLabel?.trim() || t("email.vipSpecial.defaultMemberLabel");
  const groupRewardLabel = params.rewardLabel?.trim() || t("checkout.reward.defaultPlural");
  const html = await renderEmail(
    CouponAssigned({
      t,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      code: "",
      // The headline IS the membership here, not a discount amount.
      discountLabel: memberLabel,
      termLines: params.perkLines,
      orderUrl: params.orderUrl,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantPhone: params.restaurantPhone ?? undefined,
      imprint: currentImprint(),
      memberSpecial: true,
      introOverride: t("email.vipGroupWelcome.intro", { groupName: params.groupName, restaurantName: params.restaurantName }),
      usageNote: params.hasAccount
        ? t("email.vipGroupWelcome.usageAccount")
        : t("email.vipGroupWelcome.usageGuest", { email: params.to, label: groupRewardLabel }),
      // Kept for account-holders too: having an account is not the same as being
      // SIGNED IN, and the balance is invisible at checkout without a session.
      accountTip: t("email.vipGroupWelcome.accountTip", { label: groupRewardLabel }),
      unsubscribeUrl: grpOpt.unsubscribeUrl,
      dataDeletionUrl: grpOpt.dataDeletionUrl,
      marketingStrings: grpOpt.marketingStrings,
    }),
  );
  return send({
    to: params.to,
    subject: t("email.vipGroupWelcome.subject", { groupName: params.groupName, restaurantName: params.restaurantName }),
    html,
    replyTo: params.restaurantEmail ?? undefined,
    fromName: params.restaurantName,
    listUnsubscribeUrl: grpOpt.unsubscribeUrl,
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
  // "cancelled" = the CUSTOMER cancelled via the emailed link (cms0idtz7).
  status: "requested" | "confirmed" | "declined" | "missed" | "cancelled";
  depositPaid?: boolean;
  depositAmount?: number;
  preOrderTotal?: number;
  /** Guest self-cancel page link (purpose-scoped token) — the italic "you can
   *  still cancel your table reservation here" line on requested/confirmed. */
  cancelUrl?: string;
  /** Restaurant 12h/24h preference — formats the reservation time so the email
   *  matches the restaurant's setting (was always 24h). Luigi 2026-06-08. */
  hoursFormat?: "12h" | "24h";
  /** Booked while the restaurant was CLOSED — the "requested" email adds the
   *  closed-hours note; with opensAt (Reservation.alertAt) + timezone it names
   *  the concrete opening time (orders got this in cms0gyexp #8). */
  bookedWhileClosed?: boolean;
  opensAt?: Date | string | null;
  timezone?: string;
  /** Restaurant contacts for the footer (cms0gyexp #4) — the closing line
   *  says "contact us using the details below"; these make it true. */
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  /** Smart buttons (cmsajnvkm) + the guest's own notes echoed back. */
  specialRequests?: string | null;
  adultsCount?: number | null;
  childrenCount?: number | null;
  details?: import("@/lib/reservation-details").ReservationDetails | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const timeLabel = formatTime(params.time, params.hoursFormat ?? "24h");
  // Closed-hours opening time — mirrors the order-confirmation label: alertAt
  // is a real UTC instant, so it formats in the restaurant's timezone.
  // Null/past → the generic closedNote fallback renders.
  const opensDate = params.opensAt ? new Date(params.opensAt) : null;
  const opensAtLabel = opensDate && Number.isFinite(opensDate.getTime()) && opensDate.getTime() > Date.now()
    ? formatDateCapitalized(opensDate, params.locale || "en", {
        timeZone: params.timezone || "UTC",
        weekday: "long", day: "numeric", month: "short",
        hour: "numeric", minute: "2-digit",
        hourCycle: params.hoursFormat === "24h" ? "h23" : "h12",
      })
    : null;
  // Localized human date, NOT the raw ISO + English "at" the email used to
  // show ("2026-07-25 at 19:00" — Fabrizio cms0gyexp). The stored date/time
  // are the restaurant's LOCAL wall clock, so no timeZone conversion; weekday
  // + month per the customer's locale, capitalized for Romance locales, then
  // the time per the restaurant's 12h/24h setting. Comma-joined — no
  // translatable connector word needed.
  const dateObj = new Date(`${params.date}T${params.time}:00`);
  const dateTimeLabel = Number.isFinite(dateObj.getTime())
    ? `${formatDateCapitalized(dateObj, params.locale || "en", { weekday: "long", day: "numeric", month: "long" })}, ${timeLabel}`
    : `${params.date}, ${timeLabel}`;
  const html = await renderEmail(
    ReservationConfirmation({
      t,
      status: params.status,
      customerName: params.customerName,
      reservationNumber: params.confirmationCode,
      restaurantName: params.restaurantName,
      dateTime: dateTimeLabel,
      partySize: params.partySize,
      specialRequests: params.specialRequests,
      adultsCount: params.adultsCount,
      childrenCount: params.childrenCount,
      details: params.details,
      depositPaid: params.depositPaid,
      cancelUrl: params.cancelUrl,
      bookedWhileClosed: params.bookedWhileClosed,
      opensAtLabel,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail ?? undefined,
      restaurantPhone: params.restaurantPhone ?? undefined,
      imprint: currentImprint(),
    })
  );
  const subjectSuffix =
    params.status === "cancelled" ? "Cancelled"
    : (params.status === "declined" || params.status === "missed") ? "Declined"
    : params.status === "requested" ? "Requested" : "";
  return send({
    to: params.to,
    subject: t(`email.reservationConfirmed.subject${subjectSuffix}`),
    html,
    // Show the restaurant's name as the sender (display name), like order
    // emails — the address stays the platform's verified sender. Fabrizio
    // report cmpxeljn6.
    fromName: params.restaurantName,
    // Replies go to the restaurant, not the platform inbox (cms0gyexp #3/#4).
    replyTo: params.restaurantEmail,
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
  /** "cancelled" = the CUSTOMER cancelled via their emailed link (cms0idtz7)
   *  — the staff ping flips to the cancelled wording. */
  status: "pending" | "confirmed" | "cancelled";
  dashboardUrl: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** Guest's special requests / notes — amber card (cms0gyexp #1). */
  specialRequests?: string | null;
  /** Smart buttons (cmsajnvkm): adults/children split + structured details. */
  adultsCount?: number | null;
  childrenCount?: number | null;
  details?: import("@/lib/reservation-details").ReservationDetails | null;
  /** Restaurant 12h/24h preference for the reservation time. */
  hoursFormat?: "12h" | "24h";
  locale?: string;
}) {
  const t = await getDict(params.locale);
  // Localized human date (was "2026-07-25 at 19:00" — raw ISO + English "at",
  // Fabrizio cms0gyexp). Local wall clock — no timeZone conversion.
  const dateObj = new Date(`${params.date}T${params.time}:00`);
  const timeLabel = formatTime(params.time, params.hoursFormat ?? "24h");
  const dateTimeLabel = Number.isFinite(dateObj.getTime())
    ? `${formatDateCapitalized(dateObj, params.locale || "en", { weekday: "long", day: "numeric", month: "long" })}, ${timeLabel}`
    : `${params.date}, ${timeLabel}`;
  const html = await renderEmail(
    NewReservationNotification({
      t,
      restaurantName: params.restaurantName,
      reservationNumber: params.confirmationCode,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      dateTime: dateTimeLabel,
      partySize: params.partySize,
      specialRequests: params.specialRequests,
      adultsCount: params.adultsCount,
      childrenCount: params.childrenCount,
      details: params.details,
      dashboardUrl: params.dashboardUrl,
      cancelled: params.status === "cancelled",
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t(
      params.status === "cancelled"
        ? "email.newReservation.subjectCancelled"
        : "email.newReservation.subject",
      { restaurant: params.restaurantName },
    ),
    html,
  });
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string | null;
  resetUrl: string;
  /** Restaurant branding for STOREFRONT-customer resets (cms0gyexp #5 —
   *  white-label): brands the body copy ("your {restaurant} account"), the
   *  From display name, Reply-To, and the footer contacts. Omit for
   *  platform flows (owner / marketplace), which keep the platform brand. */
  restaurantName?: string;
  restaurantUrl?: string;
  restaurantEmail?: string | null;
  restaurantPhone?: string | null;
  locale?: string;
}) {
  const t = await getDict(params.locale);
  const html = await renderEmail(
    PasswordReset({
      t,
      name: params.name ?? undefined,
      resetUrl: params.resetUrl,
      accountName: params.restaurantName,
      restaurantName: params.restaurantName,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      imprint: currentImprint(),
    })
  );
  return send({
    to: params.to,
    subject: t("email.passwordReset.subject"),
    html,
    // Storefront resets ride the restaurant's identity like every other
    // customer email; platform flows keep the default sender.
    fromName: params.restaurantName,
    replyTo: params.restaurantEmail,
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
  /** ── Localizable form of the two labels above ──────────────────────────
   *  periodLabel/comparisonLabel are rendered ONCE when the digest is built,
   *  in English, and then reused for every recipient — so an Italian owner's
   *  otherwise-translated report still read "Thursday, July 30, 2026" and
   *  "vs same time yesterday". These carry the same facts structurally so the
   *  SENDER can render them in each recipient's own language. Optional: any
   *  consumer that ignores them keeps the pre-rendered English.
   *  Luigi 2026-07-31. */
  periodAnchorISO?: string;       // the day/month this report covers
  periodKind?: "day" | "month";
  timezone?: string;              // restaurant tz, so the date lands correctly
  comparisonKind?: "liveVsYesterday" | "vsPreviousDay" | "vsSameMonthLastYear";

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
  offlinePaymentsAmount: number;  // cash/card actually collected (net of store credit + refunds)
  onlinePayments: number;
  onlinePaymentsAmount: number;   // cash/card actually collected (net of store credit + refunds)
  /** Per-method online sub-buckets (sum = onlinePayments/Amount) — so PayPal
   *  money renders as "Online (PayPal)", not "Online (card)" (Fabrizio
   *  cms0gyexp #14). "Other" = reward_credit-covered orders + future methods. */
  onlineCardPayments: number;
  onlineCardPaymentsAmount: number;
  onlinePaypalPayments: number;
  onlinePaypalPaymentsAmount: number;
  onlineOtherPayments: number;
  onlineOtherPaymentsAmount: number;
  /** Reward / store credit spent across the window — a TENDER, not cash/card. */
  storeCreditRedeemed: number;
  /** Orders with a (partial or full) refund + total refunded back to customers
   *  across the window (Order.refundedAmount) — Fabrizio cms0gyexp #14. */
  refundedOrders: number;
  refundsAmount: number;
  /** Cancelled-or-rejected counts (info lines — these are EXCLUDED from the
   *  earned orders / tableReservations numbers). missedOrders = the auto-
   *  rejected subset (nobody accepted in time). */
  cancelledOrders: number;
  cancelledReservations: number;
  missedOrders: number;
  /** Real cash/card kept = sales − storeCreditRedeemed − refundsAmount. */
  collected: number;
  /** Promo + coupon discounts given across the window (Order.promoDiscount +
   *  Order.couponDiscount) — the EOD/Summary "Discounts" line. */
  discounts: number;

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

  // ── Render the two headline labels in THIS recipient's language ──────────
  // stats.periodLabel / comparisonLabel are built once, in English, and shared
  // by every recipient — so an Italian owner's otherwise fully-translated
  // report still opened with "Thursday, July 30, 2026" and "vs same time
  // yesterday". `t` here is already the recipient's own translator, so render
  // from the structured twins when the builder supplied them and fall back to
  // the prebuilt English when it did not. Luigi 2026-07-31.
  const localeTag = (t as any).locale || "en";
  const periodLabel = stats.periodAnchorISO
    ? new Date(stats.periodAnchorISO).toLocaleDateString(
        localeTag,
        stats.periodKind === "month"
          ? { month: "long", year: "numeric", timeZone: stats.timezone }
          : { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: stats.timezone },
      )
    : stats.periodLabel;
  const comparisonLabel = stats.comparisonKind
    ? t(`email.digest.comparison.${stats.comparisonKind}`)
    : stats.comparisonLabel;

  const html = await renderEmail(
    DigestEmail({
      period: kind,
      periodLabel,
      comparisonLabel,
      restaurantName: stats.restaurantName,
      t,
      // Same tag the headline labels are formatted with, so <html lang/dir>
      // agrees with the language the body actually renders in.
      locale: localeTag,
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
        // Discounts + store-credit reconciliation rows — were silently dropped
        // here, so the emailed breakdown didn't reconcile and the owner never
        // saw credit-vs-collected in the digest (audit 2026-07-11).
        discounts: stats.discounts,
        storeCreditRedeemed: stats.storeCreditRedeemed,
        // Refunds issued back to customers — netted out of "collected"
        // (Fabrizio cms0gyexp #14).
        refundsAmount: stats.refundsAmount,
        refundedOrders: stats.refundedOrders,
        collected: stats.collected,
      },
      pickup:    { count: stats.pickupOrders,   value: money(stats.pickupSales) },
      delivery:  { count: stats.deliveryOrders, value: money(stats.deliverySales) },
      onPremise: { count: stats.dineInOrders,   value: money(stats.dineInSales) },
      offlinePayments: { count: stats.offlinePayments, value: money(stats.offlinePaymentsAmount) },
      onlinePayments:  { count: stats.onlinePayments,  value: money(stats.onlinePaymentsAmount) },
      // Per-method online split — the template shows PayPal/other cards only
      // when a non-card method actually took money (Fabrizio cms0gyexp #14).
      onlineCardPayments:   { count: stats.onlineCardPayments,   value: money(stats.onlineCardPaymentsAmount) },
      onlinePaypalPayments: { count: stats.onlinePaypalPayments, value: money(stats.onlinePaypalPaymentsAmount) },
      onlineOtherPayments:  { count: stats.onlineOtherPayments,  value: money(stats.onlineOtherPaymentsAmount) },
      // Real signals now (were hardcoded true) — cancelled/rejected counts get
      // their own lines when nonzero.
      noMissedOrders: stats.missedOrders === 0,
      noCanceledOrders: stats.cancelledOrders === 0 && stats.cancelledReservations === 0,
      cancelledOrders: stats.cancelledOrders,
      cancelledReservations: stats.cancelledReservations,
      dashboardUrl,
      unsubscribeUrl,
      imprint: currentImprint(),
    })
  );
  // 🚨 NO one-click unsubscribe header on the owner's own business report.
  //
  // This used to pass `listUnsubscribeUrl`, which makes send() emit BOTH
  // `List-Unsubscribe` and `List-Unsubscribe-Post: One-Click` (RFC 8058) — the
  // bulk-sender contract. The URL pointed at /admin/notifications: an
  // authenticated admin page that redirects to /login and has no POST handler,
  // so the advertised one-click endpoint does not work.
  //
  // Declaring yourself bulk mail and then failing the one-click check is worse
  // than not declaring it at all. Microsoft 365 (where the owner's report
  // address lives) quarantines on exactly that, AFTER Resend has returned 200 —
  // so the sweep recorded a successful send and stamped the day as reported
  // while nothing reached the inbox. Every other staff email to the SAME
  // address carries no such header and arrives normally, which is why only the
  // end-of-day report went missing, for every restaurant. Luigi 2026-08-09.
  //
  // These reports are not bulk: they go to a handful of addresses the
  // restaurant itself entered, each with its own on/off toggle in
  // Settings → Notifications (linked from the footer). Gmail/Yahoo's bulk rules
  // apply at >5k recipients/day, which a per-restaurant staff report never hits.
  return send({
    to,
    subject: kind === "daily"
      ? t("email.digest.subjectDaily",   { restaurant: stats.restaurantName, period: periodLabel })
      : t("email.digest.subjectMonthly", { restaurant: stats.restaurantName, period: periodLabel }),
    html,
    // Send as the RESTAURANT, like every order email that does arrive, instead
    // of the bare platform default — one consistent sending identity per store.
    fromName: stats.restaurantName || undefined,
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

// ─── Marketing emails — THE compliance chokepoint ────────────────────
// Every marketing-class email (autopilot second-order / reengagement /
// cart-abandon, kickstarter cold invites, and every FUTURE marketing add-on)
// MUST go through sendMarketingEmail(). It is the single door that enforces:
//   GATE 1  unified suppression (do-not-email) — the Customer/Prospect silo fix
//   GATE 2  a valid CASL consent basis (present + inside the implied-consent window)
//   footer  the prominent CASL footer: WHY-received + Unsubscribe + Delete-my-data
//   header  RFC-8058 List-Unsubscribe (Gmail/Yahoo bulk rules)
//   tags    restaurantId/campaign so the Resend bounce/complaint webhook can attribute
// Direct resend.emails.send / the private send() with classification:"marketing"
// are additionally suppression-checked (see send()), and an ESLint rule blocks
// importing `resend` anywhere but this file.

/** Load the localized CASL marketing footer strings for a recipient's locale
 *  (restaurant.defaultLanguage), defaulting to English. Mirrors the unsubscribe
 *  route's dynamic-import loader. */
async function marketingFooterStrings(locale?: string | null): Promise<MarketingFooterStrings> {
  const pick = (m: any): MarketingFooterStrings | null => {
    const f = m?.emailFooter?.marketing;
    // The "Unsubscribe" label reuses the already-localized unsubscribe.title.
    const unsub = m?.unsubscribe?.title;
    return f?.whyReceiving && f?.deleteData && unsub
      ? { whyReceiving: f.whyReceiving, unsubscribe: unsub, deleteData: f.deleteData }
      : null;
  };
  const lc = locale && isSupportedLocale(locale) ? locale : "en";
  try {
    const got = pick((await import(`@/messages/${lc}.json`)).default);
    if (got) return got;
  } catch { /* fall through to en */ }
  return pick((await import(`@/messages/en.json`)).default)!;
}

/**
 * Localized copy for the "you're already a member" card that REPLACES the coupon
 * card when the owner has told Autopilot not to hand club members another code
 * (Luigi 2026-08-11, Ben Bilton). Same locale-resolution shape as
 * marketingFooterStrings — recipient locale, falling back to English.
 */
async function memberPerkStrings(locale?: string | null): Promise<{ title: string; body: string }> {
  const pick = (m: any): { title: string; body: string } | null => {
    const p = m?.emailFooter?.memberPerk;
    return p?.title && p?.body ? { title: p.title, body: p.body } : null;
  };
  const lc = locale && isSupportedLocale(locale) ? locale : "en";
  try {
    const got = pick((await import(`@/messages/${lc}.json`)).default);
    if (got) return got;
  } catch { /* fall through to en */ }
  return pick((await import(`@/messages/en.json`)).default)!;
}

/**
 * Per-recipient opt-out footer bits for a PROMOTIONAL email that isn't a bulk
 * campaign (personal coupon, VIP special, reward gift). These are already
 * consent-gated by their callers, but CASL still requires a VISIBLE unsubscribe
 * in the body — this builds the signed unsubscribe + delete-my-data links (on
 * the restaurant's branded origin) and the localized footer strings. The
 * returned `unsubscribeUrl` is also passed to send() as `listUnsubscribeUrl`.
 */
export async function buildOptOutFooter(args: {
  restaurantId: string;
  email: string;
  restaurantUrl?: string | null;
  locale?: string | null;
}): Promise<{ unsubscribeUrl: string; dataDeletionUrl: string; marketingStrings: MarketingFooterStrings }> {
  let origin: string | undefined;
  try { if (args.restaurantUrl) origin = new URL(args.restaurantUrl).origin; } catch { /* platform fallback */ }
  return {
    unsubscribeUrl: customerUnsubscribeUrl({ restaurantId: args.restaurantId, email: args.email, origin }),
    dataDeletionUrl: dataDeletionUrl({ restaurantId: args.restaurantId, email: args.email, origin }),
    marketingStrings: await marketingFooterStrings(args.locale),
  };
}

/** Brief confirmation that a data-erasure request was completed. Sent to the
 *  (now-removed) address so the person has a record the request was honored. */
export async function sendErasureConfirmationEmail(params: {
  to: string;
  restaurantName: string;
}): Promise<{ success: boolean; error?: string }> {
  const safeName = escapeHtml(params.restaurantName || "the restaurant");
  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#111827;line-height:1.6">` +
    `<p>This confirms that ${safeName} has removed the personal data linked to this email address and has stopped all marketing to it.</p>` +
    `<p style="color:#6b7280;font-size:13px">Records required for tax and accounting are kept only in anonymized form, with nothing that identifies you.</p>` +
    `</div>`;
  return send({
    to: params.to,
    subject: `Your data has been removed — ${params.restaurantName}`,
    html,
    fromName: params.restaurantName,
  });
}

/** Deliver a DSAR data export (the "download my data" request) to the on-file
 *  address ONLY — the JSON is attached, never rendered to a token bearer. */
export async function sendDataExportEmail(params: {
  to: string;
  restaurantName: string;
  jsonContent: string;
}): Promise<{ success: boolean; error?: string }> {
  const safeName = escapeHtml(params.restaurantName || "the restaurant");
  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#111827;line-height:1.6">` +
    `<p>Here is a copy of the personal data ${safeName} holds for this email address, attached as a JSON file.</p>` +
    `<p style="color:#6b7280;font-size:13px">If you didn't request this, you can ignore this email — the data was only sent to your own address.</p>` +
    `</div>`;
  return send({
    to: params.to,
    subject: `Your data export — ${params.restaurantName}`,
    html,
    fromName: params.restaurantName,
    attachments: [{ filename: "my-data.json", content: params.jsonContent }],
  });
}

/**
 * Minimum gap between two sends of the SAME campaign to the SAME address.
 *
 * 20h rather than 24h so a daily-cadence campaign isn't pushed a day later each
 * run by clock drift, while still making "twice in one day" impossible. Every
 * real campaign here is days or weeks apart (autopilot drip steps, one-shot
 * kickstarter invites), so this never delays legitimate mail.
 */
const MIN_RESEND_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * The anti-spam backstop: has this campaign already reached this address too
 * recently? Atomically records the send when it allows one, so two concurrent
 * cron runs can't both pass.
 *
 * Fails OPEN (allows the send) if the guard table errors — suppression and
 * consent have already been checked, so the downside of a DB hiccup here is a
 * duplicate email, not an unlawful one.
 */
async function checkAndClaimSendGuard(
  restaurantId: string,
  campaign: string,
  emailLower: string,
): Promise<{ allowed: boolean; hoursSinceLast?: number; sendCount?: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_RESEND_INTERVAL_MS);
  try {
    // Claim atomically: only bump the row if it's older than the cutoff. A
    // count of 0 means somebody sent recently (or a concurrent run just won).
    const claimed = await prisma.marketingSendGuard.updateMany({
      where: { restaurantId, campaign, emailLower, lastSentAt: { lt: cutoff } },
      data: { lastSentAt: now, sendCount: { increment: 1 } },
    });
    if (claimed.count > 0) return { allowed: true };

    // No row updated: either there's a recent row (block) or none at all (first
    // ever send for this pair — create it and allow).
    const existing = await prisma.marketingSendGuard.findUnique({
      where: { restaurantId_campaign_emailLower: { restaurantId, campaign, emailLower } },
      select: { lastSentAt: true, sendCount: true },
    });
    if (existing) {
      return {
        allowed: false,
        hoursSinceLast: Math.round(((now.getTime() - existing.lastSentAt.getTime()) / 3_600_000) * 10) / 10,
        sendCount: existing.sendCount,
      };
    }
    try {
      await prisma.marketingSendGuard.create({
        data: { restaurantId, campaign, emailLower, lastSentAt: now, sendCount: 1 },
      });
      return { allowed: true };
    } catch (e) {
      // Lost the create race to a concurrent run — that run is sending, so we
      // must not. This is the correct fail-CLOSED branch.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) return { allowed: false, hoursSinceLast: 0 };
      throw e;
    }
  } catch (e) {
    console.error("[marketing] send-guard unavailable, allowing send", e);
    return { allowed: true };
  }
}

export async function sendMarketingEmail(params: {
  /** Session-derived restaurant id — scopes the suppression check + tag. */
  restaurantId: string;
  to: string;
  /** e.g. "autopilot:second_order" | "kickstarter:invite" — tag + logging. */
  campaign: string;
  /** REQUIRED consent basis. Null / no basis / a stale implied one => NOT sent
   *  (fails closed — never default a missing basis to a valid one). */
  consentBasis: MarketingConsentBasis | null;
  /** REQUIRED — the signed unsubscribe link (List-Unsubscribe + footer). */
  unsubscribeUrl: string;
  /** REQUIRED — the signed "delete my personal data" link (CASL footer). */
  dataDeletionUrl: string;
  /** Recipient locale for the footer (restaurant.defaultLanguage). */
  locale?: string | null;
  customerName: string;
  restaurantName: string;
  subject: string;
  body: string;
  couponCode?: string | null;
  couponLabel?: string | null;
  /** Name of the customer's club, when this recipient is a member and the owner
   *  chose to send the nudge WITHOUT an extra code (Luigi 2026-08-11). Replaces
   *  the coupon card with "your member pricing already applies", so the email
   *  still delivers on the owner's "here's a treat" copy. Null = normal email. */
  memberPerk?: string | null;
  ctaUrl: string;
  ctaLabel?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
}): Promise<{ sent: boolean; skipped?: "suppressed" | "stale" | "no_basis" | "too_soon"; success?: boolean; error?: string }> {
  const emailLower = params.to.trim().toLowerCase();

  // GATE 1 — unified suppression (silences a person across BOTH send paths).
  if (await isSuppressed(params.restaurantId, emailLower)) {
    console.log("[marketing] skip suppressed", { restaurantId: params.restaurantId, campaign: params.campaign });
    return { sent: false, skipped: "suppressed" };
  }
  // GATE 2 — a valid CASL consent basis must be present + in-window.
  const basis = checkConsentBasis(params.consentBasis);
  if (basis !== "ok") {
    console.log("[marketing] skip — no valid consent basis", { campaign: params.campaign, basis });
    return { sent: false, skipped: basis };
  }
  // GATE 3 — ANTI-SPAM BACKSTOP. Nobody gets the same campaign twice inside
  // MIN_RESEND_INTERVAL_MS, no matter what the calling campaign logic believes.
  //
  // A de-dup bug in the autopilot runner once mailed one address ~50 copies of
  // the same win-back email, hourly, for two days (Luigi 2026-08-07). That root
  // cause is fixed, but per-caller de-dup means the NEXT bug spams customers
  // too. This gate is inside the chokepoint every marketing email must pass, so
  // it cannot be bypassed or forgotten by a new campaign.
  //
  // Fails OPEN on a DB error: a marketing email is worth less than a false
  // outage, and GATES 1+2 (suppression + consent) have already run.
  const guard = await checkAndClaimSendGuard(params.restaurantId, params.campaign, emailLower);
  if (!guard.allowed) {
    console.error("[marketing] BLOCKED as duplicate — a campaign is trying to re-send too soon", {
      restaurantId: params.restaurantId,
      campaign: params.campaign,
      hoursSinceLast: guard.hoursSinceLast,
      sendCount: guard.sendCount,
    });
    return { sent: false, skipped: "too_soon" };
  }

  // Substitute owner-editable tokens in BOTH subject + body.
  const vars = {
    customerName: params.customerName || "there",
    restaurantName: params.restaurantName || "",
    restaurantLink: params.restaurantUrl || params.ctaUrl || "",
  };
  const subject = applyEmailTokens(params.subject, vars);
  const body = applyEmailTokens(params.body, vars);

  const html = await renderEmail(
    AutopilotEmail({
      locale: params.locale,
      customerName: params.customerName,
      restaurantName: params.restaurantName,
      subject,
      body,
      couponCode: params.couponCode,
      couponLabel: params.couponLabel,
      memberPerk: params.memberPerk,
      memberPerkStrings: params.memberPerk ? await memberPerkStrings(params.locale) : undefined,
      ctaUrl: params.ctaUrl,
      ctaLabel: params.ctaLabel,
      restaurantUrl: params.restaurantUrl,
      restaurantEmail: params.restaurantEmail,
      restaurantPhone: params.restaurantPhone,
      imprint: currentImprint(),
      // CASL: commercial mail needs a VISIBLE why-received + opt-out + a
      // delete-my-data link + the sender's postal address in the BODY.
      unsubscribeUrl: params.unsubscribeUrl,
      dataDeletionUrl: params.dataDeletionUrl,
      marketing: true,
      footerStrings: await marketingFooterStrings(params.locale),
      postalAddress: await getPlatformPostalAddress(),
    })
  );

  const result = await send({
    to: params.to,
    subject,
    html,
    // Marketing rides the RESTAURANT's identity like receipts do.
    fromName: params.restaurantName,
    replyTo: params.restaurantEmail,
    listUnsubscribeUrl: params.unsubscribeUrl,
    classification: "marketing",
    consentContext: { restaurantId: params.restaurantId, emailLower },
    tags: { restaurantId: params.restaurantId, emailClass: "marketing", campaign: params.campaign },
  });
  return { sent: !!result.success, success: result.success, error: result.error };
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

/**
 * Owner alert: a customer disputed a card charge (H-1 / LR-PAY-02). Sent to the
 * restaurant owner because the money + a fee are pulled from THEIR Stripe
 * balance and they have a hard deadline to submit evidence in Stripe. Staff-
 * facing → English body (matches the other owner/staff notifications), all
 * dynamic values escaped. Best-effort; never blocks the webhook.
 */
export async function sendDisputeOwnerAlert(params: {
  to: string;
  restaurantName: string;
  orderNumber: string;
  amountLabel: string;
  reason?: string | null;
  dueByLabel?: string | null;
  stripeUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const esc = (s: string) => escapeHtml(s);
  const due = params.dueByLabel
    ? `<p style="margin:0 0 12px"><strong>Respond by ${esc(params.dueByLabel)}</strong> or the dispute is automatically lost.</p>`
    : "";
  const reason = params.reason ? `<p style="margin:0 0 8px">Reason given: <strong>${esc(params.reason)}</strong></p>` : "";
  const link = params.stripeUrl
    ? `<p style="margin:16px 0 0"><a href="${esc(params.stripeUrl)}" style="color:#059669">Open your Stripe dashboard to respond →</a></p>`
    : `<p style="margin:16px 0 0">Log in to your Stripe dashboard to review and respond.</p>`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px;font-size:18px">⚠️ A customer disputed a payment</h2>
    <p style="margin:0 0 8px">Order <strong>#${esc(params.orderNumber)}</strong> at <strong>${esc(params.restaurantName)}</strong> was disputed for <strong>${esc(params.amountLabel)}</strong>.</p>
    ${reason}
    <p style="margin:0 0 12px">Stripe has placed a hold on these funds and charged a dispute fee to your account. If you don't respond with evidence, the dispute is lost and the amount is not returned.</p>
    ${due}
    ${link}
    <p style="margin:24px 0 0;font-size:12px;color:#666">You're receiving this because you're the account owner for ${esc(params.restaurantName)}.</p>
  </div>`;
  return send({ to: params.to, subject: `Payment disputed — order #${params.orderNumber}`, html, fromName: params.restaurantName });
}
