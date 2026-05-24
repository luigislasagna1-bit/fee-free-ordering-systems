/**
 * DELETE a single holiday row by id.
 *
 * Ownership check is via the where-clause restaurantId match — same
 * pattern as the rest of the admin write routes. Returns 404 if the
 * row doesn't belong to the caller's restaurant (vs. 403, which would
 * leak existence). 404 is the safer signal for a not-yours/not-found
 * miss.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const result = await prisma.restaurantHoliday.deleteMany({
    where: { id, restaurantId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
