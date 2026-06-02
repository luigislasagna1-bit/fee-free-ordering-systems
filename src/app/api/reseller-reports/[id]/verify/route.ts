/**
 * POST   /api/reseller-reports/[id]/verify  — cast or change a vote.
 * DELETE /api/reseller-reports/[id]/verify  — withdraw your vote.
 *
 * Body (POST): { vote: "WORKING" | "NOT_WORKING" }
 *
 * Verification poll. Available to anyone with view access — the report
 * doesn't have to be IN_TESTING / FIXED for a vote to be recorded
 * (a reseller can call "still not working" on a NEW report to confirm
 * Luigi he sees it too on his end before Luigi tries a fix). Each
 * voter gets ONE row per report; voting again upserts.
 *
 * The reporter's vote is special-cased on the read side (detail page
 * highlights it). The API doesn't need to know who the reporter is —
 * it just stores per-user votes and lets the UI render the importance.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess, VERIFICATION_VOTES, type VerificationVote } from "@/lib/reseller-reports-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: { vote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const vote = body.vote as VerificationVote;
  if (!VERIFICATION_VOTES.includes(vote)) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  // Confirm the report exists before upserting — otherwise an FK error
  // surfaces as a confusing 500.
  const report = await prisma.resellerReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const lowerEmail = access.email.trim().toLowerCase();
  const verification = await prisma.resellerReportVerification.upsert({
    where: { reportId_voterEmail: { reportId: id, voterEmail: lowerEmail } },
    update: { vote, voterName: access.name },
    create: {
      reportId: id,
      voterEmail: lowerEmail,
      voterName: access.name,
      vote,
    },
  });
  // Touch updatedAt so the list re-sorts by activity.
  await prisma.resellerReport.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  // Audit-log the verification.
  await prisma.resellerReportActivity.create({
    data: {
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: vote === "WORKING" ? "VERIFIED_WORKING" : "VERIFIED_BROKEN",
    },
  });
  return NextResponse.json({ verification });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const lowerEmail = access.email.trim().toLowerCase();
  const result = await prisma.resellerReportVerification.deleteMany({
    where: { reportId: id, voterEmail: lowerEmail },
  });
  if (result.count === 0) {
    return NextResponse.json({ ok: true, removed: 0 });
  }
  await prisma.resellerReportActivity.create({
    data: {
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "VERIFICATION_REMOVED",
    },
  });
  return NextResponse.json({ ok: true, removed: result.count });
}
