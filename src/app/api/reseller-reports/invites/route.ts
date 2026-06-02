/**
 * GET  /api/reseller-reports/invites — list every email in the allow-list.
 * POST /api/reseller-reports/invites — add an email to the allow-list.
 *
 * Both endpoints are SUPERADMIN-ONLY. Invited resellers can see WHO
 * else has access only inside the page UI if Luigi decides to surface
 * it; the API endpoint itself is locked down so a reseller can't probe
 * the list.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";

export async function GET() {
  const access = await getReportAccess();
  if (!access.canInvite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const invites = await prisma.resellerReportInvite.findMany({
    orderBy: { invitedAt: "desc" },
  });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const access = await getReportAccess();
  if (!access.canInvite || !access.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { email?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim().slice(0, 100) || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Upsert so the same email can be re-invited (e.g. to update the
  // display name) without throwing a unique constraint error.
  const invite = await prisma.resellerReportInvite.upsert({
    where: { email },
    update: { displayName: displayName ?? undefined },
    create: {
      email,
      displayName,
      invitedById: access.user.id,
    },
  });
  return NextResponse.json({ invite });
}
