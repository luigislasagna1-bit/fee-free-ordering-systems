/**
 * Reseller Reports & Requests — lifecycle automation. SERVER-ONLY.
 *
 * This is the "close the loop" engine (Phase 1). It connects a deployed
 * fix to the report's status and to the people who care, WITHOUT ever
 * deciding on its own that something is truly fixed.
 *
 * Two entry points:
 *   markFixShipped()    — called when a human ships a fix (the SA clicks
 *                         "Mark fix shipped" on the report). Moves the
 *                         report to IN_TESTING, drops a comment, and emails
 *                         the reporter + everyone who upvoted, asking them
 *                         to verify on the live site.
 *   onVerificationVote()— called by the verify route after a vote lands.
 *                         Handles the two automated reactions below.
 *
 * ┌─ THE FIXED GUARDRAIL (Luigi's hard rule) ─────────────────────────┐
 * │ A report NEVER becomes FIXED on a single vote or on Claude's       │
 * │ judgment. It reaches FIXED only by:                                │
 * │   (a) the superadmin setting it manually (the "myself" path), or   │
 * │   (b) auto-close — which requires AT LEAST `VERIFY_QUORUM` distinct │
 * │       resellers voting WORKING and ZERO outstanding "still broken"  │
 * │       votes. That quorum IS the "multiple resellers" human approval.│
 * │ Lower the bar by NOTHING; raise VERIFY_QUORUM to require more.      │
 * └────────────────────────────────────────────────────────────────────┘
 */
import "server-only";
import prisma from "@/lib/db";
import { sendReportNotificationEmail } from "@/lib/email";
// VERIFY_QUORUM is the single source of truth for the auto-close threshold;
// it lives in the client-safe constants module so the detail-page UI can
// display the same number the engine enforces.
import { VERIFY_QUORUM } from "@/lib/reseller-reports-constants";

export { VERIFY_QUORUM };

/** Synthetic actor for activity rows the system writes (auto-close). */
const SYSTEM_ACTOR = { email: "support@feefreeordering.com", name: "Auto-verify" };

/** Where "a fix was disputed" alerts go. Defaults to the superadmin. */
const OPS_EMAIL = process.env.REPORTS_OPS_EMAIL || "support@feefreeordering.com";

/** Absolute base URL for links in emails. NEXT_PUBLIC_APP_URL is localhost
 *  in laptop dev; fall back to the real domain so prod links never point
 *  at localhost. */
function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/$/, "");
  return "https://feefreeordering.com";
}

function reportUrl(id: string): string {
  return `${appUrl()}/reseller-reports/${id}`;
}

interface RecipientLite {
  email: string;
  name: string | null;
}

/** Reporter + everyone who upvoted ("me too"), deduped + lowercased.
 *  These are the people who asked to be kept in the loop on this report. */
function collectRecipients(
  report: { authorEmail: string; authorName: string; reportedByEmail: string | null; reportedByName: string | null },
  upvotes: { voterEmail: string; voterName: string }[],
): RecipientLite[] {
  const byEmail = new Map<string, RecipientLite>();
  const reporterEmail = (report.reportedByEmail ?? report.authorEmail).trim().toLowerCase();
  const reporterName = report.reportedByName ?? report.authorName;
  if (reporterEmail) byEmail.set(reporterEmail, { email: reporterEmail, name: reporterName });
  for (const u of upvotes) {
    const e = u.voterEmail.trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, { email: e, name: u.voterName });
  }
  return [...byEmail.values()];
}

/** Best-effort fan-out — never throws. One bad recipient must not block
 *  the others or the status change that triggered the notification. */
async function notifyAll(
  recipients: RecipientLite[],
  build: (r: RecipientLite) => Parameters<typeof sendReportNotificationEmail>[0],
): Promise<void> {
  await Promise.allSettled(
    recipients.map(async (r) => {
      try {
        await sendReportNotificationEmail(build(r));
      } catch (err) {
        console.error("[reseller-reports-workflow] notify failed", { to: r.email, err });
      }
    }),
  );
}

