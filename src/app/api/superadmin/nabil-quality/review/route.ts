import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff, writeAuditLog } from "@/lib/platform-auth";

/**
 * PUT /api/superadmin/nabil-quality/review — platform staff mark a call
 * good/bad with the failure taxonomy (Phase D part 2b). One review per call
 * (upsert). Audited. Internal tool — English by policy.
 */
export const runtime = "nodejs";

export const REVIEW_TAGS = [
  "wrong_item",
  "wrong_modifier",
  "missed_correction",
  "unnecessary_clarification",
  "failed_to_clarify",
  "hallucination",
  "bad_transfer",
  "tool_failure",
  "rigid_flow",
  "robotic",
  "dead_air",
  "audio",
  "other",
] as const;
const VERDICTS = new Set(["good", "bad", "unsure"]);

export async function PUT(req: NextRequest) {
  const user = await requirePlatformStaff();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const callId = typeof b.callId === "string" ? b.callId.trim() : "";
  const verdict = typeof b.verdict === "string" ? b.verdict : "";
  if (!callId || !VERDICTS.has(verdict)) return NextResponse.json({ error: "callId + verdict (good|bad|unsure) required", code: "bad_request" }, { status: 400 });
  const tags = (Array.isArray(b.tags) ? b.tags : []).filter((t): t is string => typeof t === "string" && (REVIEW_TAGS as readonly string[]).includes(t)).slice(0, 13);
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 2000) || null : null;
  const failureReason = typeof b.failureReason === "string" ? b.failureReason.trim().slice(0, 300) || null : null;
  const completed = typeof b.completed === "boolean" ? b.completed : null;

  const call = await prisma.voiceCall.findUnique({ where: { id: callId }, select: { id: true, restaurantId: true } });
  if (!call) return NextResponse.json({ error: "Call not found", code: "not_found" }, { status: 404 });

  const data = { restaurantId: call.restaurantId, verdict, tags, notes, completed, failureReason, reviewerId: user.id, reviewerEmail: user.email ?? null };
  const row = await prisma.voiceCallReview.upsert({
    where: { callId },
    create: { callId, ...data },
    update: data,
    select: { id: true, updatedAt: true },
  });
  await writeAuditLog({ actor: user, action: "nabil.call_review", entity: callId, detail: { verdict, tags, completed } });
  return NextResponse.json({ ok: true, id: row.id, updatedAt: row.updatedAt.toISOString() });
}
