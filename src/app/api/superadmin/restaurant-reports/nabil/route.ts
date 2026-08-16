import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { VOICE_CALL_REPORT_OPEN_STATUSES, isVoiceCallReportStatus } from "@/lib/voice/call-reports";

/**
 * GET /api/superadmin/restaurant-reports/nabil?status=open|NEW|…|all&take=50&cursor=<id>
 *
 * The superadmin "Restaurant Reports › Nabil AI reports" list. Platform staff
 * (superadmin + platform_support) may read. Urgent first, then newest.
 * Cursor-paged so a busy month never becomes an unbounded findMany.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TAKE = 100;

export async function GET(req: NextRequest) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const statusParam = (sp.get("status") || "open").toUpperCase();
  const take = Math.min(MAX_TAKE, Math.max(1, Number(sp.get("take")) || 50));
  const cursor = sp.get("cursor") || null;
  const restaurantId = sp.get("restaurantId") || null;

  const where = {
    ...(statusParam === "ALL" ? {} : statusParam === "OPEN" ? { status: { in: [...VOICE_CALL_REPORT_OPEN_STATUSES] } } : isVoiceCallReportStatus(statusParam) ? { status: statusParam } : { status: { in: [...VOICE_CALL_REPORT_OPEN_STATUSES] } }),
    ...(restaurantId ? { restaurantId } : {}),
  };

  const [rows, counts] = await Promise.all([
    prisma.voiceCallReport.findMany({
      where,
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        topic: true,
        urgent: true,
        status: true,
        description: true,
        reporterName: true,
        createdAt: true,
        updatedAt: true,
        restaurant: { select: { id: true, name: true, slug: true } },
        call: { select: { id: true, startedAt: true, durationSeconds: true, outcome: true, orderNumber: true, fromNumber: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.voiceCallReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c._count._all;

  return NextResponse.json({
    reports: page.map((r) => ({
      ...r,
      description: r.description.slice(0, 240),
      // The caller's number is not the point of this screen — last 4 only.
      call: { ...r.call, fromNumber: r.call.fromNumber ? `…${r.call.fromNumber.slice(-4)}` : null },
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    counts: byStatus,
  });
}