/**
 * Mark a report as "seen" by a viewer right now — clears the in-app NEW badge
 * for them. Upsert keyed on (reportId, viewerEmail). Best-effort; never throws.
 * Called when a viewer opens a report, comments, or changes its status.
 * Luigi 2026-06-05.
 */
export async function markReportSeen(reportId: string, viewerEmail: string): Promise<void> {
  const email = (viewerEmail || "").trim().toLowerCase();
  if (!email) return;
  try {
    await prisma.resellerReportSeen.upsert({
      where: { reportId_viewerEmail: { reportId, viewerEmail: email } },
      update: { seenAt: new Date() },
      create: { reportId, viewerEmail: email, seenAt: new Date() },
    });
  } catch (e) {
    console.error("[reseller-reports] markReportSeen failed", { reportId, email, e });
  }
}

/**
 * Count reports that have NEW activity for a viewer (for the nav badge) —
 * i.e. updatedAt newer than their seenAt, or never seen. Best-effort; returns
 * 0 on error. Fine to scan all reports at our scale (<1k); revisit with a
 * narrower query if the tracker ever grows large. Luigi 2026-06-05.
 */
export async function countNewReportsForViewer(viewerEmail: string): Promise<number> {
  const email = (viewerEmail || "").trim().toLowerCase();
  if (!email) return 0;
  try {
    const [reports, seen] = await Promise.all([
      prisma.resellerReport.findMany({ select: { id: true, updatedAt: true } }),
      prisma.resellerReportSeen.findMany({ where: { viewerEmail: email }, select: { reportId: true, seenAt: true } }),
    ]);
    const seenMap = new Map(seen.map((s) => [s.reportId, s.seenAt.getTime()]));
    let n = 0;
    for (const r of reports) {
      const s = seenMap.get(r.id);
      if (s === undefined || r.updatedAt.getTime() > s) n++;
    }
    return n;
  } catch (e) {
    console.error("[reseller-reports] countNewReportsForViewer failed", e);
    return 0;
  }
}

/** Human-readable status label for emails. */
function prettyStatus(s: string): string {
  switch (s) {
    case "NEW": return "New";
    case "IN_PROGRESS": return "In progress";
    case "IN_TESTING": return "In testing";
    case "FIXED": return "Fixed";
    case "WONT_FIX": return "Won't fix";
    default: return s;
  }
}

/** Drop the person who triggered the event — nobody needs an email about
 *  their own comment / status change. Case-insensitive. */
function excludeActor(recipients: RecipientLite[], actorEmail: string): RecipientLite[] {
  const a = (actorEmail || "").trim().toLowerCase();
  return recipients.filter((r) => r.email !== a);
}

/**
 * Notify everyone following a report that a NEW COMMENT landed — the reporter,
 * everyone who upvoted, and anyone who previously commented (so a back-and-forth
 * keeps the whole thread in the loop) — except the person who just commented.
 * Best-effort; never throws. Luigi 2026-06-05.
 */
export async function notifyReportComment(
  reportId: string,
  opts: { actorEmail: string; actorName: string; snippet?: string | null },
): Promise<{ notified: number }> {
  const report = await prisma.resellerReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, title: true,
      authorEmail: true, authorName: true,
      reportedByEmail: true, reportedByName: true,
      upvotes: { select: { voterEmail: true, voterName: true } },
      comments: { select: { authorEmail: true, authorName: true } },
    },
  });
  if (!report) return { notified: 0 };

  // reporter + upvoters, then merge in prior distinct commenters.
  const byEmail = new Map<string, RecipientLite>();
  for (const r of collectRecipients(report, report.upvotes)) byEmail.set(r.email, r);
  for (const c of report.comments) {
    const e = (c.authorEmail || "").trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, { email: e, name: c.authorName });
  }
  const recipients = excludeActor([...byEmail.values()], opts.actorEmail);
  if (recipients.length === 0) return { notified: 0 };

  const snippet = opts.snippet?.trim()
    ? `\n\n"${opts.snippet.trim().slice(0, 200)}${opts.snippet.trim().length > 200 ? "…" : ""}"`
    : "";
  await notifyAll(recipients, (r) => ({
    to: r.email,
    recipientName: r.name?.split(" ")[0] ?? null,
    subject: `New comment: ${report.title}`,
    title: `${opts.actorName} commented on your report`,
    subtitle: report.title,
    body: `${opts.actorName} added a comment to a report you're following.${snippet}\n\nOpen the report to read the full thread and reply.`,
    ctaLabel: "View the discussion",
    ctaUrl: reportUrl(reportId),
  }));
  return { notified: recipients.length };
}

