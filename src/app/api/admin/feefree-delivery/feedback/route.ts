import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";
import { recomputeDriverRating } from "@/lib/driver-rating";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/feefree-delivery/feedback
 *
 * Restaurant rates the driver on a finished delivery (v1.1 Phase 8, plan
 * §4.4). Body: { assignmentId, stars 1–5, comment? }.
 *
 * Auth chain (plan §4.4, in this exact order):
 *   getSessionUser() → restaurantId from the SESSION → ownership fetch
 *   findFirst({ id: assignmentId, restaurantId }) → require terminal status
 *   + non-null driver → driverId taken from the FETCHED ROW, never from the
 *   client → upsert on @@unique([assignmentId, source]) →
 *   recomputeDriverRating(driverId) after the write.
 *
 * Re-submitting EDITS the existing rating (upsert), so double-taps and
 * changed minds both land on the same single row — one restaurant rating
 * per delivery, ever. The upsert races P2002 under a true concurrent
 * double-submit; that collapses to an update retry (find-then-create is
 * NOT a race guard — plan §4.4).
 *
 * 404 for both "not found" and "someone else's assignment" — no
 * enumeration. 400 codes: bad_assignment_id | bad_stars | bad_comment |
 * not_terminal | no_driver.
 */

const MAX_COMMENT_LEN = 500;
const SOURCE = "restaurant";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate: kitchen logins never grant the dispatch surface. Gate on
  // `role` — NOT effectiveRole — so impersonating superadmins/resellers
  // still pass (session.ts).
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const assignmentId = typeof b.assignmentId === "string" ? b.assignmentId : "";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(assignmentId)) {
    return NextResponse.json({ error: "bad_assignment_id" }, { status: 400 });
  }

  const stars = b.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "bad_stars" }, { status: 400 });
  }

  let comment: string | null = null;
  if (b.comment != null) {
    if (typeof b.comment !== "string" || b.comment.length > MAX_COMMENT_LEN) {
      return NextResponse.json({ error: "bad_comment" }, { status: 400 });
    }
    comment = b.comment.trim() || null;
  }

  // Ownership fetch — the assignment must belong to THIS restaurant. 404
  // covers both absent and foreign rows identically (no enumeration).
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { id: assignmentId, restaurantId },
    select: { id: true, status: true, driverId: true, orderId: true },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!ASSIGNMENT_TERMINAL.has(assignment.status)) {
    return NextResponse.json({ error: "not_terminal" }, { status: 400 });
  }
  if (!assignment.driverId) {
    return NextResponse.json({ error: "no_driver" }, { status: 400 });
  }
  // From here on, driverId comes from the fetched row ONLY.
  const driverId = assignment.driverId;

  const data = {
    driverId,
    orderId: assignment.orderId,
    assignmentId: assignment.id,
    restaurantId,
    source: SOURCE,
    stars,
    comment,
  };
  const uniqueWhere = {
    assignmentId_source: { assignmentId: assignment.id, source: SOURCE },
  };
  try {
    await prisma.driverFeedback.upsert({
      where: uniqueWhere,
      // driverId/orderId/restaurantId deliberately NOT in update — they are
      // identity fields of the original row; only the rating itself edits.
      update: { stars, comment },
      create: data,
    });
  } catch (e) {
    // Concurrent double-submit can race the upsert's create branch into
    // P2002 — the row now exists, so the retry is a plain update.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await prisma.driverFeedback.update({
        where: uniqueWhere,
        data: { stars, comment },
      });
    } else {
      throw e;
    }
  }

  // Fold the new feedback into the blended score AFTER the write commits
  // (reliability 40% / on-time 30% / feedback 30%, driver-rating.ts).
  const ratingPct = await recomputeDriverRating(prisma, driverId);

  return NextResponse.json({ ok: true, stars, comment, ratingPct });
}
