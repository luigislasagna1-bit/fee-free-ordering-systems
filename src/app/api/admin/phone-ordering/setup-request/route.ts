import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requirePhoneOrderingAdmin } from "../guard";
import { notifyNabilSetupRequested } from "@/lib/platform-notifications";
import { parseVoiceSetupRequest, readVoiceSetupPayload } from "@/lib/voice/setup-request";

/**
 * Nabil AI — concierge line setup (on sale, 2026-08-17).
 *
 *   GET  /api/admin/phone-ordering/setup-request → this restaurant's request (or null)
 *   POST /api/admin/phone-ordering/setup-request → file / update it
 *        { currentNumber, mode: "new" | "forward", transferNumber, greetingName, notes? }
 *
 * Owner-authenticated + entitled (the add-on must be active — the guard's
 * feature check), scoped to the session's restaurantId. ONE row per restaurant
 * (upsert): a re-submission updates the payload and re-opens the request
 * (status back to NEW) so the platform sees the latest wishes. Filing notifies
 * the platform (in-app bell + email to superadmins and support@) — the
 * provisioning itself is done by hand within one business day.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT = { id: true, status: true, payload: true, createdAt: true, updatedAt: true, doneAt: true } as const;

function view(row: { id: string; status: string; payload: unknown; createdAt: Date; updatedAt: Date; doneAt: Date | null } | null) {
  if (!row) return null;
  const p = readVoiceSetupPayload(row.payload);
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    doneAt: row.doneAt,
    // Never echo submittedBy back to the browser — it is for the ops mail.
    payload: p ? { currentNumber: p.currentNumber, mode: p.mode, transferNumber: p.transferNumber, greetingName: p.greetingName, notes: p.notes } : null,
  };
}

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const row = await prisma.voiceSetupRequest.findUnique({ where: { restaurantId: gate.restaurantId }, select: SELECT });
  return NextResponse.json({ request: view(row) });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const user = await getSessionUser();
  const parsed = parseVoiceSetupRequest(body, user?.email ?? null);
  if (!parsed.ok) return NextResponse.json({ error: parsed.code, code: parsed.code }, { status: 400 });

  // A line that already exists makes the form moot — the dashboard hides it,
  // but a stale tab must not file a request the platform then chases.
  const existingLine = await prisma.voiceNumber.findFirst({ where: { restaurantId }, select: { id: true } });
  if (existingLine) {
    return NextResponse.json({ error: "Line already provisioned", code: "already_provisioned" }, { status: 409 });
  }

  const payload = JSON.parse(JSON.stringify(parsed.value));
  const row = await prisma.voiceSetupRequest.upsert({
    where: { restaurantId },
    create: { restaurantId, status: "NEW", payload },
    update: { status: "NEW", payload, doneAt: null },
    select: SELECT,
  });

  // Fire-and-forget: the restaurant's request must not wait on mail.
  void notifyNabilSetupRequested(row.id).catch((e) => console.error("[nabil-setup-request] notify failed", e));

  return NextResponse.json({ request: view(row) }, { status: 201 });
}