/**
 * Notify the reporter + upvoters that a report's STATUS CHANGED (e.g.
 * New → In progress, or marked Fixed by the superadmin). Excludes the actor.
 * Covers the manual paths; the IN_TESTING / auto-FIXED transitions have their
 * own richer "please verify" / "resolved" emails via markFixShipped /
 * onVerificationVote. Best-effort; never throws. Luigi 2026-06-05.
 */
export async function notifyReportStatusChange(
  reportId: string,
  opts: { actorEmail: string; actorName: string; fromStatus: string; toStatus: string },
): Promise<{ notified: number }> {
  const report = await prisma.resellerReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, title: true,
      authorEmail: true, authorName: true,
      reportedByEmail: true, reportedByName: true,
      upvotes: { select: { voterEmail: true, voterName: true } },
    },
  });
  if (!report) return { notified: 0 };

  const recipients = excludeActor(collectRecipients(report, report.upvotes), opts.actorEmail);
  if (recipients.length === 0) return { notified: 0 };

  await notifyAll(recipients, (r) => ({
    to: r.email,
    recipientName: r.name?.split(" ")[0] ?? null,
    subject: `Status updated: ${report.title}`,
    title: `Your report is now "${prettyStatus(opts.toStatus)}"`,
    subtitle: report.title,
    body: `The status of a report you're following changed from ${prettyStatus(opts.fromStatus)} to ${prettyStatus(opts.toStatus)}.`,
    ctaLabel: "View the report",
    ctaUrl: reportUrl(reportId),
  }));
  return { notified: recipients.length };
}

/**
 * Mark a report's fix as shipped. Human-triggered (SA button / endpoint).
 * Moves NEW/IN_PROGRESS → IN_TESTING, drops a comment, and asks the
 * reporter + upvoters to verify. No-op (returns ok:false) when the report
 * is already FIXED or WONT_FIX.
 */
export async function markFixShipped(
  reportId: string,
  opts: { actorEmail: string; actorName: string; version?: string | null; note?: string | null },
): Promise<{ ok: boolean; reason?: string; notified: number }> {
  const report = await prisma.resellerReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, title: true, status: true,
      authorEmail: true, authorName: true,
      reportedByEmail: true, reportedByName: true,
      upvotes: { select: { voterEmail: true, voterName: true } },
    },
  });
  if (!report) return { ok: false, reason: "not found", notified: 0 };
  if (report.status === "FIXED" || report.status === "WONT_FIX") {
    return { ok: false, reason: `already ${report.status}`, notified: 0 };
  }

  const prevStatus = report.status;
  const versionLine = opts.version ? ` (${opts.version})` : "";
  const noteLine = opts.note?.trim() ? `\n\n${opts.note.trim()}` : "";

  await prisma.resellerReport.update({
    where: { id: reportId },
    data: { status: "IN_TESTING" },
  });
  await prisma.resellerReportComment.create({
    data: {
      reportId,
      authorEmail: opts.actorEmail,
      authorName: opts.actorName,
      body: `🔧 A fix for this has shipped${versionLine}. Please verify it on the live site and use the “Confirmed Working” / “Still Not Working” buttons above so we know it’s truly resolved.${noteLine}`,
    },
  });
  await prisma.resellerReportActivity.create({
    data: {
      reportId,
      actorEmail: opts.actorEmail,
      actorName: opts.actorName,
      kind: "STATUS_CHANGE",
      detail: `${prevStatus} → IN_TESTING${versionLine}`,
    },
  });

  const recipients = collectRecipients(report, report.upvotes);
  await notifyAll(recipients, (r) => ({
    to: r.email,
    recipientName: r.name?.split(" ")[0] ?? null,
    subject: `Please verify the fix: ${report.title}`,
    title: "A fix shipped for your report",
    subtitle: report.title,
    body: `Good news — a fix for the issue you reported has been deployed${versionLine}. Please take a moment to confirm it’s working on the live site, then mark it “Confirmed Working” (or “Still Not Working” if it isn’t).${opts.note?.trim() ? `\n\nNote from the team: ${opts.note.trim()}` : ""}`,
    ctaLabel: "Verify the fix",
    ctaUrl: reportUrl(reportId),
  }));

  return { ok: true, notified: recipients.length };
}

