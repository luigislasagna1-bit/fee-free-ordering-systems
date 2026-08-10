import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sanitizePhone } from "@/lib/phone";
import { requirePhoneOrderingAdmin } from "../guard";
import { MAX_BLOCKED_CALLERS, MAX_REASON_CHARS } from "../validators";

export const runtime = "nodejs";

/**
 * Nabil blocked callers — collection API.
 *   GET  /api/admin/phone-ordering/blocked-callers   list (newest first)
 *   POST /api/admin/phone-ordering/blocked-callers   block (upsert; cap 500)
 *
 * Phones are stored via sanitizePhone() ("+" + digits, E.164-shaped) — the
 * SAME shape as Twilio's `From`, which the TwiML entry route matches RAW
 * against BlockedCaller.phone (<Reject>). Storing any other format would
 * silently never block anyone.
 */

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const callers = await prisma.blockedCaller.findMany({
    where: { restaurantId: gate.restaurantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ callers });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = await req.json().catch(() => ({}));
  const phone = sanitizePhone(typeof body.phone === "string" ? body.phone : null);
  if (!phone) {
    return NextResponse.json({ error: "Invalid phone", code: "invalid_phone" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON_CHARS) || null : null;

  // The cap only blocks NEW rows — re-blocking an existing number just
  // refreshes its reason via the upsert below.
  const [count, existing] = await Promise.all([
    prisma.blockedCaller.count({ where: { restaurantId } }),
    prisma.blockedCaller.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
      select: { id: true },
    }),
  ]);
  if (!existing && count >= MAX_BLOCKED_CALLERS) {
    return NextResponse.json({ error: "Blocked-caller limit reached", code: "blocked_limit" }, { status: 409 });
  }

  const caller = await prisma.blockedCaller.upsert({
    where: { restaurantId_phone: { restaurantId, phone } },
    create: { restaurantId, phone, reason },
    update: { reason },
  });
  return NextResponse.json({ ok: true, caller });
}
