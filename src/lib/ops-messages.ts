/**
 * Ops messages — a DB-queued "message to the platform owner". SERVER-ONLY.
 *
 * Why this exists (Luigi 2026-08-15): a script or a Claude session running on
 * a laptop has a DATABASE_URL but no working Resend transport (the prod key
 * doesn't decrypt locally, and dev suppresses mail anyway — see send() in
 * src/lib/email.ts). So instead of emailing from the laptop, it ENQUEUES an
 * OpsMessage row, and PRODUCTION emails it out on the next tick of the
 * every-minute eod-digest-closing cron (src/app/api/cron/eod-digest-closing).
 *
 * Audience + plumbing are the SAME as the platform notifications for signups /
 * add-ons (src/lib/platform-notifications.ts): in-app ResellerNotification
 * rows for the superadmin login(s) (drives the panel bell) + a transactional
 * email via sendReportNotificationEmail to the superadmins AND the monitored
 * ops inbox (support@…).
 *
 * WHY NOT sendMarketingEmail(): the CASL chokepoint (AGENTS.md) governs mail
 * to CUSTOMERS — consent basis, suppression list, unsubscribe footer. An ops
 * message is an operator notification addressed to the platform's own
 * superadmin users and its own ops inbox; there is no customer, no consent
 * question and no PII in the row (subject/body are operator-authored). It is
 * transactional, exactly like the signup / add-on alerts it sits beside.
 *
 * Delivery contract:
 *   • a row is pending while `sentAt` is null and `attempts` < MAX_ATTEMPTS;
 *   • dispatch CLAIMS a row with a conditional updateMany (attempts must still
 *     equal what we read) before sending, so two overlapping cron ticks can
 *     never both send the same message — the loser sees count 0 and skips;
 *   • the in-app rows are created on the FIRST attempt only (a retry re-sends
 *     the email, never re-posts the bell);
 *   • `sentAt` is stamped when at least one recipient's email was ACCEPTED by
 *     Resend (`success: true`); a partial fan-out failure is recorded in
 *     `lastError` but is not retried (that would double-mail the ones that
 *     succeeded). Zero acceptances ⇒ lastError + retry next tick, up to
 *     MAX_ATTEMPTS, after which the row is left for a human to look at.
 */
import "server-only";
import prisma from "@/lib/db";
import { appUrl, createInApp, emailAll, superadminAudience } from "@/lib/platform-notifications";

/** In-app `kind` (ResellerNotification.kind); unknown kinds render as a bell. */
export const OPS_MESSAGE_KIND = "ops_message";
/** After this many claimed attempts a row is no longer picked up. */
export const OPS_MESSAGE_MAX_ATTEMPTS = 5;

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;
const MAX_CTA_LABEL = 80;
const MAX_LINK = 2_000;
/** In-app feed shows a 2-line clamp — keep the stored preview short. */
const IN_APP_PREVIEW = 240;

export interface EnqueueOpsMessageInput {
  subject: string;
  /** Plain text. Newlines are preserved: a blank line = new paragraph. */
  body: string;
  /** App-relative ("/superadmin/…") or absolute http(s) URL for the CTA. */
  link?: string | null;
  ctaLabel?: string | null;
}

/** Validate + normalise a CTA link. Returns null for "no link"; throws on a
 *  value that is neither app-relative nor http(s) (a `javascript:` URL must
 *  never reach an email or a <Link>). */
export function normalizeOpsLink(link: string | null | undefined): string | null {
  const v = (link ?? "").trim();
  if (!v) return null;
  if (v.length > MAX_LINK) throw new Error(`link is too long (max ${MAX_LINK} chars)`);
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  throw new Error(`link must be app-relative (start with "/") or an http(s) URL, got: ${v.slice(0, 60)}`);
}

/** Absolute URL for the email CTA: app-relative links get the app origin
 *  (never localhost — see appUrl), absolute links pass through. */
export function opsCtaUrl(link: string | null | undefined): string | undefined {
  const v = (link ?? "").trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  return `${appUrl()}${v.startsWith("/") ? v : `/${v}`}`;
}

/** Whitespace-collapsed excerpt for the in-app feed row. */
export function opsInAppPreview(body: string): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > IN_APP_PREVIEW ? `${flat.slice(0, IN_APP_PREVIEW - 1)}…` : flat;
}

/**
 * Queue a message for the platform owner. Only needs a DATABASE_URL — nothing
 * is emailed here; production's cron does that within ~1 minute.
 * Returns the row id.
 */
