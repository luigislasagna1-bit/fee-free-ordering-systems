/**
 * Platform notifications — SERVER-ONLY.
 *
 * Tells the people who run the business when something important happens to a
 * restaurant account: a new signup, a paid add-on subscription, or an add-on
 * cancellation. Two audiences, both notified in-app AND by email:
 *
 *   • Superadmin(s)  — every User with role=superadmin. They see it in the
 *                      superadmin panel's notification bell/feed (which already
 *                      reads ResellerNotification by recipientEmail) + email.
 *   • The reseller   — if the restaurant is attributed to a ResellerProfile
 *                      (signup carried their ?ref=), that reseller is notified
 *                      about their own client + email.
 *
 * We REUSE the existing generic plumbing rather than inventing a parallel one:
 *   - in-app rows  → ResellerNotification (recipientEmail-keyed; the bell/feed
 *                    helpers in reseller-reports-workflow.ts already read it).
 *   - email        → sendReportNotificationEmail (a generic transactional shell
 *                    with title/subtitle/body/CTA + reseller imprint footer).
 *
 * These recipients are platform operators + business partners (not customers),
 * so the copy is English — consistent with the rest of the reseller/superadmin
 * surfaces, which are English-only. The customer-facing i18n rule does not apply.
 *
 * Everything here is best-effort: a failure to notify must NEVER block the
 * signup response or the Stripe webhook. All DB/email calls are wrapped.
 */
import "server-only";
import prisma from "@/lib/db";
import { sendReportNotificationEmail } from "@/lib/email";
import { ROLES } from "@/lib/roles";

/** Absolute base URL for email links. NEXT_PUBLIC_APP_URL is localhost in
 *  laptop dev; fall back to the real domain so prod links never point local. */
export function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/$/, "");
  return "https://feefreeordering.com";
}

export interface Recipient {
  email: string;
  name: string | null;
}

/** Every superadmin's login email (in-app feed + email recipients), deduped. */
async function superadminRecipients(): Promise<Recipient[]> {
  try {
    const rows = await prisma.user.findMany({
      where: { role: ROLES.SUPERADMIN },
      select: { email: true, name: true },
    });
    const seen = new Set<string>();
    const out: Recipient[] = [];
    for (const u of rows) {
      const e = (u.email || "").trim().toLowerCase();
      if (e && !seen.has(e)) {
        seen.add(e);
        out.push({ email: e, name: u.name });
      }
    }
    return out;
  } catch (e) {
    console.error("[platform-notifications] superadminRecipients failed", e);
    return [];
  }
}

/** The reseller (owner login email) a restaurant is attributed to, if any. */
async function resellerRecipient(resellerProfileId: string | null | undefined): Promise<Recipient | null> {
  if (!resellerProfileId) return null;
  try {
    const p = await prisma.resellerProfile.findUnique({
      where: { id: resellerProfileId },
      select: { companyName: true, user: { select: { email: true, name: true } } },
    });
    const e = (p?.user?.email || "").trim().toLowerCase();
    if (!e) return null;
    return { email: e, name: p?.companyName ?? p?.user?.name ?? null };
  } catch (e) {
    console.error("[platform-notifications] resellerRecipient failed", e);
    return null;
  }
}

/** One in-app ResellerNotification row per recipient (best-effort). Exported
 *  for src/lib/ops-messages.ts, which reuses this exact plumbing. */
export async function createInApp(
  recipients: Recipient[],
  n: { kind: string; title: string; body?: string | null; linkUrl?: string | null },
): Promise<void> {
  if (recipients.length === 0) return;
  try {
    await prisma.resellerNotification.createMany({
      data: recipients.map((r) => ({
        recipientEmail: r.email,
        kind: n.kind,
        title: n.title,
        body: n.body ?? null,
        linkUrl: n.linkUrl ?? null,
      })),
    });
  } catch (e) {
    console.error("[platform-notifications] createInApp failed", e);
  }
}

/** Per-recipient outcome of emailAll. `success` mirrors SendEmailResult: true
 *  ONLY when Resend accepted the email. */
