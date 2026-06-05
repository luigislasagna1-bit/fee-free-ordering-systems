/**
 * /reseller-reports — hidden bug-tracker / feature-request hub.
 *
 * Server component. Resolves access, redirects unauthorised users to
 * /login (so casual visitors don't even know the route exists — they
 * just get bounced to a normal login page). Authorized callers get
 * the client-side list rendered with their access level threaded in.
 */
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { ReportsListClient } from "./ReportsListClient";

export const dynamic = "force-dynamic";

/** Count attached screenshots without parsing the whole array. Used
 *  by the list row to drive the paperclip indicator. */
function countImageUrls(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default async function ReportsListPage() {
  const access = await getReportAccess();
  // Send everyone without access to /login. Returning notFound() would
  // leak the route's existence to anyone probing — /login is the same
  // place an unauthed visitor lands on any auth-required surface.
  if (!access.canView) redirect("/login");

  const viewerEmail = access.email.trim().toLowerCase();
  const [reports, invites, seenRows] = await Promise.all([
    prisma.resellerReport.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        authorEmail: true,
        authorName: true,
        reportedByEmail: true,
        reportedByName: true,
        imageUrls: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            comments: true,
            upvotes: true,
            verifications: true,
          },
        },
      },
    }),
    access.canInvite
      ? prisma.resellerReportInvite.findMany({ orderBy: { invitedAt: "desc" } })
      : Promise.resolve([]),
    // This viewer's "last seen" markers — drives the in-app NEW badge.
    prisma.resellerReportSeen.findMany({
      where: { viewerEmail },
      select: { reportId: true, seenAt: true },
    }),
  ]);

  // reportId → last-seen timestamp for this viewer.
  const seenMap = new Map(seenRows.map((s) => [s.reportId, s.seenAt.getTime()]));

  return (
    <ReportsListClient
      access={{
        canCreate: access.canCreate,
        canChangeStatus: access.canChangeStatus,
        canInvite: access.canInvite,
      }}
      reports={reports.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        priority: r.priority,
        authorEmail: r.authorEmail,
        authorName: r.authorName,
        // Fall back to author when reportedBy isn't explicitly set.
        // The whole point of reportedBy is "Luigi filed on behalf of X" —
        // when it's null the report was self-filed and author IS reporter.
        reporterEmail: r.reportedByEmail ?? r.authorEmail,
        reporterName: r.reportedByName ?? r.authorName,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        commentsCount: r._count.comments,
        upvotesCount: r._count.upvotes,
        verificationsCount: r._count.verifications,
        attachmentsCount: countImageUrls(r.imageUrls),
        // NEW for this viewer when there's been activity since they last opened
        // it (or they never have). Comment/status changes touch updatedAt.
        isNew: (() => {
          const seen = seenMap.get(r.id);
          return seen === undefined ? true : r.updatedAt.getTime() > seen;
        })(),
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        displayName: i.displayName,
        invitedAt: i.invitedAt.toISOString(),
      }))}
    />
  );
}
