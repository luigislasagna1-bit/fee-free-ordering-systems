/**
 * /reseller-reports/[id] — single report + comment thread.
 *
 * Same access gate as the list page; same auth philosophy (unauthed →
 * /login, not notFound, so the route doesn't leak).
 */
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { ReportDetailClient } from "./ReportDetailClient";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getReportAccess();
  if (!access.canView) redirect("/login");

  const { id } = await params;
  const report = await prisma.resellerReport.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!report) notFound();

  return (
    <ReportDetailClient
      access={{
        canComment: access.canComment,
        canChangeStatus: access.canChangeStatus,
      }}
      report={{
        id: report.id,
        title: report.title,
        body: report.body,
        type: report.type,
        status: report.status,
        priority: report.priority,
        authorEmail: report.authorEmail,
        authorName: report.authorName,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        comments: report.comments.map((c) => ({
          id: c.id,
          authorEmail: c.authorEmail,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
      }}
    />
  );
}