export interface EmailOutcome {
  to: string;
  success: boolean;
  error?: string;
}

/** Fan-out emails; one bad recipient never blocks the rest. Returns the
 *  per-recipient outcomes (a thrown helper is reported as a failure, not
 *  re-thrown) — the notify* functions here ignore them (best-effort), while
 *  src/lib/ops-messages.ts uses them to decide sent-vs-retry. Exported for
 *  that reuse; behaviour for the existing callers is unchanged. */
export async function emailAll(
  recipients: Recipient[],
  build: (r: Recipient) => Parameters<typeof sendReportNotificationEmail>[0],
): Promise<EmailOutcome[]> {
  if (recipients.length === 0) return [];
  const settled = await Promise.allSettled(
    recipients.map(async (r): Promise<EmailOutcome> => {
      try {
        const res = await sendReportNotificationEmail(build(r));
        return { to: r.email, success: !!res?.success, error: res?.success ? undefined : res?.error || "email not sent" };
      } catch (e) {
        console.error("[platform-notifications] email failed", { to: r.email, e });
        return { to: r.email, success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { to: recipients[i].email, success: false, error: String(s.reason) },
  );
}

interface AudienceCopy {
  kind: string;
  inAppTitle: string;
  inAppBody?: string | null;
  /** App-relative path; used for both the in-app linkUrl and the email CTA. */
  link: string;
  emailSubject: string;
  emailTitle: string;
  emailSubtitle?: string;
  emailBody: string;
  emailCtaLabel: string;
}

/** In-app rows for `inApp` recipients + emails for `email` recipients. The two
 *  lists differ for the superadmin audience: the in-app bell is keyed to the
 *  superadmin login (admin@…, which drives the panel badge), while the EMAIL
 *  also goes to the monitored ops inbox (support@…) — that inbox isn't a panel
 *  user but IS where the operator actually reads mail. */
async function dispatch(
  audience: { inApp: Recipient[]; email: Recipient[] },
  copy: AudienceCopy,
): Promise<void> {
  await createInApp(audience.inApp, {
    kind: copy.kind,
    title: copy.inAppTitle,
    body: copy.inAppBody ?? null,
    linkUrl: copy.link,
  });
  await emailAll(audience.email, (r) => ({
    to: r.email,
    recipientName: r.name?.split(" ")[0] ?? null,
    subject: copy.emailSubject,
    title: copy.emailTitle,
    subtitle: copy.emailSubtitle,
    body: copy.emailBody,
    ctaLabel: copy.emailCtaLabel,
    ctaUrl: `${appUrl()}${copy.link}`,
  }));
}

/** The monitored platform ops inbox. Defaults to support@feefreeordering.com —
 *  which is also the email `from` address and the report-center OPS default —
 *  and is overridable via env. This is where signup / add-on alerts must land:
 *  the superadmin LOGIN (admin@…) isn't necessarily a real, monitored mailbox,
 *  which is why the first round of emails went unseen. Luigi 2026-06-11. */
function opsEmail(): string {
  return (process.env.PLATFORM_OPS_EMAIL || process.env.REPORTS_OPS_EMAIL || "support@feefreeordering.com")
    .trim()
    .toLowerCase();
}

/** Superadmin audience: in-app to the superadmin login(s) (drives the panel
 *  bell), email to those PLUS the ops inbox, deduped, so support@ always gets
 *  a copy. Exported for src/lib/ops-messages.ts (same audience, same rules). */
export async function superadminAudience(): Promise<{ inApp: Recipient[]; email: Recipient[] }> {
  const users = await superadminRecipients();
  const byAddr = new Map<string, Recipient>();
  for (const u of users) byAddr.set(u.email, u);
  const ops = opsEmail();
  if (ops && !byAddr.has(ops)) byAddr.set(ops, { email: ops, name: "Super Admin" });
  return { inApp: users, email: [...byAddr.values()] };
}

/**
 * A brand-new restaurant signed up. Notify all superadmins, and the reseller
 * who referred them (if any). Best-effort; never throws.
 */
export async function notifyRestaurantSignup(restaurantId: string): Promise<void> {
  let r: { id: string; name: string; city: string | null; country: string | null; resellerProfileId: string | null } | null = null;
  try {
    r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, city: true, country: true, resellerProfileId: true },
    });
  } catch (e) {
    console.error("[platform-notifications] signup lookup failed", e);
    return;
  }
  if (!r) return;

  const where = [r.city, r.country].filter(Boolean).join(", ");
  const whereSuffix = where ? ` (${where})` : "";

  const [sa, reseller] = await Promise.all([
    superadminAudience(),
    resellerRecipient(r.resellerProfileId),
  ]);

  await dispatch(sa, {
    kind: "restaurant_signup",
    inAppTitle: `New restaurant signed up: ${r.name}`,
    inAppBody: where || null,
    link: `/superadmin/restaurants/${r.id}`,
    emailSubject: `New signup: ${r.name}`,
    emailTitle: "A new restaurant just signed up",
    emailSubtitle: r.name,
    emailBody: `${r.name}${whereSuffix} just created an account on Fee Free Ordering.`,
    emailCtaLabel: "View restaurant",
  });

  if (reseller) {
    await dispatch({ inApp: [reseller], email: [reseller] }, {
      kind: "restaurant_signup",
      inAppTitle: `New restaurant under you: ${r.name}`,
      inAppBody: where || null,
      link: `/reseller/restaurants/${r.id}`,
      emailSubject: `New restaurant joined under your account: ${r.name}`,
      emailTitle: "A new restaurant signed up under you",
      emailSubtitle: r.name,
      emailBody: `${r.name}${whereSuffix} just signed up using your referral link. You'll start earning commission once they subscribe to a paid plan or add-on.`,
      emailCtaLabel: "View in your dashboard",
    });
  }
}

/**
 * A superadmin manually attributed an existing restaurant to a reseller (e.g.
 * retro-fixing a signup whose ?ref= was lost). Notify just that reseller so
 * the new client shows up for them. Best-effort; never throws.
 */
export async function notifyResellerRestaurantAssigned(
  restaurantId: string,
  resellerProfileId: string,
): Promise<void> {
  let r: { id: string; name: string; city: string | null; country: string | null } | null = null;
  try {
    r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, city: true, country: true },
    });
  } catch (e) {
    console.error("[platform-notifications] assign lookup failed", e);
    return;
  }
  if (!r) return;

  const reseller = await resellerRecipient(resellerProfileId);
  if (!reseller) return;

  const where = [r.city, r.country].filter(Boolean).join(", ");
  const whereSuffix = where ? ` (${where})` : "";

  await dispatch({ inApp: [reseller], email: [reseller] }, {
    kind: "restaurant_assigned",
    inAppTitle: `Restaurant added to your account: ${r.name}`,
    inAppBody: where || null,
    link: `/reseller/restaurants/${r.id}`,
    emailSubject: `A restaurant was added to your account: ${r.name}`,
    emailTitle: "A restaurant was added to your account",
    emailSubtitle: r.name,
    emailBody: `${r.name}${whereSuffix} is now linked to your reseller account. You'll start earning commission once they subscribe to a paid plan or add-on.`,
    emailCtaLabel: "View in your dashboard",
  });
}

