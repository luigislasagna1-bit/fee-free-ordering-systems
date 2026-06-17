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
function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/$/, "");
  return "https://feefreeordering.com";
}

interface Recipient {
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

/** One in-app ResellerNotification row per recipient (best-effort). */
async function createInApp(
  recipients: Recipient[],
  n: { kind: string; title: string; body?: string | null; linkUrl: string },
): Promise<void> {
  if (recipients.length === 0) return;
  try {
    await prisma.resellerNotification.createMany({
      data: recipients.map((r) => ({
        recipientEmail: r.email,
        kind: n.kind,
        title: n.title,
        body: n.body ?? null,
        linkUrl: n.linkUrl,
      })),
    });
  } catch (e) {
    console.error("[platform-notifications] createInApp failed", e);
  }
}

/** Fan-out emails; one bad recipient never blocks the rest. */
async function emailAll(
  recipients: Recipient[],
  build: (r: Recipient) => Parameters<typeof sendReportNotificationEmail>[0],
): Promise<void> {
  if (recipients.length === 0) return;
  await Promise.allSettled(
    recipients.map(async (r) => {
      try {
        await sendReportNotificationEmail(build(r));
      } catch (e) {
        console.error("[platform-notifications] email failed", { to: r.email, e });
      }
    }),
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
 *  a copy. */
async function superadminAudience(): Promise<{ inApp: Recipient[]; email: Recipient[] }> {
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