export async function enqueueOpsMessage(input: EnqueueOpsMessageInput): Promise<{ id: string }> {
  const subject = (input.subject ?? "").replace(/\s+/g, " ").trim();
  if (!subject) throw new Error("subject is required");
  if (subject.length > MAX_SUBJECT) throw new Error(`subject is too long (max ${MAX_SUBJECT} chars)`);

  const body = (input.body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) throw new Error("body is required");
  if (body.length > MAX_BODY) throw new Error(`body is too long (max ${MAX_BODY} chars)`);

  const link = normalizeOpsLink(input.link);
  const ctaLabel = (input.ctaLabel ?? "").replace(/\s+/g, " ").trim() || null;
  if (ctaLabel && ctaLabel.length > MAX_CTA_LABEL) throw new Error(`ctaLabel is too long (max ${MAX_CTA_LABEL} chars)`);

  const row = await prisma.opsMessage.create({
    data: { subject, body, link, ctaLabel: link ? ctaLabel : null },
    select: { id: true },
  });
  return { id: row.id };
}

export interface DispatchOpsMessagesResult {
  /** Rows stamped sentAt this pass. */
  sent: number;
  /** Rows claimed this pass whose email fan-out got zero acceptances. */
  failed: number;
}

/**
 * Send pending ops messages (oldest first, up to `limit`). Best-effort per
 * row; never throws for a single bad row — a DB error on the initial SELECT
 * does propagate so the caller can log it.
 */
export async function dispatchPendingOpsMessages(
  { limit = 5 }: { limit?: number } = {},
): Promise<DispatchOpsMessagesResult> {
  const take = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await prisma.opsMessage.findMany({
    where: { sentAt: null, attempts: { lt: OPS_MESSAGE_MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, subject: true, body: true, link: true, ctaLabel: true, attempts: true, createdAt: true },
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  // Resolve the audience once per pass, lazily (only if we actually claim a row).
  let audience: Awaited<ReturnType<typeof superadminAudience>> | null = null;

  for (const row of rows) {
    // CLAIM: bump attempts only if nobody else did since we read the row. Two
    // overlapping ticks race here; exactly one wins.
    const claim = await prisma.opsMessage.updateMany({
      where: { id: row.id, sentAt: null, attempts: row.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    const attemptNo = row.attempts + 1;

    try {
      audience ??= await superadminAudience();

      const ctaUrl = opsCtaUrl(row.link);
      const ctaLabel = ctaUrl ? (row.ctaLabel?.trim() || "Open") : undefined;

      // In-app bell: first attempt only, so a retried email never re-posts it.
      if (row.attempts === 0) {
        await createInApp(audience.inApp, {
          kind: OPS_MESSAGE_KIND,
          title: row.subject,
          body: opsInAppPreview(row.body),
          linkUrl: row.link ?? null,
        });
      }

      const outcomes = await emailAll(audience.email, (r) => ({
        to: r.email,
        recipientName: r.name?.split(" ")[0] ?? null,
        subject: row.subject,
        title: row.subject,
        subtitle: "Message from the platform ops queue",
        body: row.body,
        ctaLabel,
        ctaUrl,
      }));

      const ok = outcomes.filter((o) => o.success);
      const bad = outcomes.filter((o) => !o.success);
      const now = new Date();

      if (outcomes.length > 0 && ok.length > 0) {
        const partial =
          bad.length > 0
            ? `attempt ${attemptNo}: sent to ${ok.length}/${outcomes.length}; failed: ${bad
                .map((b) => `${b.to} (${b.error ?? "unknown"})`)
                .join("; ")}`.slice(0, 2000)
            : null;
        await prisma.opsMessage.update({
          where: { id: row.id },
          data: { sentAt: now, lastError: partial },
        });
        sent++;
        console.log("[ops-messages] sent", { id: row.id, attempt: attemptNo, recipients: ok.length, partial: bad.length });
      } else {
        const reason =
          outcomes.length === 0
            ? "no recipients resolved (no superadmin users and no ops inbox)"
            : bad.map((b) => `${b.to}: ${b.error ?? "unknown"}`).join("; ");
        await prisma.opsMessage.update({
          where: { id: row.id },
          data: { lastError: `attempt ${attemptNo}: ${reason}`.slice(0, 2000) },
        });
        failed++;
        console.error("[ops-messages] send failed", { id: row.id, attempt: attemptNo, reason });
      }
    } catch (e) {
      // Any unexpected throw (audience lookup, DB) → record and move on; the
      // claim already spent this attempt.
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ops-messages] dispatch error", { id: row.id, attempt: attemptNo, msg });
      try {
        await prisma.opsMessage.update({
          where: { id: row.id },
          data: { lastError: `attempt ${attemptNo}: ${msg}`.slice(0, 2000) },
        });
      } catch (e2) {
        console.error("[ops-messages] could not record lastError", { id: row.id, e2 });
      }
    }
  }

  return { sent, failed };
}
