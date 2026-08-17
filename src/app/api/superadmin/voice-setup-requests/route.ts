import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { readVoiceSetupPayload, VOICE_SETUP_STATUSES, type VoiceSetupRequestRow } from "@/lib/voice/setup-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Superadmin › Nabil Phone Lines — the concierge activation queue.
 *
 *   GET            → open (NEW) requests first, then the 50 most recent DONE.
 *                    Each row carries whether the restaurant ALREADY has a
 *                    VoiceNumber (so "mark done" without provisioning is visible).
 *   PATCH { id, status: "DONE" | "NEW" } → mark done (or re-open), audit-logged.
 *
 * Marking DONE is bookkeeping only — the restaurant's dashboard flips from
 * "we're setting up your line" to live when a VoiceNumber row exists for it
 * (provisioned by hand via the script + Twilio), not when this flag flips.
 */

const SELECT = {
  id: true,
  status: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
  doneAt: true,
  restaurant: {
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      timezone: true,
      voiceNumbers: { select: { phoneNumber: true, status: true }, orderBy: { createdAt: "asc" as const }, take: 1 },
    },
  },
} as const;

function toRow(r: {
  id: string; status: string; payload: unknown; createdAt: Date; updatedAt: Date; doneAt: Date | null;
  restaurant: { id: string; name: string; slug: string; email: string | null; phone: string | null; timezone: string | null; voiceNumbers: Array<{ phoneNumber: string; status: string }> };
}): VoiceSetupRequestRow {
  const { voiceNumbers, ...restaurant } = r.restaurant;
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    restaurant,
    line: voiceNumbers[0] ?? null,
    payload: readVoiceSetupPayload(r.payload),
  };
}

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [open, done] = await Promise.all([
    prisma.voiceSetupRequest.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "asc" }, take: 200, select: SELECT }),
    prisma.voiceSetupRequest.findMany({ where: { status: "DONE" }, orderBy: { doneAt: "desc" }, take: 50, select: SELECT }),
  ]);
  return NextResponse.json({ open: open.map(toRow), done: done.map(toRow) });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  if (!(VOICE_SETUP_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const existing = await prisma.voiceSetupRequest.findUnique({ where: { id }, select: { id: true, status: true, restaurantId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.voiceSetupRequest.update({
    where: { id },
    data: { status, doneAt: status === "DONE" ? new Date() : null },
    select: SELECT,
  });
  await writeAuditLog({
    actor: user,
    action: status === "DONE" ? "nabil_setup_request.done" : "nabil_setup_request.reopen",
    entity: `VoiceSetupRequest:${id}`,
    detail: { restaurantId: existing.restaurantId, from: existing.status, to: status },
  });
  return NextResponse.json({ request: toRow(updated) });
}