/**
 * A restaurant subscribed to, or cancelled, a paid add-on. Notify all
 * superadmins + the attributed reseller. Called from the Stripe webhook on the
 * real state transition (activated = first time it goes active; cancelled =
 * the subscription actually ends). Best-effort; never throws.
 */
/**
 * A restaurant owner approved their Branded Mobile App config — a platform
 * project is waiting for store-access verification. Superadmin-only (the
 * owner gets localized status emails from src/lib/branded-app/notify.ts).
 * Best-effort; never throws.
 */
export async function notifyBrandedAppSubmitted(
  restaurantId: string,
  platform: string,
): Promise<void> {
  let r: { id: string; name: string } | null = null;
  try {
    r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });
  } catch (e) {
    console.error("[platform-notifications] branded-app lookup failed", e);
    return;
  }
  if (!r) return;
  const sa = await superadminAudience();
  await dispatch(sa, {
    kind: "branded_app_submitted",
    inAppTitle: `Branded app submitted (${platform}): ${r.name}`,
    link: `/superadmin/branded-apps`,
    emailSubject: `Branded app ready for verification: ${r.name}`,
    emailTitle: "A restaurant approved their branded app setup",
    emailSubtitle: `${r.name} — ${platform}`,
    emailBody: `${r.name} completed the Branded Mobile App wizard for ${platform}. Verify their store-account access in the superadmin panel, then move the project to Building.`,
    emailCtaLabel: "Open branded-app queue",
  });
}

