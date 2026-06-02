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
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      verifications: { orderBy: { updatedAt: "desc" } },
      upvotes: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) notFound();

  // Resolve the canonical reporter identity. Falls back to author when
  // reportedByEmail is null (self-filed).
  const reporterEmail = report.reportedByEmail ?? report.authorEmail;
  const reporterName = report.reportedByName ?? report.authorName;
  const myLowerEmail = access.email.trim().toLowerCase();
  const myUpvote = report.upvotes.find((u) => u.voterEmail === myLowerEmail) ?? null;
  const myVerification = report.verifications.find((v) => v.voterEmail === myLowerEmail) ?? null;

  return (
    <ReportDetailClient
      access={{
        canComment: access.canComment,
        canChangeStatus: access.canChangeStatus,
      }}
      myEmail={access.email}
      myName={access.name}
      report={{
        id: report.id,
        title: report.title,
        body: report.body,
        type: report.type,
        status: report.status,
        priority: report.priority,
        authorEmail: report.authorEmail,
        authorName: report.authorName,
        reporterEmail,
        reporterName,
        // True only when superadmin filed on behalf of someone else.
        // Drives a small "Filed by Luigi" subtitle on the detail page.
        filedOnBehalf: !!report.reportedByEmail,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        comments: report.comments.map((c) => ({
          id: c.id,
          authorEmail: c.authorEmail,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
        verifications: report.verifications.map((v) => ({
          id: v.id,
          voterEmail: v.voterEmail,
          voterName: v.voterName,
          vote: v.vote,
          isReporter: v.voterEmail === reporterEmail.toLowerCase(),
          updatedAt: v.updatedAt.toISOString(),
        })),
        upvotes: report.upvotes.map((u) => ({
          id: u.id,
          voterEmail: u.voterEmail,
          voterName: u.voterName,
          createdAt: u.createdAt.toISOString(),
        })),
        activity: report.activity.map((a) => ({
          id: a.id,
          actorEmail: a.actorEmail,
          actorName: a.actorName,
          kind: a.kind,
          detail: a.detail,
          createdAt: a.createdAt.toISOString(),
        })),
        myUpvoteId: myUpvote?.id ?? null,
        myVerificationVote: myVerification?.vote ?? null,
      }}
    />
  );
}
