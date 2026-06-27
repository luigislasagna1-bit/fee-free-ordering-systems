/**
 * POST   /api/admin/customer-groups/[id]/members   — add members
 *   body: { customerIds?: string[], emails?: string[] }
 *   - customerIds: existing restaurant customers (verified scoped).
 *   - emails: raw pasted list (e.g. a team roster). Each is linked to an
 *     existing Customer when one matches by email, else stored as a raw member.
 * DELETE /api/admin/customer-groups/[id]/members?memberId=...  — remove one
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

async function ownGroup(id: string, restaurantId: string) {
  const g = await prisma.customerGroup.findUnique({ where: { id }, select: { id: true, restaurantId: true } });
  return g && g.restaurantId === restaurantId ? g : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;
  if (!(await ownGroup(groupId, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const customerIds: string[] = Array.isArray(body.customerIds) ? body.customerIds.map(String) : [];
  const emailsRaw: string[] = Array.isArray(body.emails) ? body.emails.map((x: unknown) => String(x)) : [];

  // What's already in the group (dedup).
  const existing = await prisma.customerGroupMember.findMany({ where: { groupId }, select: { customerId: true, email: true } });
  const haveCustomer = new Set(existing.map((e) => e.customerId).filter(Boolean) as string[]);
  const haveEmail = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);

  const toCreate: Array<{ groupId: string; restaurantId: string; customerId?: string; email?: string }> = [];

  // 1) Explicit customer picks — must belong to this restaurant.
  if (customerIds.length) {
    const valid = await prisma.customer.findMany({
      where: { id: { in: customerIds }, restaurantId },
      select: { id: true, email: true },
    });
    for (const c of valid) {
      if (haveCustomer.has(c.id)) continue;
      toCreate.push({ groupId, restaurantId, customerId: c.id });
      haveCustomer.add(c.id);
      if (c.email) haveEmail.add(c.email.toLowerCase());
    }
  }

  // 2) Pasted emails — link to a Customer row when one matches, else raw.
  const norm = [...new Set(emailsRaw.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && e.length <= 200))];
  if (norm.length) {
    const matched = await prisma.customer.findMany({
      where: { restaurantId, email: { in: norm, mode: "insensitive" } },
      select: { id: true, email: true },
    });
    const byEmail = new Map(matched.map((c) => [c.email!.toLowerCase(), c.id]));
    for (const e of norm) {
      const cid = byEmail.get(e);
      if (cid) {
        if (!haveCustomer.has(cid)) { toCreate.push({ groupId, restaurantId, customerId: cid }); haveCustomer.add(cid); haveEmail.add(e); }
      } else if (!haveEmail.has(e)) {
        toCreate.push({ groupId, restaurantId, email: e });
        haveEmail.add(e);
      }
    }
  }

  if (toCreate.length) {
    await prisma.customerGroupMember.createMany({ data: toCreate, skipDuplicates: true });
    await prisma.customerGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } });
  }
  return NextResponse.json({ ok: true, added: toCreate.length });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;
  if (!(await ownGroup(groupId, restaurantId))) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
  const m = await prisma.customerGroupMember.findUnique({ where: { id: memberId }, select: { id: true, groupId: true, restaurantId: true } });
  if (!m || m.groupId !== groupId || m.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  await prisma.customerGroupMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