export async function notifyAddOnChange(
  restaurantId: string,
  addOn: { slug: string; name: string },
  change: "activated" | "cancelled",
): Promise<void> {
  let r: { id: string; name: string; resellerProfileId: string | null } | null = null;
  try {
    r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, resellerProfileId: true },
    });
  } catch (e) {
    console.error("[platform-notifications] addon lookup failed", e);
    return;
  }
  if (!r) return;

  const [sa, reseller] = await Promise.all([
    superadminAudience(),
    resellerRecipient(r.resellerProfileId),
  ]);

  const kind = change === "activated" ? "addon_activated" : "addon_cancelled";
  const verb = change === "activated" ? "subscribed to" : "cancelled";

  await dispatch(sa, {
    kind,
    inAppTitle:
      change === "activated"
        ? `Add-on subscribed: ${addOn.name} — ${r.name}`
        : `Add-on cancelled: ${addOn.name} — ${r.name}`,
    link: `/superadmin/restaurants/${r.id}`,
    emailSubject:
      change === "activated"
        ? `New add-on subscription: ${r.name}`
        : `Add-on cancelled: ${r.name}`,
    emailTitle:
      change === "activated"
        ? "A restaurant subscribed to a paid add-on"
        : "A restaurant cancelled a paid add-on",
    emailSubtitle: r.name,
    emailBody: `${r.name} ${verb} the “${addOn.name}” add-on.`,
    emailCtaLabel: "View restaurant",
  });

  if (reseller) {
    await dispatch({ inApp: [reseller], email: [reseller] }, {
      kind,
      inAppTitle:
        change === "activated"
          ? `${r.name} subscribed to ${addOn.name}`
          : `${r.name} cancelled ${addOn.name}`,
      link: `/reseller/restaurants/${r.id}`,
      emailSubject:
        change === "activated"
          ? `Your client subscribed to an add-on: ${r.name}`
          : `Your client cancelled an add-on: ${r.name}`,
      emailTitle:
        change === "activated"
          ? "A restaurant under you subscribed to a paid add-on"
          : "A restaurant under you cancelled a paid add-on",
      emailSubtitle: r.name,
      emailBody:
        change === "activated"
          ? `${r.name} just ${verb} the “${addOn.name}” add-on. This may affect your commission.`
          : `${r.name} just ${verb} the “${addOn.name}” add-on.`,
      emailCtaLabel: "View in your dashboard",
    });
  }
}

/* ── Nabil AI call reports (Luigi 2026-08-16) ─────────────────────────────── */

/**
 * A restaurant reported a Nabil AI call. Superadmins get the in-app bell +
 * email (support@ included); an URGENT report says so in the subject. The
 * restaurant's description is quoted in the email so the operator can judge
 * severity from the inbox — it is staff-typed text about a call, not customer
 * PII by design (see PII_ERASURE_MAP for the erasure story). Best-effort.
 */
