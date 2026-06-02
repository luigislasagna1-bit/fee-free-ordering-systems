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

export default async function ReportsListPage() {
  const access = await getReportAccess();
  // Send everyone without access to /login. Returning notFound() would
  // leak the route's existence to anyone probing — /login is the same
  // place an unauthed visitor lands on any auth-required surface.
  if (!access.canView) redirect("/login");

  const [reports, invites] = await Promise.all([
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
        createdAt: true,
        updatedAt: true,
        _count: { select: { comments: true } },
      },
    }),
    access.canInvite
      ? prisma.resellerReportInvite.findMany({ orderBy: { invitedAt: "desc" } })
      : Promise.resolve([]),
  ]);

  return (
    <ReportsListClient
      access={{
        canCreate: access.canCreate,
        canChangeStatus: access.canChangeStatus,
        canInvite: access.canInvite,
      }}
      reports={reports.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        commentsCount: r._count.comments,
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
