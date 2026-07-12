import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { SA_RESELLER_IMPERSONATE_COOKIE } from "@/lib/session";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * POST — set the sa_reseller_impersonate cookie. Superadmin only.
 * DELETE — clear the cookie.
 *
 * The cookie carries the ResellerProfile.id. getSessionUser() reads it on
 * every request and swaps the superadmin's effective identity to that reseller.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Confirm the reseller exists before stashing the cookie — otherwise we'd
  // hand out an SA→nowhere cookie that getSessionUser would silently drop.
  const profile = await prisma.resellerProfile.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SA_RESELLER_IMPERSONATE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8h
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  // user.role stays "superadmin" even while in SA→reseller mode (effectiveRole
  // is the one that gets swapped), so this check admits the exit-impersonation
  // request correctly.
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.delete(SA_RESELLER_IMPERSONATE_COOKIE);
  return NextResponse.json({ ok: true });
}