export async function notifyNabilCallReported(reportId: string): Promise<void> {
  let rep: {
    id: string;
    topic: string;
    urgent: boolean;
    description: string;
    reporterName: string | null;
    reporterEmail: string | null;
    restaurant: { name: string };
    call: { startedAt: Date; outcome: string | null; orderNumber: string | null; durationSeconds: number | null };
  } | null = null;
  try {
    rep = await prisma.voiceCallReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        topic: true,
        urgent: true,
        description: true,
        reporterName: true,
        reporterEmail: true,
        restaurant: { select: { name: true } },
        call: { select: { startedAt: true, outcome: true, orderNumber: true, durationSeconds: true } },
      },
    });
  } catch (e) {
    console.error("[platform-notifications] call-report lookup failed", e);
    return;
  }
  if (!rep) return;
  const { VOICE_CALL_REPORT_TOPIC_LABEL_EN } = await import("@/lib/voice/call-reports");
  const topic = (VOICE_CALL_REPORT_TOPIC_LABEL_EN as Record<string, string>)[rep.topic] ?? rep.topic;
  const when = rep.call.startedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const urgentTag = rep.urgent ? "URGENT — " : "";
  const sa = await superadminAudience();
  await dispatch(sa, {
    kind: "nabil_call_reported",
    inAppTitle: `${urgentTag}Nabil call reported: ${rep.restaurant.name} — ${topic}`,
    inAppBody: rep.description.slice(0, 200),
    link: `/superadmin/restaurant-reports/nabil/${rep.id}`,
    emailSubject: `${urgentTag}Nabil AI call reported by ${rep.restaurant.name}: ${topic}`,
    emailTitle: rep.urgent ? "URGENT: a restaurant reported a Nabil AI call" : "A restaurant reported a Nabil AI call",
    emailSubtitle: `${rep.restaurant.name} — ${topic}`,
    emailBody:
      `Call on ${when}` +
      (rep.call.durationSeconds != null ? ` (${Math.round(rep.call.durationSeconds)} s)` : "") +
      (rep.call.outcome ? `, outcome ${rep.call.outcome}` : "") +
      (rep.call.orderNumber ? `, order ${rep.call.orderNumber}` : "") +
      `.\n\nReported by ${rep.reporterName || rep.reporterEmail || "the restaurant"}:\n\n“${rep.description}”\n\n` +
      "Open the report to read the transcript, download the call as a regression case, set a status and reply — the restaurant sees your notes on the call page.",
    emailCtaLabel: "Open the report",
  });
}

/* ── Nabil AI concierge line setup (on sale, 2026-08-17) ─────────────────── */

/**
 * A subscribed restaurant filed (or re-filed) its Nabil AI line-setup request —
 * the platform must provision the line BY HAND within one business day. In-app
 * bell + email to superadmins and support@, with the whole intake in the mail so
 * the operator can act from the inbox. The numbers are the restaurant's own
 * business lines (not customer PII). Best-effort; never throws.
 */
export async function notifyNabilSetupRequested(requestId: string): Promise<void> {
  let req: {
    id: string;
    status: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
    restaurant: { id: string; name: string; slug: string; email: string | null; phone: string | null; timezone: string | null };
  } | null = null;
  try {
    req = await prisma.voiceSetupRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
        restaurant: { select: { id: true, name: true, slug: true, email: true, phone: true, timezone: true } },
      },
    });
  } catch (e) {
    console.error("[platform-notifications] setup-request lookup failed", e);
    return;
  }
  if (!req) return;
  const { readVoiceSetupPayload } = await import("@/lib/voice/setup-request");
  const p = readVoiceSetupPayload(req.payload);
  const refiled = req.updatedAt.getTime() - req.createdAt.getTime() > 60_000;
  const modeText = p?.mode === "forward" ? "FORWARD their existing number to Nabil" : "a NEW Nabil number (they will advertise it / forward to it)";
  const sa = await superadminAudience();
  await dispatch(sa, {
    kind: "nabil_setup_requested",
    inAppTitle: `${refiled ? "Updated" : "New"} Nabil AI line setup: ${req.restaurant.name}`,
    inAppBody: p ? `${modeText} · callers dial ${p.currentNumber} · transfer to ${p.transferNumber}` : null,
    link: "/superadmin/settings/nabil",
    emailSubject: `${refiled ? "UPDATED — " : ""}Nabil AI line setup requested by ${req.restaurant.name} (provision within 1 business day)`,
    emailTitle: refiled ? "A restaurant updated its Nabil AI line-setup request" : "A restaurant subscribed to Nabil AI and needs its line set up",
    emailSubtitle: `${req.restaurant.name} (${req.restaurant.slug})`,
    emailBody:
      `Concierge activation — please provision this line by hand within one business day, then mark the request DONE on Superadmin › Nabil Phone Lines (a VoiceNumber row is what flips their dashboard from "we're setting up your line" to live).\n\n` +
      (p
        ? `Wants: ${modeText}\n` +
          `Number callers dial today: ${p.currentNumber}\n` +
          `Transfer-to-staff number: ${p.transferNumber}\n` +
          `Greeting name: “${p.greetingName}”\n` +
          (p.notes ? `Notes: “${p.notes}”\n` : "") +
          (p.submittedBy ? `Filed by: ${p.submittedBy}\n` : "")
        : "(payload unreadable — open the queue)\n") +
      `\nRestaurant contact: ${req.restaurant.email ?? "—"} · ${req.restaurant.phone ?? "—"} · tz ${req.restaurant.timezone ?? "—"}\n` +
      `Restaurant id: ${req.restaurant.id}`,
    emailCtaLabel: "Open the Nabil Phone Lines queue",
  });
}

