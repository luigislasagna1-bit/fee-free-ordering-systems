/**
 * Reward Dollars earn rules — item API.
 *   PATCH  /api/admin/reward-rules/[id]   toggle active / edit
 *   DELETE /api/admin/reward-rules/[id]   remove
 * Restaurant-scoped. Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const rule = await prisma.rewardEarnRule.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!rule || rule.restaurantId !== restaurantId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: any = {};
  if ("active" in body) data.active = !!body.active;
  if ("label" in body) data.label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  if ("earnAmount" in body) data.earnAmount = body.earnAmount == null || body.earnAmount === "" ? null : Math.max(0, Math.round(Number(body.earnAmount) * 100) / 100);
  if ("earnPercent" in body) data.earnPercent = body.earnPercent == null || body.earnPercent === "" ? null : Math.min(100, Math.max(0, Math.round(Number(body.earnPercent) * 100) / 100));

  await prisma.rewardEarnRule.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const rule = await prisma.rewardEarnRule.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!rule || rule.restaurantId !== restaurantId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.rewardEarnRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