/**
 * React to a verification vote. Called by the verify route AFTER the vote
 * row + activity are written.
 *
 *  - WORKING vote: if the report is IN_TESTING and the quorum of distinct
 *    WORKING votes is met with no "still broken" votes, auto-close to FIXED
 *    and notify the reporter + upvoters.
 *  - NOT_WORKING vote: if the report is IN_TESTING, alert ops that the fix
 *    was disputed. Status is left alone — a human decides whether to reopen.
 *
 * Best-effort: never throws (wrapped by the caller too).
 */
export async function onVerificationVote(
  reportId: string,
  vote: "WORKING" | "NOT_WORKING",
): Promise<{ autoClosed: boolean }> {
  const report = await prisma.resellerReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, title: true, status: true,
      authorEmail: true, authorName: true,
      reportedByEmail: true, reportedByName: true,
      upvotes: { select: { voterEmail: true, voterName: true } },
      verifications: { select: { voterEmail: true, vote: true } },
    },
  });
  if (!report) return { autoClosed: false };

  // Only act while a report is awaiting verification.
  if (report.status !== "IN_TESTING") return { autoClosed: false };

  const working = new Set<string>();
  const broken = new Set<string>();
  for (const v of report.verifications) {
    if (v.vote === "WORKING") working.add(v.voterEmail);
    else if (v.vote === "NOT_WORKING") broken.add(v.voterEmail);
  }

  if (vote === "WORKING" && working.size >= VERIFY_QUORUM && broken.size === 0) {
    // ── AUTO-CLOSE (the only automated path to FIXED) ──────────────
    await prisma.resellerReport.update({ where: { id: reportId }, data: { status: "FIXED" } });
    await prisma.resellerReportActivity.create({
      data: {
        reportId,
        actorEmail: SYSTEM_ACTOR.email,
        actorName: SYSTEM_ACTOR.name,
        kind: "STATUS_CHANGE",
        detail: `IN_TESTING → FIXED · auto-closed after ${working.size} reseller confirmations`,
      },
    });
    const recipients = collectRecipients(report, report.upvotes);
    await notifyAll(recipients, (r) => ({
      to: r.email,
      recipientName: r.name?.split(" ")[0] ?? null,
      subject: `Resolved: ${report.title}`,
      title: "Your report was marked Fixed",
      subtitle: report.title,
      body: `${working.size} people confirmed the fix is working, so this report has been closed as Fixed. Thanks for helping verify it. If it ever regresses, reopen it with a comment.`,
      ctaLabel: "View the report",
      ctaUrl: reportUrl(reportId),
    }));
    return { autoClosed: true };
  }

  if (vote === "NOT_WORKING") {
    // Dispute alert — keep the report IN_TESTING and let a human decide.
    try {
      await sendReportNotificationEmail({
        to: OPS_EMAIL,
        subject: `Fix disputed: ${report.title}`,
        title: "A shipped fix was reported still broken",
        subtitle: report.title,
        body: `Someone just voted “Still Not Working” on a report that was marked In Testing. It has NOT been auto-closed. Please review and decide whether to reopen it.`,
        ctaLabel: "Open the report",
        ctaUrl: reportUrl(reportId),
      });
    } catch (err) {
      console.error("[reseller-reports-workflow] dispute alert failed", { reportId, err });
    }
  }

  return { autoClosed: false };
}