/**
 * The platform replied on (or changed the status of) a restaurant's call
 * report — email the person who filed it so they know to look. Their own
 * language would be ideal; the reporter is a restaurant operator and this
 * follows the same English-only rule as every other platform→operator mail
 * in this file. Best-effort; never throws.
 */
export async function notifyNabilCallReportUpdated(
  reportId: string,
  change: { kind: "comment"; body: string } | { kind: "status"; status: string; resolution?: string | null },
): Promise<void> {
  let rep: {
    id: string;
    callId: string;
    topic: string;
    reporterName: string | null;
    reporterEmail: string | null;
    restaurant: { name: string };
  } | null = null;
  try {
    rep = await prisma.voiceCallReport.findUnique({
      where: { id: reportId },
      select: { id: true, callId: true, topic: true, reporterName: true, reporterEmail: true, restaurant: { select: { name: true } } },
    });
  } catch (e) {
    console.error("[platform-notifications] call-report update lookup failed", e);
    return;
  }
  if (!rep?.reporterEmail) return;
  const { VOICE_CALL_REPORT_TOPIC_LABEL_EN, VOICE_CALL_REPORT_STATUS_LABEL_EN } = await import("@/lib/voice/call-reports");
  const topic = (VOICE_CALL_REPORT_TOPIC_LABEL_EN as Record<string, string>)[rep.topic] ?? rep.topic;
  const to: Recipient = { email: rep.reporterEmail.toLowerCase(), name: rep.reporterName };
  const link = `/admin/phone-ordering/calls/${rep.callId}`;
  if (change.kind === "comment") {
    await dispatch({ inApp: [], email: [to] }, {
      kind: "nabil_call_report_comment",
      inAppTitle: `Fee Free replied on your call report (${topic})`,
      link,
      emailSubject: `Reply on your Nabil AI call report — ${rep.restaurant.name}`,
      emailTitle: "The Fee Free team replied on your call report",
      emailSubtitle: topic,
      emailBody: `“${change.body}”\n\nOpen the call to read the full thread and answer.`,
      emailCtaLabel: "Open the call",
    });
    return;
  }
  const status = (VOICE_CALL_REPORT_STATUS_LABEL_EN as Record<string, string>)[change.status] ?? change.status;
  await dispatch({ inApp: [], email: [to] }, {
    kind: "nabil_call_report_status",
    inAppTitle: `Your call report is now “${status}” (${topic})`,
    link,
    emailSubject: `Your Nabil AI call report is now “${status}” — ${rep.restaurant.name}`,
    emailTitle: `Call report status: ${status}`,
    emailSubtitle: topic,
    emailBody: (change.resolution ? `“${change.resolution}”\n\n` : "") + "Open the call to see the details and reply if anything is still off.",
    emailCtaLabel: "Open the call",
  });
}
